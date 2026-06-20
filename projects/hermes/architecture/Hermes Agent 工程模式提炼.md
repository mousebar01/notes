# Hermes Agent 工程模式提炼

这篇笔记不是介绍 Hermes 的项目目录，而是从 Hermes 的架构里提炼一些可以迁移到其他 Agent 系统的工程模式。

如果只看功能，Hermes 像是一个集成了 CLI、TUI、Gateway、MCP、Kanban、Memory、插件和桌面端的复杂 Agent 项目。但从工程设计角度看，它真正值得学习的是：它把 Agent 系统里容易混在一起的东西拆开了，并且给每一类状态、能力和生命周期找到了合适的边界。

## 1. 把关键状态从上下文窗口里拿出来

很多简单 Agent 原型的问题是：状态只存在于当前 prompt 或内存里。

这样会导致：

- 进程一退出，任务状态丢失。
- 子任务运行到一半无法恢复。
- 多端接入时不知道当前 session 到哪一步。
- 历史只能靠模型上下文记住。
- 审计和搜索都很困难。

Hermes 的做法是把关键状态落到 SQLite：

- session metadata
- messages
- system prompt snapshot
- compression lineage
- Kanban task state
- task comments / events
- token 和 cost counters

这背后的通用模式是：

> Agent 的关键运行状态不应该只放在 prompt 里，而应该进入可查询、可恢复、可审计的外部状态存储。

这也是从 demo 走向工程系统的第一步。

## 2. 稳定规则和动态上下文分开

Agent 的 prompt 里通常会混入很多东西：

- 身份
- 工具规则
- 项目规则
- 用户偏好
- 当前时间
- 检索结果
- 插件上下文
- 外部 memory recall

如果全部塞进 system prompt，每一轮都重新拼，prompt cache 会失效，行为也会不稳定。

Hermes 的模式是：

```text
stable      长期稳定的身份和操作规则
context     项目规则和 workspace 上下文
volatile    session 级但较易变的信息
per-turn    当前轮检索结果、插件上下文、外部 memory recall
```

其中 system prompt 在 session 内冻结，动态信息在 API 调用时注入当前 user message。

可迁移经验：

> 稳定规则应该被冻结，动态上下文应该临时注入。不要让每轮检索结果污染 system prompt。

## 3. 内部历史和模型请求副本分开

Hermes 区分：

```text
messages       内部真实历史，会持久化
api_messages   每次请求模型前临时组装
```

外部 memory recall、插件上下文、provider 兼容字段等只进入 `api_messages`，不写回真实历史。

这个模式解决的是一个很常见的问题：

```text
模型本轮需要知道的信息
不一定是系统长期应该保存的事实
```

例如检索结果可以帮助本轮回答，但不能被当成用户刚说的话保存进 session。插件上下文可以影响本轮行为，但不一定应该成为历史记录。

可迁移经验：

> Agent 系统要区分“给模型看的临时上下文”和“系统要保存的 durable history”。

## 4. 工具注册和工具暴露分开

简单系统里经常是：工具注册了，模型就能调用。

Hermes 的模式更细：

```text
registry       工具能力全集
toolset        场景化工具分组
session config 当前会话启用/禁用哪些能力
availability   当前环境是否真的可用
schema          最终暴露给模型的工具描述
dispatch        实际执行工具
```

这样做的好处是：

- CLI、Gateway、Cron、ACP、Kanban worker 可以暴露不同工具面。
- 子 agent 不能自动继承父 agent 的全部能力。
- 某些工具依赖 Docker、浏览器、凭证或 MCP server，只有可用时才暴露。
- 插件工具可以注册，但不一定默认启用。

可迁移经验：

> 工具注册只是能力库存，模型可见工具应该是当前 session 的最小可用能力面。

## 5. 长期记忆和历史检索分开

Hermes 没有把所有历史都写进 memory，而是区分：

```text
Memory          少量长期事实
Session Search  精确历史检索
Messages        当前会话记录
```

Memory 适合保存：

- 用户稳定偏好
- 长期工作方式
- 重要身份信息
- 可复用原则

Session search 适合查：

- 某次对话说了什么
- 某个任务的具体细节
- 某个文件、commit、PR、命令输出

如果把所有细节都塞进 memory，会带来两个问题：

- 每轮 prompt 变贵。
- 临时事实被误当成长期事实。

可迁移经验：

> Memory 应该是经过筛选的长期事实，不应该变成聊天记录压缩包。

## 6. 上下文压缩是状态迁移，不是删除消息

长会话一定会遇到上下文窗口问题。最粗暴的方法是删旧消息，但 Agent 场景里这很危险：

- tool call / tool result 可能被删断。
- 用户目标可能丢失。
- 最近任务状态可能丢失。
- 压缩后无法 resume。
- 历史搜索不知道新旧 session 关系。

Hermes 把压缩做成会话迁移：

```text
保护开头关键消息
保护最近上下文
中间区域生成结构化摘要
修复工具调用配对
旧 session 标记结束
新 session 指向 parent session
```

可迁移经验：

> 压缩不是清理文本，而是把一个长会话安全迁移到新的上下文边界。

## 7. 同步子任务和持久任务队列分开

Hermes 的多 Agent 不是单一机制，而是分成两类：

```text
delegate_task   当前 turn 内同步 fan-out
Kanban worker   持久任务队列
```

`delegate_task` 适合：

- 临时并行搜索
- 多角度分析
- 父 agent 汇总子结果

Kanban 适合：

- 长期任务
- 多步骤 pipeline
- worker 崩溃恢复
- human-in-the-loop
- 任务状态审计

这两类机制的生命周期完全不同。

可迁移经验：

> 不要把所有“子 agent”都设计成一种东西。临时并行和持久协作应该分开。

## 8. 多 Agent 协作不一定需要复杂协议

Hermes Kanban 的底层原语很少：

```text
tasks
task_links
task_comments
task_events
assignee
workspace
```

但这些简单原语可以组合出：

- fan-out
- fan-in
- pipeline
- voting / quorum
- long-running journal
- human unblock

这里的关键不是发明复杂的多 Agent 通信语言，而是把任务、依赖、状态、评论、事件持久化。

可迁移经验：

> 多 Agent 协作的底层不一定是复杂协议，很多时候是一个可靠的任务状态机。

## 9. 外部入口用 Adapter 收敛

Hermes 支持很多入口：

- CLI
- TUI
- Dashboard
- Desktop
- ACP
- MCP
- Telegram / Slack / Discord / Email / Webhook

如果每个入口都直接改 agent loop，核心逻辑会很快失控。

Hermes 的模式是：

```text
外部平台 / 协议
  -> adapter
  -> 统一事件 / session / tool schema
  -> AIAgent loop
```

例如：

- MCP server 工具转成内部工具。
- ACP 编辑器请求转成 agent session。
- Gateway 平台消息转成 `MessageEvent`。
- Dashboard 嵌入真实 TUI，而不是重写聊天内核。

可迁移经验：

> 外部入口可以很多，但核心 agent loop 应该只有一套。平台差异要压在 adapter 层。

## 10. 并发上下文不能靠全局变量

Gateway、TUI、ACP、Cron 都可能并发运行多个 session。如果用全局变量保存当前用户、当前 cwd、当前 profile、当前 approval session，很容易串上下文。

Hermes 使用 `contextvars` 管理：

- session key
- user/chat/thread
- approval context
- HERMES_HOME override
- task cwd override

进入 thread pool 时再用 `copy_context()` 传递上下文。

可迁移经验：

> Agent runtime 一旦支持并发，就不能依赖全局环境变量表达当前会话状态。

## 11. 安全要分层，而不是一个 YOLO 开关

Agent 会执行命令、写文件、调用插件、连接外部服务，所以安全不能只有“允许/不允许”。

Hermes 的安全层次包括：

- hardline block
- dangerous command approval
- sudo stdin guard
- secret redaction
- prompt injection scan
- plugin opt-in
- toolset 最小暴露
- env sanitization
- dashboard / websocket / CORS 防护
- tool loop guardrail

其中 hardline block 不受 YOLO/off 影响。这是一个很重要的设计：用户可以选择高信任模式，但系统仍然保留不可越过的底线。

可迁移经验：

> Agent 安全应该是多层防线。高信任模式不等于取消所有底线。

## 12. 插件发现和插件执行分开

插件是 Agent 系统扩展能力的重要方式，但插件也是任意代码。

Hermes 的模式是：

- 可以发现插件。
- 不一定加载插件。
- standalone 插件默认 opt-in。
- disabled list 优先。
- memory provider、model provider、backend provider 有不同加载路径。
- 插件工具也要走 registry/toolset/availability 过滤。

这个模式避免了“只要目录里有插件就执行”的风险。

可迁移经验：

> 插件系统至少要区分 discover、load、register、expose 四个阶段。

## 13. 后台任务要有无人值守边界

Cron、Kanban worker 这类后台任务和普通对话不同：

- 没有人实时审批。
- 运行时间更长。
- 更容易遇到崩溃、超时、重复执行。
- 输出需要投递或保存。
- prompt 可能来自磁盘上的 skill、script、历史 job 输出。

Hermes 对后台任务做了额外设计：

- cron mode 单独审批策略。
- no-agent 脚本模式。
- prompt 运行前重新扫描注入风险。
- job 输出持久化。
- worker heartbeat。
- crash recovery。
- circuit breaker。
- claim 防重复执行。

可迁移经验：

> 后台 Agent 不是普通聊天的异步版，它需要自己的权限、恢复和审计模型。

## 14. 文件和终端操作要可回滚、可追踪

Hermes 的文件/终端工具不是直接让模型随便执行 shell。

它额外处理：

- workdir 校验
- cwd 追踪
- foreground/background 区分
- 长驻进程 registry
- file read/write state
- patch 防线
- checkpoint
- rollback
- lint / LSP diagnostics
- cross-agent file state

这背后有一个通用经验：

> Agent 写文件和执行命令不是“工具调用”这么简单，而是一套可追踪、可审批、可恢复的变更系统。

## 15. 可观测性默认本地，外部上报 opt-in

Agent 的日志里可能有非常敏感的信息：

- 用户消息
- prompt
- tool output
- token
- API key
- 文件路径
- 命令输出

Hermes 的观测模式是：

- 默认写本地 rotating logs。
- `errors.log` 做快速排障。
- session tag 串起同一会话日志。
- 写盘前做 secret redaction。
- debug 上传需要显式动作。
- 外部 trace 插件必须 opt-in。

可迁移经验：

> Agent observability 不能默认上传完整 trace。默认本地、外部 opt-in 是更稳妥的边界。

## 总结

Hermes 的工程价值不只是功能多，而是它提供了一套比较成熟的 Agent 系统拆分方式：

```text
状态持久化
Prompt 分层
工具能力分层
历史和记忆分层
同步任务和持久任务分层
平台入口和核心 loop 分层
安全审批分层
插件生命周期分层
后台任务生命周期分层
```

这些模式可以迁移到其他 Agent 项目里。

如果要压缩成一句话：

> Agent 工程的核心不是让模型一次回答得更聪明，而是把模型周围的状态、工具、权限、上下文、任务和外部入口设计成可恢复、可审计、可组合的系统。

