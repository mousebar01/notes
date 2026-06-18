# Hermes Kanban 核心概念

这篇笔记整理自 `kanban.md`，目标是快速抓住 Hermes Kanban 的核心机制，而不是逐字翻译原文。

## 一句话理解

Hermes Kanban 是一个基于 SQLite 的持久化任务看板，用来协调多个 Hermes profile / Agent 协作。

它解决的问题是：多个 Agent 不再依赖脆弱的进程内子 Agent 调用，而是通过同一个任务看板交接工作、记录状态、恢复失败和审计过程。

可以理解成：

```text
任务卡 = 工作单元
看板 = 多 Agent 之间的共享状态层
dispatcher = 扫描看板并启动 worker 的调度器
profile = 具体执行任务的 Agent 身份
```

## 两种操作入口

Hermes Kanban 有两类入口：

1. **人类 / 脚本入口**

用户通过这些方式操作看板：

```text
hermes kanban ...
/kanban ...
dashboard
cron / scripts
```

这些入口适合创建任务、查看状态、评论、解除阻塞、归档等。

2. **Agent / worker 入口**

Agent 不应该在任务执行时 shell 调用 `hermes kanban`，而是通过 `kanban_*` 工具直接读写看板，例如：

```text
kanban_show
kanban_complete
kanban_block
kanban_heartbeat
kanban_comment
kanban_create
kanban_link
kanban_unblock
```

这样可以避免 shell 参数转义问题，也能让工具结果保持结构化。

## Kanban 和 delegate_task 的区别

`delegate_task` 和 Kanban 都能让 Agent 把工作交给另一个执行者，但它们不是同一种机制。

| 对比项 | delegate_task | Kanban |
| --- | --- | --- |
| 形态 | 一次 RPC 调用 | 持久化任务队列 + 状态机 |
| 父 Agent | 等子任务返回 | 创建任务后可以结束 |
| 子 Agent 身份 | 匿名、短生命周期 | 命名 profile，有自己的 memory / skills |
| 可恢复性 | 失败就失败 | 可 block / unblock / reclaim / retry |
| 人类介入 | 不适合 | 可以 comment / unblock / reassign |
| 审计记录 | 容易随上下文压缩丢失 | SQLite 中长期保存 |

一句话：

> `delegate_task` 是函数调用；Kanban 是一个持久化工作队列，每次交接都是任何 profile 或人类都能读写的一行记录。

适合用 `delegate_task` 的情况：

- 短小、自包含的推理任务
- 父 Agent 需要立刻拿到答案继续执行
- 不需要人类介入
- 不需要长期审计

适合用 Kanban 的情况：

- 工作跨多个 Agent / profile
- 任务需要跨进程、跨轮次存在
- 可能需要人类输入
- 可能需要失败恢复或重试
- 结果以后还要被追踪和审计

## 核心概念

### Board

Board 是一个独立任务队列，有自己的 SQLite DB、workspace 目录和 dispatcher loop。

一个 Hermes 安装可以有多个 board，例如：

```text
default
project-a
repo-x
ops
```

不同 board 之间隔离：

- SQLite DB 独立
- workspace / logs 独立
- worker 只能看到自己 board 的任务
- 不允许跨 board 建 task link

### Task

Task 是任务卡，是看板里的基本工作单元。

它通常包含：

```text
title
body
assignee
status
tenant
workspace
priority
idempotency key
```

常见状态：

```text
triage    粗略想法，等待拆解或明确
todo      已创建，但依赖还没满足或还没准备好
ready     可以被 dispatcher 领取
running   worker 正在执行
blocked   等待人类或其他 profile 输入
done      已完成
archived  已归档
```

### Link

Link 表示任务依赖关系。

例如：

```text
Research -> Draft -> Review
```

后一个任务必须等前一个任务完成后才会从 `todo` 推进到 `ready`。

这让 Kanban 可以表达流水线、fan-in、fan-out 等协作结构。

### Comment

Comment 是 Agent 和人类之间的持久化交流通道。

它可以记录：

- 问题
- 人类反馈
- 中间产物
- 审查意见
- 重试原因
- 后续建议

worker 被重新启动时，会读取完整 comment thread。因此不需要依赖脆弱的聊天上下文。

### Workspace

Workspace 是 worker 执行任务时所在的目录。

主要有三种：

```text
scratch        临时目录，任务完成后可清理
dir:<path>     指向已有目录，例如 Obsidian vault、项目目录、邮件处理目录
worktree       git worktree，适合代码任务
```

Workspace 的意义是给任务一个明确的文件上下文边界，避免多个 worker 混在同一个目录里互相影响。

### Dispatcher

Dispatcher 是调度器，默认跑在 gateway 里。

它做的事主要是：

1. 扫描任务状态。
2. 把依赖已满足的任务推进到 `ready`。
3. 原子 claim 一个 `ready` 任务。
4. 根据 `assignee` 启动对应 profile。
5. 回收 stale claim 或崩溃 worker。
6. 连续失败后自动 block，避免无限重试。

Dispatcher 不应该做复杂智能路由。智能路由、预算、审批、组织层级更适合放到 profile、skill 或 plugin。

### Tenant

Tenant 是 board 内的可选命名空间。

它适合一个 specialist fleet 服务多个业务上下文：

```text
business-a
business-b
personal
```

Tenant 不是强隔离边界，更像软过滤和上下文标签。真正的硬隔离还是 board。

## Worker 如何执行任务

一个典型 worker 流程是：

```text
dispatcher claim task
dispatcher spawn profile
worker 调用 kanban_show 读取任务上下文
worker 在 workspace 中做实际工作
worker 定期 kanban_heartbeat
worker 完成后 kanban_complete
如果卡住，则 kanban_block
```

其中 `kanban_complete` 最好写清楚：

```text
summary     人类可读的结果摘要
metadata    结构化交接信息，例如 changed_files、verification、residual_risk
```

这样下游任务或 reviewer 不需要重新猜测上游做了什么。

## 为什么用工具而不是 CLI

worker 用 `kanban_*` 工具有几个好处：

1. **避免环境问题**：如果 worker 的 terminal 在 Docker / SSH / Modal 里，里面不一定有 `hermes` 命令或本地 DB。
2. **避免 shell 转义问题**：结构化 metadata 不需要被塞进命令行字符串。
3. **错误更清楚**：工具返回结构化 JSON，模型更容易理解。
4. **正常会话不膨胀**：普通 `hermes chat` 不会默认带上所有 `kanban_*` 工具。

## Dashboard 的作用

Dashboard 不是核心逻辑，只是人类更舒服地看和操作 Kanban 的界面。

它适合：

- 查看任务状态
- 看 comment thread
- 拖动任务状态
- 批量 reassign / archive
- 查看 run history
- 看 worker 日志和事件

它本质上仍然通过同一个 `kanban_db` 层读写 SQLite，所以 CLI、Dashboard、Agent 工具不会各自维护一套状态。

## Runs 和 Events

Task 是逻辑工作单元，Run 是一次执行尝试。

一个任务可能经历多次 run：

```text
run 1 blocked
run 2 crashed
run 3 completed
```

Run 用来保存每次尝试的：

- worker profile
- started / ended
- outcome
- summary
- metadata
- error
- log path

Event 则记录状态变化和执行过程，例如：

```text
created
promoted
claimed
spawned
heartbeat
completed
blocked
unblocked
crashed
timed_out
stale
gave_up
```

Runs 解决“尝试历史”，Events 解决“时间线审计”。

## 典型协作模式

Kanban 支持一些常见协作模式：

- **Fan-out**：一个任务拆成多个并行子任务。
- **Pipeline**：Research -> Draft -> Review 这种顺序链条。
- **Voting / Quorum**：多个 worker 给答案，一个 aggregator 汇总。
- **Long-running journal**：同一个 profile 定期写入同一个 workspace。
- **Human-in-the-loop**：worker block，用户 comment，然后 unblock。
- **@mention delegation**：通过 `@reviewer` 这种方式创建委派任务。
- **Thread-scoped workspace**：聊天 thread 绑定 workspace。
- **Fleet farming**：一个 specialist profile 管很多相似对象。

这些模式本质上都来自同一组原语：

```text
tasks + links + comments + assignee + workspace
```

## 适用边界

Kanban 设计上偏单机。

它假设：

- `kanban.db` 是本地 SQLite 文件。
- dispatcher 在同一台机器上启动 worker。
- crash detection 可以通过本机 PID 判断。

如果要跨多主机协作，Kanban 本身不是完整方案，需要额外的消息队列、远程调度或每台机器独立 board。

## 我的理解

Hermes Kanban 的关键不是“多开几个 Agent”，而是把多 Agent 协作变成一个可持久化、可恢复、可审计的工作流系统。

它最重要的设计取舍是：

- 用 SQLite 做共享状态，而不是让 Agent 彼此直接通信。
- 用 profile 表示 worker 身份，而不是重新发明 agent entity。
- 用 task / link / comment / event 表达协作，而不是设计复杂协议。
- 用 dispatcher 做简单调度，把智能路由留给 profile / skill / plugin。
- 用 run / event 保存尝试历史和审计线索。

一句话总结：

> Kanban 是 Hermes 的多 Agent 协作状态层；它让任务、交接、失败恢复和人类介入都变成可记录、可恢复的结构化流程。
