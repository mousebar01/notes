# Agent 系统学习索引

这个索引用来把当前仓库里和 Agent 系统相关的笔记串起来，避免内容散在多个目录里找不到。

## 总体主线

目前可以按这条路径看：

```text
工程设计基础
  ↓
Agent 单轮上下文
  ↓
HTTP payload / messages / tools
  ↓
记忆系统设计
  ↓
工具安全与沙箱
  ↓
长期项目：Hermes
```

## 1. 工程设计基础

相关笔记：

- [工程程序设计经验总结](../topics/software-engineering/工程程序设计经验总结.md)
- [软件工程的一些初步理解](../topics/software-engineering/软件工程.md)

关键词：

```text
职责边界
变化成本
低耦合
可测试性
异常边界
工程不是只写 happy path
```

## 2. 上下文管理

相关笔记：

- [Agent 上下文管理](../topics/agent/上下文管理.md)
- [DeepSeek HTTP payload 结构](../topics/llm/DeepSeek%20HTTP%20payload%20结构.md)

关键词：

```text
单次对话流程
runtime context
messages
tools schema
tool_choice
ReAct loop
工具结果回填
```

## 3. 记忆系统

相关入口：

- [聚类算法笔记](../topics/algorithms/clustering/README.md)

关键词：

```text
长期记忆
BM25
embedding
RRF
向量检索
图记忆
记忆衰减
episode / note / user memory / agent memory
```

这里目前主要保留相关算法笔记，后续如果继续整理记忆系统，可以沉淀到 `topics/agent/` 或新的专题目录。

## 4. 安全与沙箱

相关笔记：

- [Agent 安全与沙箱](../topics/agent/security/README.md)
- [提示词攻击测试方案](../topics/agent/security/提示词攻击测试方案.md)
- [Agent 提示词攻击测试流程](../topics/agent/security/Agent%20提示词攻击测试流程.md)
- [AstrBot Agent 沙箱调研](../topics/agent/security/AstrBot-Agent-沙箱调研.md)

关键词：

```text
提示词攻击
间接注入
工具权限
不可信内容边界
FakeProvider
沙箱
文件系统白名单
命令权限
```

核心判断：

> Agent 安全不能只靠模型拒绝，必须让工具调度层、权限系统和沙箱兜底。

## 5. Hermes 项目

相关入口：

- [Hermes](../projects/hermes/README.md)
- [Hermes Kanban - 多 agent 协作](../projects/hermes/kanban/多agent协作.md)

关键词：

```text
Kanban
多 Agent
worker
heartbeat
TTL
lease
dispatcher
ACP
```
