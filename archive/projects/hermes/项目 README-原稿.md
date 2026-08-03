# Hermes

这里记录对 Hermes Agent、Kanban、worker 和多 Agent 协作机制的阅读与提炼。内容包含源码观察、设计稿信息和个人判断，具体结论应以各篇文档标注的资料边界为准。

## 阅读入口

- [Architecture](../../../projects/hermes/architecture/README.md)：Agent 状态、上下文、工具、安全和后台任务的工程模式。
- [Kanban](./kanban/README.md)：任务状态、worker、心跳、租约、协作与部署。
- [Concepts](./concepts/README.md)：Swarm、同步子任务和持久化协作的概念辨析。

## 最短阅读路径

1. [多 Agent 协作](./kanban/多%20Agent%20协作.md)
2. [Hermes Kanban 核心概念](./kanban/Hermes%20Kanban%20核心概念.md)
3. [Worker Lane 与任务执行](./kanban/Worker%20Lane%20与任务执行.md)
4. [Hermes Agent 工程模式提炼](../../../projects/hermes/architecture/Hermes%20Agent%20工程模式提炼.md)

## 资料边界

- `kanban/` 和 `concepts/` 是中文整理笔记，部分机制来自设计稿，不应自动视为已经实现。
- `architecture/` 提炼可迁移的工程模式，不追求覆盖全部源码细节。
- 外部原始资料只作为核对来源，不作为第一阅读入口。
