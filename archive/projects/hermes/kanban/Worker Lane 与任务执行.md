# Worker Lane 与任务执行

这篇笔记整理自 `kanban-worker-lanes.md`，用于理解 Kanban 任务卡是如何被真正执行的。

## Worker lane 是什么

Worker lane 可以理解为“任务执行通道”。

一张 Kanban 卡被分配给某个 `assignee` 后，dispatcher 需要知道：

- 这个 `assignee` 代表谁
- 怎么启动它
- 它启动后必须如何结束任务
- 它失败时系统如何处理

所以一个 lane 至少包含三件事：

```text
assignee string  分配标识
spawn mechanism  启动方式
lifecycle contract  生命周期契约
```

## 层级关系

原文给出的层级可以这样理解：

```text
Hermes Kanban  =  任务生命周期与审计真相
Worker lane    =  某张任务卡的执行者
Reviewer       =  审查并决定是否真的完成的人或代理
GitHub PR      =  可选的代码交付物
```

关键点是：

> Kanban 拥有任务生命周期的真相，worker lane 只是执行任务，不能自己绕过 Kanban 改写状态。

worker 做的任何事，最后都应该通过 `kanban_*` 工具或 API 回写到 Kanban。

## 一个 lane 必须提供什么

### 1. assignee string

`task.assignee` 是 dispatcher 用来匹配执行者的字段。

默认情况下，它对应一个 Hermes profile 名称，例如：

```text
researcher
writer
reviewer
backend-dev
```

如果 assignee 找不到，任务不会被随便交给某个 fallback worker，而是留在 `ready`，并记录类似 `skipped_nonspawnable` 的事件，方便操作者修复。

这点很重要：**任务不会因为 assignee 拼错就被错误执行。**

### 2. spawn mechanism

对默认 Hermes profile lane 来说，dispatcher 会启动类似这样的进程：

```text
hermes -p <assignee> chat -q <prompt>
```

启动时会把任务上下文通过环境变量传进去，例如：

```text
HERMES_KANBAN_TASK
HERMES_KANBAN_DB
HERMES_KANBAN_BOARD
HERMES_KANBAN_WORKSPACE
HERMES_KANBAN_RUN_ID
HERMES_KANBAN_CLAIM_LOCK
HERMES_PROFILE
HERMES_TENANT
```

这些变量让 worker 知道：

- 当前处理哪张卡
- 用哪个 board / DB
- 在哪个 workspace 里工作
- 当前 run 是哪一次尝试
- 自己的 claim lock 是什么

### 3. lifecycle terminator

每次 claim 最后必须有一个明确结局：

```text
kanban_complete(summary=..., metadata=...)
kanban_block(reason=...)
worker 异常退出 / 超时 / 崩溃
```

健康 worker 不应该“写完普通回答就退出”。如果 worker 没有调用 `kanban_complete` 或 `kanban_block` 就退出，Kanban 会把它当成协议违规或失败路径。

这保证了任务状态不会停留在一种模糊状态：

```text
到底做完了吗？
是卡住了吗？
还是 worker 死了？
```

## review-required 约定

对代码修改类任务来说，worker 写完代码不一定代表任务真的完成，因为还需要人类 review。

这种情况下可以用约定：

```text
kanban_comment(...)  先写结构化元信息
kanban_block(reason="review-required: ...")
```

这样任务会进入 `blocked`，表示等待 review。

Reviewer 可以：

- approve 后 unblock
- comment 要求修改
- 让 worker 下一轮读取 comment thread 后继续

这个设计把“实现完成”和“审查通过”区分开。

## 日志和审计

dispatcher 会把每个 worker 的 stdout / stderr 写到任务日志里。

同时，Kanban 还会记录：

- `task_runs`：每次尝试的 run history，包括 summary、metadata、exit code、log path。
- `task_events`：每次状态变化，例如 claimed、heartbeat、completed、blocked、crashed、timed_out。

这些信息让 reviewer 或后续 worker 可以不用打开 dashboard，也能通过 `kanban_show` 看到完整历史。

## 现有 lane 类型

### Hermes profile lane

这是默认 lane 类型。

特点：

- assignee 是 profile 名称
- dispatcher 启动 `hermes -p <profile>`
- worker 加载 `kanban-worker` skill
- worker 用 `kanban_*` 工具结束任务

创建 profile 时，名称最好体现角色，例如：

```text
researcher
writer
reviewer
backend-dev
ops
```

这样 orchestrator 才容易把任务路由给合适的 profile。

### Orchestrator profile lane

Orchestrator 是特殊的 profile lane。

它的职责不是自己执行任务，而是：

- 拆解高层目标
- 创建子任务
- 设置 assignee
- 建立 parent / child links
- 然后退场

更好的 orchestrator 应该有 `kanban` 能力，但不应该默认拥有 `terminal`、`file`、`code`、`web` 这些执行工具。

它是控制室，不是万能工人。

### 外部 CLI worker lane

文档也提到可以接入非 Hermes worker，例如：

```text
Codex CLI
Claude Code CLI
OpenCode CLI
本地 coding model runner
```

但这还不是完全铺好的路径。

外部 lane 需要解决：

- 如何启动外部 CLI
- 如何把退出码映射到 `kanban_complete` / `kanban_block`
- 如何处理 workspace / sandbox
- 如何处理认证和策略
- 如何把日志、结果和错误写回 Kanban

所以它更像插件集成问题，不是 Kanban kernel 的默认能力。

## dispatcher 处理的失败模式

worker lane 作者不需要自己重做所有失败恢复，因为 dispatcher 已经负责一些通用情况：

### Stale claim TTL

worker claim 了任务，但之后没有完成、没有 block、也没有有效 heartbeat。

超过 TTL 后，任务可以被回收。

### Crashed worker

如果本机 PID 消失，说明 worker 进程可能崩溃。

dispatcher 会回收任务，并增加失败计数。

### Run-level retry

同一张任务卡可以有多次 run。

如果任务被重试，worker 可以通过 run id / expected run id 判断自己是不是已经过期，避免旧 worker 覆盖新 worker 结果。

### Per-task max runtime

任务可以设置最大运行时间。

即使 PID 还活着，如果超过 wall-clock 限制，也可以被判定为超时。

### Stranded task detection

如果任务一直停在 `ready`，但 assignee 从不 claim，说明可能有问题：

- assignee 拼错
- profile 被删了
- 外部 worker pool 不在线

诊断工具会把它标成 stranded。

## 我的理解

Worker lane 解决的是“任务卡如何变成一个实际执行过程”的问题。

它把执行者抽象成一个可替换通道：

```text
任务卡 -> assignee -> lane -> spawn worker -> worker 回写结果
```

关键不是“怎么启动某个进程”，而是启动后必须遵守同一套生命周期契约：

```text
show -> work -> heartbeat -> complete / block
```

这样无论 worker 是 Hermes profile、外部 CLI，还是未来的容器服务，都能通过同一套 Kanban 状态机协作。
