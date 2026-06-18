# Hermes Agent Engineering Notes

This directory contains detailed engineering notes derived from the current
worktree. The goal is to explain the design in a way that is useful for
learning, debugging, and future development.

Current documents:

- [Project Map](./project-map.md): high-level map of runtime entrypoints,
  major directories, agent loop ownership, and subsystem boundaries.
- [Prompt Architecture](./prompt-architecture.md): how the system prompt is
  assembled, why identity/context/memory are separated, and what engineering
  safeguards exist around context files.
- [Memory System](./memory-system.md): built-in memory, frozen snapshots,
  memory writes, background review, and external memory provider integration.
- [Agent Loop](./agent-loop.md): single-turn lifecycle inside
  `agent/conversation_loop.py`, including prompt restoration, preflight
  compression, plugin/memory injection, API request construction, tool-call
  correction, retries, persistence, and post-turn hooks.
- [Security and Approval](./security-and-approval.md): dangerous command
  detection, hardline blocks, gateway/CLI approval queues, smart approval,
  sudo handling, secret redaction, and tool-loop guardrails.
- [Skills System](./skills-system.md): progressive skill disclosure,
  `skills_list`/`skill_view`, slash-skill invocation, skill prompt caching,
  setup/secret handling, supporting files, and agent-managed `skill_manage`.
- [File and Terminal Execution](./file-terminal-execution.md): terminal
  backends, spawn-per-call shell snapshots, foreground/background execution,
  file tools, path/staleness guards, lint/LSP diagnostics, cross-agent file
  coordination, and checkpoint/rollback internals.
- [Background Automation: Cron and Kanban](./automation-cron-kanban.md):
  cron job storage/scheduling, no-agent and agent jobs, runtime prompt
  scanning, gateway-embedded Kanban dispatch, SQLite claim/run lifecycle,
  worker context, heartbeat/crash handling, and circuit breakers.
- [Subagent Delegation / `delegate_task` 机制](./subagent-delegation.md):
  synchronous child-agent fan-out, dynamic delegation schema, tool isolation,
  role/depth/concurrency limits, child provider routing, progress events,
  interrupt propagation, timeout diagnostics, cost rollup, and Kanban
  differences.
- [Observability and Logging](./observability-and-logging.md): centralized
  file logging, rotating handlers, session tags, secret redaction,
  `hermes logs`, dashboard log APIs, debug sharing, OAuth traces, and
  Langfuse/NeMo Relay observability plugins.
- [MCP Integration](./mcp-integration.md): MCP server configuration,
  stdio/HTTP/SSE transports, background event loop, dynamic tool discovery,
  schema normalization, OAuth 2.1 token handling, sampling, circuit breakers,
  and orphan subprocess cleanup.
- [Desktop App Architecture](./desktop-app-architecture.md): Electron main
  process, preload IPC boundary, local/remote/OAuth gateway boot, multi-profile
  backend pools, streaming chat state, desktop slash-command curation, file
  preview, terminal, security hardening, and update flow.
- [ACP Adapter](./acp-adapter.md): Agent Client Protocol stdio server,
  session persistence/replay, editor prompt/resource conversion, tool event
  mapping, native todo plans, dangerous-command and edit approvals, model/mode
  switching, and per-session isolation.
- [Dashboard / Web 管理台架构](./dashboard-web.md): FastAPI Dashboard
  backend, React SPA routing, loopback/OAuth auth shell, PTY-embedded TUI chat,
  JSON-RPC/event side channels, config/session/log/MCP APIs, and dashboard
  plugin loading/security boundaries.
- [Web / Browser / Media / Computer-Use 工具链](./browser-media-computer-use.md):
  providerized web search, browser automation, image generation, TTS, managed
  gateways, browser session/vision routing, and macOS computer-use safety.
- [Auth / Credentials / Portal / Proxy](./auth-credentials-proxy.md):
  `auth.json`, provider registry, credential pools, source suppression,
  Nous Portal runtime credentials, managed tool gateway, MCP OAuth, sandbox
  credential-file mounting, and local OpenAI-compatible proxying.
- [Testing / CI / Release / Supply Chain](./testing-ci-release-supply-chain.md):
  per-file subprocess test isolation, CI slicing, lint strategy, exact pins,
  lockfile checks, OSV/supply-chain scanners, packaging metadata, and release
  automation.
- [Install / Bootstrap / Startup / Update](./install-bootstrap-update.md):
  Windows UTF-8 bootstrap, early profile/TUI/Termux paths, Node/TUI build
  decisions, install scripts, postinstall, Dashboard startup, dependency
  ensure, and git/pip/docker update flows.
- [Tool System](./tool-system.md): tool registration, toolsets, schema
  filtering, dispatch, bridge tools, and plugin tool behavior.
- [Context Compression](./context-compression.md): context compaction,
  handoff summaries, protected head/tail windows, compression-driven session
  rotation, and memory/context-engine hooks.
- [Plugin System](./plugin-system.md): plugin discovery, manifests, opt-in
  loading, hooks/tools/commands, provider registries, and specialized memory,
  context-engine, and model-provider paths.
- [Gateway and TUI](./gateway-and-tui.md): multi-platform message routing,
  session context prompts, agent caching, JSON-RPC TUI backend, slash workers,
  approvals, streaming, and compression session re-anchoring.
- [Messaging Platforms / Gateway Adapter 机制](./messaging-platforms.md):
  normalized message events, platform adapter contracts, thread/topic mapping,
  media caching/delivery, streaming progress, approval/clarify UI, platform
  plugins, and cron/send_message delivery reuse.
- [Config System](./config-system.md): profile-aware config/env paths,
  `load_config()` caching and merging, migrations, `.env` safety, custom
  provider compatibility, and CLI/Gateway loader differences.
- [Model Provider and Auxiliary Client](./model-provider-and-auxiliary.md):
  `ProviderProfile`, model-provider discovery, Chat Completions transport
  adaptation, auxiliary task routing, retries, auth refresh, and fallbacks.
- [CLI and Commands](./cli-and-commands.md): command registry, slash-command
  dispatch, quick commands, skill commands, and TUI/gateway command flow.
- [Session State and Search](./session-state-and-search.md): SQLite session
  persistence, FTS/trigram search, lineage, compression chains, and
  `session_search` behavior.

Recommended reading order:

1. `prompt-architecture.md`
2. `memory-system.md`
3. `agent-loop.md`
4. `security-and-approval.md`
5. `skills-system.md`
6. `file-terminal-execution.md`
7. `subagent-delegation.md`
8. `automation-cron-kanban.md`
9. `observability-and-logging.md`
10. `mcp-integration.md`
11. `desktop-app-architecture.md`
12. `acp-adapter.md`
13. `dashboard-web.md`
14. `browser-media-computer-use.md`
15. `auth-credentials-proxy.md`
16. `testing-ci-release-supply-chain.md`
17. `install-bootstrap-update.md`
18. `context-compression.md`
19. `plugin-system.md`
20. `gateway-and-tui.md`
21. `messaging-platforms.md`
22. `config-system.md`
23. `model-provider-and-auxiliary.md`
24. `session-state-and-search.md`
25. `tool-system.md`
26. `cli-and-commands.md`
27. `project-map.md`

The notes intentionally include code references so each claim can be checked
against source.
