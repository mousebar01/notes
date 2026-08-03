# Kanban 使用场景

> 来源状态：场景整理自 `kanban-tutorial.md`，并映射到 v1 **设计稿**中的协作模式；本文没有逐项**源码验证**，命令、状态与恢复行为的当前实现均**待确认**。选择建议包含**个人推断**。

这篇只用于“按问题选模式”。术语见 [核心概念](./Hermes%20Kanban%20核心概念.md)，P1-P8 的设计来源见 [多 Agent 协作](./多%20Agent%20协作.md)。

## 场景表

| 场景 | Task 结构 | 主要机制 | 交接重点 |
| --- | --- | --- | --- |
| 单人开发 feature | Schema -> API -> Tests | P2 Pipeline、依赖推进 | 上游 summary / metadata 成为下游上下文 |
| 批量独立任务 | 多个无依赖 Task，按 specialist 分配 | P1 Fan-out 或 P8 Fleet farming | 每个对象独立 workspace，统一查看进度 |
| 角色流水线与审查 | PM -> Engineer -> Reviewer；不通过时回到 Engineer | Pipeline、block / comment / unblock、多次 Run | 保留打回原因和本轮验证结果 |
| 多路分析后收敛 | N 个分析 Task -> 1 个 aggregator | P3 Voting / Quorum、fan-in | aggregator 必须显式依赖所有输入 |
| 等待人工输入 | worker block -> 人类 comment -> unblock | P5 Human-in-the-loop | 问题和回答留在同一 Task |
| 周期性长期任务 | 固定 profile + 固定 workspace + 每期新 Task | P4 Long-running journal | Board 留执行记录，workspace 留长期产物 |
| worker 崩溃或超时 | 同一 Task 产生新 Run | claim、stale recovery、重试上限 | 旧 Run 不能覆盖新 Run |

## 交接最小契约

worker 不应只写“完成了”。下游至少需要：

| 字段 | 内容 |
| --- | --- |
| `summary` | 人类可读的结果、结论和未完成项 |
| `metadata` | changed_files、verification、decisions、residual_risk 等结构化信息 |

具体字段应随任务类型裁剪，不必为了格式完整堆积无用信息。

## 不适合使用 Kanban

- 一次调用内能完成、父 Agent 必须立即得到结果的短任务。
- 不需要持久交接、人工介入或审计的局部推理。
- 需要跨多主机强一致调度，但尚未补齐远程执行与分布式协调的系统。

最后一种情况不能仅靠本地 SQLite 看板解决。通用恢复设计见 [后台任务租约与恢复](../../../software-engineering/后台任务租约与恢复.md)。
