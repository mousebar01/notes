# Memory System

本文整理 Hermes 的 memory 系统。当前重点是内置 memory 写入、漂移检测、后台提取、外部 memory provider，以及 memory 与 session search 的边界。

需要注意：这篇笔记来自源码阅读整理，不等同于官方承诺；具体实现仍应以当前源码为准。

## Drift Detection

Hermes 的内置 memory 文件不是任意文本文件，而是有结构的长期记忆存储。为了避免模型、shell、patch 工具或人工编辑破坏结构，memory 工具会做 drift detection。

触发 drift 的条件包括：

- 用 `ENTRY_DELIMITER` 解析后再序列化，去除首尾空白后字节发生变化。
- 单个 parsed entry 超过目标文件的整体字符限制。

第二个条件主要用于发现有人通过 shell、patch、手工编辑或另一个 session 追加了大块自由文本。

发现 drift 后：

- 原始文件会备份为 `.bak.<timestamp>`。
- 当前 mutation 会被拒绝。
- tool response 会说明如何恢复。

这样做可以防止模型在文件结构已经不受 memory tool 控制时继续改写，从而造成数据丢失。

## Memory Extraction

内置 memory extraction 是 model-mediated 的，不是 embedding-based，也不是纯规则系统。

有两条写入路径：

- 主 agent 可以在对话中直接调用 `memory` 工具。
- 后台 review agent 可以检查已完成的 conversation snapshot，如果发现值得长期保存的事实，再调用 `memory` 工具。

后台 prompt 会要求 review agent 寻找：

- 用户画像、愿望、偏好和个人细节。
- 用户对 agent 行为的期待。
- 工作风格或操作偏好。

如果没有值得保存的内容，review agent 应该回答 `Nothing to save.` 并停止。

## Review Cadence

主 conversation loop 会跟踪 `_turns_since_memory`。

当满足这些条件：

- memory nudging 已启用；
- `memory` 工具可用；
- 内置 memory store 存在；

用户 turn 会递增计数器。当计数达到 `_memory_nudge_interval` 时，系统会调度一次 memory review，然后重置计数器。

默认间隔初始化为 10，也可以从 `config.memory.nudge_interval` 读取。

恢复 session 时，Hermes 会根据之前的用户 turn 数恢复计数器。这样 gateway 新建出来的 agent 不会忘掉 review 节奏。

## Session Search vs Memory

Memory 用来保存应该始终进入上下文的关键事实。

Session search 用来查找精确的历史对话细节。

这个边界很重要：

- Memory 很小，但每个 session 都会消耗 prompt tokens。
- Session search 按需查询 SQLite FTS，并返回真实 messages。
- Memory 应避免保存任务日志、PR 编号、commit SHA 和容易过期的细节。
- 像“上周我们讨论了什么？”这类问题更适合用 session search。

## External Memory Providers

外部 provider 是 additive 的，不会替代内置 memory。

配置示例：

```yaml
memory:
  provider: honcho
```

同一时间只能启用一个外部 provider。`MemoryManager` 会强制这个限制，避免 tool schema 膨胀和后端冲突。

Provider discovery 位于 `plugins/memory/__init__.py`。

它会扫描：

- bundled providers：`plugins/memory/<name>/`
- 用户安装 providers：`$HERMES_HOME/plugins/<name>/`

同名冲突时，bundled providers 优先。

## MemoryProvider Contract

`MemoryProvider` 定义生命周期：

- `is_available()`：检查本地配置和依赖，不做网络调用。
- `initialize(session_id, **kwargs)`：初始化 session-scoped resources。
- `system_prompt_block()`：返回 provider 静态 system prompt guidance。
- `prefetch(query, session_id="")`：为即将到来的 turn 返回相关上下文。
- `queue_prefetch(query, session_id="")`：为下一 turn 预热 recall。
- `sync_turn(user_content, assistant_content, ...)`：持久化已完成 turn。
- `get_tool_schemas()`：暴露 provider-specific tools。
- `handle_tool_call()`：路由 provider tool calls。
- `shutdown()`：flush 或关闭资源。

可选 hooks：

- `on_turn_start`
- `on_session_end`
- `on_session_switch`
- `on_pre_compress`
- `on_memory_write`
- `on_delegation`

Provider 应该使用注入的 `hermes_home`，不要硬编码 `~/.hermes`。

## MemoryManager 职责

`MemoryManager` 负责：

- 最多注册一个外部 provider。
- 构造外部 provider 的静态 prompt block。
- 执行 provider prefetch。
- 为下一 turn queue prefetch。
- 同步已完成 turn。
- 收集 provider tool schemas。
- 路由 provider tool calls。
- 转发生命周期 hooks。
- 把主 agent 和 provider failure 隔离开。

大多数 provider failure 只会记录日志，并被视为非致命。外部 memory backend 坏掉不应该阻止用户拿到回答。

## Turn-Level External Memory Flow

一个用户 turn 中，外部 memory 大致这样流动：

1. conversation loop 调用 `memory_manager.on_turn_start(...)`。
2. 调用 `memory_manager.prefetch_all(original_user_message)`。
3. 预取到的上下文被包进 `<memory-context>`。
4. 这个 block 只追加到当前 API 调用的 user message。
5. 持久化 `messages` 列表不会被这段注入上下文污染。
6. 成功得到最终回复后，`_sync_external_memory_for_turn()` 调用 `sync_all(...)`。
7. 然后调用 `queue_prefetch_all(...)`，为下一 turn 预热。

被中断的 turn 不会同步。部分回复或中止的工具链不应被视为可靠的长期对话事实。

## Memory Context Fencing

外部 memory recall 会被包进：

```xml
<memory-context>
[System note: The following is recalled memory context, NOT new user input. Treat as authoritative reference data ...]

...
</memory-context>
```

`sanitize_context()` 会先移除 provider 自己提供的 memory-context fence，然后由 Hermes 统一包裹。

系统还有 streaming scrubber，用来防止模型分块输出时把拆开的 `<memory-context>` 片段泄漏到可见输出里。

## Built-In Writes Mirrored to External Providers

当内置 `memory` 工具执行 `add` 或 `replace` 时，Hermes 会为外部 providers 调用 `memory_manager.on_memory_write(...)`。

manager 会跳过名为 `builtin` 的 provider，并兼容三种 hook 签名：

- 现代 keyword metadata。
- positional metadata。
- legacy no-metadata。

这样旧 provider 插件仍能工作，新 provider 又能接收 provenance metadata。

## 工程经验

可复用模式：

- 区分短期 conversation state 和长期 curated memory。
- 严格限制 always-in-prompt memory。
- 用 frozen snapshots 保持 prompt-cache 稳定。
- memory 写入要即时且持久，但不要热更新当前 system prompt。
- 对模型管理的 list 文件使用显式 delimiter。
- 当外部编辑导致文件无法安全 round-trip 时拒绝写入。
- 内置写入可以 mirror 到外部 provider，但 provider failure 应是 best-effort。
- 中断 turn 不应视为 durable。
- 外部 recall 放在 per-turn context，而不是缓存的 system prompt。
- 对内部上下文加 fence，并在流式输出中 scrub。
