# MCP Integration

本文记录 Hermes Agent 的 MCP（Model Context Protocol）集成机制。

Hermes 把外部 MCP server 暴露成普通工具，让 agent 可以像调用内置工具一样调用 MCP tools。这个系统不仅是“连上 MCP SDK”那么简单，它还处理了：

- stdio / Streamable HTTP / SSE 三种 transport。
- 后台 asyncio event loop 和长连接生命周期。
- tool discovery 与动态 tools/list_changed 刷新。
- 工具 schema 归一化，兼容 OpenAI / Anthropic / Gemini / Moonshot。
- MCP OAuth 2.1 PKCE、token 持久化、外部刷新感知、401 去重。
- 安全 env 传递、stderr 重定向、错误脱敏、URL 校验、Authorization redirect 防泄漏。
- 断线重连、session expired 重连、circuit breaker、orphan subprocess 清理。
- MCP sampling，也就是 MCP server 反向请求 Hermes 帮它调用 LLM。

相关入口：

- `tools/mcp_tool.py`
- `tools/mcp_oauth.py`
- `tools/mcp_oauth_manager.py`
- `hermes_cli/mcp_startup.py`
- `cli.py`
- `gateway/run.py`
- `model_tools.py`
- `tools/registry.py`
- `hermes_cli/config.py`

---

## 1. 配置入口

MCP 配置位于 `config.yaml` 顶层：

```yaml
mcp_servers:
  filesystem:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    env: {}
    timeout: 120
    connect_timeout: 60

  github:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}"
    supports_parallel_tool_calls: true

  remote_api:
    url: "https://my-mcp-server.example.com/mcp"
    headers:
      Authorization: "Bearer ${MCP_TOKEN}"
    timeout: 180

  searxng:
    url: "http://localhost:8000/sse"
    transport: sse
    timeout: 180
    connect_timeout: 10
```

常见字段：

- `command` / `args` / `env`：stdio transport。
- `url` / `headers`：HTTP / SSE transport。
- `transport: sse`：显式使用 SSE。
- `timeout`：每次 MCP tool call 的超时，默认 120 秒。
- `connect_timeout`：初始连接超时，默认 60 秒。
- `enabled: false`：禁用 server。
- `supports_parallel_tool_calls: true`：声明该 server 的工具可并行调用。
- `tools.include` / `tools.exclude`：选择性注册 MCP tools。
- `tools.resources` / `tools.prompts`：是否注册 resources/prompts utility tools。
- `auth: oauth`：启用 MCP OAuth。
- `oauth`：OAuth 细节配置。
- `sampling`：MCP server-initiated LLM requests。

`${ENV_VAR}` 会从 `os.environ` 插值。源码会先尝试加载 `~/.hermes/.env`，所以配置里可以引用 `.env` 里的 token。

---

## 2. 启动发现时机

MCP discovery 不是每次 tool call 才连接。

主要路径：

- `model_tools.py` 触发工具发现时会调用 `discover_mcp_tools()`。
- CLI deferred startup 会通过 `hermes_cli/mcp_startup.py::start_background_mcp_discovery()` 在后台线程里发现 MCP。
- `wait_for_mcp_discovery(timeout=0.75)` 会在第一次工具快照前短暂等待后台发现。
- Gateway 启动时在 executor 中运行 `discover_mcp_tools()`，避免阻塞 asyncio event loop。
- Gateway / CLI shutdown 时调用 `shutdown_mcp_servers()`。

`mcp_startup.py` 有一个便宜的 config probe：

- 如果没有配置 `mcp_servers`，就不导入 MCP stack。
- 如果 config probe 失败，保守地后台尝试 discovery，但不阻塞启动。

这个设计减少了非 MCP 用户的启动成本。

---

## 3. 可选依赖与 graceful no-op

`tools/mcp_tool.py` 会尝试 import MCP SDK：

- `mcp.ClientSession`
- `stdio_client`
- `streamable_http_client` / `streamablehttp_client`
- `sse_client`
- sampling types
- notification types

如果 `mcp` 包没安装：

- `_MCP_AVAILABLE = False`
- `discover_mcp_tools()` 返回空列表
- 显式注册也直接跳过
- 只写 debug 日志

因此 MCP 是 optional capability，不应该让普通 Hermes 使用失败。

---

## 4. 总体架构

核心状态：

- `_servers: Dict[str, MCPServerTask]`
- `_mcp_loop`
- `_mcp_thread`
- `_parallel_safe_servers`
- `_mcp_tool_server_names`
- `_stdio_pids`
- `_orphan_stdio_pids`
- `_stdio_pgids`

架构：

```text
主线程 / agent tool handler
  ↓ sync registry handler
_run_on_mcp_loop()
  ↓ run_coroutine_threadsafe
后台 mcp-event-loop thread
  ↓
MCPServerTask per server
  ↓
ClientSession over stdio / HTTP / SSE
```

为什么要专门的 event loop：

- MCP SDK 是 async。
- Hermes agent/tool loop 主要是同步接口。
- 长连接需要持续活着。
- stdio transport 的 async context manager 必须在同一个 asyncio task 里进入和退出，否则 anyio cancel-scope cleanup 会出问题。

`MCPServerTask` 代表一个 server 的长生命周期：

- connect
- initialize
- list_tools
- register tools
- wait for shutdown / reconnect
- disconnect
- backoff reconnect

---

## 5. Stdio Transport

stdio server 配置使用 `command` + `args`。

安全 env：

`_build_safe_env()` 默认只传：

- `PATH`
- `HOME`
- `USER`
- `LANG`
- `LC_ALL`
- `TERM`
- `SHELL`
- `TMPDIR`
- `XDG_*`

然后叠加用户在 `mcp_servers.<name>.env` 里显式配置的变量。

这避免把当前进程里的所有 API key / token / password 自动泄漏给 MCP subprocess。

命令解析：

- `~` 会 expand。
- bare command 会用 subprocess env 的 `PATH` 查找。
- 对 `npx` / `npm` / `node` 有额外 fallback：
  - `<HERMES_HOME>/node/bin`
  - `~/.local/bin`
  - `/usr/local/bin`
- 如果解析到具体目录，会 prepend 到 subprocess PATH，避免 `npx` shebang 再找不到 `node`。

spawn 前还会调用 `tools.osv_check.check_package_for_malware()`，对 npm 等 package 做 OSV malware 检查。

---

## 6. MCP stderr 日志

MCP SDK 的 `stdio_client(..., errlog=sys.stderr)` 默认会把 server stderr 打到用户终端。

这会破坏 CLI/TUI：

- FastMCP banner
- JSON startup logs
- server warning
- prompt_toolkit / Rich 正在渲染时被 stderr 插入

Hermes 改成把所有 stdio MCP subprocess stderr 写到：

```text
~/.hermes/logs/mcp-stderr.log
```

每次启动 server 前写 header：

```text
===== [timestamp] starting MCP server '<name>' =====
```

如果无法打开日志文件，fallback 到 `os.devnull`，最后才退回真实 stderr。

这个设计既保护 UI，又保留排障能力。

---

## 7. HTTP / Streamable HTTP Transport

HTTP server 使用 `url`。

启动前会做 URL validation：

- 必须是 string。
- scheme 必须是 `http` 或 `https`。
- 必须有 host / hostname。
- 非 http(s)、空 URL、缺 host 都会快速失败。

Streamable HTTP 还有 content-type preflight：

- 对 URL 做短 timeout HEAD/GET。
- 如果 2xx response 明确返回非 MCP content type，例如 `text/html`，则判定 URL 指向普通网页而不是 MCP endpoint。
- 这会抛 `NonMcpEndpointError`，避免 SDK 卡完整个 `connect_timeout` 后给用户一个模糊 `CancelledError`。

HTTP headers：

- 如果用户没设置 `MCP-Protocol-Version`，会自动补 `LATEST_PROTOCOL_VERSION`。
- 支持 `ssl_verify`。
- 支持 `client_cert` / `client_key` mTLS。

新版 MCP SDK path：

- Hermes 自己创建 `httpx.AsyncClient`。
- `follow_redirects=True`
- read timeout 300 秒。
- 跨 origin redirect 时主动移除 Authorization header，避免 token 泄漏到别的域。
- 因为传了自建 `http_client`，Hermes 用 `async with` 负责 client lifecycle。

旧版 MCP SDK path：

- 使用 deprecated `streamablehttp_client`。
- 仍传 headers、timeout、verify、auth。

---

## 8. SSE Transport

`transport: sse` 使用 `sse_client`。

细节：

- `timeout` 使用 `connect_timeout`。
- `sse_read_timeout` 固定 300 秒。
- 原因：SSE server 可能长时间没有事件，60 秒 read timeout 会误断。
- OAuth auth 会传给 `sse_client`。
- 如果配置了 mTLS 或 `ssl_verify`，会通过 `httpx_client_factory` 注入。

SSE endpoint 本身合法返回 `text/event-stream`，所以 Streamable HTTP 的 content-type preflight 不用于 SSE。

---

## 9. MCPServerTask 生命周期

`MCPServerTask.run(config)` 是长生命周期 loop。

启动阶段：

1. 保存 config。
2. 设置 `tool_timeout`。
3. 解析 `auth`。
4. 如果 sampling enabled 且 SDK 支持，创建 `SamplingHandler`。
5. 如果同时有 `url` 和 `command`，warning 并使用 HTTP。
6. HTTP URL / content-type preflight。
7. 进入 transport。
8. `session.initialize()`。
9. `session.list_tools()`。
10. `_ready.set()`。
11. 等待 shutdown / reconnect / keepalive。

重连策略：

- 初始连接失败最多 `_MAX_INITIAL_CONNECT_RETRIES = 3`。
- 初始 OAuth auth 失败不自动 retry。
- 已 ready 后连接丢失最多 `_MAX_RECONNECT_RETRIES = 5`。
- 指数 backoff，最大 60 秒。
- shutdown 时不重连。
- OAuth recovery / manual refresh 设置 `_reconnect_event`，这是“正常重连”，不计入失败 retry。

keepalive：

- `_wait_for_lifecycle_event()` 每 180 秒发一次轻量 `list_tools()`。
- 如果 keepalive 失败，触发 reconnect。

---

## 10. Dynamic Tool Discovery

如果 MCP SDK 支持 notification handler，Hermes 会处理：

- `notifications/tools/list_changed`
- `prompts/list_changed`
- `resources/list_changed`

当前只有 tools/list_changed 会触发刷新。

刷新设计：

- notification handler 不同步跑 list_tools，而是 schedule background task。
- 原因：有些 server 在 startup 或其他 request 期间发 notification，如果 handler 直接占用 JSON-RPC stream，可能和正在进行的 tool call 竞态，导致 stdio stream wedge。
- `_rpc_lock` 序列化 client-initiated RPC。
- `_refresh_lock` 防止多个刷新重叠。

刷新流程：

1. 获取 old tool names。
2. `session.list_tools()` 获取新列表。
3. 对 stale tool deregister。
4. 对新工具重新 register。
5. 比较 added / removed。
6. 有变化时 warning，让 operator 验证是否预期。

这很关键，因为 MCP server 控制 tool description 和 schema，动态变更可能影响 prompt 面和能力面。

---

## 11. 工具注册命名

MCP tool 会注册成：

```text
mcp_<sanitized_server>_<sanitized_tool>
```

`sanitize_mcp_name_component()` 会把非 `[A-Za-z0-9_]` 字符替换成 `_`，并保留历史行为：hyphen 也变 underscore。

注册时：

- toolset 是 `mcp-<server>`。
- 同时注册 raw server name alias 到这个 toolset。
- handler 是 `_make_tool_handler(server, tool, timeout)`。
- check_fn 是 `_make_check_fn(server)`。
- `is_async=False`，因为 registry handler 是同步入口，内部再转发到 MCP loop。

碰撞保护：

- 如果生成的 tool name 和内置非 MCP 工具冲突，会跳过 MCP 工具，保留内置工具。
- utility tools 也做同样保护。

工具 provenance：

- `_mcp_tool_server_names[tool_name] = server_name`
- 这避免用字符串 prefix 猜 server，因为 server 名可能含 underscore，`mcp_a_b_tool` 有歧义。

---

## 12. Tool Include / Exclude

配置可限制 server 注册哪些 MCP tools：

```yaml
mcp_servers:
  my_server:
    tools:
      include: ["search", "fetch"]
```

或：

```yaml
mcp_servers:
  my_server:
    tools:
      exclude: ["dangerous_write"]
```

规则：

- `include` 是白名单。
- `exclude` 是黑名单。
- `include` 优先于 `exclude`。
- 都不设置则注册全部 tools。

resources / prompts utility tools 也可以关：

```yaml
tools:
  resources: false
  prompts: false
```

---

## 13. Resources / Prompts Utility Tools

Hermes 会为 MCP server 额外构造 utility tools：

- `mcp_<server>_list_resources`
- `mcp_<server>_read_resource`
- `mcp_<server>_list_prompts`
- `mcp_<server>_get_prompt`

但不会盲目注册。

正确 gate 是 `initialize_result.capabilities`：

- server advertise `resources` 才注册 resources tools。
- server advertise `prompts` 才注册 prompts tools。

旧逻辑如果只看 `hasattr(ClientSession, "list_resources")` 会误判，因为 SDK class 本身总有这些 method，即使 server 不支持，调用会返回 `Method not found`。

这是一个很值得学习的协议集成细节：client method 存在不等于 server capability 存在，必须看 initialize capabilities。

---

## 14. Tool Description 扫描

MCP server 提供 tool description，而 description 会进入 LLM tool schema，相当于 prompt 上下文。

Hermes 对 description 做 prompt-injection pattern 扫描：

- `ignore previous instructions`
- `you are now a`
- `your new task/role/instructions`
- `system:`
- `<system>` / `<human>` / `<assistant>`
- `do not tell/inform/mention/reveal`
- `curl/wget/fetch http`
- `base64 decode`
- `exec(` / `eval(`
- `import subprocess/os/shutil/socket`

命中时：

- 记录 warning。
- 不阻止注册。

为什么不阻止：

- MCP server 可能是合法工具，description 里可能出现安全文档或示例。
- false positive 如果直接 block，会破坏用户配置。

这是一种“高信号审计，但不默认中断”的策略。

---

## 15. Schema 归一化

MCP tool 的 `inputSchema` 会通过 `_normalize_mcp_input_schema()` 转成更兼容 LLM tool calling 的 JSON Schema。

处理内容：

- 空 schema → `{"type": "object", "properties": {}}`
- `definitions` → `$defs`
- `#/definitions/...` ref → `#/$defs/...`
- object-shaped node 缺 `type` 时补 `type: object`
- object 缺 `properties` 时补空 dict
- `required` 只保留确实存在于 `properties` 的字段
- nullable union，例如 `anyOf: [T, {"type": "null"}]`，会折叠到非 null 分支，并保留 `nullable: true` hint

为什么要做这些修复：

- Moonshot / Kimi 对 `$ref` 形状更挑。
- Gemini 会因 required 指向不存在 property 而 400。
- Anthropic 拒绝 nullable branch。
- 有些 MCP/Pydantic schema 本身省略 type 或 properties。

Hermes 选择 provider-agnostic repair，在注册时一次性修好，避免不同 provider 下同一个 MCP 工具表现不同。

---

## 16. Tool Call Handler

每个 MCP tool 的 handler 是同步函数，但内部会：

```text
registry handler
  ↓
_run_on_mcp_loop()
  ↓
server.session.call_tool(...)
```

关键保护：

- `_rpc_lock`：同一 server 的 client-initiated RPC 串行化。
- `timeout`：每个 tool call 独立超时。
- interrupt polling：调用线程每 0.1 秒检查 `tools.interrupt.is_interrupted()`。
- user interrupt 时 cancel future，返回标准 JSON error。

结果处理：

- 如果 MCP `result.isError`，提取 text block，返回 `{"error": ...}`。
- text block 合并成字符串。
- image block 会解码并缓存到 gateway image cache，返回 `MEDIA:<path>` tag。
- 如果有 `structuredContent`，会和 text result 一起返回：
  - 有文本：`{"result": text, "structuredContent": structured}`
  - 无文本：`{"result": structured}`

这对多模态 MCP 很重要：Playwright / screenshot 等 image content 不会被静默丢掉。

---

## 17. Error Sanitization

MCP error 返回给 LLM 前会走 `_sanitize_error()`。

会替换：

- GitHub PAT
- `sk-...`
- `Bearer ...`
- `token=...`
- `key=...`
- `API_KEY=...`
- `password=...`
- `secret=...`

连接错误还有 `_format_connect_error()`：

- 从 ExceptionGroup / cause / context 中递归找 FileNotFoundError。
- 如果缺 `npx` / `npm` / `node`，给出 Node.js / PATH 的具体建议。
- 最终消息也会 sanitize。

这很实际：MCP server 往往由第三方命令启动，错误里可能带命令行、headers、token。

---

## 18. Circuit Breaker

MCP tool handler 有 per-server circuit breaker：

- 连续失败计数 `_server_error_counts`
- threshold：3
- cooldown：60 秒

状态：

- closed：失败数低于阈值。
- open：达到阈值，短路返回“server unreachable，不要重试”。
- half-open：cooldown 到期，下一个 call 作为 probe。

目的：

- 阻止模型在 90 次工具迭代里反复调用已经不可达的 MCP server。
- 给模型明确指令：不要现在重试，换方法或让用户检查 MCP server。

成功 tool call 会 reset breaker。OAuth recovery 成功也会 reset，因为它证明 server 有恢复可能。

---

## 19. Auth Error 与 Session Expired

MCP 集成区分两类常见失败。

### Auth error

`_is_auth_error()` 识别：

- MCP SDK OAuthFlowError / OAuthTokenError
- 旧 SDK UnauthorizedError
- Hermes OAuthNonInteractiveError
- HTTP 401

处理：

1. 调 `MCPOAuthManager.handle_401()`。
2. 如果可恢复，设置 server `_reconnect_event`。
3. 等新 session ready。
4. 重试一次。
5. 如果不可恢复，返回结构化错误：

```json
{
  "error": "MCP server '<name>' requires re-authentication...",
  "needs_reauth": true,
  "server": "<name>"
}
```

错误会明确告诉模型不要重试，让用户运行 `hermes mcp login <server>`。

### Session expired

`_is_session_expired_error()` 匹配：

- invalid or expired session
- session not found
- unknown session
- transport is closed
- broken pipe
- end of file
- closed resource

这不代表 OAuth token 失效，只是 server-side transport session 被 GC / restart / pod rotation。

处理：

- 不走 OAuth refresh。
- 直接触发 transport reconnect。
- 等 ready。
- 重试一次。

这个区分很重要：把 session expired 当 auth error 会浪费刷新流程，还可能要求用户无意义地重新登录。

---

## 20. Parallel Tool Calls

配置：

```yaml
supports_parallel_tool_calls: true
```

Hermes 会把该 server 的 sanitized name 放入 `_parallel_safe_servers`。

`is_mcp_tool_parallel_safe(tool_name)`：

- 只对 `mcp_` 工具生效。
- 用注册时保存的 `_mcp_tool_server_names` 查真实 server。
- 判断该 server 是否 opt-in。

默认不并行的原因：

- 很多 MCP stdio server 是单 JSON-RPC stream。
- 同 server 并发请求可能造成 stream 乱序、阻塞或 server 状态竞态。
- 只有 server 明确声明安全时，Hermes 才允许并行工具调用。

---

## 21. MCP OAuth 文件存储

`tools/mcp_oauth.py` 实现 OAuth 2.1 PKCE glue。

token 目录：

```text
<HERMES_HOME>/mcp-tokens/
```

文件：

- `<server>.json`：tokens
- `<server>.client.json`：dynamic client registration info
- `<server>.meta.json`：OAuth server metadata

安全写入：

- 父目录用 `secure_parent_dir()` 收紧。
- 临时文件用 `os.open(..., O_EXCL, 0o600)` 创建。
- 写入后 `fsync`。
- `os.replace()` 原子替换。

这样避免了 `write_text()` 后再 chmod 的 TOCTOU 窗口，因为那段时间 token 文件可能短暂继承 umask 成为 world-readable。

token 读取：

- 如果有 `expires_at`，把它转换为剩余 `expires_in`。
- 老 token 文件没有 `expires_at` 时，用文件 mtime + expires_in 推测是否已过期。
- 过期则让 SDK 启动前 refresh，而不是先发 stale bearer。

---

## 22. OAuth Manager

`tools/mcp_oauth_manager.py` 是 per-server OAuth state 的唯一入口。

它解决三个问题：

### Provider 缓存

`get_or_build_provider(server_name, server_url, oauth_config)`：

- 同名同 URL 复用 provider。
- URL 改变则丢弃旧 entry。
- provider 构造失败时返回 None / warning。

### Disk Watch

`invalidate_if_disk_changed(server_name)`：

- stat token file 的 `st_mtime_ns`。
- 如果 mtime 变化，就把 SDK provider 的 `_initialized` 设为 False。
- 下一次 auth flow 会重新从 disk load。

这解决外部进程刷新 token 的问题。例如 cron job 或另一个 CLI 刷新了 token，长跑 gateway 不需要重启。

### 401 Dedup

`handle_401(server_name, failed_access_token)`：

- 用 `pending_401` dict 按 failed token 去重。
- N 个并发 tool call 同时遇到 401，只让一个 recovery 流程跑。
- 其他 caller await 同一个 future。
- recovery 先检查 disk 是否变化。
- 如果 disk 没变，再看 SDK 是否能 refresh in-place。

这防止 401 thundering herd。

---

## 23. OAuth Provider Subclass

Hermes 动态创建 `HermesMCPOAuthProvider` 子类。

增强点：

- async auth flow 前调用 manager disk-watch。
- `_initialize()` 后根据 token `expires_in` 更新 SDK 的 token expiry。
- cold-load 时从 `<server>.meta.json` 恢复 OAuth metadata。
- 如果 metadata 不存在，会 prefetch PRM / ASM，获取真正 token endpoint。
- SDK lazy 401 branch 发现到的新 metadata 也会持久化。

还有一个很细的 generator bridge：

`httpx.Auth` 的 async auth flow 是双向 generator，httpx 会用 `.asend(response)` 把 response 送回 generator。Hermes wrapper 不能简单 `async for item in inner`，否则 response 会丢失，SDK 看到 `response=None` 崩溃。

源码手写了：

```python
outgoing = await inner.__anext__()
while True:
    incoming = yield outgoing
    outgoing = await inner.asend(incoming)
```

这是一个典型“包装异步生成器协议时要保持双向 send 语义”的工程坑。

---

## 24. OAuth 交互流程

`tools/mcp_oauth.py` 负责：

- 判断是否 interactive。
- 判断能否打开 browser。
- 启动 localhost callback server。
- 选择 free port 或使用 `redirect_port`。
- PKCE / dynamic client registration 由 MCP SDK 处理。
- redirect callback 捕获 authorization code。
- token / client info / metadata 持久化到 `mcp-tokens/`。

非交互环境：

- 如果没有 cached tokens，OAuth 会 warning。
- server 连接会失败为“需要先交互登录”。
- tool call 最终会提示用户运行 `hermes mcp login <server>`。

---

## 25. Sampling：MCP Server 反向调用 LLM

MCP sampling 允许 server 发 `sampling/createMessage`，让 client 调 LLM。

Hermes 的 `SamplingHandler` 支持：

配置：

```yaml
sampling:
  enabled: true
  model: "gemini-3-flash"
  max_tokens_cap: 4096
  timeout: 30
  max_rpm: 10
  allowed_models: []
  max_tool_rounds: 5
  log_level: "info"
```

行为：

- 每个 MCP server 一个 SamplingHandler。
- rate limit 是每实例 sliding window。
- model resolution：config override > server hints > default auxiliary routing。
- LLM 调用通过 `agent.auxiliary_client.call_llm(task="mcp")`。
- 同步 LLM 调用用 `asyncio.to_thread()` offload，避免堵 MCP event loop。
- 支持 text response。
- 支持 tool-use response，返回 `CreateMessageResultWithTools`。
- `max_tool_rounds=0` 可禁用 tool loop。
- 超过 tool loop round limit 会返回 ErrorData。
- response text 会 sanitize。

它还支持把 MCP SamplingMessage 转成 OpenAI-style messages：

- text block → user/assistant content
- image block → data URL
- tool result block → role tool
- tool use block → assistant tool_calls

这让 MCP server 可以把 Hermes 当一个受控 LLM backend 使用。

---

## 26. Shutdown 与 Orphan 清理

`shutdown_mcp_servers()`：

- snapshot active servers。
- 在 MCP loop 上 parallel `server.shutdown()`。
- 每个 server deregister 它注册的工具。
- 清 `_servers`。
- 停止 MCP loop。

stdio subprocess 清理非常细：

- `_run_stdio()` spawn 前后 snapshot child pids。
- 记录 direct child pid。
- POSIX 上记录 pgid。
- 正常 context exit 后，如果 direct child 或 pgroup 仍活着，把 pid 放入 `_orphan_stdio_pids`。
- `_kill_orphaned_mcp_children()` 只清 orphan pid，避免杀掉并发活跃 session。
- final shutdown 时 `include_active=True`，杀所有 tracked active pids。
- 先 SIGTERM，等 2 秒，再 SIGKILL。
- POSIX 上优先 killpg，能杀到 reparented grandchildren。

Cron tick 完成后也会 best-effort sweep MCP orphan sessions/resources，避免后台 job 留下 stdio subprocess。

---

## 27. Status 与 Probe

`get_mcp_status()` 返回 configured MCP servers 的状态：

- `name`
- `transport`
- `tools`
- `connected`
- `disabled`
- `sampling` metrics

它会区分：

- enabled 但未 connected：失败或未连接。
- `enabled: false`：明确 disabled，不应显示成失败。

`probe_mcp_server_tools()` 用于 `hermes tools` 这类配置 UI：

- 临时连接 enabled servers。
- 获取 tool names/descriptions。
- 不注册进 Hermes registry。
- 结束后 shutdown probed servers。
- 最后 stop MCP loop。

---

## 28. 与 Tool System 的关系

MCP 工具最终进入同一个 `tools.registry`。

因此它们享受同一套机制：

- schema 暴露给模型。
- check_fn 控制可用性。
- toolset 控制启用/禁用。
- `model_tools.handle_function_call()` dispatch。
- tool result 进入 transcript。
- approval / security / logging / observability 仍可按普通 tool call 处理。

但 MCP 也有独有边界：

- server 连接是长生命周期。
- handler 是 sync wrapper + async event loop。
- 错误可能来自外部 process / network / OAuth / JSON-RPC。
- tool schema 来自外部 server，必须更谨慎扫描和 normalize。

---

## 29. 工程细节总结

### MCP server 是 prompt 面的一部分

Tool description 会进入模型上下文。外部 server 的 description 不能完全信任，所以 Hermes 做 injection pattern warning。

### capability 必须来自 initialize result

ClientSession 有 method 不代表 server 支持 method。resources/prompts utility tools 必须看 server advertise 的 capabilities。

### stdio server 不应继承完整环境

默认只传安全 env + 用户显式 env。否则当前进程里的各种 API key 会被所有 MCP subprocess 继承。

### stderr 不能直接打到 TTY

长期运行的外部 server 会输出 banner/log。把 stderr 导到 `mcp-stderr.log` 是 TUI/CLI 稳定性必需品。

### 同 server RPC 默认串行

很多 stdio MCP server 不是为并发 JSON-RPC stream 设计的。Hermes 用 `_rpc_lock` 串行化，只有配置 `supports_parallel_tool_calls` 才给 agent 并行调用信号。

### URL 要快速失败

HTTP MCP URL 指到普通网页时，让 SDK 卡 60 秒很差。Hermes 用 URL validation + content-type preflight 提前给明确错误。

### Authorization 不能跨域重定向

HTTP client follow redirects 时，如果 target origin 变了，Authorization header 必须去掉。

### OAuth token 要按绝对过期时间持久化

只存 `expires_in` 会在进程重启后失真。Hermes 存 `expires_at`，读取时转换成剩余时间。

### 外部 token 刷新需要 disk-watch

长跑 gateway 的内存 OAuth provider 不会自动知道另一个进程改了 token 文件。mtime watch + `_initialized=False` 是低成本修复。

### 401 要去重

多个 tool call 同时 401 时，只让一个 recovery 流程跑，其他 await future，避免刷新风暴。

### session expired 不是 auth expired

OAuth token 仍有效时，不要让用户重登；重建 transport session 即可。

### Orphan subprocess 要按 pgroup 清理

stdio wrappers 可能留下 grandchildren。记录 PGID 并 killpg 是比只 kill direct child 更可靠的清理方式。

---

## 30. 简化流程图

MCP discovery：

```text
config.yaml mcp_servers
  ↓ discover_mcp_tools()
_ensure_mcp_loop()
  ↓
MCPServerTask.start()
  ↓
stdio / HTTP / SSE transport
  ↓
session.initialize()
  ↓
session.list_tools()
  ↓
_register_server_tools()
  ↓
tools.registry.register(mcp_<server>_<tool>)
```

MCP tool call：

```text
model emits tool_call: mcp_x_y
  ↓
registry handler
  ↓
_run_on_mcp_loop()
  ↓
server._rpc_lock
  ↓
session.call_tool(y, args)
  ↓
text/image/structuredContent normalization
  ↓
JSON result back to agent
```

MCP OAuth recovery：

```text
tool call gets 401
  ↓
_handle_auth_error_and_retry()
  ↓
MCPOAuthManager.handle_401()
  ↓
disk mtime changed? reload provider
  ↓
or SDK can_refresh_token?
  ↓
server._reconnect_event
  ↓
new MCP ClientSession
  ↓
retry tool once
```

