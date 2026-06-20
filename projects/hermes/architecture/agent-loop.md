# Agent Loop

本文整理 Hermes 单个用户 turn 的内部运行机制，核心源码在
`agent/conversation_loop.py`，入口转发在 `run_agent.py`。

如果只记一个结论：Hermes 的 agent loop 不是简单的
“拼 prompt -> 调模型 -> 执行工具”。它更像一个 turn 边界内的事务协调器：
稳定 system prompt、会话历史、上下文压缩、外部记忆预取、插件注入、工具纠错、
工具执行、错误恢复、token 统计、持久化、后台记忆/技能复盘，都在这个边界里按顺序
收束。

## 入口位置

`run_agent.AIAgent.run_conversation()` 现在是薄转发：

```python
def run_conversation(...):
    from agent.conversation_loop import run_conversation
    return run_conversation(self, ...)
```

真正的大循环在 `agent/conversation_loop.py::run_conversation(agent, ...)`。
文件头部注释也写得很清楚：这是从 `run_agent.AIAgent` 抽出来的约 3900 行
conversation loop，负责一个用户 turn 的模型调用、工具派发、重试、fallback、
压缩、post-turn hooks、后台 memory/skill review。

这个拆法有一个工程上的兼容细节：很多测试或生产代码过去会 monkey patch
`run_agent.handle_function_call`、`run_agent.OpenAI`、`run_agent._set_interrupt`。
所以 `conversation_loop.py` 里通过 `_ra()` 懒加载 `run_agent`，让旧 patch 仍然能
影响新路径。

## 总体生命周期

一个 turn 大致按下面顺序走：

1. 初始化 turn 运行状态：stdio 防护、session 上下文、task_id、stream callback、
   token 计数、retry 计数、interrupt 状态。
2. 加载或恢复历史消息：把传入的 `conversation_history` 转成内部 `messages`。
3. 追加当前用户消息：`messages.append({"role": "user", "content": user_message})`。
4. 恢复或构建 system prompt：优先从 SessionDB 读冻结快照；没有则重新构建并写回 DB。
5. preflight compression：进入主循环前先估算当前请求大小，必要时先压缩历史。
6. 插件 `pre_llm_call`：收集插件上下文，稍后注入当前 user message，而不是 system。
7. 外部记忆 provider `prefetch_all()`：按原始用户问题搜索跨会话记忆，结果缓存一次。
8. 进入 while 主循环：每一轮可能是一次模型调用，随后要么执行工具，要么得到最终回答。
9. API-call-time 拼请求：复制 `messages`，注入记忆/插件上下文、prefill、cache_control，
   做 role/tool 序列修复和 provider 兼容清洗。
10. 调模型并处理响应：流式/非流式、usage 统计、错误分类、fallback/retry。
11. 如果模型返回工具调用：校验工具名和 JSON 参数，执行工具，把 tool result 追加回
    `messages`，必要时压缩，继续下一轮。
12. 如果模型返回普通文本：追加 assistant 消息，退出 loop。
13. loop 后收尾：超预算摘要、轨迹保存、资源清理、session 持久化、插件输出转换、
    external memory sync、后台 memory/skill review、`on_session_end` hook。

## System Prompt 恢复与冻结

`_restore_or_build_system_prompt()` 是 prompt 稳定性的关键函数。

它区分 SessionDB 里的四种 system prompt 状态：

- `missing`：没有 session row，通常是第一轮。
- `null`：session row 存在，但 `system_prompt` 列是 `NULL`，可能是旧 session 或迁移残留。
- `empty`：列存在但空字符串，通常意味着上一轮写入出了问题。
- `present`：有可用 prompt，直接复用。

如果是继续会话并且 DB 中存在 prompt，Hermes 会原样复用：

```python
if stored_prompt:
    agent._cached_system_prompt = stored_prompt
    return
```

否则会调用：

```python
agent._cached_system_prompt = agent._build_system_prompt(system_message)
agent._session_db.update_system_prompt(agent.session_id, agent._cached_system_prompt)
```

这里的设计目标不是“每轮读取最新文件”，而是“会话内 prompt 前缀稳定”。尤其 gateway
路径通常每条消息都会创建新的 `AIAgent`，如果不从 SessionDB 恢复上一轮 prompt，
就会重新读取身份文件、记忆文件、上下文文件，导致 Anthropic prompt cache 或本地 KV cache
前缀失配。

所以 Hermes 的 system prompt 是 session 级 frozen snapshot：

- 第一轮构建一次。
- 写入 SessionDB。
- 后续轮次从 DB 复用。
- 上下文压缩等事件可能生成新 session 或重置缓存。

这个机制和内置记忆系统强相关：即使模型上一轮写了 `MEMORY.md`，下一轮也不一定重新读
这个文件；会话内模型仍看到开局时那份冻结快照，避免它“刚写的记忆又被 system prompt
重复灌入”。

## 用户消息与 API 请求副本

Hermes 区分两份东西：

- `messages`：内部真实历史，会持久化到 session DB。
- `api_messages`：每次调用模型前临时复制出来的请求副本。

很多动态上下文只加到 `api_messages`，不改 `messages`：

- 外部记忆 provider 的 prefetch 结果。
- 插件 `pre_llm_call` 返回的 context。
- `agent.ephemeral_system_prompt`。
- `agent.prefill_messages`。
- Anthropic `cache_control` 标记。
- provider 兼容字段转换。

这种分层非常重要。它让 Hermes 可以把“本轮需要给模型看的东西”和“需要永久保存在会话
历史里的事实”分开。

例如外部记忆注入逻辑在构造 `api_messages` 时才执行：

```python
if idx == current_turn_user_idx and msg.get("role") == "user":
    _injections = []
    if _ext_prefetch_cache:
        _injections.append(build_memory_context_block(_ext_prefetch_cache))
    if _plugin_user_context:
        _injections.append(_plugin_user_context)
    api_msg["content"] = _base + "\n\n" + "\n\n".join(_injections)
```

源码注释明确说：这些注入是 API-call-time only，原始 `messages` 不会被修改，所以不会泄漏
到 session persistence。

## 插件上下文为什么不进 System Prompt

`pre_llm_call` hook 可以返回字符串或 `{"context": "..."}`。Hermes 会把这些上下文收集到
`_plugin_user_context`，后面注入当前 user message。

源码注释强调：

- 插件 context 永远注入 user message。
- 不注入 system prompt。
- 目的是保持 system prompt cache prefix 稳定。
- system prompt 是 Hermes 内部保留区；插件只能在用户输入旁边贡献上下文。

这点和 prompt 工程很有参考价值：动态信息如果塞进 system，每一轮 system 前缀都会变，
缓存收益和“稳定身份规则”都会被破坏。Hermes 把稳定规则放 system，把动态检索结果放
当前 user message，是一个很清晰的分层。

## 外部记忆预取

外部 memory provider 在主循环前预取一次：

```python
_ext_prefetch_cache = agent._memory_manager.prefetch_all(_query) or ""
```

注意几个细节：

- query 使用 `original_user_message`，不是注入 skill 内容后的 `user_message`。
- 预取在 tool loop 之前执行。
- 结果缓存到 `_ext_prefetch_cache`，每轮 API 调用复用。
- 不会因为一个 turn 内有 10 次工具调用就重复调用 provider 10 次。

这样做兼顾了实时性和成本：本 turn 需要的跨会话记忆先搜索一次，后面模型每次续轮都能看到，
但不会造成额外延迟和费用爆炸。

## Preflight Context Compression

主循环开始前，Hermes 会先做一次 context 估算：

```python
estimate_request_tokens_rough(
    messages,
    system_prompt=active_system_prompt or "",
    tools=agent.tools or None,
)
```

这里刻意把 tool schema token 也算进去。源码注释提到：工具很多时 schema 可能额外占
20K-30K tokens，如果只估消息本身，会错过压缩时机。

如果估算超过阈值，会最多压缩 3 次：

```python
for _pass in range(3):
    messages, active_system_prompt = agent._compress_context(...)
    conversation_history = None
    agent._empty_content_retries = 0
    agent._thinking_prefill_retries = 0
```

几个工程细节值得注意：

- 压缩后 `conversation_history = None`，因为压缩可能创建新 session；后续 flush 时必须把
  压缩后的全量 messages 写入新 session，而不是按旧 history 长度跳过。
- 压缩后重置 empty response 和 thinking prefill retry 计数，避免压缩前的失败状态污染压缩后
  的新上下文。
- 如果 rough estimate 被判断为会过度估算，compressor 可以 defer 到真实 provider usage。

这说明压缩不是异常处理的最后补救，而是 turn 进入主循环前的常规 preflight。

## 主循环条件

核心 while 条件是：

```python
while (api_call_count < agent.max_iterations and agent.iteration_budget.remaining > 0) \
        or agent._budget_grace_call:
```

它同时受两个预算约束：

- `max_iterations`：本轮最多模型调用次数。
- `iteration_budget`：跨 agent 或子任务共享的 iteration budget。

另外有一个 `_budget_grace_call`，表示预算用完后允许一次 grace call，让模型有机会收束/总结。

每轮开始会做：

- checkpoint 去重重置：`agent._checkpoint_mgr.new_turn()`。
- interrupt 检查。
- `api_call_count += 1`。
- 消耗 iteration budget。
- 触发 `step_callback`，把上一轮工具调用和结果报告给 gateway/TUI。
- skill nudge 计数。
- 尝试 drain `/steer`。

## `/steer` 注入位置

`/steer` 是运行中用户给模型的方向调整。Hermes 不直接把 steer 插到 user role，因为那会破坏
role alternation。它会优先向后找最近一条 tool message，把 steer marker 追加进去：

```python
if _sm.get("role") == "tool":
    marker = format_steer_marker(_pre_api_steer)
    _sm["content"] = existing + marker
```

如果当前还没有 tool message，steer 会重新排回 pending，等下一批工具结果出现再注入。

这个设计很细：它既想让模型尽快看到用户 steer，又不想制造 `user -> user` 或非法 tool 序列。

## API 请求构造

每次调用模型前，Hermes 会从内部 `messages` 复制出 `api_messages`，然后做一系列清洗：

- 修复损坏的 tool call arguments。
- 修复 role alternation。
- 拷贝 reasoning 到 provider 需要的字段。
- 移除内部字段，如 `reasoning`、`finish_reason`、`_thinking_prefill`。
- 对严格 API 清理 Codex Responses 字段。
- 加上 system message。
- 注入 prefill messages。
- 应用 Anthropic cache control。
- 移除 orphan tool results，给缺失 tool results 补 stub。
- 删除 thinking-only assistant turns 并合并相邻 user messages。
- 规范化 whitespace 和 tool call JSON，使 prompt cache 前缀更稳定。
- 清理 surrogate characters，避免 SDK JSON 序列化崩溃。

这里的一个关键原则是：对 API 兼容性的修复尽量发生在请求副本上，而不是污染内部历史。

## Prefill Messages

`prefill_messages` 是 few-shot/priming 类消息。源码注释明确：

- 只在 API-call-time 注入。
- 不存入 `messages`。
- 不写 session DB。
- 不进 batch trajectory。
- 每次 API call 都重新插入。

插入位置是 system prompt 之后、conversation history 之前：

```python
sys_offset = 1 if api_messages[0].get("role") == "system" else 0
api_messages.insert(sys_offset + idx, pfm.copy())
```

这个位置让 prefill 靠近稳定 system 前缀，但又保持可临时替换。

## Prompt Cache 稳定策略

Hermes 为 prompt cache 做了很多小动作：

- system prompt session 内复用同一字符串。
- 插件和外部记忆注入 user message，不改 system。
- `api_messages` 中字符串内容会 `.strip()`。
- tool call JSON 用 `json.dumps(..., separators=(",", ":"), sort_keys=True)` 规范化。
- Anthropic cache control 会在 system 和最后几条消息上打断点。

这说明 prompt cache 不是只靠 provider 参数，而是需要整个消息序列尽量 byte-stable。

## 模型响应与 Usage

模型响应后，Hermes 会做 usage 标准化：

- `normalize_usage()` 把不同 provider 的 usage 结构转成统一字段。
- `context_compressor.update_from_response()` 用真实 prompt token 更新上下文压力。
- `estimate_usage_cost()` 估算成本。
- session 上累计 input/output/cache/reasoning/prompt/completion/total tokens。
- 如果有 SessionDB 和 session_id，会调用 `update_token_counts()` 写入 SQLite。

这里有一个可靠性细节：如果 session row 可能没创建成功，会先 `_ensure_db_session()` 再写 token。
这是为并发、cron、kanban 等 SQLite 锁竞争场景兜底。

## 错误分类与恢复

API 异常不会只靠字符串打印。Hermes 会调用：

```python
classified = classify_api_error(...)
```

分类结果包含：

- `reason`
- `status_code`
- `retryable`
- `should_compress`
- `should_rotate_credential`
- `should_fallback`

然后按分类做结构化恢复，比如：

- Nous paid entitlement 刷新。
- credential pool 轮换。
- 图片过大则 shrink image parts 后重试一次。
- provider 不支持 tool message 的 list multimodal content，则降级成文本后重试。
- Anthropic OAuth 不支持 1M context beta，则本 session 禁用 beta 并重建 client。
- Codex/OpenAI/xAI OAuth 401 刷新 token。
- Nous/Copilot/Anthropic 401 尝试刷新对应凭证。
- context 过大时触发压缩或 fallback。

工程上值得学的是：错误处理不只是“retry N 次”，而是先把错误归因，再选择恢复动作。

## 工具调用校验

模型返回 `tool_calls` 后，不会马上执行。Hermes 先做三层校验。

第一层：工具名校验。

- 如果名字不在 `agent.valid_tool_names`，先尝试 `_repair_tool_call()`。
- 修不回来则向模型注入 tool error，让模型自我纠正。
- 最多 3 次，超过后返回 partial。

第二层：参数 JSON 校验。

- 参数是 dict/list 会转成 JSON string。
- 空字符串当 `{}`。
- JSON 解析失败会进入 retry。
- 如果疑似输出截断导致 JSON 不完整，拒绝执行，返回 partial。
- 连续 3 次 invalid JSON 后，会把错误作为 tool result 注入，让模型恢复。

第三层：post-call guardrails。

- `_cap_delegate_task_calls()` 限制 `delegate_task` 数量。
- `_deduplicate_tool_calls()` 去重。
- 后续执行时还有 tool guardrail 可以 halt 本 turn。

这个流程的核心原则是：宁可给模型一个结构化错误让它修正，也不要执行不可信或截断的工具参数。

## 工具执行路径

入口在 `run_agent.py::_execute_tool_calls()`：

```python
if not _should_parallelize_tool_batch(tool_calls):
    return self._execute_tool_calls_sequential(...)
return self._execute_tool_calls_concurrent(...)
```

具体实现转发到：

- `agent.tool_executor.execute_tool_calls_sequential`
- `agent.tool_executor.execute_tool_calls_concurrent`

并发策略不是“有多个工具就并发”。源码注释说明：

- 读工具可以并发。
- 文件读写只有在目标路径不重叠时才可以并发。
- 否则走顺序执行。

这避免模型一次发多个 patch/write 时发生写入竞争。

执行结果会作为 `role: "tool"` 消息追加回 `messages`，然后 loop 继续，让模型读取工具结果并决定
下一步。

## Content + Tool Calls 的 fallback

模型有时会同时给出自然语言回答和 housekeeping 工具调用，例如回答完问题后调用 memory/todo/
skill_manage。Hermes 会保存这段内容：

```python
agent._last_content_with_tools = turn_content
```

如果后续工具执行后的模型响应为空，就可以用这段内容作为 fallback final response。

还有一个显示细节：如果所有工具都是 housekeeping：

```python
_HOUSEKEEPING_TOOLS = {"memory", "todo", "skill_manage", "session_search"}
```

Hermes 可以暂时 mute 后续空输出，避免用户看到“回答已经说完了，但 agent 又为了记忆维护多跑一轮”
带来的噪音。

## 工具后压缩

工具执行后，Hermes 会再次判断是否需要压缩。

优先用 provider 返回的真实 prompt token：

```python
if _compressor.last_prompt_tokens > 0:
    _real_tokens = _compressor.last_prompt_tokens
```

如果没有真实 usage，才 fallback 到 rough estimate，并且估算时也包含 tool schemas。

这里避免了两个问题：

- 只看粗估可能因为 reasoning/completion token 膨胀而过早压缩。
- 完全没有 usage 时如果不估算，session 会无限长大。

## 最终回答路径

如果 assistant response 没有 tool calls：

```python
final_response = assistant_message.content or ""
messages.append({"role": "assistant", "content": final_response})
break
```

但在真正接受最终回答前，还会处理很多异常形态：

- 只有 think block 没有可见内容。
- 流式连接中断但已有 partial streamed content。
- 输出长度截断，最多 continuation 3 次。
- reasoning budget exhausted，返回用户友好的 “Thinking Budget Exhausted”。
- 空响应 retry / thinking prefill retry。

这些逻辑的目标是让用户不要只看到空框或半句话。

## 超预算摘要

如果 loop 退出时 `final_response is None` 且达到 max iterations 或 budget exhausted，
Hermes 会调用：

```python
agent._handle_max_iterations(messages, api_call_count)
```

这个函数会去掉 tools，追加一个 user message，请模型做一次无工具总结。

这是一个很实际的 UX 设计：当 agent 已经做了很多工具步骤但没来得及自然收束时，不直接静默失败，
而是让模型用当前上下文给用户一个阶段性总结。

## 持久化与诊断

收尾阶段会：

- `_save_trajectory()` 保存轨迹。
- `_cleanup_task_resources()` 清理 VM/browser 等 task 资源。
- `_drop_trailing_empty_response_scaffolding()` 删除内部 retry 脚手架。
- `_persist_session()` 写 JSON log 和 SQLite。
- 记录 turn exit reason。

turn exit reason 会包含：

- `interrupted_by_user`
- `budget_exhausted`
- `guardrail_halt`
- `max_iterations_reached(...)`
- `partial_stream_recovery`
- `text_response(...)`
- 以及其他错误/恢复路径。

如果最后一条消息是 tool result 且不是 interrupt，日志会用 WARNING，因为这通常意味着用户看到
“agent 好像停在工具后面不动了”。

## 文件修改失败兜底

Hermes 有一个 per-turn file mutation verifier：

```python
agent._turn_failed_file_mutations: Dict[str, Dict[str, Any]] = {}
```

如果本 turn 中 `write_file` / `patch` 失败，并且后来没有对同一路径成功写入，最终回答会追加
一个 advisory footer。

这个设计防止模型“半数 patch 失败，但最后总结说全改好了”。它把文件写入事实从模型叙述里拉出来，
用 runtime 状态兜底。

## 插件输出转换与 Post Hook

最终响应返回前，会调用：

- `transform_llm_output`
- `post_llm_call`
- `on_session_end`

其中 `transform_llm_output` 是 first non-empty string wins。也就是说多个插件都可能尝试转换输出，
但第一个返回非空字符串的插件会决定最终文本。

`post_llm_call` 更适合做外部同步，比如把 turn 写入某个外部系统。

`on_session_end` 名字容易误解：源码注释明确说它在每次 `run_conversation` 结束时触发，不代表整个
长会话真的结束。memory provider 的 `shutdown_all()` 不在这里调用，否则多轮会话第二轮前 provider
就被关掉了。

## 外部记忆同步与后台复盘

最终阶段会调用：

```python
agent._sync_external_memory_for_turn(...)
```

把本 turn 的用户消息和最终回答同步给外部 memory provider。

如果触发了 memory 或 skill nudge，还会：

```python
agent._spawn_background_review(...)
```

这个后台复盘在响应交付之后运行，所以不会抢占用户当前任务的模型注意力。

这也是 Hermes 记忆系统的一个重要分层：

- 当前 turn 前：external memory prefetch，给模型补充相关历史。
- 当前 turn 后：external memory sync，把新 turn 写入外部记忆。
- 若到达 cadence：后台 review 让模型维护内置 MEMORY/skills。

## Result 返回结构

`run_conversation()` 返回 dict，而不是只返回字符串。重要字段包括：

- `final_response`
- `last_reasoning`
- `messages`
- `api_calls`
- `completed`
- `turn_exit_reason`
- `failed`
- `partial`
- `interrupted`
- `response_transformed`
- `model`
- `provider`
- `base_url`
- token/cost 统计字段
- `session_id`
- 可选 `guardrail`
- 可选 `pending_steer`
- 可选 `interrupt_message`

CLI 可以只取 `final_response`，但 gateway/TUI/dashboard/统计系统需要完整结构。

## 工程上值得学习的设计点

第一，稳定上下文和动态上下文分层。system prompt 是 session frozen snapshot；动态记忆、
插件上下文、prefill 都是 API-call-time 注入。

第二，请求副本和持久历史分层。Hermes 对 provider 做大量兼容清洗，但多数操作只改
`api_messages`，不污染 `messages`。

第三，错误恢复是分类驱动。先归因，再选择 credential refresh、压缩、图片降级、fallback、
continuation 等动作。

第四，工具执行前有强校验。工具名、JSON、截断、重复、delegate 数量都在 runtime 层挡住，
不完全信任模型输出。

第五，压缩是 turn 生命周期的一部分，不只是报错后的 fallback。preflight 和 post-tool 都有压缩点。

第六，最终回答不是“模型最后说什么就是什么”。Hermes 会处理空输出、截断、budget exhaustion、
file mutation failure、插件转换、外部同步和诊断日志。

第七，gateway/TUI 需要的事件不是 UI 自己推断的，而是 agent loop 在 step、tool、stream、
approval、result 这些边界显式暴露。

