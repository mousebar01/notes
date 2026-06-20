# Hermes 专题

这里用于整理 Hermes Agent 的阅读材料、中文笔记和后续理解。当前重点不是收集所有资料，而是围绕几条主线建立可复习的知识结构。

## 阅读路线

如果只想快速理解 Hermes Kanban 和多 Agent 协作，建议按这个顺序：

1. [Agent Swarm 协作方式](./concepts/Agent%20Swarm%20协作方式.md)
2. [多 Agent 协作](./kanban/多%20Agent%20协作.md)
3. [Hermes Kanban 核心概念](./kanban/Hermes%20Kanban%20核心概念.md)
4. [Worker Lane 与任务执行](./kanban/Worker%20Lane%20与任务执行.md)
5. [Worker 心跳与任务租约](./kanban/Worker%20心跳与任务租约.md)
6. [Kanban 使用场景](./kanban/Kanban%20使用场景.md)
7. [多 Gateway 与 Dispatcher 部署](./kanban/多%20Gateway%20与%20Dispatcher%20部署.md)

如果想继续看 Hermes 整体架构，再读：

1. [Hermes Agent 工程模式提炼](./architecture/Hermes%20Agent%20工程模式提炼.md)
2. [Hermes 架构优秀设计提炼](./architecture/Hermes%20架构优秀设计提炼.md)
3. [Hermes 面试八股提炼](./architecture/Hermes%20面试八股提炼.md)

## 目录说明

- [kanban/](./kanban/README.md)：围绕 Hermes Kanban、多 Agent 任务协作、worker 执行、任务恢复的中文整理笔记。
- [concepts/](./concepts/README.md)：概念辨析，例如 Swarm 和 Kanban 的区别。
- [architecture/](./architecture/README.md)：从 Hermes 架构阅读中提炼出的工程模式、优秀设计和面试复习笔记。
- `reference/`：从 Hermes / OpenClaw 等项目归档来的参考资料，尽量保留原文，不作为第一阅读入口，也不直接发布到网站正文。

## 当前主线

### 1. 多 Agent 协作

核心问题：

- 为什么进程内 subagent swarm 脆弱？
- Hermes 为什么选择 Kanban 这种持久化任务看板？
- `delegate_task` 和 Kanban 的边界是什么？
- 多个 profile 如何通过任务卡、评论和依赖关系协作？

推荐阅读：

- [Agent Swarm 协作方式](./concepts/Agent%20Swarm%20协作方式.md)
- [多 Agent 协作](./kanban/多%20Agent%20协作.md)
- [Hermes Kanban 核心概念](./kanban/Hermes%20Kanban%20核心概念.md)
- [Hermes Agent 工程模式提炼](./architecture/Hermes%20Agent%20工程模式提炼.md)

### 2. Kanban 执行机制

核心问题：

- 一张任务卡如何变成一个 worker 进程？
- worker 如何读取任务、定期 heartbeat、完成或 block？
- 失败、崩溃、超时、stale claim 如何恢复？

推荐阅读：

- [Worker Lane 与任务执行](./kanban/Worker%20Lane%20与任务执行.md)
- [Worker 心跳与任务租约](./kanban/Worker%20心跳与任务租约.md)
- [Hermes Kanban 核心概念](./kanban/Hermes%20Kanban%20核心概念.md)

### 3. 使用场景与部署

核心问题：

- Kanban 适合哪些实际工作流？
- 单人开发、批量任务、角色流水线、失败重试分别说明什么？
- 多个 gateway 同时运行时，dispatcher 应该怎么部署？

推荐阅读：

- [Kanban 使用场景](./kanban/Kanban%20使用场景.md)
- [多 Gateway 与 Dispatcher 部署](./kanban/多%20Gateway%20与%20Dispatcher%20部署.md)
- [多 Agent 协作](./kanban/多%20Agent%20协作.md)

### 4. Hermes 整体架构

核心问题：

- Hermes 的核心模块怎么分层？
- 一个用户 turn 在 Agent Loop 中如何流动？
- Memory、Context Compression、Tool、Security 分别解决什么问题？

推荐阅读：

- [Hermes Agent 工程模式提炼](./architecture/Hermes%20Agent%20工程模式提炼.md)
- [Hermes 架构优秀设计提炼](./architecture/Hermes%20架构优秀设计提炼.md)
- [Hermes 面试八股提炼](./architecture/Hermes%20面试八股提炼.md)

## 资料来源说明

- `kanban/`：自己的中文整理笔记，适合复习和继续扩展。
- `concepts/`：概念辨析笔记，偏个人理解。
- `architecture/`：架构阅读后的二次提炼笔记，适合复习、迁移到其他 Agent 项目或准备面试表达。
- `reference/`：外部资料归档区。若后续重新归档 Hermes 原始资料，应优先从这里进入，不直接作为第一阅读入口。

## 后续整理建议

- [ ] 写一篇“一个 turn 在 Hermes 中如何流动”的总结。
- [ ] 把 Memory System 和 Context Compression 整合成“记忆与上下文管理”专题。
- [ ] 把 Tool System、File Execution、Security Approval 整合成“工具与安全边界”专题。
- [ ] 对照源码确认 Kanban 设计文档中哪些是已实现功能，哪些仍是设计目标。
