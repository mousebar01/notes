# Kanban 笔记索引

这里放 Hermes Kanban 相关的中文整理笔记。

## 推荐阅读顺序

1. [多 Agent 协作](./多%20Agent%20协作.md)
2. [Hermes Kanban 核心概念](./Hermes%20Kanban%20核心概念.md)
3. [Worker Lane 与任务执行](./Worker%20Lane%20与任务执行.md)
4. [Worker 心跳与任务租约](./Worker%20心跳与任务租约.md)
5. [Kanban 使用场景](./Kanban%20使用场景.md)
6. [多 Gateway 与 Dispatcher 部署](./多%20Gateway%20与%20Dispatcher%20部署.md)

## 主题说明

- `多 Agent 协作`：对照 Hermes Kanban v1 spec，整理多 Agent 协作的核心设计。
- `Hermes Kanban 核心概念`：整理 Board、Task、Link、Comment、Workspace、Dispatcher、Tenant 等概念。
- `Worker Lane 与任务执行`：整理任务卡如何被 worker 执行，以及 worker 的生命周期契约。
- `Worker 心跳与任务租约`：整理 heartbeat、TTL、claim、lease、stale recovery。
- `Kanban 使用场景`：整理教程里的典型场景。
- `多 Gateway 与 Dispatcher 部署`：整理多个 gateway 并存时 dispatcher 的 owner 问题。
