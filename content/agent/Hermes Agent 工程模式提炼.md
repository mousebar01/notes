# Hermes Agent 工程模式提炼

这篇笔记从 Hermes 的架构中提炼可迁移到其他 Agent 系统的工程模式，同时保留足够的 Hermes 具体例子，方便以后回看这些判断从哪里来。

> 资料边界：本文基于当时阅读 Hermes 架构文档形成的整理，未逐项回查当前版本源码。具体模块名、配置项和行为可能随版本变化，应以当前实现为准。

如果只看功能，Hermes 像是一个集成了 CLI、TUI、Gateway、MCP、Kanban、Memory、插件和桌面端的复杂 Agent 项目。更值得学习的不是功能数量，而是它反复区分了容易混在一起的概念，并为状态、能力和生命周期划出边界。

## 1. 把关键状态从上下文窗口里拿出来

Hermes 将关键运行状态落到 SQLite，而不是只放在 prompt 或进程内存中，例如：

- session metadata、messages 和 system prompt snapshot
- compression lineage
- Kanban task state、comments 和 events
- token 与 cost counters

这样，进程退出后仍能恢复任务，多端可以接续同一 session，历史也能被查询和审计。

> Agent 的关键运行状态应该进入可查询、可恢复、可审计的外部存储，而不是只活在上下文窗口里。

## 2. 稳定规则和动态上下文分开

Hermes 将 prompt 信息按变化频率分层：

```text
stable      身份、工具规则和模型操作指导
context     AGENTS.md、CLAUDE.md、.cursorrules 等项目上下文
volatile    日期、session id、model/provider、memory 快照等会话信息
per-turn    检索结果、插件上下文和外部 memory recall
```

system prompt 在首轮构建后作为 session snapshot 写入数据库，后续 turn 复用这份快照。当前轮才需要的信息在请求模型时临时注入，而不是反复改写 system prompt。工具 guidance 也只在对应工具实际可用时加入，避免 prompt 描述不存在的能力。

这种做法同时保持会话行为稳定，并尽量保住 prompt cache 的稳定前缀。

> 稳定规则应该被冻结，动态上下文应该临时注入。

## 3. 内部历史和模型请求副本分开

Hermes 区分：

```text
messages       内部真实历史，会持久化
api_messages   每次请求模型前临时组装的副本
```

外部 memory recall、插件的 per-turn context、ephemeral system prompt、provider 兼容字段和 cache control 等内容，只需要进入本轮的 `api_messages`，不必写回真实历史。

这个边界避免把检索结果伪装成用户说过的话，也避免临时插件上下文永久污染 session。

> 模型本轮需要知道的信息，不一定是系统长期应该保存的事实。

## 4. 工具注册和工具暴露分开

Hermes 的工具面大致经过以下阶段：

```text
registry
  -> toolset
  -> session config
  -> availability check
  -> model-visible schema
  -> dispatch
```

因此，“工具已经注册”不等于“模型现在可以调用”。最终 schema 由当前会话和运行环境决定：

- CLI、Gateway、Cron、ACP、Kanban worker 可以使用不同工具集。
- 子 agent 不自动继承父 agent 的全部能力。
- 依赖 Docker、浏览器、凭证或 MCP server 的工具，只在依赖可用时暴露。
- 插件工具仍需经过 toolset 和 availability 过滤。
- 最终 schema 不描述当前不可用的能力。

> registry 是能力库存，模型看到的应该是当前 session 的最小可用能力面。

## 5. 长期记忆和历史检索分开

Hermes 没有把所有历史都写进 memory，而是区分：

```text
Memory          少量、稳定、值得长期保留的事实
Session Search  按需检索过去对话和任务细节
Messages        当前会话记录
```

用户偏好、长期工作方式和可复用原则适合进入 memory；某次对话、文件、commit、PR 或命令输出更适合留在可搜索历史中。

如果把日志型细节都提升为 memory，不仅会增加每轮 prompt 成本，也容易把临时事实误当成长期事实。

> Memory 应该是经过筛选的长期事实，不是聊天记录压缩包。

## 6. 上下文压缩是状态迁移

Hermes 没有把 context compression 处理成简单删除旧消息，而是做一次带 lineage 的会话交接：

```text
保护开头关键消息
保护最近上下文
为中间区域生成结构化摘要
修复 tool_call / tool_result 配对
旧 session 标记结束
新 session 指向 parent session
```

整理资料还记录了几个重要防线：

- memory provider 在压缩前有机会提取长期信息。
- 摘要失败不能悄悄丢弃原上下文。
- 需要防止多个进程同时压缩造成状态分叉。
- 压缩后仍要支持 resume 和历史搜索。

> 压缩不是清理文本，而是把长会话安全迁移到新的上下文边界。

## 7. 临时并行和持久协作分开

Hermes 的多 Agent 机制有两种不同语义：

```text
delegate_task   当前 turn 内同步 fan-out
Kanban worker   跨 turn、跨进程、可恢复的持久任务队列
```

`delegate_task` 适合临时并行搜索、多角度分析和父 agent 汇总；它的生命周期依附于当前 turn。

Kanban 适合长期任务、多步骤 pipeline、人工介入和崩溃恢复。它用少量持久化原语支撑协作：

```text
tasks
task_links
task_comments
task_events
assignee
workspace
```

这些原语可以组合出 fan-out、fan-in、pipeline、voting/quorum 和 long-running journal。关键不是发明复杂的 Agent 通信语言，而是把任务、依赖、状态、评论和事件做成可靠的状态机。

> 临时并行和持久协作具有不同生命周期，不应该强塞进同一种“子 agent”机制。

## 8. 外部入口用 Adapter 收敛

Hermes 支持 CLI、TUI、Dashboard、Desktop、ACP、MCP，以及 Telegram、Slack、Discord、Email 和 Webhook 等入口，但核心路径保持一致：

```text
外部平台 / 协议 / UI
  -> adapter
  -> 统一的 event / session / tool schema
  -> AIAgent loop
```

例如，MCP server 工具被归一化为内部工具，ACP 将 agent 包装成编辑器可调用的服务，Gateway 将平台消息转成统一事件，Dashboard 则复用真实 TUI。

> 外部入口可以很多，但核心 agent loop 应该只有一套；平台差异留在 adapter 层。

## 9. 并发上下文不能依赖全局变量

Gateway、TUI、ACP 和 Cron 都可能并发运行多个 session。如果用全局变量保存当前用户、cwd、profile 或 approval session，很容易串上下文。

Hermes 使用 `contextvars` 管理 session key、user/chat/thread、approval context、`HERMES_HOME` override 和 task cwd override，进入 thread pool 时再通过 `copy_context()` 传递。

> Agent runtime 支持并发后，会话状态必须随执行上下文传播，不能依赖进程级全局变量。

## 10. 安全是多层防线

Hermes 的安全模型不是单一的 YOLO 开关，而是多层约束：

- hardline block：始终禁止不可恢复或明显越界的命令。
- dangerous command approval：按 manual、smart、off 等模式处理高风险操作。
- sudo stdin guard：避免模型尝试或猜测密码。
- cron mode：为无人值守任务使用单独策略。
- secret redaction 和 environment sanitization。
- prompt injection scan、plugin opt-in 和最小工具暴露。
- dashboard、WebSocket、CORS 防护与 tool loop guardrail。

其中 hardline block 不受高信任模式影响。已有架构笔记还记录了安全模式在 import time 固定，避免 agent 通过执行 `export HERMES_YOLO_MODE=1` 在运行期绕过审批；这一实现细节应在使用时按当前源码确认。

> 高信任模式可以减少交互审批，但不应取消系统底线。

## 11. 插件发现和插件执行分开

插件是扩展能力，也是任意代码和额外攻击面。Hermes 将插件生命周期拆为：

```text
discover -> select/load -> register -> expose
```

整理资料中的具体策略包括：

- standalone 插件默认 opt-in。
- bundled backend/platform 与 memory、model provider 使用不同加载路径。
- disabled list 优先。
- 用户或项目插件可按 key 覆盖 bundled 插件。
- 插件注册的工具仍需经过 session 过滤后才对模型可见。

> 发现目录里存在插件，不等于应该立即导入和执行它。

## 12. 后台任务有自己的无人值守边界

Cron 和 Kanban worker 与普通对话不同：没有人实时审批，运行时间更长，也更容易遇到超时、崩溃和重复执行。

Hermes 为这类任务增加了：

- cron mode 的独立审批策略
- no-agent 脚本模式
- prompt 运行前的注入风险复查
- job 输出持久化
- worker heartbeat 和 crash recovery
- circuit breaker
- claim 机制，避免重复执行

> 后台 Agent 不是普通聊天的异步版，它需要自己的权限、恢复和审计模型。

## 13. 文件和终端操作是可恢复的变更系统

Hermes 的文件与终端工具除了执行动作，还处理：

- workdir 校验和 cwd 追踪
- foreground/background 区分
- 长驻进程 registry
- file read/write state 与 cross-agent file state
- patch 防线
- checkpoint 和 rollback
- lint / LSP diagnostics

> Agent 写文件和执行命令不只是一次工具调用，而是一套可追踪、可审批、可恢复的变更系统。

## 14. 可观测性默认本地，外部上报 opt-in

Agent 日志可能包含用户消息、prompt、tool output、API key、文件路径和命令输出。Hermes 的处理方式是：

- 默认写本地 rotating logs，并提供 `errors.log` 快速排障。
- 用 session tag 串联同一会话日志。
- 写盘前做 secret redaction。
- debug 上传需要显式动作。
- 外部 trace 插件必须 opt-in。

> 完整 Agent trace 不应默认上传；本地优先、外部上报 opt-in 是更稳妥的边界。

## 总结：Hermes 的设计气质

Hermes 的价值不在某个单点功能，而在于它持续做同一件事：把容易混乱的状态、上下文、权限和任务生命周期拆开，再让每一层都可持久化、可查询、可恢复。

这套拆分可以概括为：

```text
状态存储       != 上下文窗口
稳定规则       != 动态上下文
内部历史       != 模型请求副本
工具注册       != 工具暴露
长期记忆       != 历史检索
临时并行       != 持久任务
外部入口       != 核心 loop
插件发现       != 插件执行
高信任模式     != 取消安全底线
普通对话       != 无人值守任务
```

如果压缩成一句话：

> Agent 工程的核心不是让模型一次回答得更聪明，而是把模型周围的状态、工具、权限、上下文、任务和外部入口设计成可恢复、可审计、可组合的系统。
