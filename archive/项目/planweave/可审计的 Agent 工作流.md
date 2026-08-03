# 可审计的 Agent 工作流

这篇记录我对 PlanWeave 的观察，重点关注它如何用本地文件、任务图、Review 和恢复机制管理长时间运行的 AI 编程任务。

这个项目最大的亮点不是“又做了一个 AI 任务看板”，而是它把 **AI 编程任务从聊天记录里抽出来，变成可执行、可审计、可恢复的本地文件系统工作流**。

我觉得主要亮点有这些：

## 1. 文件即状态，适合长任务恢复

PlanWeave 是 **file-backed** 的：计划、任务、block、运行记录、结果产物都落在本地 workspace 里。这样好处是，agent 跑到一半失败、上下文丢失、电脑重启，理论上都可以从文件状态继续，而不是依赖一段脆弱的聊天上下文。

README 也强调它会记录每次 run，并保持 loop recoverable。

## 2. 把模糊需求变成任务图

它不是简单让 AI “做这个功能”，而是把目标拆成 **task graph**：任务之间可以有依赖、实现 block、review block、反馈循环。复杂工程任务天然就是图结构，这比线性 TODO 更接近真实开发流程。

README 里提到：fuzzy goal / chat-authored plan 会变成 task graph，每个 block 可以被 claim、实现、review，并记录 durable run artifacts。

## 3. 支持多 agent 分工

一个很实用的设计是 **per-node / per-block agent routing**。也就是说，不同 block 可以交给不同工具：

* Codex 做实现
* Claude Code 做复杂推理
* OpenCode 或 Pi 跑其他实现
* 本地命令做确定性 review/check

这比“一个 agent 从头干到尾”更灵活，也更适合复杂项目。README 明确列了 Codex、Claude Code、OpenCode、Pi、本地 review commands 和 review-feedback loops。

## 4. Review 是一等公民

很多 AI coding 工具只关注“生成代码”，但 PlanWeave 把 **review、feedback、retry、divergence、blocked 状态** 都放进工作流里。CLI 入口里注册了 `submit-review`、`submit-feedback`、`retry-review`、`mark-diverged`、`mark-blocked`、`resolve-divergence`、`unblock` 等命令，说明它认真处理了“做完以后如何验收、返工、恢复”的问题。

这点很重要，因为 AI 编程真正难的不是生成第一版，而是闭环修复和稳定交付。

## 5. MCP 接入 ChatGPT，定位很清楚

它的 MCP server 不是只读状态查询，而是可以让 ChatGPT 创建 canvas、任务、blocks、依赖、review pipeline，并验证本地项目。

这意味着 PlanWeave 把 ChatGPT 定位成 **规划和编排入口**，把本地 CLI/runtime 定位成 **执行和持久化系统**。这个分工比较合理。

## 6. CLI 和 Desktop 双入口

CLI 是主力，适合严肃使用；Desktop 是实验性可视化 canvas，适合看任务图、调 MCP tunnel、检查生成计划。README 明确说 CLI-first，desktop 目前 experimental。

这个取舍比较务实：先保证底层 CLI/workflow 能跑，再提供图形界面。

## 7. Agent skills 设计成可复用能力包

仓库里内置了 `plan-maker`、`plan-importer`、`plan-auditor`、`plan-coordinator`、`plan-runner`、`plan-reviewer`、`plan-recovery` 等 skills。

这很像把“团队角色”拆给不同 agent：

* maker：做计划
* importer：从文档导入计划
* auditor：审计划
* coordinator：调度
* runner：执行
* reviewer：验收
* recovery：修复异常状态

比单一 prompt 更工程化。

## 8. 面向真实失败场景

它有 `doctor`、`why-not`、`explain`、`run-status`、`run-session`、`reset` 等命令，说明作者考虑了 agent 工作流里常见的问题：为什么任务不能跑、当前状态是什么、上次 session 发生了什么、怎么恢复。README 也建议调度不清楚时先用 `explain`、`why-not`、`doctor`。

## 总结

PlanWeave 的亮点可以概括成一句话：

**它试图把 AI 编程从“聊天式的一次性生成”升级成“文件化、图结构、多 agent、可 review、可恢复的工程闭环”。**

这类方向现在很有价值，因为 AI coding agent 越强，越需要一个能管理计划、状态、审查、失败恢复的中间层。PlanWeave 的创新点就在这个中间层。
