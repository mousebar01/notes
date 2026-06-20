# Session State 与 Search

本文解释 Hermes 的 SQLite session store、system prompt 持久化、历史搜索和 resume 行为。

核心源码：

- `hermes_state.py`
- `tools/session_search_tool.py`
- `agent/conversation_loop.py`
- `cli.py`

## 目的

`hermes_state.py` 用 SQLite database 取代了按 session 分散存 JSONL 的方式。

它保存：

- session metadata。
- 完整 message history。
- model configuration。
- system prompt snapshot。
- token 和 cost counters。
- title 和 cwd metadata。
- 用于压缩和分支的 parent/child session links。

Batch runner 和 RL trajectories 不存这里，它们有独立系统。

## 数据库位置

默认路径：

```text
$HERMES_HOME/state.db
```

路径通过 `get_hermes_home()` 实现 profile-aware。

## 核心表

`sessions` 每个 session 一行。

重要字段：

- `id`
- `source`
- `user_id`
- `model`
- `model_config`
- `system_prompt`
- `parent_session_id`
- `started_at`
- `ended_at`
- `end_reason`
- token counters
- cost fields
- `cwd`
- `title`
- handoff fields
- `rewind_count`
- `archived`

`messages` 保存 OpenAI-style conversation records。

重要字段：

- `id`
- `session_id`
- `role`
- `content`
- `tool_call_id`
- `tool_calls`
- `tool_name`
- `timestamp`
- token count
- finish reason
- reasoning fields
- platform message id
- `observed`
- `active`

`compression_locks` 用来跨进程协调压缩工作。

`state_meta` 保存 schema/version metadata。

## WAL 模式与 fallback

Hermes 尝试使用 SQLite WAL 模式，因为 gateway 和多个 profile 可能产生并发读写。

有些文件系统不可靠支持 WAL：

- NFS
- SMB/CIFS
- 某些 FUSE mounts
- 类 WSL1 环境

如果 `PRAGMA journal_mode=WAL` 抛出已知 locking errors，Hermes 会 fallback 到 `journal_mode=DELETE`。

这样降低并发能力，但保留功能可用性。

warning 会按 database label 去重，避免短生命周期连接反复刷日志。

## 写冲突策略

`SessionDB` 使用：

- 短 SQLite timeout。
- `BEGIN IMMEDIATE`。
- 应用层 retry。
- 随机 20-150ms jitter。
- 周期性 WAL checkpoints。

这样可以避免长时间确定性的 SQLite busy wait，并让 CLI、gateway、dashboard、worktree agents 之间的竞争写入错开。

## Schema Migration

`SCHEMA_VERSION` 记录当前 schema 版本。

schema init 不只是执行 `CREATE TABLE IF NOT EXISTS`：

- 对旧数据库补齐缺失列。
- 修复 FTS triggers。
- 在列存在后创建 deferred indexes。
- 当 schema 变化需要时 backfill FTS indexes。
- 处理 FTS5 不可用的运行环境。

代码把 FTS availability 当作可选能力。即使不能初始化全文搜索，message storage 也应该继续工作。

## FTS 搜索

Hermes 在 message content 和 tool metadata 上使用 FTS5：

```text
content + tool_name + tool_calls
```

triggers 会在 insert、delete、update 时维护 FTS 表。

有两张 FTS 表：

- `messages_fts`：普通 unicode tokenizer。
- `messages_fts_trigram`：trigram tokenizer，用于 CJK 和 substring search。

trigram 表存在的原因是标准 tokenizer 可能把 CJK 文本切成不太有用的单字 token。

## System Prompt 持久化

system prompt 持久化在 `sessions.system_prompt`。

这对 gateway 行为很关键。Gateway 经常每条消息都构造新的 `AIAgent`，所以不能依赖进程内 prompt cache 跨 turn 存活。

`agent.conversation_loop._restore_or_build_system_prompt()` 处理这件事。

状态区分：

- `missing`：还没有 session row，合法的 first turn。
- `null`：session row 存在，但 `system_prompt` 是 NULL。
- `empty`：session row 存在，但 prompt 是空字符串。
- `present`：存在可用 prompt，可以复用。

如果存储的 prompt 是 present，Hermes 会原样复用。这能让 provider prefix cache 跨 turn 有效。

如果 prompt missing、null 或 empty，Hermes 会重建，并尝试持久化重建后的 prompt。写入失败只记录 warning，因为持久化失败意味着后续 turn 仍然会错过 prompt cache。

## Resume 与 Compression Chain

压缩可能把一个 session 拆成 descendant session。原 session 变成链路里的 parent，descendant 保存当前 transcript。

resume 时，CLI 调用 `resolve_resume_session_id()`，这样请求旧 compressed head 时，可以实际恢复到包含当前 messages 的 descendant。

这避免用户 resume 一个看似有效、但因为压缩前移而没有当前 transcript 的 session id。

## Title

Session title 由 `SessionDB.sanitize_title()` 清洗。

CLI 处理两种情况：

- 如果 session row 已存在，`/title` 立即写入。
- 如果 session row 还不存在，title 会排队，等第一条 message 创建 DB session 后再应用。

CLI 会尽早检查 title 唯一性，让用户立即获得反馈。

## Session Search Tool

`session_search` 是 agent 面向 SQLite 历史的 recall tool。

它没有显式 `mode` 参数。mode 从参数推断。

模式：

- Discovery：传 `query`。
- Scroll：传 `session_id` 和 `around_message_id`。
- Browse：不传参数。
- Read：传 `session_id`，执行 whole-session bounded read。

所有模式都返回真实数据库消息。没有 LLM summarization 路径。

## Discovery Mode

Discovery mode 会：

- 运行 FTS5。
- 按 session lineage 去重命中。
- 返回 top sessions。
- 包含 FTS-highlighted snippet。
- 包含 anchor message 周围窗口。
- 包含 session 开头和结尾的 bookends。

Bookends 能让长 session 中间命中的结果带上足够上下文，帮助理解整个 session 在讨论什么。

## Scroll Mode

Scroll mode 参数：

- `session_id`
- `around_message_id`
- `window`

它返回 anchor id 周围的消息。继续滚动时，模型可以锚定返回结果里的第一条或最后一条 message id，再次调用。

Scroll mode 不做 FTS，也不做 bookend expansion。

## Browse Mode

Browse mode 按时间列出最近 sessions，包含：

- title
- preview
- timestamps
- source
- message count

默认排除 `tool` 等 hidden session source，避免集成会话污染用户可见历史。

## 跨 Profile 读取

`session_search` 能解析带 profile 限定的 session reference。

它可以只读打开另一个 profile 的 `state.db`。只读模式跳过 schema initialization 和 DDL，避免对另一个活跃 profile 加写锁。

如果传入裸 session id、没有 profile 信息，工具可以只读扫描 profile databases，定位该 session 属于哪个 profile。

## Memory vs Session Search

Session search 是历史对话细节的事实来源。

内置 memory 小而精，是 curated 的。Session search 更宽、更事实化。

用 memory 保存长期高价值事实；用 session search 查精确历史讨论、历史工具结果，以及不应该进入每次未来 prompt 的细节。

## 工程经验

可复用模式：

- 持久化 system prompt，跨 fresh agent object 恢复 prefix cache。
- 区分 missing/null/empty stored prompt，方便排障。
- 用 SQLite FTS 做零 LLM 的历史召回。
- search response 直接基于真实 messages。
- 跨 profile DB access 使用 read-only，避免写锁。
- resume 时解析 compressed session chains。
- 在不兼容文件系统上从 WAL fallback。
- 对共享 SQLite 写入使用 jittered application-level retry。
