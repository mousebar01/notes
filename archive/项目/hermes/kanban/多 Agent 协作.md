# 多 Agent 协作

> 来源状态：主体来自 `hermes-kanban-v1-spec.pdf`，该 PDF 明确标注 **Design Only**；因此三平面、P1-P8 和 dispatcher 职责均按**设计稿**表述，不作为当前实现证明。Swarm 对比和边界判断含**个人推断**，实际落地范围**待确认**，本文没有逐项**源码验证**。

## 要解决的问题

短生命周期子 Agent 往往依赖父 Agent 的进程、调用链和当前上下文。父 Agent 结束、容器重启或上下文压缩后，子任务可能失去状态；如果只并行分工而没有明确汇总任务，也容易出现“每个 Agent 都做了事，但没人交付最终结果”。

Kanban v1 的设计选择是把任务、依赖、评论和事件放进持久状态层，让执行者可以退出或重启，而工作本身仍能继续被发现、接手和审计。

## Swarm 与 Kanban

Swarm 是“多个 Agent 围绕同一目标动态组队”的宽泛范式，常由 manager / lead 拆分任务、启动子 Agent 并汇总结果。它可以很灵活；其状态可能在共享上下文、运行时或外部存储中，不能一概而论。

设计稿主要反对的是 **in-process swarm**，而不是所有多 Agent 协作：如果子 Agent 都绑在父进程和单次 SDK 生命周期里，父进程结束时协作状态也可能消失。

| 对比项 | 典型 in-process swarm | Kanban v1 设计 |
| --- | --- | --- |
| 协调中心 | manager / lead 的运行时 | 持久任务板 |
| 生命周期 | 通常围绕一次调用 | 任务设计为跨进程、跨轮次存在 |
| 交接 | 返回父 Agent 或共享上下文 | task result、comment 和 event |
| 恢复 | 取决于父运行时 | 通过 claim 与 stale recovery 重新调度 |
| 优势 | 动态分工、同步协作直接 | 可追踪、可人工介入、可恢复 |

简化比喻是：in-process swarm 像临时会议；Kanban 像所有人围绕持久工单异步交接。

## 三平面

设计稿把系统分为三个平面：

| 平面 | 角色 | 边界 |
| --- | --- | --- |
| Control plane | CLI、聊天平台、Dashboard 等人机入口 | 创建、查看、评论和干预任务 |
| State plane | `kanban.db` 与 dispatcher | 保存事实、推进状态、领取任务、启动 worker |
| Execution plane | 独立 Hermes profile 进程 | 在自己的 memory、skills 和 workspace 中执行 |

关键设计不变量是：worker 不靠直接互相调用来交接，而是读写同一 Board。SQLite 是设计中的事实来源，独立 OS 进程是执行单元。

## P1-P8 协作模式

这些模式由少量原语组合而来：task、link、comment，以及 Task 上的 assignee 和 workspace。术语定义见 [核心概念](./Hermes%20Kanban%20核心概念.md)。

| 模式 | 设计组合 | 适合的问题 |
| --- | --- | --- |
| P1 Fan-out | 多个无依赖 sibling task | 并行研究、批量独立处理 |
| P2 Pipeline | 用 link 串联不同 assignee | 研究、编辑、写作等角色接力 |
| P3 Voting / Quorum | N 个 sibling + 依赖全部父任务的 aggregator | 多路判断后汇总；显式避免“无人收敛” |
| P4 Long-running journal | 固定 profile memory + 固定 workspace + 周期任务 | 日报、监控、长期知识积累 |
| P5 Human-in-the-loop | worker block + comment + 人类回复 + unblock | 信息不足、审批、人工决策 |
| P6 @mention delegation | 把 `@profile` 与周围文本转换成 Task | 在聊天入口快速委派 |
| P7 Thread-scoped workspace | 对话 thread 绑定 workspace | 同一讨论线程共享文件上下文 |
| P8 Fleet farming | specialist profile + 每个对象独立 workspace + 批量 Task | 多账号、转写、翻译等规模化处理 |

设计稿前文写“seven reusable patterns”，实际编号为 P1-P8，共八项。这是原资料中的不一致，不应自行改写成确定结论。

Pattern coverage test 的意义是检验新需求能否由现有原语组合：

1. 能组合出来，就不必扩张 Kanban kernel。
2. 组合不出来，先判断它是否真是协作问题。
3. 仍属于协作问题时，再考虑增加模式或原语。

## `delegate_task` 与 Kanban

| 判断 | `delegate_task` | Kanban |
| --- | --- | --- |
| 时间 | 一次调用内结束 | 需要活过一次 API loop |
| 父 Agent | 等结果后继续 | 创建任务后可以退出 |
| 可见性 | 主要对父 Agent 可见 | 对其他 profile 和人类可见 |
| 人工介入与审计 | 通常不需要 | 是核心需求之一 |

记忆规则：

> 交接是否必须跨过当前调用，并被其他 profile 或人类继续操作？是则考虑 Kanban，否则优先同步委派。

两者可以嵌套：Kanban worker 内部仍可用 `delegate_task` 完成短小、同步的推理或检查。

## Dispatcher 与 Orchestrator

二者都参与“调度”，但层级不同：

| 角色 | 应负责 | 不应负责 |
| --- | --- | --- |
| Dispatcher | 计算 ready、原子 claim、按 assignee / workspace 启动 worker、回收 stale claim | 智能路由、预算、审批、组织治理 |
| Orchestrator profile | 拆任务、选 assignee、建依赖、创建 aggregator | 默认亲自执行所有子任务 |

设计稿中的 dispatcher 被刻意保持简单；orchestrator 则是一种受 profile、toolset 和 skill 约束的角色，而不是 Kanban kernel 的特权实体。

这条边界很重要：dispatcher 保证状态机推进，orchestrator 决定工作如何分解。把二者混在一起，会让基础调度层承担无法稳定验证的智能决策。

## 我的判断

Kanban v1 真正有价值的不是“同时启动更多 Agent”，而是把交接从临时对话变成持久状态。但这只解决协调层问题；具体任务是否幂等、结果是否正确、工具权限是否安全，仍需要 worker 和业务层单独保证。
