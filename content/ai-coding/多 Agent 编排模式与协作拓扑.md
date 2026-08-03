# 多 Agent 编排模式与协作拓扑

> 记录时间：2026-08-03
> 来源：Codex 子代理配置讨论中的延伸——「orchestrator 编排是常见的编排框架吗？还有其他框架吗？学术上叫什么？」
> 结论先行：orchestrator（主从/星型）是最主流的编排模式之一；学术上属于 Multi-Agent Systems（多智能体系统，MAS）的 coordination patterns（协调模式）。

## 学术归属

- 领域：**Multi-Agent Systems (MAS)** / 分布式 AI
- 主题词：**coordination patterns**、agent orchestration、workflow patterns
- 2025 年 survey（Tran et al., arXiv 2501.06322）把编排拆成两个维度：**系统拓扑**（谁控制谁）+ **协作机制**（智能体之间如何交互决策）
- 搜索建议：`multi-agent orchestration` / `agent coordination patterns`

## LLM 时代标准分类（Anthropic《Building Effective Agents》）

| 模式 | 结构 | 场景 |
|---|---|---|
| Prompt chaining | 线性流水线 A→B→C | 固定步骤、有中间产物（翻译→润色→校对） |
| Routing | 输入分类后分发给不同专家 | 不同类型任务走不同处理（客服分流） |
| Parallelization | 扇出并行 + 扇入合并 | 独立子任务（同时审查安全/测试/文档） |
| **Orchestrator-workers** ⭐ | 中央智能体拆解→派发→汇总 | 任务可拆、子任务独立（**Codex 当前架构**） |
| Evaluator-optimizer | 生成→评估→打回循环 | 有明确评估标准（写手+评审循环） |

## 多 Agent 协作模式全景（经典 MAS + 学术术语）

| 模式 | 学术名称 | 机制 | 代表 |
|---|---|---|---|
| 层级 | Hierarchical | 树状，上级拆下级（子代理可嵌套） | 军方/企业 MAS |
| 合同网 | Contract-Net Protocol（Smith 1980） | 任务广播→竞标→中标执行 | 经典分布式 AI |
| 黑板 | Blackboard Architecture | 共享黑板，各专家读写协作 | 语音识别等旧系统 |
| 辩论 | Debate / Adversarial | 多 agent 互相批评收敛答案 | GPT-4 辩论研究 |
| 市场/拍卖 | Market-based / Auction | 任务按报价分配 | 资源调度 |
| 蜂群/移交 | Handoff / Swarm | 对话接力移交，无中央控制 | OpenAI Swarm |
| 共识 | Consensus / Voting | 多模型投票/多数决 | 高可靠场景 |

## 关键区分

- **Orchestrator（主从/星型）**：中央控制 + 星型通信，子代理不互通——Codex 这套（主代理中转、汇总责任在主代理）
- **Pipeline（流水线）**：无中央、链式接力，省上下文但串行
- **Swarm/Handoff**：去中心化，agent 直接移交
- **Debate**：平级对抗，提质量但烧 token

## Codex 的定位

- 当前架构 = **Orchestrator-workers**（主代理拆解、并行派探子、汇总结果）
- 子代理可再派 = 具备 Hierarchical（层级）扩展能力（max_depth 控制）
- 与「@提及」结合 = 用户可显式指定路由目标，但仍是星型（消息先到主代理）

## 一句话总结

orchestrator-workers 是「任务可拆解 + 需要统一汇总」场景的最优解，也是当前 coding agent（codex / claude code 子代理模式）的事实标准；其他模式各有适用场景（辩论提质量、流水线省上下文、swarm 灵活）。
