# Hermes Kanban

这里按职责整理 Hermes Kanban 笔记。设计稿中的机制不自动等于当前实现，具体证据以各篇“来源状态”为准。

## 推荐顺序

1. [核心概念](./Hermes%20Kanban%20核心概念.md)
2. [多 Agent 协作](./多%20Agent%20协作.md)
3. [Worker Lane 与任务执行](./Worker%20Lane%20与任务执行.md)
4. [Worker 心跳与任务租约](./Worker%20心跳与任务租约.md)
5. [Kanban 使用场景](./Kanban%20使用场景.md)
6. [多 Gateway 与 Dispatcher 部署](./多%20Gateway%20与%20Dispatcher%20部署.md)

## 文档职责

| 文档 | 只回答什么 |
| --- | --- |
| 核心概念 | 有哪些术语、状态与边界 |
| 多 Agent 协作 | 为什么这样设计，以及 P1-P8 如何组合 |
| Worker Lane | assignee 如何变成一次受约束的执行 |
| 心跳与任务租约 | Hermes 中 claim、run id 和 stale recovery 如何配合 |
| 使用场景 | 某类需求应组合哪些原语 |
| 多 Gateway ADR | 谁拥有 dispatcher，以及这项决定的后果 |

通用任务可靠性见 [后台任务租约与恢复](../../../software-engineering/后台任务租约与恢复.md)。整理前版本保存在 `archive/projects/hermes/kanban/`，不参与 VitePress 发布。
