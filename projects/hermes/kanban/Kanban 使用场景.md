# Kanban 使用场景

这篇笔记整理自 `kanban-tutorial.md`，主要记录 Hermes Kanban 适合哪些场景，以及每种场景想说明什么机制。

## 教程的前提

教程假设你已经知道几个基础概念：

```text
task        任务卡
run         一次执行尝试
assignee    分配给哪个 profile
dispatcher  扫描看板并启动 worker 的调度器
```

用户可以通过 dashboard / CLI 查看和操作任务；worker 不看 dashboard，也不跑 CLI，而是通过 `kanban_*` 工具读写看板。

## 看板列

Dashboard 里常见列：

```text
Triage       粗略想法，等待拆解或明确
Todo         已创建，但还没满足依赖或还没分配
Ready        已分配，等待 dispatcher claim
In progress  worker 正在执行
Blocked      等待人类输入，或失败熔断
Done         已完成
```

这套列就是任务状态机的可视化。

## 场景一：单人开发一个 feature

经典流程：

```text
Design schema -> Implement API -> Write tests
```

这说明 Kanban 如何表达任务依赖。

例如：

```text
SCHEMA -> API -> TESTS
```

只有 `SCHEMA` 一开始是 `ready`。`API` 和 `TESTS` 会停在 `todo`，直到父任务完成。

worker 完成 `SCHEMA` 后，会写入：

```text
summary
metadata
```

下游 `API` worker 调用 `kanban_show()` 时，就能看到父任务的结构化结果，而不需要重新读一篇长设计文档。

这个场景的重点：

> Kanban 不只是任务列表，它能把上游产出作为下游 worker 的上下文交接。

## 场景二：Fleet farming

Fleet farming 指一个或多个 specialist profile 并行处理大量独立任务。

例子：

```text
translator   翻译多个页面
transcriber  转写多个通话
copywriter   写多个商品描述
```

这些任务彼此没有依赖，可以并行执行。

dispatcher 会根据 assignee 把任务分配给对应 profile。Dashboard 的 `In progress` 可以按 profile 分 lane 展示，让用户看到每个 worker 正在做什么。

这个场景的重点：

> Kanban 可以把一堆同类或独立任务交给多个 specialist profile 并行消化，同时保留可见进度和结构化结果。

## 场景三：角色流水线 + 重试

这是 Kanban 比普通 TODO list 更有价值的地方。

示例流程：

```text
PM 写规格 -> Engineer 实现 -> Reviewer 审查 -> Engineer 修改 -> Reviewer 通过
```

关键是：某个任务可能不是一次成功。

例如实现任务第一次被 reviewer 打回：

```text
run 1 -> blocked
reason = password strength check missing ...
```

人类或 reviewer unblock 后，同一张任务卡会产生第二次 run：

```text
run 2 -> completed
metadata = changed_files / tests_run / review_iteration
```

第二次 worker 读取任务时，会看到第一次 block 的原因，因此不需要从头猜问题。

这个场景的重点：

> Kanban 的 retry history 是一等结构。失败、阻塞、修改、再次完成，都保存在同一张任务卡的 run history 里。

## 场景四：熔断和崩溃恢复

真实 worker 会失败，例如：

- 缺少环境变量
- 认证失败
- OOM
- 进程崩溃
- 网络问题
- 外部 CLI 不存在

Kanban 有两类防护：

### Circuit breaker

如果某个任务连续失败太多次，dispatcher 不会无限重试，而是把任务自动 block。

例如：

```text
spawn_failed
spawn_failed
gave_up
```

这样坏任务不会无限消耗 worker。

### Crash recovery

如果 worker 已经启动，但中途进程死掉，dispatcher 可以检测到 PID 消失，然后释放 claim，让任务回到 `ready`，下一轮重新调度。

重试 worker 可以看到之前 run 的失败原因，选择不同策略继续执行。

这个场景的重点：

> Kanban 把失败当成正常状态来建模，而不是把失败藏在某次对话上下文里。

## 结构化交接为什么重要

教程反复强调 `summary` 和 `metadata`。

worker 完成任务时，不应该只写一句“完成了”，而应该写清楚：

```text
summary   人类可读的结果
metadata  机器可读的结构化信息
```

例如：

```text
changed_files
tests_run
decisions
acceptance
review_iteration
```

这样下游 worker / reviewer 可以快速知道：

- 上游做了什么
- 怎么验证的
- 哪些文件改了
- 哪些风险还在
- 之前为什么失败

## 运行中任务如何查看

一个任务在 `running` 时，会有一个 active run。

如果 worker 后续：

- 完成，run 变成 `completed`
- block，run 变成 `blocked`
- 崩溃，run 变成 `crashed`
- 超时，run 变成 `timed_out`

run 不会消失，而是变成 attempt history 的一部分。

这让用户能复盘整个任务经历了什么，而不只是看到最新状态。

## 我的理解

`kanban-tutorial.md` 的重点不是教几个命令，而是用场景证明 Kanban 的几个能力：

- 任务依赖：父任务完成后子任务才 ready。
- 并行处理：多个 profile 可以同时消化任务。
- 角色流水线：不同 profile 按阶段接力。
- 阻塞重试：block / unblock 让人类介入成为一等流程。
- 崩溃恢复：worker 死掉后任务不会丢。
- 结构化交接：summary / metadata 让下游 worker 不用猜。

一句话：

> Kanban 的价值在于把多 Agent 协作中的“过程”也保存下来，而不只是保存最终结果。
