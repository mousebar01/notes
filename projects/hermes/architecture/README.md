# Hermes Agent 架构笔记

这个目录保存从 Hermes Agent 当前代码树整理出来的工程笔记。目标不是复述 README，而是把运行入口、agent loop、工具系统、记忆系统、插件、安全、网关和桌面端等模块的职责边界讲清楚，方便学习、排查和后续继续整理。

## 当前文档

- [项目地图](./project-map.md)：运行入口、主要目录、agent loop 归属和子系统边界。
- [Prompt 架构](./prompt-architecture.md)：system prompt 如何组装，为什么要区分 identity、project context、memory 和 volatile session data。
- [记忆系统](./memory-system.md)：内置 memory、冻结快照、memory 写入、后台 review 和外部 memory provider。
- [Agent Loop](./agent-loop.md)：单个用户 turn 在 `agent/conversation_loop.py` 里的生命周期。
- [安全与审批](./security-and-approval.md)：危险命令检测、hardline block、CLI/Gateway 审批队列、smart approval、sudo、secret redaction 和工具循环 guardrail。
- [Skills 系统](./skills-system.md)：渐进式 skill disclosure、`skills_list` / `skill_view`、slash skill、skill prompt cache、setup/secret 处理和 `skill_manage`。
- [文件与终端执行](./file-terminal-execution.md)：terminal backend、每次调用的 shell snapshot、前台/后台命令、文件工具、路径安全、lint/LSP diagnostics、跨 agent 文件协调和 checkpoint/rollback。
- [后台自动化：Cron 与 Kanban](./automation-cron-kanban.md)：cron job 存储与调度、agent/no-agent job、gateway 内嵌 Kanban dispatcher、SQLite claim/run 生命周期、worker context、heartbeat/crash 处理和 circuit breaker。
- [Subagent Delegation / `delegate_task` 机制](./subagent-delegation.md)：同步 child-agent fan-out、动态 delegation schema、工具隔离、父子 agent 上下文边界。
- [Observability and Logging](./observability-and-logging.md)：日志、脱敏、debug 上传、本地排障和 opt-in observability 插件。
- [MCP Integration](./mcp-integration.md)：stdio / Streamable HTTP / SSE MCP server、tool discovery、OAuth、schema 归一化、重连和 MCP sampling。
- [Desktop App Architecture](./desktop-app-architecture.md)：Electron main、React renderer、Python dashboard/gateway backend、IPC/REST/JSON-RPC 边界。
- [ACP Adapter](./acp-adapter.md)：如何把 Hermes `AIAgent` 包装成 ACP stdio server，服务 Zed、VS Code、JetBrains 等编辑器。
- [Dashboard / Web 管理台架构](./dashboard-web.md)：FastAPI dashboard、React/Vite SPA、PTY + xterm.js 嵌入 TUI 和插件 slot。
- [Web / Browser / Media / Computer-Use 工具链](./browser-media-computer-use.md)：Web search、browser automation、image generation、TTS、computer use 的 provider 化工具设计。
- [Auth / Credentials / Portal / Proxy](./auth-credentials-proxy.md)：provider auth、credential pool、Nous Portal、managed gateway、本地 proxy 和远程 sandbox 凭证挂载。
- [Testing / CI / Release / Supply Chain](./testing-ci-release-supply-chain.md)：测试运行器、CI、依赖锁定、供应链扫描、发布脚本和 Windows 编码坑。
- [Install / Bootstrap / Startup / Update](./install-bootstrap-update.md)：安装脚本、bootstrap、desktop stage protocol、启动和更新流程。
- [Tool System](./tool-system.md)：工具注册、toolset 分组、session 过滤、schema 暴露和 dispatch。
- [Context Compression](./context-compression.md)：上下文压缩、摘要交接、tool message 修复、session lineage 轮转和 memory pre-commit。
- [Plugin System](./plugin-system.md)：插件发现、manifest、opt-in、不同 provider 类型的发现路径和隔离边界。
- [Gateway and TUI](./gateway-and-tui.md)：多平台消息路由、TUI gateway、JSON-RPC 和 agent session 桥接。
- [Messaging Platforms / Gateway Adapter 机制](./messaging-platforms.md)：Telegram、Slack、Discord、LINE、Teams、Email、SMS、Webhook、API Server 等 adapter 如何统一进入 agent 会话。
- [Config System](./config-system.md)：profile-aware config/env 路径、YAML 容错、迁移、缓存和自定义 provider 配置。
- [Model Provider and Auxiliary Client](./model-provider-and-auxiliary.md)：主对话 provider/transport 与辅助任务 LLM client 的分层。
- [CLI and Slash Commands](./cli-and-commands.md)：交互式 CLI、slash-command registry、gateway/help/autocomplete 共享机制。
- [Session State and Search](./session-state-and-search.md)：SQLite session store、system prompt 持久化、历史搜索、resume 和压缩链路。

## 阅读建议

如果只想抓主线，建议按下面顺序看：

1. [项目地图](./project-map.md)
2. [Agent Loop](./agent-loop.md)
3. [Prompt 架构](./prompt-architecture.md)
4. [Tool System](./tool-system.md)
5. [记忆系统](./memory-system.md)
6. [Context Compression](./context-compression.md)
7. [安全与审批](./security-and-approval.md)

如果关注多 Agent 和后台任务，优先看：

1. [Subagent Delegation / `delegate_task` 机制](./subagent-delegation.md)
2. [后台自动化：Cron 与 Kanban](./automation-cron-kanban.md)
3. [Gateway and TUI](./gateway-and-tui.md)

如果关注产品形态和外部集成，优先看：

1. [Dashboard / Web 管理台架构](./dashboard-web.md)
2. [Desktop App Architecture](./desktop-app-architecture.md)
3. [ACP Adapter](./acp-adapter.md)
4. [MCP Integration](./mcp-integration.md)

## 说明

这些文档是源码阅读和工程理解笔记，不等同于官方承诺。若要确认某个机制是否已经实现，应继续对照对应源码和当前版本行为。
