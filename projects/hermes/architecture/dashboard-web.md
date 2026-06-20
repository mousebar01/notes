# Dashboard / Web 管理台架构

本文记录 Hermes Dashboard 这一套 Web 管理台的实现细节。它的核心不是“又写了一个聊天前端”，而是：

- 后端用 `hermes_cli/web_server.py` 提供 FastAPI 服务、REST 管理接口、WebSocket 转发、静态资源和插件挂载。
- 前端用 `web/src/` 的 React/Vite SPA 提供设置页、状态页、日志页、插件页、会话页等管理体验。
- Chat 页嵌入真正的 `hermes --tui`，通过 PTY + xterm.js 显示终端 UI，而不是在 React 里重写主聊天 transcript/composer。
- 旁边的 React 侧栏通过独立 WebSocket 接收结构化事件，展示 tool call、模型选择等辅助视图。

这个边界非常关键：主对话体验归 TUI/Ink 管，Dashboard 只是在浏览器里承载它，并补上管理面板。

## 入口与总体分层

主要入口：

- `hermes_cli/web_server.py`：FastAPI app，包含 Dashboard 的绝大部分 REST/WS API。
- `hermes_cli/pty_bridge.py`：POSIX PTY 桥，把浏览器 WebSocket 和本地 `hermes --tui` 进程连接起来。
- `web/src/App.tsx`：Dashboard SPA 的路由、导航、插件插槽、持久 Chat 挂载。
- `web/src/pages/ChatPage.tsx`：xterm.js 终端页，连接 `/api/pty`。
- `web/src/components/ChatSidebar.tsx`：Chat 旁边的结构化事件侧栏。
- `web/src/lib/api.ts`：统一 REST/WebSocket URL、鉴权参数、fetch 包装。
- `web/src/lib/gatewayClient.ts`：浏览器侧 JSON-RPC client，连接 `/api/ws`。
- `web/src/plugins/*`：Dashboard 插件 SDK、注册表、slot 系统和动态加载逻辑。

可以把它想成四层：

```text
Browser React SPA
  ├─ Management pages: config / env / logs / cron / plugins / MCP / sessions / ...
  ├─ ChatPage: xterm.js terminal, embeds real hermes --tui
  ├─ ChatSidebar: listens to structured tool/model/session events
  └─ Plugin SDK: loads dashboard extension JS/CSS

FastAPI dashboard server
  ├─ REST APIs: status, config, sessions, logs, MCP, cron, plugins, memory, tools...
  ├─ WebSockets: /api/pty, /api/ws, /api/pub, /api/events
  ├─ Auth shell: loopback token or OAuth/cookie gate
  └─ Static serving: SPA dist + dashboard plugin assets

TUI gateway layer
  ├─ tui_gateway JSON-RPC backend
  ├─ dispatcher events
  └─ command/session/model APIs

Hermes runtime
  ├─ AIAgent
  ├─ SessionDB
  ├─ tools/plugins/memory/context
  └─ config/profile/logs
```

值得注意的是，Dashboard 和 Desktop App 是两套不同前端。Desktop 是 Electron + React + JSON-RPC 后端的独立聊天面；Dashboard Chat 是浏览器里的终端嵌入，目标是“所有 Ink/TUI 改动自动出现在 Dashboard”。

## 静态资源与 SPA 注入

`web_server.py` 中的 `WEB_DIST` 默认指向 `hermes_cli/web_dist`，也支持 `HERMES_WEB_DIST` 环境变量覆盖。Dashboard 运行时会服务 Vite build 后的 SPA。

服务 HTML 时会做运行时注入，主要向前端写入：

- `window.__HERMES_SESSION_TOKEN__`：loopback 模式使用的临时 token。
- `window.__HERMES_DASHBOARD_EMBEDDED_CHAT__`：告诉前端当前是 Dashboard 环境。
- `window.__HERMES_BASE_PATH__`：反向代理路径前缀，例如 `/hermes`。
- `window.__HERMES_AUTH_REQUIRED__`：是否处在 gated auth 模式。

`X-Forwarded-Prefix` 会影响 base path。代码还会重写 HTML/CSS 里的资源 URL，避免 Dashboard 挂在反向代理子路径时静态资源仍然请求根路径。

这个设计解决了两个常见问题：

- 同一个 build 产物可以在根路径、反向代理子路径、本地 loopback 下工作。
- 前端不需要硬编码认证模式，启动时读取注入变量即可。

## 安全模型：两种鉴权壳

Dashboard 有两种安全姿态。

第一种是 loopback/default 模式。服务绑定在本地回环地址时，不要求 OAuth 登录，而是使用一次进程启动生成的 `_SESSION_TOKEN`。前端所有 `/api/*` 请求通过 `X-Hermes-Session-Token` header 携带 token，WebSocket 通过 query 参数携带。

第二种是 public/gated 模式。当服务暴露到非 loopback，且没有显式 `--insecure` 放行时，启用 `hermes_cli/dashboard_auth/middleware.py` 的 OAuth/cookie gate。此时前端不再依赖 legacy session token，而是使用 cookie session 和单次 WebSocket ticket。

`gated_auth_middleware()` 的行为：

- 登录页、OAuth 回调、`/api/auth/providers`、静态资源等公共路径放行。
- 普通 HTML 路由未登录时 302 到 `/login?next=...`。
- `/api/*` 未登录时返回 401 JSON，包含 `login_url`，由前端跳转。
- 支持 access token 过期后使用 refresh token 透明刷新。
- 多 provider 逐个尝试验证 session；某个 provider 不可达不会立即否定其他 provider。
- refresh token 轮换成功后会重写 cookie，避免复用旧 refresh token。

这个中间件里有几个工程细节很值得学：

- API 不返回 302，而返回结构化 401。否则 `fetch()` 可能悄悄跟随 OAuth 跳转，前端拿到不透明响应。
- `next` 只允许同源相对路径，并拒绝 `/api/*`，避免登录后落到 JSON 接口页面。
- 反向代理前缀也进入 login URL 和 cookie path，避免子路径部署时 cookie 删除/设置不匹配。
- Access token cookie 到期后浏览器可能根本不再发送 access token，只剩 refresh token，所以代码直接进入 refresh 路径。

## Host、CORS 与 WebSocket 防护

Dashboard 不只靠 token。`web_server.py` 还有 Host header、CORS 和 WebSocket 层防护。

Host header middleware 用来防 DNS rebinding：

- loopback 绑定只接受 loopback host alias。
- 明确绑定某个 host 时只接受该 host。
- 绑定 `0.0.0.0` / `::` 才放宽 host。

CORS 主要允许 localhost / 127.0.0.1 等本地源，不是任意 `*`。

WebSocket 认证也区分模式：

- loopback 模式：`?token=<session-token>`。
- gated 模式：先 `POST /api/auth/ws-ticket` 兑换单次 ticket，再 `?ticket=<ticket>`。

`web/src/lib/api.ts` 中的 `buildWsAuthParam()` 封装了这个差异；插件或侧栏不应该自己拼认证参数。

## 前端 API 层

`web/src/lib/api.ts` 是 Dashboard 前端访问后端的统一入口。

关键职责：

- 读取 `window.__HERMES_BASE_PATH__`，为 REST 和 WS 统一加前缀。
- `fetchJSON()` 自动附加 `X-Hermes-Session-Token`，同时设置 `credentials: include` 支持 cookie gate。
- gated 模式下遇到 `401 unauthenticated/session_expired` 会跳转到 `login_url`。
- loopback 模式下如果 token stale，触发页面 reload 一次，重新拿服务端注入的新 token。
- `getWsTicket()` 在 gated 模式下向 `/api/auth/ws-ticket` 换单次 WebSocket ticket。
- `buildWsUrl()` 负责 `ws://`/`wss://`、base path、token/ticket 参数。

这层的好处是：页面组件、插件、JSON-RPC client、ChatSidebar 都不需要理解“现在是 loopback token 还是 cookie + ticket”。

`web/src/lib/gatewayClient.ts` 是浏览器侧 JSON-RPC 客户端：

- 连接 `/api/ws`。
- 默认请求超时 120 秒。
- 维护连接状态。
- 支持事件订阅。
- 使用 `buildWsAuthParam()`，所以同样兼容两种鉴权模式。

## 后端 API 分组

`web_server.py` 是一个大文件，API 面很宽。可以按功能理解：

- 状态与系统：`/api/status`、系统统计、版本、路径、gateway liveness、auth providers。
- 配置：读写 config、raw config、profile-aware path、模型上下文长度、配置校验。
- 环境变量：`.env` 管理、provider 凭证校验、secret reveal。
- 模型：模型选项、推荐默认、auxiliary assignments、`/api/model/set`。
- 会话：session 列表、详情、搜索、bulk 操作、跨 profile session 聚合。
- 日志：读取 `~/.hermes/logs`，支持 level/component/search/tail。
- Cron：管理 cron jobs，并在 profile 切换时重定向 cron 模块全局路径。
- MCP：读写 MCP 配置、catalog、server probe、git bootstrap 安装动作。
- Gateway/平台：启动停止 gateway、平台配置、OAuth 流程、webhooks、pairing。
- Memory/Tools/Toolsets：记忆 provider、工具可用性、toolset 开关。
- Skills/Plugins：skill hub、插件安装启停更新、Dashboard 插件 manifest。
- Ops：hooks、checkpoints、诊断、后台动作、curator 等。

它不是典型“小后端只代理几个接口”的管理台，而是把 CLI 里大量管理能力搬到了浏览器。

## 后台动作模型

一些耗时操作不会在 HTTP request 里同步跑完，而是走后台 action。

`_spawn_hermes_action()` 相关逻辑会：

- 为 action 建立日志文件，路径在 Hermes logs 目录下。
- 记录 `_ACTION_LOG_FILES`、`_ACTION_PROCS`、`_ACTION_RESULTS`。
- `stdin` 使用 `DEVNULL`，避免后台进程卡在交互输入。
- 设置 `HERMES_NONINTERACTIVE=1`。
- 尽量创建独立进程组/session，便于隔离和后续管理。

前端可以轮询 action status/log。这种设计适合“安装插件、MCP bootstrap、gateway 启动”等不适合阻塞 HTTP 的任务。

## Chat 页：嵌入真实 TUI

`web/src/pages/ChatPage.tsx` 是 Dashboard 最值得看的文件之一。

它做的不是 React 聊天组件，而是：

- 创建 xterm.js `Terminal`。
- 加载 `WebglAddon`、`FitAddon`、`Unicode11Addon`、`WebLinksAddon`。
- 连接 `/api/pty` WebSocket。
- 把浏览器键盘输入写入 PTY。
- 把 PTY 输出写入 xterm。
- resize 时发送特殊 escape：`\x1b[RESIZE:<cols>;<rows>]`。
- 支持 copy/paste、OSC 52 clipboard、鼠标事件、移动端侧栏。

后端 `/api/pty` 会：

- 在 accept 前验证 token/ticket、host/origin/client。
- 使用不同 close code 表示 auth/forbidden/timeout/not found 等错误。
- POSIX 下通过 `PtyBridge` 启动真实 `hermes --tui`。
- Windows 原生环境不支持 PTY，会显示 unsupported banner。
- 在 executor 中读 PTY，避免阻塞事件循环。
- 解析 resize escape，调用 PTY resize。

`hermes_cli/pty_bridge.py` 的实现也有一些细节：

- 基于 `ptyprocess`，POSIX-only。
- 字节级读写，避免终端控制序列被文本编码破坏。
- 设置 TERM fallback。
- 限制 cols/rows 最大值，防止异常 resize 消耗资源。
- close 时按 SIGHUP/SIGTERM/SIGKILL 阶梯清理子进程。

这个架构的学习点是：当已有高质量 TUI 时，Web 端可以选择“终端承载”而不是重写完整聊天协议。代价是 UI 定制能力受限；收益是一套主聊天体验跨 CLI/TUI/Dashboard 复用。

## Chat 持久挂载

`web/src/App.tsx` 中 Chat 页不是普通 route 切换时 mount/unmount 的页面。它被持久挂载在路由外部，`/chat` route 只是一个 placeholder/sink。

这样做的原因：

- 切到 Logs/Config/Plugins 等页面时，不要断开 PTY。
- xterm 状态、TUI 子进程、WebSocket、正在进行的 agent turn 都应继续存在。
- 回到 Chat 页时，不应该重新启动一个聊天会话。

这是一处非常实际的前端工程设计：不是所有页面都适合跟随路由生命周期销毁。

## 结构化事件旁路：/api/pub 与 /api/events

Dashboard Chat 有两条通道：

- 主通道：`/api/pty`，承载终端字节流。
- 事件通道：`/api/events?channel=...`，承载结构化 tool/session/model 事件。

`ChatPage.tsx` 会生成一个 opaque channel id，并传给 PTY 子进程相关流程。PTY 侧的 `tui_gateway.entry` 通过 dispatcher emit 事件，后端 `/api/pub` 接收后广播到对应 channel，浏览器侧 `ChatSidebar` 订阅 `/api/events`。

`ChatSidebar.tsx` 明确写了这个设计：

- `GatewayClient -> /api/ws` 是侧栏自己的 JSON-RPC sidecar，用于模型 badge、模型选择、连接状态。
- `/api/events` 是被动订阅 PTY 子进程的工具事件。
- 这两者独立于 PTY pane 的主 session，失败时只影响侧栏，不影响终端聊天。

侧栏目前主要展示：

- 当前模型。
- 连接状态。
- credential warning/error。
- 最近 20 个 tool call。
- tool start/progress/complete。
- 模型选择弹窗发出的 slash command。

这是一种很优雅的折中：主 transcript 仍由 TUI 渲染，React 侧栏通过结构化事件补充可视化，而不抢主聊天的控制权。

## /api/ws JSON-RPC Sidecar

`/api/ws` 不是 PTY，而是 JSON-RPC WebSocket，由 `tui_gateway.ws.handle_ws` 处理。

浏览器侧 `GatewayClient` 通过它创建自己的 session，执行诸如 `session.create`、`slash.exec` 等方法。ChatSidebar 用这个 sidecar 来驱动模型选择：

- ModelPicker 产生完整 slash command，例如 `/model ...`。
- 侧栏通过 `slash.exec` 发给 JSON-RPC gateway。
- TUI pane 自己仍通过 PTY 渲染主输出。

这里有一个看起来奇怪但合理的点：侧栏 session 和 PTY pane session 是独立的。它只需要一个 session id 来调用模型选择等命令，不试图成为主聊天 session 的 authoritative state。

## 会话与跨 Profile 查询

Dashboard 的 session 页面和 API 会直接读取 `state.db`。

跨 profile session 列表的实现不是启动每个 profile 的后端，而是：

- 找到每个 profile 对应的 `state.db`。
- 以 read-only 方式打开 SQLite。
- 每个 profile 多取一些 rows。
- 给结果打上 profile 标记。
- 合并排序后分页/window。

session search 还有两个有意思的细节：

- 会按 compression lineage root 去重。
- 搜索结果返回 lineage tip，而不是压缩链中间的旧 session。
- ID 精确/前缀命中优先，然后才走 FTS prefix query。

这样用户在 Dashboard 看到的是“当前可继续的会话”，而不是一堆被压缩切分出来的内部片段。

## Config、Env 与模型设置

Dashboard 配置页面不是直接把 YAML 原样丢给前端。

后端做了 normalization：

- `model` dict 会 flatten 成前端容易编辑的字符串字段。
- `model_context_length` 会显式暴露。
- 写回时 denormalization 会保留 `model` 下其他 subkeys，并写回 `context_length`。

环境变量页有额外保护：

- `/api/env/reveal` 需要 token。
- 有速率限制，例如 30 秒内最多 5 次。
- 会 audit log。

Provider credential validation 会按 provider 类型做探测：

- OpenRouter/OpenAI/XAI 类 bearer token。
- Gemini query key。
- Local `OPENAI_BASE_URL` 的 `/models`。

模型 API 与 TUI model picker 保持一致，包含模型 options、recommended default、auxiliary task assignments，以及 `/api/model/set`。

这里的设计思路是：前端负责呈现，后端负责理解 Hermes config 的兼容结构和 profile-aware 路径。

## Cron 与 MCP 的 Dashboard 适配

Cron 页面有一个特别工程化的细节：`cron.jobs` 模块里有一些路径是 module globals。Dashboard 支持 profile，所以在处理 profile 下 cron 数据时，需要在 `_CRON_PROFILE_LOCK` 下临时 retarget 这些 module globals。

这说明项目里存在旧式全局状态时，Dashboard 没有硬改全部 cron 架构，而是用锁和 profile retarget 做了一层适配。

MCP 页面则封装了 `hermes_cli.mcp_config` 和 catalog：

- 读取/编辑 MCP server 配置。
- redact stdio env，不把 secret 泄给前端。
- probe server 时放到 thread 里跑。
- git bootstrap 安装走后台 action，例如 `mcp-install`。

## Dashboard 插件系统

Dashboard 插件和 agent runtime 插件有关联，但不是同一层。

后端发现逻辑在 `web_server.py` 的 `_discover_dashboard_plugins()`：

- 用户插件：`~/.hermes/plugins/<name>/dashboard/manifest.json`。
- bundled 插件：repo `plugins/` 下，包括 `plugins/memory` 等。
- project 插件：`./.hermes/plugins/`，只有 `HERMES_ENABLE_PROJECT_PLUGINS` 为 truthy 时启用。

manifest 里可以声明：

- `name`、`label`、`description`、`icon`、`version`。
- `tab.path`、`tab.position`、`tab.override`、`tab.hidden`。
- `slots`。
- `entry` JS bundle。
- `css`。
- `api` 后端 FastAPI router 文件。

前端加载逻辑在 `web/src/plugins/usePlugins.ts`：

- 请求 `/api/dashboard/plugins` 拿 manifest。
- 为声明了 CSS 的插件插入 `<link>`。
- 为 JS bundle 插入 `<script>`。
- dev 模式用 query cache-bust。
- 支持 manifest `integrity`，浏览器执行 SRI 校验。
- 等插件调用 `window.__HERMES_PLUGINS__.register()`。

SDK 暴露在 `web/src/plugins/registry.ts`：

- `window.__HERMES_PLUGINS__.register()` 注册 tab component。
- `registerSlot()` 注册 slot component。
- `window.__HERMES_PLUGIN_SDK__` 暴露 React hooks、Hermes API client、UI components、utils、i18n、WebSocket URL helpers。
- `SDK_CONTRACT_VERSION` 当前为 `1.1.0`，用于公共契约版本。

## 插件安全细节

Dashboard 插件这块非常值得认真看，因为代码里有明显的安全补丁痕迹。

`api` 字段曾经可能带来任意 Python 文件导入风险。现在 `_safe_plugin_api_relpath()` 会拒绝：

- 绝对路径。
- `../..` 路径穿越。
- resolve 后不在插件 `dashboard/` 目录内的文件。

即使 discovery 阶段过滤了，`_mount_plugin_api_routes()` 导入前还会再次校验 resolved path，属于 defense in depth。

另一个细节：project plugins 可以贡献静态 JS/CSS，但不能自动 import Python backend API。原因是 `./.hermes/plugins/` 跟当前项目目录绑定，用户可能打开恶意 repo；如果 Web server 自动 import 里面的 Python，就是 RCE 面。

插件静态资源路由 `/dashboard-plugins/{plugin_name}/{file_path}` 也做了限制：

- 必须在插件 dashboard 目录内。
- 拒绝路径穿越。
- 只允许浏览器资产后缀，例如 JS/CSS/JSON/HTML/SVG/PNG/JPG/WOFF 等。
- 不允许随便下载 `.py`、README、`.env.example` 这类文件。
- Cache-Control 使用 no-store/no-cache，避免开发和更新时拿旧 bundle。

这些细节说明：Dashboard 插件是“允许执行扩展”的能力，所以必须把静态资源、Python backend、用户插件、项目插件的信任边界拆开。

## App 路由与插件插槽

`web/src/App.tsx` 维护内置 route：

- `/sessions`
- `/analytics`
- `/models`
- `/logs`
- `/cron`
- `/skills`
- `/plugins`
- `/mcp`
- `/pairing`
- `/channels`
- `/webhooks`
- `/system`
- `/profiles`
- `/config`
- `/env`
- `/docs`
- `/chat`

插件 manifest 可以往导航里插 tab，也可以 override built-in route，或者只声明 hidden + slots。

`PluginSlot` 在多个页面出现，例如 Env、Models、Logs、Plugins、Analytics、Cron、Config、Chat、Sessions、Docs、System、Skills 等。这样插件既能加独立页面，也能往现有页面塞局部 UI。

导航插入支持 before/after/end。`/plugins` 页面还会把 agent runtime 插件和 dashboard manifest 合并展示，并允许：

- 安装插件。
- enable/disable runtime plugin。
- update git plugin。
- remove 用户插件。
- hide/show dashboard sidebar entry。
- 设置 memory provider / context engine。

## 日志与诊断

Dashboard 日志 API 复用了 `hermes_cli.logs._read_tail`。

常见能力：

- tail 指定行数。
- 按 level 过滤。
- 按 component 过滤。
- search 文本。
- 读取 `agent.log`、`errors.log`、`gateway.log` 等 profile-aware 日志。

Dashboard 也提供 diagnostics/system 类接口，把 CLI 里原本需要用户手工查的状态集中在浏览器里。

## 和 Gateway/TUI 的关系

Dashboard 有三种“连接 Hermes runtime”的方式：

- REST API 直接读写 config/session/log/db。
- JSON-RPC `/api/ws` 进入 `tui_gateway`。
- PTY `/api/pty` 启动真实 `hermes --tui`。

这三者不是重复，而是面向不同问题：

- 配置、日志、列表页适合 REST。
- 结构化控制和事件适合 JSON-RPC。
- 主聊天体验适合 PTY 承载 TUI。

如果后续要给 Dashboard 加新功能，要先判断它属于哪条通道。不要为了一个侧栏 widget 去解析终端字节流，也不要为了主聊天体验在 React 里重写一套 composer/transcript。

## 值得学习的工程点

- 复用已有 TUI：Dashboard 通过 xterm + PTY 复用 `hermes --tui`，避免多套主聊天 UI 分叉。
- 持久挂载 Chat：路由切换不销毁 PTY，会话体验更接近原生 app。
- 结构化旁路事件：终端字节流负责“真实显示”，事件通道负责“可视化增强”。
- 鉴权抽象下沉：`api.ts` 统一处理 token/cookie/ticket，组件不用理解部署模式。
- 反向代理友好：base path 注入、login URL 前缀、cookie path、资源 URL rewrite 都照顾子路径部署。
- API 401 不 redirect：SPA fetch 场景用结构化 JSON 让前端决定跳转。
- Host header 防 rebinding：本地服务也不能只靠“绑定 localhost”心安理得。
- 后台 action 非交互化：`DEVNULL` + `HERMES_NONINTERACTIVE=1` 避免 HTTP 操作挂死。
- 跨 profile 直接读 DB：管理台聚合只读数据时不必为每个 profile 启 runtime。
- 插件信任边界细分：user/bundled/project、static/backend、asset/api 分开处理。
- 插件 SDK 用 window global：外部 bundle 不需要绑定 host 内部模块路径，也避免重复打包 React。
- 防御式路径校验：manifest API 文件 discovery 校验一次，import 前再校验一次。

## 阅读源码建议

建议按这个顺序看：

1. `web/src/App.tsx`：先理解路由、持久 Chat、插件导航。
2. `web/src/pages/ChatPage.tsx`：理解 xterm/PTty 主通道。
3. `hermes_cli/web_server.py` 的 `/api/pty`、`/api/ws`、`/api/pub`、`/api/events`：理解后端通道。
4. `web/src/components/ChatSidebar.tsx`：理解结构化旁路事件。
5. `web/src/lib/api.ts`：理解 auth/base path/fetch/WS 抽象。
6. `hermes_cli/dashboard_auth/middleware.py`：理解 public/gated auth。
7. `web/src/plugins/usePlugins.ts` 和 `web/src/plugins/registry.ts`：理解 Dashboard 插件。
8. `web_server.py` 的 `_discover_dashboard_plugins()` 和 `_mount_plugin_api_routes()`：理解插件安全边界。
