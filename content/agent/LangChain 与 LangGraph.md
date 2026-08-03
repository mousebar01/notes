# LangChain 与 LangGraph

这篇记录两者在 Agent 系统中的职责边界，避免把 Agent 组件、状态图和运行时能力混成一个概念。

## 核心区别

| 维度 | LangChain | LangGraph |
| --- | --- | --- |
| 主要定位 | 模型、消息、工具、Agent 和 middleware 组件 | 有状态图、节点流转和运行时 |
| Agent 创建 | `create_agent` 等高层入口 | 承载编译后的 graph |
| 状态恢复 | 不是主要职责 | checkpoint、thread、resume |
| 流程控制 | 适合标准工具调用 Agent | 适合循环、分支、路由和人工节点 |
| 流式事件 | 提供部分抽象 | graph 执行事件与状态更新 |

可以简化为：

```text
LangChain 负责组装 Agent
LangGraph 负责运行有状态工作流
```

## 两者如何协作

调用 `langchain.agents.create_agent(...)` 时，最终得到的对象可以执行：

```python
graph.ainvoke(...)
graph.astream(...)
graph.astream_events(...)
graph.aget_state(...)
```

高层入口负责组装模型、工具和 middleware，底层 graph 负责状态、checkpoint、流式执行和恢复。因此项目里同时出现两套 API 并不代表存在两个独立 Agent runtime。

## 如何选择

优先使用标准 Agent 入口：

- 普通聊天和工具调用
- 简单 RAG
- 主 Agent 调用少量专家工具
- 不需要固定多阶段拓扑

显式使用 LangGraph `StateGraph`：

- planner、researcher、reviewer 等固定流水线
- 需要条件路由、循环或人工确认
- 多阶段任务必须 checkpoint 和 resume
- 需要严格控制每个节点的输入输出

实践上可以先用 `create_agent` 跑通标准循环，只有确定性流程和恢复需求真正出现后，再显式增加状态图。

## 项目案例

Yuxi 使用 LangChain 组装主 Agent 和子 Agent，并使用 LangGraph 管理 thread、checkpoint、stream 和 child graph。这是“主 Agent + 专家工具”模式，不等于固定多角色流水线。
