# Hermes Kanban 核心概念

> 来源状态：**设计稿 + 项目文档整理**。核心 schema 和状态来自 `hermes-kanban-v1-spec.pdf`（标注 **Design Only**）及 `kanban.md`；本文未逐项做**源码验证**。设计稿与当前实现的差异均属**待确认**，“适用边界”包含**个人推断**。

本文只统一术语、状态和边界。协作模式、worker 执行和恢复机制分别放在其他文档。

## 一句话理解

Hermes Kanban 的设计目标，是用 SQLite 中的持久任务状态协调多个 Hermes profile，使任务交接不依赖某个父 Agent 的单次进程或对话上下文。

## 核心对象

| 对象 | 设计语义 | 关键边界 |
| --- | --- | --- |
| Board | 独立任务队列，拥有 DB 与 workspace 范围 | board 之间不建立 task link；用于硬隔离 |
| Task | 逻辑工作单元 | 保存标题、正文、assignee、状态、优先级等 |
| Link | Task 之间的依赖 | 父任务完成后，子任务才可能进入 `ready` |
| Comment | 人类与 Agent 的持久交流 | 问题、反馈、审查意见不依赖聊天上下文 |
| Profile | 具名 Agent 身份 | 可以拥有自己的 memory、skills 和工具集 |
| Assignee | Task 上的执行者标识 | 决定 dispatcher 应选择哪条 worker lane |
| Workspace | Task 的文件上下文 | `scratch`、`dir:<path>` 或 git worktree |
| Dispatcher | 读取状态并启动 worker 的调度者 | 不承担智能路由、预算和组织治理 |
| Tenant | board 内的可选标签或命名空间 | 只是软过滤，不是安全隔离边界 |

## 状态

v1 设计稿给出的主状态如下：

| 状态 | 含义 | 典型下一步 |
| --- | --- | --- |
| `todo` | 已创建，但依赖尚未满足 | 父任务完成后转 `ready` |
| `ready` | 可以领取 | 被原子 claim 后转 `running` |
| `running` | 某次执行正在进行 | `done`、`blocked` 或被回收 |
| `blocked` | 等待输入、审查或人工处理 | 解除阻塞后重新调度 |
| `done` | 逻辑工作已完成 | 触发下游依赖重新判断 |
| `archived` | 从活跃视图移出 | 继续保留历史 |

教程中的 Dashboard 还出现 `Triage` 列。它是否对应当前持久化状态，本文没有源码证据，暂记为**待确认**。

状态机的核心不是列名，而是每次变化都能被持久化和审计：

~~~text
todo -> ready -> running -> done
                    |
                    v
                 blocked -> ready
~~~

## Task、Run 与 Event

- **Task** 表示“这件事”，其身份跨重试保持不变。
- **Run** 表示一次执行尝试；后续 worker 文档使用 run id 区分新旧尝试。Run 是否属于 v1 最小 schema 之外的后续实现，**待确认**。
- **Event** 表示时间线上的变化，例如 created、claimed、blocked、completed 或 stale。

因此，一张 Task 可以有多次 Run；Event 用来解释这些尝试如何演变。

## 数据与上下文边界

v1 设计稿的最小 schema 是：

~~~text
tasks
task_links
task_comments
task_events
~~~

其中 assignee 和 workspace 是 `tasks` 的字段，不是独立实体。Board 提供更强的 DB / workspace 隔离，Tenant 只在同一 Board 内做分类。不要把 Tenant 当作权限或安全边界。

Workspace 解决的是“在哪里工作”：

| 类型 | 用途 |
| --- | --- |
| `scratch` | 一次性临时工作 |
| `dir:<path>` | 复用已有项目、知识库或业务目录 |
| `worktree` | 隔离并行代码修改 |

## 操作入口边界

| 使用者 | 入口 | 用途 |
| --- | --- | --- |
| 人类或脚本 | CLI、聊天命令、Dashboard | 创建、查看、评论、解除阻塞、归档 |
| Kanban worker | `kanban_*` 结构化工具 | 读取任务并回写完成、阻塞、心跳等状态 |

worker 使用结构化工具可以避免 shell 转义和远程环境缺少 CLI 的问题；这项行为是否已覆盖所有执行环境，**待确认**。

## 适用边界

适合 Kanban 的工作通常具有一种或多种特征：

- 需要跨进程、跨轮次或跨 profile 存活。
- 需要依赖关系、人工介入、失败恢复或审计。
- 交接结果要对其他 Agent 或人类可见。

短小、同步、父 Agent 必须立即拿到结果的任务，更适合 `delegate_task`。详细判断见 [多 Agent 协作](./多%20Agent%20协作.md)。

设计稿偏向单机 SQLite、同机 dispatcher 和本地 worker。跨多主机调度需要额外的队列、远程执行与一致性设计，不能从本文推断 Hermes 已经支持。
