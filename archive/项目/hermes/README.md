# Hermes

这里记录对 Hermes Agent 与 Kanban 协作机制的阅读和判断。活跃文档按“术语、协作、执行、可靠性、部署”分工，整理前原稿保存在 `archive/projects/hermes/`；该目录不参与 VitePress 发布。

> 资料边界：Kanban v1 spec 明确标注为 **Design Only**。各篇会分别标注“源码验证 / 设计稿 / 个人推断 / 待确认”，没有源码证据的设计不视为当前实现。

## 阅读路径

1. [Kanban 专题](./kanban/README.md)：按核心概念、协作、执行、可靠性、场景和部署顺序阅读。
2. [架构提炼](./architecture/README.md)：需要复习可迁移的 Agent 工程模式时再读。

通用的 heartbeat、TTL、lease、幂等和 Dead Letter 设计已提炼到 [后台任务租约与恢复](../../software-engineering/后台任务租约与恢复.md)。

## 内容边界

- `kanban/` 保留 Hermes 项目上下文，不再重复通用后台任务教材。
- `architecture/` 提炼可迁移模式，不追求覆盖全部源码。
- 已合并的 `concepts/` 内容只在归档中保留，不再作为活跃入口。
