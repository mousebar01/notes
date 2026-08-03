# Pi 使用与生态：热加载、subagent 与 Web UI

## 背景

使用 pi coding agent 过程中与 Agent 讨论沉淀的三块内容：配置热加载的设计取舍、subagent 的角色注册表架构、以及 Web UI 生态的选型。适合作为 pi 使用与生态的索引型笔记。

## 一、配置热加载：pi 能做到，Codex 为什么不行

pi 的模型配置（`~/.pi/agent/models.json`）**每次打开 `/model` 都会重新从磁盘读取**，改完不用重启：

```js
// 源码：打开 /model 或模型选择器都会 refresh
async handleModelCommand(searchTerm) {
    await this.session.modelRuntime.refresh();   // 重新读 models.json
}
```

对比 Codex（OpenAI 的 CLI）每次都要重启才能生效。本质是设计取舍：

| | pi | Codex |
|---|-----|-------|
| 配置模型 | **用前重读**：models.json 是纯数据文件，每次 `/model` 打开时花一次文件读取+解析 | 启动时把配置树加载进内存，运行中假设它不变 |
| 热更新成本 | 低——一个 JSON 文件，读进来就是新的 | 高——配置影响已加载的模型运行时、缓存、auth 状态，热换易出状态不一致 |

边界：
- 环境变量 key（`"apiKey": "$VAR"`）是进程启动时解析的，改了要重启；但 `/login` 写的 `auth.json` 和 models.json 字面量 key 走热加载
- 改已选中模型的元数据不影响当前正在跑的会话（运行时快照）
- 扩展等资源用 `/reload` 命令重新加载

**经验**：把配置设计成"每次用都重新读"能天然支持热加载；把配置当"启动期快照"就要处理一堆一致性，干脆不做。

## 二、subagent 架构：角色注册表模式

pi-subagents 扩展的 subagent 设计：

**执行时引用"已注册的角色"，但角色本身可随时创建/修改，不是写死的：**

1. **内置角色**（bundled，9 个）：advisor、planner、worker、delegate、reviewer、oracle、researcher、scout、context-builder，自带 system prompt
2. **自定义角色**两种创建方式（都不需要重启）：
   - 运行时 `subagent({ action: "create", config: {...} })`——system prompt、模型、工具、thinking 现场指定
   - 写 agent 文件（markdown + frontmatter）持久化

**本质是"函数注册表"模式**：

```
注册（define）→ 执行（call）
  │                │
  │ 内置 9 个       subagent({ agent: "reviewer", task: "..." })
  │ 运行时 create   /run my-agent
  │ 写文件持久化    subagent({ agent: "my-agent", ... })
```

任务描述每次传入，但角色（system prompt + 工具白名单 + 模型 + acceptance 策略）必须提前注册。为什么这样设计：角色是**权限和资源边界的主要载体**（tools 是严格白名单；模型/预算/acceptance 挂在角色上；看门狗、并行扇出、async 控制都依赖"角色已知"这个前提）。

**调用链路**：

```
Agent 侧：LLM → subagent 工具调用（工具门面）→ executor 引擎
人侧：    TUI 输入 /run /chain /parallel（slash 命令）→ RPC bridge → 同一个 executor
```

两条路径汇合到同一个 `executor.execute`，行为完全一致。子 agent 是完整的独立 pi 会话（自己的模型、thinking、工具白名单、独立上下文）。普通子 agent 默认没有 subagent 工具（防递归），只有显式配置的 fanout 子 agent 才有，且有深度限制。

## 三、Web UI 生态

pi 生态里成熟的 Web UI **都不是 pi 扩展**，而是独立应用（`pi install` 装不了）：

| | Pi Web（agegr/pi-web） | PI WEB（jmfederico/pi-web） |
|---|---|---|
| 定位 | 本地单机：翻历史会话 + 实时聊天 + 模型/Key 管理 | 长驻会话：服务器/工作区里持续运行 agent，浏览器断线不断 |
| 启动 | `npx @agegr/pi-web@latest` | `npm install -g ... --allow-scripts=node-pty` + `pi-web install` |
| 移动端 | PWA 可安装，safe-area/软键盘适配完善 | 多设备切换是卖点 |
| 注意 | 能调用高权限 agent，需设 `PI_WEB_PASSWORD` | 要求 pi >= 0.82.1 |

对比参考：`@cloudcli-ai/cloudcli` 是 Claude Code CLI 的 Web UI，架构同类（Vite SPA + Node server）。

**经验**：
- 用 Web UI 暴露 coding agent 是高权限动作，默认只绑 `127.0.0.1`，远程访问要走加密隧道（tailnet）+ 密码
- 两个应用放同一域名下做子路径不可行（Next.js/Vite 的绝对资源路径会冲突），用独立端口或独立子域名区分
- PWA 方案在移动端体验明显更好（可"添加到主屏幕"）

## 结论 / 经验

- pi 的"用前重读"配置设计、subagent 的角色注册表、Web UI 的独立应用生态，三块都是可迁移的设计模式
- 更多 pi 架构细节（消息模型、compaction 等）见 [Pi Agent 学习笔记](../agent/Pi%20Agent%20学习笔记.md)

## 相关笔记

- [Pi Agent 学习笔记](../agent/Pi%20Agent%20学习笔记.md)：pi 架构与上下文管理
- [Tailscale 服务暴露实操记录](../software-engineering/Tailscale%20服务暴露实操记录.md)：把 pi-web 暴露到 tailnet 的实操
- [渐进式披露](../ai-coding/渐进式披露.md)：上下文压缩与信息组织
