# 上下文压缩与会话轮转机制

本文整理 Hermes Agent 的上下文压缩系统。它不是简单把老消息删掉，而是一套“摘要交接 + 保护最近上下文 + 工具调用完整性修复 + 会话 lineage 轮转 + 记忆预提交”的机制。

核心源码：

- `agent/context_compressor.py`：内置 `ContextCompressor`，负责真正压缩消息列表。
- `agent/conversation_compression.py`：压缩编排层，负责加锁、调用压缩器、重建 system prompt、切换 session。
- `agent/context_engine.py`：可替换的 Context Engine 抽象接口。
- `agent/agent_init.py`：读取配置，选择内置压缩器或插件 context engine。
- `agent/conversation_loop.py`：在主循环中做 preflight / post-response 压缩判断。

---

## 1. 这套机制解决什么问题

LLM 对话上下文会不断增长。Hermes 需要在接近模型上下文窗口时继续工作，但又不能把关键状态丢掉。这里有几个风险：

1. 直接删除旧消息会丢掉用户目标、文件路径、命令结果、未完成任务。
2. 工具调用消息有配对约束，删除一半会导致 OpenAI API 拒绝请求。
3. 多个 agent 实例共享同一个 session 时，可能同时压缩同一段历史，造成 session 分叉。
4. 压缩摘要模型可能失败，不能因为摘要失败就无限重试或悄悄丢上下文。
5. 长会话压缩后，数据库中的历史检索还要知道新旧 session 的父子关系。
6. 外部记忆 provider 需要在上下文被丢弃前有机会提取关键信息。

所以 Hermes 的压缩不是“清理上下文”，更像是一次“会话边界提交”：

```text
旧消息列表
  -> 保护 system/head
  -> 保护最近 tail
  -> 中间区域生成结构化摘要
  -> 修复工具消息结构
  -> 旧 session end_session(reason="compression")
  -> 新 session create_session(parent_session_id=old_session_id)
  -> memory/context engine 收到 session switch 通知
```

---

## 2. ContextEngine 抽象

`agent/context_engine.py` 定义了可替换的上下文管理接口。内置压缩器实现这个接口，插件也可以实现它。

核心生命周期：

1. `on_session_start(...)`
2. `update_model(...)`
3. `update_from_response(usage)`
4. `should_compress(prompt_tokens)`
5. `compress(messages, current_tokens)`

接口要求 context engine 至少维护这些字段：

- `last_prompt_tokens`
- `threshold_tokens`
- `context_length`
- `compression_count`

它还支持一些可选能力：

- `should_compress_preflight(messages)`：请求前预判断。
- `has_content_to_compress(messages)`：手动 `/compress` 前检查是否真有可压缩区域。
- `get_tool_schemas()`：context engine 可以暴露自己的工具，例如检索、展开上下文。
- `handle_tool_call(name, arguments)`：处理 context engine 自带工具。
- `on_session_reset()`：`/new` 或 `/reset` 时清理状态。
- `on_session_start(... boundary_reason="compression")`：压缩导致 session 轮转时通知插件。

这个抽象很重要：Hermes 不把“上下文管理”硬编码成只能 summary，它允许未来换成 LCM、检索式上下文、分层上下文图等机制。

---

## 3. 初始化与配置

初始化在 `agent/agent_init.py`。

读取配置项：

- `compression.enabled`：是否启用自动压缩，默认 true。
- `compression.threshold`：触发阈值比例，默认 0.50。
- `compression.target_ratio`：摘要和尾部预算比例，默认 0.20。
- `compression.protect_last_n`：老的尾部保护数量配置，默认 20。
- `compression.protect_first_n`：保护开头非 system 消息数量，默认 3。
- `compression.abort_on_summary_failure`：摘要失败时是否中止压缩，默认 false。
- `model.context_length`：主模型上下文窗口手动覆盖。
- `auxiliary.compression.context_length`：辅助压缩模型上下文窗口手动覆盖。

还有一个细节：`compression.threshold` 可能被模型特定配置覆盖：

```python
from agent.auxiliary_client import _compression_threshold_for_model
_model_cthresh = _compression_threshold_for_model(agent.model)
if _model_cthresh is not None:
    compression_threshold = _model_cthresh
```

也就是说，默认阈值不是绝对最终值。某些模型可以有自己的压缩阈值。

---

## 4. 内置 ContextCompressor 的状态

`ContextCompressor` 在 `agent/context_compressor.py`。

它保存的关键状态：

- `model/base_url/api_key/provider/api_mode`：摘要调用需要知道当前主模型运行环境。
- `context_length`：模型上下文窗口。
- `threshold_percent`：触发压缩的比例。
- `threshold_tokens`：实际触发阈值。
- `protect_first_n`：保护头部消息数量。
- `protect_last_n`：尾部保护相关配置。
- `summary_target_ratio`：摘要和尾部 token 预算比例。
- `tail_token_budget`：尾部保护 token 预算。
- `max_summary_tokens`：摘要最大 token 数。
- `_previous_summary`：上一次压缩摘要，用于迭代更新。
- `_last_summary_error`：最近一次摘要失败错误。
- `_last_summary_dropped_count`：失败 fallback 时丢弃了多少消息。
- `_last_summary_fallback_used`：是否用了确定性 fallback 摘要。
- `_last_compress_aborted`：是否因为摘要失败而完全中止压缩。
- `_last_aux_model_failure_error/_model`：辅助摘要模型失败但回退主模型的记录。
- `_ineffective_compression_count`：连续低收益压缩次数，用于防止 thrashing。

一个工程细节：`summary_target_ratio` 被夹在 0.10 到 0.80 之间：

```python
self.summary_target_ratio = max(0.10, min(summary_target_ratio, 0.80))
```

这防止配置把摘要预算设得过小或过大。

---

## 5. 阈值与模型切换

压缩阈值不是固定数字，而由模型上下文窗口推导：

```python
self.context_length = get_model_context_length(...)
self.threshold_tokens = max(
    int(self.context_length * threshold_percent),
    MINIMUM_CONTEXT_LENGTH,
)
```

这里有一个下限：`MINIMUM_CONTEXT_LENGTH`。即使比例算出来更低，也不会低于最低上下文长度要求。Hermes 还会拒绝上下文窗口低于最低要求的模型：

```python
if _ctx and _ctx < MINIMUM_CONTEXT_LENGTH:
    raise ValueError(...)
```

模型切换时调用 `update_model(...)`，重新计算：

- `context_length`
- `threshold_tokens`
- `tail_token_budget`
- `max_summary_tokens`

这避免从 200K 模型切到 32K 模型后仍沿用旧预算。

---

## 6. 什么时候触发压缩

`should_compress(prompt_tokens)` 判断是否触发：

```python
tokens = prompt_tokens if prompt_tokens is not None else self.last_prompt_tokens
if tokens < self.threshold_tokens:
    return False
```

但它还有 anti-thrashing：

```python
if self._ineffective_compression_count >= 2:
    return False
```

如果连续两次压缩节省不到 10%，就停止自动压缩，提示用户考虑 `/new` 或 `/compress <topic>`。

原因很现实：有些会话里工具 schema、图片、多模态内容或巨大尾部消息占主要 token，压缩中间区域也省不了多少。如果继续自动压缩，会出现“压缩 -> 仍超阈值 -> 再压缩 -> 仍超阈值”的无效循环。

---

## 7. rough token 与真实 usage 的关系

Hermes 会用粗略估算做 preflight，但粗略估算可能高估，尤其是工具 schema 很多时。

`update_from_response(usage)` 会记录 provider 返回的真实 token：

- `last_prompt_tokens`
- `last_completion_tokens`
- `last_total_tokens`
- `last_real_prompt_tokens`

`should_defer_preflight_to_real_usage(rough_tokens)` 的设计是：如果上一次真实请求证明 prompt 能放进模型窗口，而这次 rough estimate 只是小幅增长，就暂时相信真实 usage，不因为粗估偏高反复压缩。

它允许的 rough 增长范围：

```python
tolerated_growth = max(4096, int(self.threshold_tokens * 0.05))
```

这个设计是在工程上承认：token 粗估宁可偏保守，但不能让保守估算导致无限压缩。

---

## 8. 压缩主流程

`ContextCompressor.compress(...)` 的核心步骤：

1. 清理本次调用的错误状态。
2. 如果 `force=True`，清除摘要失败 cooldown。
3. 检查消息数量是否足够压缩。
4. 预剪枝旧工具结果。
5. 计算保护 head 和 tail 的边界。
6. 查找已有 handoff summary，用于迭代更新。
7. 调用辅助 LLM 生成结构化摘要。
8. 摘要失败时按配置 abort 或 fallback。
9. 组装压缩后的消息列表。
10. 修复 tool_call/tool_result 配对。
11. 去除历史图片大 payload。
12. 估算节省 token，更新 anti-thrashing 状态。

伪代码：

```text
compress(messages):
  reset last error fields
  if force: clear summary cooldown
  if too few messages: return original

  messages = prune_old_tool_results(messages)

  compress_start = protected head end
  compress_end = tail cut by token budget
  turns = messages[compress_start:compress_end]

  if existing summary found:
    restore _previous_summary
    summarize only turns after existing summary

  summary = generate_summary(turns)

  if summary failed and abort_on_summary_failure:
    mark aborted
    return original messages

  if summary failed:
    summary = deterministic fallback summary

  compressed = head + summary + tail
  compressed = sanitize_tool_pairs(compressed)
  compressed = strip_historical_media(compressed)
  update compression counters
  return compressed
```

---

## 9. Head 保护

压缩不会动 system prompt。`_protect_head_size(messages)` 明确把 system prompt 作为隐式保护：

```python
head = 0
if messages and messages[0].get("role") == "system":
    head = 1
return head + self.protect_first_n
```

语义是：

- `protect_first_n=0`：至少保护 system prompt。
- `protect_first_n=3`：保护 system prompt + 前 3 条非 system 消息。

这个设计让压缩在不同调用路径下语义稳定。有些路径传入 messages 时包含 system prompt，有些手动压缩路径可能剥离 system prompt。

---

## 10. Tail 保护

尾部不是简单保护最后 N 条消息，而是按 token budget 往回走。

`_find_tail_cut_by_tokens(...)`：

- 从消息末尾向前累计 token。
- 默认 budget 是 `tail_token_budget`。
- 至少保护最近 3 条消息。
- 允许超过预算到 1.5 倍，避免切开一个超大消息。
- 如果预算会保护全部消息，则强制在 head 后切开，使压缩仍然能发生。
- 不切断 tool_call/tool_result group。
- 强制保证最近一条 user 消息留在 tail。

最后一条 user 消息保护尤其关键。源码注释提到一个真实 bug：如果最近 user 请求被压进摘要里，摘要前缀又告诉模型“不要回应摘要里的过去请求，只回应摘要之后的 user 消息”，那模型可能完全丢掉当前任务。

所以 `_ensure_last_user_message_in_tail(...)` 会把 tail cut 拉回到最近 user 消息处。

这说明 Hermes 把“最新用户输入”当成活跃任务锚点，而不是摘要材料。

---

## 11. 工具结果预剪枝

压缩前会先调用 `_prune_old_tool_results(...)`。这是 cheap pre-pass，不需要 LLM。

目的：

- 老工具结果常常很长，比如文件读取、搜索结果、终端输出。
- 直接把完整 tool result 交给摘要模型也浪费 token。
- 旧工具结果可以先变成一行信息摘要，再进入压缩。

它会尽量保留：

- 工具名。
- 参数摘要。
- 结果关键信息。
- 错误文本。
- 截图/多模态内容的文字摘要。

同时它会截断大型 `tool_call` arguments，避免旧工具参数长期撑大上下文。

---

## 12. 摘要输入序列化

`_serialize_for_summary(turns)` 把消息转成给摘要模型看的文本。

它不是只序列化 `content`，而是区分角色：

- tool result：保留 `tool_call_id` 和结果内容。
- assistant：保留 assistant 文本，并附带 tool call 的名字和参数。
- user/其他角色：保留角色和内容。

每条消息会限制长度：

- `_CONTENT_MAX = 6000`
- `_CONTENT_HEAD = 4000`
- `_CONTENT_TAIL = 1500`
- `_TOOL_ARGS_MAX = 1500`
- `_TOOL_ARGS_HEAD = 1200`

并且序列化前会做 secret redaction：

```python
content = redact_sensitive_text(...)
args = redact_sensitive_text(...)
```

这个点很重要：摘要会跨压缩长期保留，如果里面泄露 API key，影响比普通上下文更持久。

---

## 13. 摘要 prompt 的结构

`_generate_summary(...)` 构造一个专门的 summarizer prompt。

它要求摘要模型：

- 只生成结构化 summary。
- 不添加寒暄、前言、prefix。
- 使用用户对话中的同一种语言，不要切换成英文。
- 不包含 API keys、tokens、passwords、secrets、credentials、connection strings。
- 如果发现凭证，用 `[REDACTED]` 替代。

摘要模板包括这些 section：

- `## Active Task`
- `## Goal`
- `## Constraints & Preferences`
- `## Completed Actions`
- `## Active State`
- `## In Progress`
- `## Blocked`
- `## Key Decisions`
- `## Resolved Questions`
- `## Pending User Asks`
- `## Relevant Files`
- `## Remaining Work`
- `## Critical Context`

最值得关注的是 `Active Task`。模板把它定义成最重要字段，要求捕获用户最近未完成输入的原文。它明确说：用户刚问的问题也是 active task，不能因为用户没有下命令就写 `None`。

这说明 Hermes 的压缩摘要不只是“历史总结”，它要承接下一轮应该继续做什么。

---

## 14. 迭代摘要

如果已经压缩过，`_previous_summary` 会保存上一次摘要。下一次压缩不是从零总结，而是“更新摘要”：

```text
PREVIOUS SUMMARY:
{self._previous_summary}

NEW TURNS TO INCORPORATE:
{content_to_summarize}
```

要求摘要模型：

- 保留仍相关的旧信息。
- 添加新的 completed actions。
- 把已完成事项从 In Progress 移到 Completed Actions。
- 把已回答问题移到 Resolved Questions。
- 更新 Active State。
- 更新 Active Task 到最新未完成输入。
- 只删除明确过时的信息。

工程意义：多次压缩后，不是形成“摘要的摘要的摘要”的随机漂移，而是维护一个滚动 checkpoint。

---

## 15. focus topic 压缩

手动 `/compress <focus>` 可以传入 `focus_topic`。

如果有 focus topic，prompt 末尾追加指导：

- 与 focus topic 相关的内容保留完整细节。
- 包括精确值、文件路径、命令输出、错误信息、决策。
- 不相关内容更激进压缩。
- focus topic 使用大约 60-70% 的摘要预算。
- 即使是 focus topic，也不能保留 secrets。

这个设计和 Claude Code 的 `/compact` 类似：用户可以告诉压缩器“这次主要保留哪条线索”。

---

## 16. 摘要预算

摘要预算由被压缩内容量和模型上下文窗口共同决定：

```python
content_tokens = estimate_messages_tokens_rough(turns_to_summarize)
budget = int(content_tokens * _SUMMARY_RATIO)
return max(_MIN_SUMMARY_TOKENS, min(budget, self.max_summary_tokens))
```

`max_summary_tokens` 又是：

```python
self.max_summary_tokens = min(
    int(self.context_length * 0.05),
    _SUMMARY_TOKENS_CEILING,
)
```

因此大上下文模型会得到更丰富的摘要，但不会无限扩大。小压缩窗口也至少有最低摘要 token。

---

## 17. 摘要模型调用与回退

摘要调用通过 `call_llm(task="compression", ...)`：

```python
call_kwargs = {
    "task": "compression",
    "main_runtime": {
        "model": self.model,
        "provider": self.provider,
        "base_url": self.base_url,
        "api_key": self.api_key,
        "api_mode": self.api_mode,
    },
    "messages": [{"role": "user", "content": prompt}],
    "max_tokens": int(summary_budget * 1.3),
}
```

如果配置了 `summary_model`，会传入独立模型。当前初始化中 `summary_model_override=None`，但辅助 client 的配置体系仍可为 compression task 解析模型。

失败处理很细：

- `RuntimeError`：没有 provider，进入较长 cooldown。
- 404/503/model_not_found/no available channel：如果是独立 summary model，回退主模型重试。
- timeout/rate limit/502/504：可回退主模型或进入短 cooldown。
- JSON decode / 非 JSON 响应：记录 provider、summary model、main model、base_url，然后回退或 cooldown。
- stream premature close：按 transient 网络错误处理。
- 其他异常：如果 summary model 不同于主模型，先回退主模型再试一次。

如果辅助模型失败但主模型重试成功，外层会向用户提示：

```text
Configured compression model '...' failed (...). Recovered using main model.
```

这是一个很好的“静默恢复但不静默吞错”的设计。

---

## 18. 摘要失败后的两种策略

`compression.abort_on_summary_failure` 控制摘要失败后的行为。

### 策略 A：中止压缩

如果 `abort_on_summary_failure=true`：

- 不丢任何消息。
- `_last_compress_aborted=True`。
- 返回原 messages。
- 外层警告用户运行 `/compress` 重试或 `/new` 新会话。

适合高可靠场景：宁可卡住，也不要无摘要丢失中间上下文。

### 策略 B：确定性 fallback

默认 `abort_on_summary_failure=false`。

如果 LLM summary 失败，会调用 `_build_static_fallback_summary(...)`。

这个 fallback 不用 LLM，直接从被压缩消息中本地提取：

- 最近 user asks。
- assistant actions。
- tool actions。
- relevant files。
- blockers/error text。
- last dropped turns。
- tool call 参数里的路径。

它也按正常摘要结构生成，并加上说明：

- fallback 是本地生成。
- secrets 已 redacted。
- summary 可能不完整，继续时要验证当前文件/git/process/test 状态。

这比插入“删除了 N 条消息”更有恢复价值。

---

## 19. Summary Prefix 与“不要回答摘要里的旧请求”

摘要会被 `_with_summary_prefix(...)` 包上一段 handoff prefix。

源码顶部的 `SUMMARY_PREFIX` 明确告诉后续模型：

- 这是之前上下文压缩的交接摘要。
- 不要回答 summary 里出现的问题或请求。
- 只回应 summary 后面的最新 user message。
- 如果最新 user message 和 summary 冲突，以最新 user message 为准。

这就解释了为什么最近 user 消息必须保护在 tail 里：如果它只在 summary 里出现，模型会被 prefix 要求“不要回应摘要里的旧请求”，任务就丢了。

还有历史兼容处理：

- `LEGACY_SUMMARY_PREFIX`
- `_HISTORICAL_SUMMARY_PREFIXES`
- `_strip_summary_prefix(...)`

当旧版本保存的 handoff 被恢复时，Hermes 会剥离旧 prefix，再用当前 prefix 标准化，避免历史指令残留。

---

## 20. 插入摘要时的 role 选择

压缩结果不是随便插入一个 user summary。

它会看压缩区域前后的 role：

```python
last_head_role = ...
first_tail_role = ...

if last_head_role in {"assistant", "tool"}:
    summary_role = "user"
else:
    summary_role = "assistant"
```

目标是避免连续同 role 消息破坏 provider 期望。如果怎么选都会和相邻 role 冲突，就把 summary 合并到第一条 tail 消息前面。

如果 summary 作为 standalone `role="user"`，会追加结束标记：

```text
--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---
```

原因是弱模型可能把 summary 中引用的旧 `Active Task` 当成新的用户输入。这个结束标记是给模型的方向盘。

---

## 21. system prompt 中的压缩说明

压缩后，保留的 system prompt 会追加一段 note：

```text
[Note: Some earlier conversation turns have been compacted into a handoff summary to preserve context space. The current session state may still reflect earlier work, so build on that summary and state rather than re-doing work. Your persistent memory (MEMORY.md, USER.md) remains fully authoritative regardless of compaction.]
```

这段 note 的作用：

- 告诉模型旧对话已经被压缩。
- 当前文件/系统状态可能已经体现旧工作，不要重做。
- 长期记忆 `MEMORY.md`、`USER.md` 仍然权威。

这里可以看出 prompt 分层关系：

- system prompt 是最高层行为规则。
- context summary 是压缩出来的历史交接。
- persistent memory 仍是权威长期事实来源。
- tail user message 是当前要响应的活跃输入。

---

## 22. 工具调用配对修复

OpenAI 风格 tool call 有结构约束：

- assistant 发出 tool_calls。
- 后面必须有对应 tool result。
- tool result 的 `tool_call_id` 必须能找到对应 assistant tool call。

压缩可能把中间某一半删掉，所以 `_sanitize_tool_pairs(...)` 修复两种情况：

1. 删除孤儿 tool result：有 result，但对应 assistant tool_call 已经不在上下文里。
2. 插入 stub result：有 assistant tool_call，但 result 被压缩掉了。

stub 内容：

```text
[Result from earlier conversation — see context summary above]
```

这是非常典型的 agent 工程细节：消息不是普通聊天文本，而是 provider API 有形式语法，压缩必须维护语法合法性。

---

## 23. 历史多模态 payload 清理

压缩完成后会调用 `_strip_historical_media(compressed)`。

目的：

- 历史图片 payload 可能是 multi-MB base64。
- 即使 token 被压缩，HTTP body size 仍可能过大。
- 如果一直保留旧图片，会让后续每次请求都超过 provider body-size limit。

策略是保留最新 image-bearing user turn 之前的图片内容为短文本 placeholder。

这说明上下文管理不只看 token，也要考虑 API 请求体大小。

---

## 24. 压缩收益统计

压缩后估算新 token：

```python
new_estimate = estimate_messages_tokens_rough(compressed)
saved_estimate = display_tokens - new_estimate
savings_pct = saved_estimate / display_tokens * 100
```

如果节省低于 10%：

```python
self._ineffective_compression_count += 1
```

否则清零。

连续低收益会导致后续 `should_compress` 返回 false，避免压缩震荡。

---

## 25. 外层压缩编排

`agent/conversation_compression.py` 不是简单调用 `compress()`。它负责大量外围一致性。

主要步骤：

1. 发出状态：正在 compacting context。
2. 获取 state.db 中按旧 session_id 加的压缩锁。
3. 通知 memory manager：`on_pre_compress(messages)`。
4. 调用 `agent.context_compressor.compress(...)`。
5. 如果压缩 abort，释放锁并返回原 messages。
6. 如果 summary 失败但 fallback 成功，向用户提示。
7. 如果辅助 summary model 失败但主模型恢复，向用户提示。
8. 把 todo snapshot 追加回压缩后消息。
9. invalidate 并 rebuild system prompt。
10. 提交旧 session 记忆提取。
11. end old session。
12. 创建 new session，带 `parent_session_id`。
13. 复制/自动编号 title。
14. 更新新 session system prompt。
15. 通知 context engine session start，`boundary_reason="compression"`。
16. 通知 memory manager session switch，`reset=False, reason="compression"`。
17. 更新 rough token 诊断。
18. 释放压缩锁。

这个文件体现了：压缩是一次跨系统事务，而不是局部列表变换。

---

## 26. 压缩锁

压缩锁使用 state.db，按旧 `session_id` 加锁。

源码注释解释了为什么：

- parent-turn agent 和 background-review fork 可能共享同一个 `session_id`。
- 它们可能各自拿到同一份 messages snapshot。
- 如果同时压缩，会都把 session 轮转到不同的新 id。
- gateway 的 `SessionEntry` 可能只捕获其中一个轮转。
- 另一个 child session 变成孤儿，继续静默写入。

因此锁 key 是旧 session id，因为竞争路径开始时看到的都是旧 id。

如果拿不到锁：

- 返回原 messages。
- 不破坏 session。
- 发一次 warning。
- 等另一路压缩完成后再继续。

如果锁子系统因为版本 skew 不存在或报错，Hermes 选择 fail open：跳过锁继续压缩。源码注释认为，偶发 session fork 风险小于无限压缩失败循环。

这是很真实的工程权衡。

---

## 27. 记忆系统与压缩的关系

压缩前：

```python
agent._memory_manager.on_pre_compress(messages)
```

这给外部 memory provider 一个最后机会，在上下文被丢弃前提取信息。

压缩轮转前：

```python
agent.commit_memory_session(messages)
```

这会在旧 session 结束前触发内置记忆提取/提交，避免旧上下文随着 session 结束而丢失。

压缩轮转后：

```python
agent._memory_manager.on_session_switch(
    agent.session_id,
    parent_session_id=old_session_id,
    reset=False,
    reason="compression",
)
```

`reset=False` 很关键：逻辑对话没有重置，只是 session id 换了。外部 provider 应刷新 per-session 缓存，但不能当作用户开启了全新对话。

---

## 28. session 轮转与 lineage

压缩成功后，如果有 `SessionDB`：

```python
old_title = agent._session_db.get_session_title(agent.session_id)
agent.commit_memory_session(messages)
agent._session_db.end_session(agent.session_id, "compression")
old_session_id = agent.session_id
agent.session_id = f"{timestamp}_{uuid}"
agent._session_db.create_session(
    session_id=agent.session_id,
    source=...,
    model=agent.model,
    model_config=agent._session_init_model_config,
    parent_session_id=old_session_id,
)
```

这意味着压缩后的新 session 是旧 session 的 child，而不是覆盖旧 session。

好处：

- 历史搜索可以找到旧 session。
- resume/compression lineage 能保留。
- 数据库知道旧 session 是因为 compression 结束。
- 新 session 有自己的 system prompt snapshot。

title 也会传播：

```python
new_title = agent._session_db.get_next_title_in_lineage(old_title)
agent._session_db.set_session_title(agent.session_id, new_title)
```

长会话压缩多次时，标题可自动编号，便于 UI/历史管理。

---

## 29. system prompt 重建

压缩后：

```python
agent._invalidate_system_prompt()
new_system_prompt = agent._build_system_prompt(system_message)
agent._cached_system_prompt = new_system_prompt
```

为什么要重建？

- 压缩可能改变 messages 状态。
- context files / memory / volatile prompt 块可能需要重新组装。
- system prompt 中需要包含压缩 note。
- 新 session DB 要保存新 system prompt snapshot。

这和之前讨论的“会话开始 frozen snapshot”有关：session 层面会保存 system prompt，但压缩造成 session 轮转，所以新 child session 会重新生成并保存自己的 system prompt。

---

## 30. todo snapshot 的特殊处理

压缩后会把 todo snapshot 追加回 messages：

```python
todo_snapshot = agent._todo_store.format_for_injection()
if todo_snapshot:
    compressed.append({"role": "user", "content": todo_snapshot})
```

这说明 todo 状态不是完全依赖自然对话历史。即便中间历史被压缩，当前待办也要重新注入，避免压缩让任务状态变模糊。

---

## 31. context engine 插件加载

`agent/agent_init.py` 中 context engine 选择顺序：

1. 读 `context.engine`，默认 `compressor`。
2. 如果不是 `compressor`，尝试 `plugins/context_engine/<name>/`。
3. 再尝试通用 plugin system 的 context engine。
4. 找不到则 fallback 到内置 `ContextCompressor`。

如果使用插件 engine，会调用：

```python
agent.context_compressor.update_model(...)
```

并在 agent 初始化后：

```python
agent.context_compressor.on_session_start(
    agent.session_id,
    hermes_home=str(get_hermes_home()),
    platform=agent.platform or "cli",
    model=agent.model,
    context_length=...,
    conversation_id=...
)
```

插件 engine 还可以暴露工具 schema。Hermes 会把 `get_tool_schemas()` 返回的工具加入 agent tools，但有去重和 toolset gate：

- 如果 `enabled_toolsets is None`，允许。
- 或者显式启用了 `"context_engine"` toolset，允许。
- 已有同名工具则跳过，避免 duplicate tool name。

这个设计把“上下文引擎”扩展成两部分：

- 后台管理上下文。
- 必要时给模型提供上下文检索/展开工具。

---

## 32. 手动 `/compress` 与自动压缩

自动压缩通常由 token 阈值触发，`force=False`。

手动 `/compress` 可传 `force=True`：

- 清除 summary failure cooldown。
- 允许用户马上重试。
- 可以带 focus topic。

`has_content_to_compress(messages)` 用于避免手动压缩时无意义调用 LLM。如果 head/tail 保护后没有中间区域可压缩，就可以直接告诉用户没有可压缩内容。

---

## 33. 与 prompt 设计的关系

压缩机制对 prompt 设计有几个启发：

### 33.1 摘要是上下文，不是新用户指令

Hermes 明确用 prefix 和 end marker 告诉模型：

- summary 是背景。
- 不要响应 summary 里的旧请求。
- 只响应 summary 后面的最新 user message。

这是防 prompt 混淆的关键。

### 33.2 最新用户输入必须保留原文

最新 user message 不应该只进入摘要。原因不是“摘要不准”，而是 summary 的语义就不是可回应输入。

因此压缩算法专门保证最近 user message 在 tail。

### 33.3 长期记忆与压缩摘要要分权

system note 写明：

- 压缩摘要用于历史交接。
- `MEMORY.md` / `USER.md` 仍然权威。

也就是说，摘要不应该覆盖长期记忆事实。它是“这段会话发生了什么”，不是“用户长期偏好是什么”的最终来源。

### 33.4 摘要 prompt 要保留执行状态

Hermes 的 summary template 强调：

- 文件路径。
- 命令输出。
- 错误文本。
- line numbers。
- modified/created files。
- tests status。
- pending asks。

这说明 agent 的上下文摘要要服务于继续工程任务，而不是写聊天纪要。

---

## 34. 工程上值得学习的细节

1. **压缩是事务边界**：不仅变换 messages，还轮转 session、提交 memory、通知插件、更新 system prompt。
2. **摘要失败不能静默**：要么 abort 保留原文，要么 deterministic fallback，并记录 warning。
3. **辅助模型失败要可见**：即使回退主模型成功，也提醒用户配置坏了。
4. **最新用户请求不能只在摘要里**：因为摘要被定义成背景，不是新输入。
5. **工具调用有语法约束**：压缩后必须修复 orphan tool result 和 missing tool result。
6. **上下文管理不只看 token**：还要处理图片 payload、provider body size、工具 schema 粗估偏差。
7. **长会话要有 lineage**：压缩创建 child session，而不是覆盖旧历史。
8. **并发压缩要加锁**：共享 session 的 agent fork 会造成分叉，锁按旧 session id 获取。
9. **多次压缩要迭代更新摘要**：保留 `_previous_summary`，避免压缩后逐渐丢失全局状态。
10. **prompt 里要明确摘要边界**：否则模型会把旧任务当新任务，或忽略真正当前任务。

---

## 35. 一句话总结

Hermes 的上下文压缩机制本质上是：当上下文接近上限时，把“可丢弃的中间历史”转换成结构化 handoff summary，同时保护 system prompt、最新用户输入、近期工作状态和工具调用合法性；压缩成功后把旧 session 作为父节点结束，新建 child session 继续对话，并让记忆系统和 context engine 插件同步这个边界。
