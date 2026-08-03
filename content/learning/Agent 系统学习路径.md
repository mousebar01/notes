# Agent 系统学习路径

这条路径把 Agent 的工程基础、运行循环、上下文、记忆、安全和协作机制串起来。每一阶段只保留学习目标和主要入口，具体内容回到对应专题或项目文档。

## 总体主线

```text
工程设计
  -> 消息与工具循环
  -> 上下文与长任务
  -> 记忆与检索
  -> 安全边界
  -> 持久化协作
```

## 1. 工程设计

目标：理解职责边界、低耦合、可测试性和异常路径，为后续 Agent 设计建立判断标准。

- [工程程序设计经验总结](../software-engineering/工程程序设计经验总结.md)
- [软件设计原则与 IoC / DI](../software-engineering/软件设计原则与%20IoC%20DI.md)

## 2. 消息与工具循环

目标：理解一次 Agent Run 如何组织 `messages`、工具 schema、工具结果和流式事件。

- [DeepSeek HTTP payload 结构](../llm/DeepSeek%20HTTP%20payload%20结构.md)
- [Agent 运行交互流程](../agent/Agent%20运行交互流程.md)

## 3. 上下文与长任务

目标：理解有限 Context Window 下的 token 预算、累计摘要、近期消息和分支交接。

- [Agent 上下文管理](../agent/上下文管理.md)
- [Pi Agent 学习笔记](../agent/Pi%20Agent%20学习笔记.md)

## 4. 记忆与检索

目标：区分会话上下文、长期记忆、向量检索、知识图谱和聚类在系统中的职责。

- [知识库处理流程](../agent/知识库处理流程.md)
- [知识图谱与图论基础](../agent/知识图谱与图论基础.md)
- [聚类算法笔记](../algorithms/clustering/index.md)

## 5. 安全边界

目标：理解提示词攻击、不可信内容、工具权限和沙箱之间的分层防线。

- [Agent 安全与沙箱](../agent/security/index.md)
- [Agent 提示词攻击测试流程](../agent/security/Agent%20提示词攻击测试流程.md)

核心判断：Agent 安全不能只靠模型拒绝，必须由工具调度、权限系统和隔离环境共同兜底。

## 6. 持久化协作

目标：理解多 Agent 如何把任务、状态、Review 和失败恢复从聊天上下文中独立出来。

