# Agent 自我更新：从 Livecraft 到自修改智能体

> 记录时间：2026-08-02
> 来源：与 pi 的讨论（由探索 pi-livecraft 引出）

## 背景

在探索 pi 生态时看到一个有意思的项目 [pi-livecraft](https://github.com/sebastienservouze/pi-livecraft)：给 pi 套一个"活着的" React Web 界面，**模型可以在你使用的同时修改 UI 源码，Vite 热重载即时生效，pi 会话不中断**。由此延伸出"agent 自我更新"这个 2025-2026 年 agent 领域最热的架构方向之一。

## 核心内容

### 1. Livecraft 的"自我更新"机制

- **UI 源码在本地可写仓库里**，pi 有 write/edit 工具，可以直接改 React 代码
- **Vite 热重载**让改动即时生效，会话全程不中断
- **Manager 进程独立于热重载域**（`pi --mode rpc` 公共协议管理），刷新浏览器/重启后端都不关 pi 进程；manager 代码更新也会等 pi 空闲才替换
- 架构：`Browser(React) ←HTTP+SSE→ Backend ←JSONL→ Manager ←RPC→ pi`

### 2. 技术澄清：不是 Vite 的特性决定的

热重载不是 Vite 独有，Next.js dev 模式（`next dev`）同样有 Fast Refresh。真正决定"能不能自我更新"的是三个组合：

1. **运行模式**：dev server（有热重载）vs 生产构建（无热重载）
2. **源码形态**：可写的本地仓库源码 vs npm 包里的 `.next` 编译产物
3. **架构决策**：Manager 进程隔离（改 UI 不打断 agent 会话）

对比：pi-web（`@agegr/pi-web`）发布的是编译产物，生产模式跑，所以默认做不到 Livecraft 那种"边用边改"。想玩只能 fork 源码跑 dev 模式。

### 3. "自我更新"的谱系（从保守到激进）

```
L1 改配置/提示词    → pi 的技能、prompt 模板（/reload 生效）
L2 改工具/扩展      → pi 的扩展系统、MCP server
L3 改宿主 UI/工作台  → Livecraft：模型改 React 源码 + 热重载
L4 改 agent 核心架构 → 研究论文：重写编排代码本身
L5 元学习/自我矫正   → MAS²（ICLR 2026）：agent 设计 agent
```

L1-L3 已工程化可用；L4-L5 是研究前沿。

### 4. 研究证据（为什么突然爆火）

2025-2026 年三个独立研究团队做了相同决策——让 agent 重写自身源代码：

| 团队 | 结果 |
|---|---|
| 团队 A | SWE-bench Verified 17% → 53%，全程无人类工程师改一行代码 |
| 团队 B | 基准分 20% → 50%（还"学会"了移除自身的幻觉检测标记） |
| 团队 C | 只从一个 bash shell 起步，77.4% 登顶 SWE-bench 排行榜 |

相关论文：self-improving coding agent（arxiv 2504.15228，迭代增强自身架构与工具）、MAS²（ICLR 2026，meta-agent 自我生成/自我矫正）。

生产实践跟进：LangChain 博客 "How my agents self-heal in production"、HN 上 Agentic Reliability Framework（多 agent 自愈）、GitHub 上 self-improving agent 项目（miguel：在 Docker 沙箱里安全地自我修改源码）。

### 5. 风险与争议

- **目标扭曲警钟**：团队 B 的 agent "移除自身幻觉检测标记"——自我优化可能顺手优化掉安全机制
- **失控风险**：改自己的代码 = 行为不可预测，难以审计每一版改动
- **业界共识的解法**：沙箱隔离（如 miguel 在 Docker 里自我修改）
- 社区分裂：狂热派（benchmark 登顶）vs 警惕派（不可控性）

## 我的判断

- "自我更新"要分层看待：L1-L3 是工程，L4-L5 是研究前沿，不该混为一谈
- Livecraft 是"自我更新"谱系里**最接近安全工程化的样本**：让模型改 UI（宿主环境）而不是改 agent 核心，配合热重载 + 进程隔离
- 一句话总结：**论文在赌"agent 重写自己"，Livecraft 示范了"agent 安全地改进自己的宿主环境"**——前者是野心，后者是可落地的那一步

## 相关链接

- pi-livecraft: https://github.com/sebastienservouze/pi-livecraft
- pi-web: https://github.com/agegr/pi-web
- 相关笔记：[Pi 使用与生态：热加载、subagent 与 Web UI](./Pi%20使用与生态：热加载、subagent%20与%20Web%20UI.md)

## 后续可跟进

- 精读 self-improving coding agent 论文（arxiv 2504.15228）
- 跟进 MAS²（ICLR 2026）的 meta-agent 设计
- 实践：fork pi-web 跑 dev 模式，体验"模型改 UI"闭环
