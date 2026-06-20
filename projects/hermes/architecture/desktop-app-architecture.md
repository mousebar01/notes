# Desktop App Architecture

本文记录 `apps/desktop/` 的桌面端实现。它不是简单把终端 CLI 包进一个窗口，而是一个 Electron + React 应用，通过受控 IPC、HTTP REST 和 JSON-RPC WebSocket 连接 Hermes 后端。后端本质仍然是 `hermes dashboard` / `tui_gateway` 那套 Python 能力，所以桌面端能复用同一套 agent、工具、skills、memory、sessions 和 profiles。

## 1. 总体进程模型

桌面端主要分三层：

```text
Electron main process
  - 启动/安装/更新 Hermes runtime
  - 管理本地或远程 dashboard backend
  - 管理 OAuth cookie、文件系统、终端、系统通知、外链
  - 暴露受控 IPC API 给 renderer

Electron renderer
  - React + assistant-ui + nanostores
  - 聊天、侧栏、设置、命令面板、预览、终端等 UI
  - 通过 preload 暴露的 window.hermesDesktop 与 main 通信
  - 通过 WebSocket JSON-RPC 与 Python gateway 流式通信

Python dashboard / tui_gateway backend
  - 真正运行 AIAgent、工具、sessions、config、slash commands
  - 提供 /api/* REST
  - 提供 /api/ws JSON-RPC stream
```

关键文件：

- `apps/desktop/electron/main.cjs`：Electron 主进程，负责启动后端、连接远程 gateway、IPC、文件/终端/更新/安全边界。
- `apps/desktop/electron/preload.cjs`：通过 `contextBridge.exposeInMainWorld()` 暴露 `window.hermesDesktop`，renderer 只能调用这些白名单能力。
- `apps/desktop/src/hermes.ts`：renderer 侧的 gateway client、REST 包装函数和类型导出。
- `apps/desktop/src/app/desktop-controller.tsx`：React 应用的主要协调器，连接 gateway、会话、路由、状态栏、预览、设置等。
- `apps/desktop/src/app/gateway/hooks/use-gateway-boot.ts`：renderer 侧启动和重连主 gateway。
- `apps/desktop/src/store/gateway.ts`：多 profile gateway socket registry。
- `apps/desktop/src/app/session/hooks/use-prompt-actions.ts`：发送消息、处理 slash 命令、附件同步。
- `apps/desktop/src/app/session/hooks/use-message-stream.ts`：把 gateway events 转成聊天 UI 消息。
- `apps/desktop/src/app/session/hooks/use-session-actions.ts`：创建、恢复、分支、删除、归档 session。

一个重要边界：桌面端不直接 import Python 代码，也不直接操作 agent loop。它把 Python runtime 当作一个本地或远程服务，通过标准 API 连接。

## 2. Electron 主进程的职责

`main.cjs` 很大，因为它承担“原生壳层”的所有高风险工作：

- 解析 `HERMES_HOME`、`ACTIVE_HERMES_ROOT`、venv 和 bootstrap marker。
- 首次启动时运行安装脚本，把 Hermes Agent runtime 安装到和 CLI 相同的布局。
- 找 Python、Git Bash、git、可用端口。
- 启动本地 `hermes dashboard --no-open --host 127.0.0.1 --port ...`。
- 连接远程 gateway，包括 token 模式和 OAuth 模式。
- 为 renderer 提供 IPC：连接信息、REST 代理、文件读取、媒体保存、剪贴板、系统通知、终端 PTY、日志、更新等。
- 管理多 profile 后端池。
- 处理 app 更新前的进程锁释放，特别是 Windows venv shim 被运行中 exe 锁住的问题。
- 维护 `desktop.log` 和最近日志环形缓冲。

启动时还会处理一些平台细节。例如远程显示环境下 GPU 合成容易闪烁，主进程会在 app ready 前检测 SSH X11/VNC/RDP 等远程显示并禁用硬件加速。Windows 下 Python 探测避免 Microsoft Store Python stub，也限制到受支持的 Python 3.11-3.13，避免依赖没有 wheel 时触发 Rust 源码构建失败。

## 3. 首次安装与 bootstrap

桌面端 README 说明：打包后的 app 只带 Electron shell，首次启动会把 Hermes Agent runtime 安装到 `HERMES_HOME`，布局与 CLI 安装一致。

实现上：

- `main.cjs` 计算 `HERMES_HOME`。Windows 默认 `%LOCALAPPDATA%\hermes`，macOS/Linux 默认 `~/.hermes`。
- `ACTIVE_HERMES_ROOT = HERMES_HOME/hermes-agent`。
- `BOOTSTRAP_COMPLETE_MARKER = ACTIVE_HERMES_ROOT/.hermes-bootstrap-complete`。
- `bootstrap-runner.cjs` 负责分阶段运行 `scripts/install.ps1` 或 `scripts/install.sh`。
- dev 模式优先用本地 checkout 的 installer；打包模式可根据 build-time install stamp 下载 pinned commit 的 installer。
- bootstrap 事件包括 `manifest`、`stage`、`log`、`complete`、`failed`。
- 主进程保存 bootstrap snapshot，renderer 可通过 `hermes:bootstrap:get` 恢复安装进度，避免刷新 devtools 后丢状态。
- 如果 bootstrap 失败，`bootstrapFailure` 会被 latch，后续 `startHermes()` 直接抛同一个错误，防止 renderer 重连逻辑无限重跑安装脚本。

这个设计的价值是：安装是可观察、可恢复、可取消的，而且不会让失败安装进入热循环。

## 4. preload API：安全边界

`preload.cjs` 暴露 `window.hermesDesktop`：

```js
contextBridge.exposeInMainWorld('hermesDesktop', {
  getConnection: profile => ipcRenderer.invoke('hermes:connection', profile),
  getGatewayWsUrl: profile => ipcRenderer.invoke('hermes:gateway:ws-url', profile),
  api: request => ipcRenderer.invoke('hermes:api', request),
  readFileDataUrl: filePath => ipcRenderer.invoke('hermes:readFileDataUrl', filePath),
  terminal: {
    start: options => ipcRenderer.invoke('hermes:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('hermes:terminal:write', id, data),
    onData: ...
  },
  ...
})
```

`BrowserWindow` 开启了：

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- `preload: electron/preload.cjs`

所以 renderer 不能直接使用 Node 的 `fs`、`child_process`、Electron `session` 等能力。所有危险操作必须穿过主进程 IPC handler。这个模式是 Electron 应用的核心安全工程点：renderer 负责界面，main process 负责权限。

## 5. 后端连接模型：local、remote token、remote OAuth

桌面端后端连接有三类。

### 5.1 local backend

local 模式由 `startHermes()` 启动本机 dashboard：

```text
hermes dashboard --no-open --host 127.0.0.1 --port <picked>
```

主进程生成随机 `HERMES_DASHBOARD_SESSION_TOKEN`，返回给 renderer：

```text
baseUrl = http://127.0.0.1:<port>
wsUrl   = ws://127.0.0.1:<port>/api/ws?token=<token>
```

REST 走 `fetchJson(url, token, ...)`，WebSocket 走 `?token=`。

### 5.2 remote token backend

远程 token 模式使用：

- `HERMES_DESKTOP_REMOTE_URL`
- `HERMES_DESKTOP_REMOTE_TOKEN`
- 或 `connection.json` 中保存的 remote URL/token。

主进程会规范化 URL，只允许 `http://` 或 `https://`。token 存盘时通过 Electron `safeStorage` 加密；如果系统安全存储不可用，则拒绝保存，让用户改用环境变量。

### 5.3 remote OAuth backend

OAuth 模式更复杂，源码注释写得非常关键：

- REST 不用 JS 读取 token，而是通过 Electron 的 persistent session partition 保存 HttpOnly cookie。
- 登录通过可见 `BrowserWindow` 打开 gateway `/login`，让 IDP redirect/callback 设置 cookie。
- WebSocket 不走旧的 `?token=`，而是先 POST `/api/auth/ws-ticket` mint 单次 `?ticket=`。
- access token cookie 约 15 分钟；refresh token cookie 更长，并且服务端可在下一次请求时刷新 access token。
- 因此“是否还能连接”不能只看 access token cookie，而应尝试 mint ws-ticket。

相关实现：

- `OAUTH_SESSION_PARTITION = 'persist:hermes-remote-oauth'`
- `openOauthLoginWindow(baseUrl)`
- `fetchJsonViaOauthSession(url, options)`
- `mintGatewayWsTicket(baseUrl)`
- `freshGatewayWsUrl(profile)`
- renderer 侧 `resolveGatewayWsUrl()`

一个容易踩坑的点：OAuth WebSocket ticket 是单次且短 TTL，所以 renderer 每次 `gateway.connect()` 前都必须重新调用 `getGatewayWsUrl()` mint fresh ticket。不能复用 `conn.wsUrl` 里的旧 ticket。

## 6. 多 profile 后端池

桌面端支持多 profile，并且可以让多个 profile 的会话并发流式输出。它不是只维护一个全局 socket。

主进程：

- primary backend：窗口启动 profile，由 `hermesProcess + connectionPromise + startHermes()` 管。
- secondary/pool backends：`backendPool: Map<profile, entry>`，用于非 primary profile。
- pool backend 本地模式会启动 `hermes --profile <name> dashboard ...`。
- per-profile remote override 可以直接返回远程 connection，不启动本地 child process。
- pool 有 LRU cap 和 idle reaper。默认最多 3 个，空闲超过一段时间会被 reap。
- renderer 会定期 `touchBackend(profile)`，因为 main process 看不到 renderer 到 backend 的直接 WebSocket 活跃度。

renderer：

- `store/gateway.ts` 保存 primary gateway 和 secondary gateway。
- `ensureGatewayForProfile(profile)` 懒加载并打开对应 socket。
- active profile 的 socket 写入 `$gateway`，供 UI 发请求。
- secondary socket 的事件也 funnel 到同一个 `handleGatewayEvent()`。
- pruning 依据 `$workingSessionIds` 和 `$attentionSessionIds`：只保留有运行中或等待用户输入的 profile socket。

工程意义：切 profile 不会打断后台正在 streaming 的 session；单 profile 用户仍然走最简单路径。

## 7. renderer 的 gateway 启动与重连

`useGatewayBoot()` 是 renderer 侧启动主 gateway 的地方：

1. 读取 `window.hermesDesktop`。
2. 创建 `new HermesGateway()`。
3. 设置 primary gateway。
4. 注册 event handler。
5. `desktop.getConnection()` 获取后端连接信息。
6. `resolveGatewayWsUrl(desktop, conn)` 在连接前重新解析 WS URL。
7. `gateway.connect(wsUrl)`。
8. 加载 config 和 sessions。
9. 标记 desktop boot complete。

重连逻辑也很细：

- macOS sleep、网络恢复、window visible 都会触发 reconnect。
- WebSocket 断开后使用指数退避，1s、2s、4s，最多 15s。
- OAuth reauth 错误只提示一次，避免每轮 backoff 都弹 toast。
- 重新连接后刷新 config 和 sessions，弥补睡眠期间后端状态变化。
- secondary gateways 也有自己的 reconnect/backoff，但不会影响 foreground gateway state。

`useGatewayRequest()` 负责普通 JSON-RPC request 的恢复路径：如果请求遇到 “not connected / connection closed”，primary 会走 OAuth-aware reconnect，secondary 会走 registry reconnect，然后重试一次请求。

## 8. REST API 与 JSON-RPC 分工

桌面端同时使用 REST 和 WebSocket JSON-RPC：

REST 主要用于：

- 列 session
- 搜 session
- 读 transcript
- rename/archive/delete session
- 获取 config/model/logs/status
- settings 页面数据

JSON-RPC WebSocket 主要用于：

- `session.create`
- `session.resume`
- `prompt.submit`
- `session.interrupt`
- `session.steer`
- `session.title`
- `commands.catalog`
- `complete.slash`
- `slash.exec`
- `command.dispatch`
- streaming events
- tool/approval/clarify/secret/sudo 等交互事件

`hermes.ts` 里 `HermesGateway extends JsonRpcGatewayClient`，设置默认请求超时 30s。REST 则通过 `window.hermesDesktop.api({ path, method, body, profile })`，由 main process 根据连接类型转发到 local/token/OAuth backend。

一个细节：session mutations 带 owning `profile`，否则远程 profile 的 session row 可能只存在于远程 host 的 `state.db`，打到本地 primary 会 404 或 no-op。

## 9. 跨 profile session 列表与远程拦截

renderer 调 `listAllProfileSessions()` 读取统一 session 列表：

```text
GET /api/profiles/sessions
```

main process 有 `interceptSessionRequestForRemote(request)`：

- 如果存在 per-profile remote override，统一列表会先读 primary 本地 aggregate，再把远程 profile 的 rows/totals 替换为远程真实数据。
- 远程 profile 的 `/api/sessions/{id}` 读写会被路由到对应远程 backend。
- app-global remote 模式下，一个远程 backend 服务所有 profile，请求会保留 `?profile=<name>`。

这解决了一个实际问题：本地 primary 只能读本地各 profile 的 `state.db`，但 per-profile remote 的真实 sessions 不在本机磁盘上。

## 10. 会话创建：乐观 UI 与 runtime/stored id

发送第一条消息时，如果没有 active runtime session，`createBackendSessionForSend()` 会：

1. `ensureGatewayProfile($newChatProfile.get())`，把新聊天路由到目标 profile。
2. 调 `session.create`，传 `cwd`、`cols` 和可选 `profile`。
3. 记录 `created.session_id` 作为 runtime id。
4. 记录 `created.stored_session_id` 作为持久 DB id。
5. 如果有 stored id，立即往 sidebar 插入 optimistic session row。
6. 应用 backend 返回的 runtime info：cwd、branch、model、provider、personality、reasoning、service tier、fast、yolo、usage。
7. 如果用户在 draft 上预先 armed YOLO，则在 session 创建后调用 `setSessionYolo()`。

这里区分 runtime id 和 stored id 很重要：

- runtime id 是当前 gateway 内存里的会话句柄。
- stored id 是 `SessionDB` 里的持久会话 id。
- 新 session 可能在第一轮真正持久化前还没有完整 DB row。

因此 `/title <name>` 不能直接走 REST PATCH stored session。桌面端专门走 `session.title` JSON-RPC，因为 gateway 能把 runtime id 映射到内存 session，并在 DB row 未出现时 queue 标题。

## 11. 发送消息与附件同步

`usePromptActions.submitPromptText()` 的流程：

1. 从 composer attachments 中收集 context refs。
2. 从 draft 中收集 terminal context blocks。
3. 组合最终发给 agent 的 `text`。
4. 插入 optimistic user message。
5. 设置 `busy` 和 `awaitingResponse`。
6. 如无 session，先创建 backend session。
7. 对 image attachments 调 `image.attach`，绑定到 session。
8. 调 `prompt.submit`。
9. 成功后清理 composer attachments。
10. 失败时释放 busy，并插入 assistant error message。

注意 text 的构造：

```text
contextRefs

terminalContextBlocks

visibleText
```

如果只有图片没有文字，会默认发送 “What do you see in this image?”。这避免空 prompt。

## 12. 流式消息 reducer

`useMessageStream()` 把 gateway events 变成 UI state。它处理：

- `message.delta`
- reasoning delta
- `message.complete`
- `tool.start`
- `tool.progress`
- `tool.complete`
- subagent events
- approval / clarify / sudo / secret prompts
- session info
- usage/model/cwd/branch/personality 等状态同步
- inline provider errors

流式文本不是每个 token 都立即 setState。源码设置：

```text
STREAM_DELTA_FLUSH_MS = 33
```

delta 先进入 per-session queue，然后按约 30fps 刷新。注释里提到，之前 16ms/rAF 在 30-80 tok/s 的常见速率下会导致几乎每 token 一个 React commit 和 markdown reparse，长消息性能很差。33ms 能合并约 2 个 token，视觉上仍然顺滑。

`completeAssistantMessage()` 还会做：

- final text 替换 streaming text part。
- reasoning/text 去重。
- completion text 如果看起来像 provider/gateway error，则转成 inline assistant error。
- 如果没有看到 assistant payload 或 final text 为空，会尝试 `hydrateFromStoredSession(3, ...)` 从持久 transcript 回填。
- 如果窗口在后台，发送系统通知。

## 13. session resume：先快照，后绑定 runtime

`useSessionActions.resumeSession()` 处理恢复已存 session：

1. 根据 session 所属 profile 调 `ensureGatewayProfile(sessionProfile)`。
2. 如果存在 cached runtime id，先尝试 `session.usage` 验证它还活着。
3. 如果 cached runtime id 因 profile backend 被 idle reaped 而失效，就删除缓存，走完整 resume。
4. 先 `getSessionMessages(storedSessionId, profile)` 读取本地/远程持久 transcript，减少空白闪烁。
5. 再调用 `session.resume`，绑定新的 runtime session id。
6. 对比/协调 local snapshot 与 gateway returned messages，尽量避免二次重绘。
7. 应用 runtime info。

这是一种很实用的 UX 工程：先用稳定快照快速绘制，再用 runtime resume 获得可继续对话的活会话。

## 14. slash 命令设计

桌面端不直接照搬 CLI 的全部 slash 命令，而是做 curated surface。

`desktop-slash-commands.ts` 定义：

- `DESKTOP_COMMANDS`：桌面端明确展示的 built-ins，比如 `/new`、`/branch`、`/queue`、`/usage`、`/yolo`。
- `TERMINAL_ONLY_COMMANDS`：只属于终端界面的命令，如 `/clear`、`/copy`、`/paste`、`/tools`、`/logs` 等。
- `MESSAGING_ONLY_COMMANDS`：如 `/approve`、`/deny`。
- `SETTINGS_OWNED_COMMANDS`：如 `/skills`，桌面端由设置侧栏管理。
- `ADVANCED_COMMANDS`：不展示在桌面 slash palette 的高级命令。
- aliases：如 `/fork -> /branch`、`/reset -> /new`。

关键点：skill commands 和 user quick commands 被视为 extension commands。它们不是 Hermes built-in，所以即使不在 curated allow-list 中，也应该能显示和执行。

执行路径：

1. `/new`、`/branch`、`/yolo`、`/profile`、`/skin` 等由桌面端本地特殊处理。
2. `/help` 调 `commands.catalog` 并通过 `filterDesktopCommandsCatalog()` 过滤。
3. 其他命令如果 `isDesktopSlashCommand(name)` 允许，先调 `slash.exec`。
4. 如果 `slash.exec` 失败，fallback 到 `command.dispatch`。
5. `command.dispatch` 可能返回 `exec`、`plugin`、`alias`、`skill`。
6. skill 返回 message 时，桌面端把它作为普通 prompt 送进 `submitPromptText()`。

补全路径：

- 空 query 调 `commands.catalog`。
- 非空 query 调 `complete.slash`。
- 两者都走 desktop filter。
- extension commands 会保留，terminal-only built-ins 会隐藏。

## 15. nanostores 状态分层

桌面端大量使用 nanostores，而不是把所有状态塞到 React component state。

例子：

- `store/session.ts`：connection、gatewayState、sessions、activeSessionId、messages、busy、cwd、model、usage、yolo。
- `store/gateway.ts`：primary/secondary gateway registry。
- `store/profile.ts`：active gateway profile、新聊天 profile、profile 切换。
- `store/composer.ts`：draft、attachments、terminal context blocks。
- `store/prompts.ts`：approval/sudo/secret 等 prompt。
- `store/clarify.ts`：clarify request。
- `store/tool-diffs.ts`：工具 diff 展示。
- `store/layout.ts`：sidebar/panes/pinned sessions。

工程上值得注意的模式：

- shared state 放 store，UI 用 `useStore()` 订阅。
- 非渲染逻辑用 `$atom.get()` 直接读，避免 props drilling。
- `setCurrentCwd()` 同时更新 atom 和 localStorage。
- `mergeSessionPage()` 会保留工作中 sessions 和 pinned sessions，防止刷新列表时被 server page 截掉。
- `setSessionWorking()` 配 watchdog，长时间无 stream 活动后清掉 working flag。

## 16. 文件预览、媒体和右侧面板

桌面端有右侧 preview rail、文件浏览、local preview 等功能。主进程提供：

- `readFileDataUrl`：小图片/文件以 data URL 读取，有 16MB 上限。
- `readFileText`：文本预览，最大源文件 64MB，实际读取前 512KB。
- `normalizePreviewTarget`
- `watchPreviewFile`
- `saveImageFromUrl`
- `saveClipboardImage`
- `hermes-media://` 自定义协议用于音视频流式预览。

为什么要自定义 `hermes-media://`：

- data URL 需要整文件 base64 进内存，不适合视频。
- 自定义协议可以让 Electron 的 net stack 处理 `file://`，保留 Range request，视频可 seek。
- 只允许音视频扩展名，避免变成任意本地文件无上限读取通道。

文件读取走 `hardening.cjs.resolveReadableFileForIpc()`，会拦截敏感文件。

## 17. 内置终端

`preload.cjs` 暴露 `terminal.start/write/resize/dispose/onData/onExit`。主进程使用 `node-pty`，打包时还考虑 native dep 被 asar/hoist 排除的问题，必要时从 `resources/native-deps/node-pty` 加载。

终端环境做了清理：

- 删除 npm 相关 env，避免用户 shell 被 npm prefix 干扰。
- 删除 `NO_COLOR`、`FORCE_COLOR`、`COLORFGBG` 等从非 tty runner 继承来的颜色变量。
- 设置 `COLORTERM=truecolor`、`TERM=xterm-256color`、`TERM_PROGRAM=Hermes`。
- POSIX 下优先 `/bin/zsh`、`/bin/bash`、`/bin/sh`，并以 interactive 参数启动。
- Windows 下用 `COMSPEC` 或 `cmd.exe`。

这个终端是桌面 UI 的辅助能力，不等于 agent tool 的 terminal backend；agent 工具仍然由 Python 后端管理。

## 18. 安全与硬化细节

桌面端有多层硬化：

- Renderer sandbox + context isolation + no nodeIntegration。
- 所有 Node/Electron 能力走 preload 白名单。
- 外链只允许 `http:`、`https:`、`mailto:` 和受控 `file:` open path。
- `setWindowOpenHandler` 拦截窗口打开并交给系统外部打开。
- `will-navigate` 阻止 renderer 任意导航离开 app。
- 文件读取拦截敏感文件：
  - `.ssh/`
  - `.gnupg/`
  - `.aws/credentials`
  - `.env` 与大多数 `.env.*`
  - SSH private key
  - `.kdbx`、`.p12`、`.pem`、`.pfx`
  - `.npmrc`、`.netrc`、`.pypirc`
- remote token 保存必须能用 OS secure storage。
- connection config 写入使用 temp + rename 的原子写。
- remote URL 只允许 http/https。
- OAuth REST 使用 HttpOnly cookie partition，不把 cookie 暴露给 renderer。
- WebSocket 连接测试不只测 HTTP `/api/status`，还会实际 probe `/api/ws`，避免 HTTP 可达但 WS 被代理/鉴权挡住。

## 19. 更新机制

桌面端有 update check/apply：

- update branch 默认 `main`，写在 userData 下 `updates.json`。
- `checkUpdates()` 对 git checkout fetch origin branch，然后比较 `HEAD..origin/<branch>`。
- 如果配置 branch 已被远端删除，`resolveHealedBranch()` 会 fallback 到 main 并持久化。
- Windows 更新前必须释放 venv shim 锁。`releaseBackendLockForUpdate()` 会停止 primary 和 pool backend，并用 `taskkill /T /F` 处理子进程树，再轮询 shim 是否可写。
- POSIX 没有 Windows mandatory lock 问题，可以走不同更新路径。

一个设计原则：桌面端尽量不自己 open-code “git pull + pip install + rebuild”的核心逻辑，而是把真正更新交给 staged updater / `hermes update` 流程，UI 主要负责检测、展示和交接。

## 20. 测试入口

桌面端既有 renderer Vitest，也有 Electron main 侧 Node tests。

常见文件：

- `apps/desktop/src/lib/desktop-slash-commands.test.ts`
- `apps/desktop/src/app/session/hooks/use-prompt-actions.test.tsx`
- `apps/desktop/src/app/session/hooks/use-preview-routing.test.tsx`
- `apps/desktop/src/components/assistant-ui/streaming.test.tsx`
- `apps/desktop/src/store/*.test.ts`
- `apps/desktop/electron/bootstrap-platform.test.cjs`
- `apps/desktop/electron/bootstrap-runner.test.cjs`
- `apps/desktop/electron/backend-probes.test.cjs`
- `apps/desktop/electron/connection-config.test.cjs`
- `apps/desktop/electron/gateway-ws-probe.test.cjs`
- `apps/desktop/electron/hardening.test.cjs`
- `apps/desktop/electron/oauth-net-request.test.cjs`

README 建议开发时运行：

```bash
npm run fix
npm run type-check
npm run lint
npm run test:desktop:all
```

## 21. 值得学习的工程设计点

桌面端最值得学的不是某个组件怎么写，而是边界怎么切：

1. 权限边界清楚：renderer 没有 Node 权限，所有高风险能力都在 main process 白名单里。
2. 后端复用清楚：桌面不是重写 agent，而是连接同一个 dashboard/tui_gateway 能力面。
3. OAuth 处理尊重浏览器安全模型：HttpOnly cookie 不出 partition，WS 用单次 ticket。
4. 多 profile 不是全局切换，而是 primary + secondary sockets，可以并发 stream。
5. 乐观 UI 和权威回填并存：先让用户看到发送/恢复结果，再从 session DB 和 gateway event 校准。
6. Slash 命令做 curated surface：隐藏终端噪音，但保留用户扩展命令。
7. 平台坑被显式编码：Windows Python stub、Git Bash、venv shim lock、WSL 字体、远程显示 GPU、asar native deps。
8. 失败状态可恢复：bootstrap failure latch、renderer crash reload budget、gateway reconnect backoff、remote session request reroute。

一句话总结：Hermes Desktop 是一个“安全壳 + 状态丰富的 renderer + 复用 Python agent 后端”的架构，而不是把 agent 逻辑搬到前端。
