# Auth / Credentials / Portal / Proxy

本文记录 Hermes 的认证、凭证、Nous Portal、managed tool gateway、本地 proxy 和 credential pool 机制。它们不是单一“登录”功能，而是把模型调用、工具后端、OAuth provider、外部 CLI 凭证、远程 sandbox 文件挂载串起来的一层基础设施。

## 总体分层

主要文件：

- `hermes_cli/auth.py`：核心认证模块，provider registry、`auth.json`、OAuth/API key 登录、runtime credential resolve、logout。
- `agent/credential_pool.py`：同 provider 多凭证池、轮换、失败冷却、DEAD 状态、runtime key 选择。
- `agent/credential_sources.py`：credential source 的统一删除/抑制契约。
- `agent/credential_persistence.py`：持久化前的凭证 payload 清洗。
- `tools/managed_tool_gateway.py`：Nous managed tool gateway token/gateway URL 解析。
- `tools/tool_backend_helpers.py`：managed entitlement、gateway preference、provider 名称标准化等共享逻辑。
- `tools/credential_files.py`：远程 terminal/sandbox 的 credential/cache/skills 文件挂载。
- `tools/mcp_oauth.py`、`tools/mcp_oauth_manager.py`：MCP OAuth 2.1 token 存储、刷新、跨进程 reload。
- `hermes_cli/proxy/*`：本地 OpenAI-compatible proxy，把 OAuth 凭证附加到请求上。
- `hermes_cli/dashboard_auth/*`：Dashboard 自己的浏览器登录/cookie gate，和模型 provider auth 是不同层。

可以把它分成五块：

```text
Provider auth
  -> hermes_cli/auth.py
  -> ~/.hermes/auth.json
  -> resolve_*_runtime_credentials()

Runtime credential pool
  -> agent/credential_pool.py
  -> credential_pool.<provider>
  -> selection / cooldown / dead quarantine

Managed tools
  -> tools/managed_tool_gateway.py
  -> Nous access token + gateway URL
  -> web/browser/image/tts/video/modal backends

OAuth side systems
  -> MCP OAuth tokens under HERMES_HOME/mcp-tokens
  -> Google/Qwen/Codex/xAI/MiniMax/NouS provider-specific stores

Local proxy
  -> hermes proxy start
  -> OpenAI-compatible /v1 forwarding
  -> per-request fresh bearer injection
```

## auth.json

Hermes 的主认证状态保存在：

```text
$HERMES_HOME/auth.json
```

`hermes_cli/auth.py` 中：

- `AUTH_STORE_VERSION = 1`。
- `_auth_file_path()` 返回 profile-aware auth store 路径。
- `_load_auth_store()` 读取 JSON，并兼容旧格式。
- `_save_auth_store()` 写入 `version`、`updated_at`，再保存。
- `_auth_store_lock()` 提供跨进程 advisory lock，并且是 reentrant。

典型结构：

```json
{
  "version": 1,
  "updated_at": "...",
  "active_provider": "nous",
  "providers": {
    "nous": {
      "access_token": "...",
      "refresh_token": "...",
      "inference_base_url": "...",
      "agent_key": "...",
      "expires_at": "..."
    }
  },
  "credential_pool": {
    "nous": [
      {
        "id": "...",
        "label": "...",
        "auth_type": "oauth",
        "source": "device_code",
        "access_token": "...",
        "agent_key": "...",
        "last_status": "ok"
      }
    ]
  },
  "suppressed_sources": {
    "provider": ["source"]
  }
}
```

`providers.<provider>` 是 singleton provider state；`credential_pool.<provider>` 是 runtime 可轮换凭证列表。

## Provider Registry

`hermes_cli/auth.py` 里有 `ProviderConfig` 和 `PROVIDER_REGISTRY`。

内置 provider 包括：

- `nous`
- `openai-codex`
- `openai-api`
- `xai-oauth`
- `qwen-oauth`
- `google-gemini-cli`
- `lmstudio`
- `copilot`
- `gemini`
- `zai`
- `kimi-coding`
- `minimax-oauth`
- `anthropic`
- `deepseek`
- `xai`
- `nvidia`
- `bedrock`
- `azure-foundry`
- 以及很多 OpenAI-compatible/API-key provider。

`PROVIDER_REGISTRY` 还会被 model-provider plugin 扩展：如果插件注册了 API-key provider，auth 模块会把它加进 registry，避免每加一个 provider 都要改核心 auth 代码。

ProviderConfig 通常描述：

- provider 名字。
- 显示名。
- API key env vars。
- base URL。
- OAuth login 类型。
- portal URL。
- extra metadata。

## active_provider

`auth.json.active_provider` 是 Hermes 当前推断/选择 provider 的重要线索。

用途：

- `get_active_provider()` 返回当前 provider。
- `set_active_provider` 类流程会同步 auth store 和 config。
- setup wizard 和 runtime resolver 可以据此判断用户是否已为当前模型 provider 登录。
- `hermes logout` 没指定 provider 时会默认清 active provider。

一个细节：有些登录流程保存了凭证，但最后不一定切换 provider。例如 Nous 登录后如果用户没有选择 Nous 模型，代码会恢复先前 `active_provider`，并提示“凭证已保存，将来可用”。

## Profile 与全局 fallback

Hermes 支持 profile-aware `HERMES_HOME`。这会带来凭证继承问题：profile 自己的 `auth.json` 可能没有凭证，但全局 `~/.hermes/auth.json` 有。

auth 模块做了两个 fallback：

- `_load_provider_state()`：profile 缺 provider state 时，可从 global auth store 读。
- `read_credential_pool()`：profile pool 缺 provider 时，可从 global pool 只读 fallback。

写入仍然写当前 profile。这样 worktree/profile worker 能复用全局登录，又不会把测试/临时 profile 的写操作污染全局。

## Credential Pool

`agent/credential_pool.py` 负责同 provider 多凭证。

核心类型是 `PooledCredential`，字段包括：

- `provider`
- `id`
- `label`
- `auth_type`: `oauth` 或 `api_key`
- `priority`
- `source`
- `access_token`
- `refresh_token`
- `base_url`
- `expires_at`
- `agent_key`
- `inference_base_url`
- `last_status`
- `last_error_code`
- `last_error_reason`
- `last_error_reset_at`
- `request_count`

选择策略：

- `fill_first`
- `round_robin`
- `random`
- `least_used`

状态：

- `ok`
- `exhausted`
- `dead`

`exhausted` 用于暂时不可用，比如 rate limit、quota、短暂 auth 失败。不同错误有不同 TTL：

- 401：默认 5 分钟。
- 429：默认 1 小时。
- 其他：默认 1 小时。
- provider 返回 reset timestamp 时优先使用。

`dead` 用于永久失效，例如：

- `token_invalidated`
- `token_revoked`
- `invalid_token`
- `invalid_grant`
- `unauthorized_client`
- `refresh_token_reused`

Manual dead credential 会在 24 小时 quiet window 后 prune；singleton-seeded entry 不 prune，因为下一次 seed 会用同一组坏 token 重建它。它们会保留 DEAD，直到显式 re-auth 写入新 token。

## Nous runtime credential

Nous provider 有两种 token 概念：

- OAuth access/refresh token：用于 Portal 身份和刷新。
- inference invoke JWT / `agent_key`：真正调用 inference API 的 bearer。

`resolve_nous_runtime_credentials()` 会：

- 读取 `providers.nous`。
- 检查/刷新 OAuth token。
- 检查/刷新 inference credential。
- 校验 inference base URL。
- 持久化刷新后的状态。
- 同步 credential pool。

`PooledCredential.runtime_api_key` 对 `provider == "nous"` 有特殊逻辑：优先返回可用的 `agent_key`，而不是普通 `access_token`。这是因为 runtime API call 需要 NAS invoke JWT。

有终端刷新错误时，代码会 quarantine OAuth state 和 pool entries，避免所有后续进程继续拿死 token 重试。

## Shared Nous Store

Nous 还有一个 shared store：

```text
${HERMES_SHARED_AUTH_DIR}/nous_auth.json
```

默认位于 Hermes root 下的 `shared/nous_auth.json`。

作用：

- 跨 profile 共享 Nous OAuth 状态。
- 登录时如果发现共享凭证，可以询问是否导入。
- refresh 后 best-effort 写回 shared store。

但注释里也强调：per-profile `auth.json` 仍是 source of truth，shared store 是 convenience layer。

## Managed Tool Gateway

`tools/managed_tool_gateway.py` 处理 Nous 托管工具 gateway。

关键函数：

- `peek_nous_access_token()`：便宜读取，不刷新 token。
- `read_nous_access_token()`：必要时通过 `resolve_nous_access_token()` 刷新。
- `build_vendor_gateway_url(vendor)`：生成 vendor gateway origin。
- `resolve_managed_tool_gateway(vendor)`：返回 `ManagedToolGatewayConfig`。
- `is_managed_tool_gateway_ready(vendor)`：只做便宜 readiness 检查。

默认 gateway URL：

```text
https://<vendor>-gateway.nousresearch.com
```

可通过环境变量覆盖：

- `TOOL_GATEWAY_DOMAIN`
- `TOOL_GATEWAY_SCHEME`
- `<VENDOR>_GATEWAY_URL`
- `TOOL_GATEWAY_USER_TOKEN`

`peek_nous_access_token()` 和 `read_nous_access_token()` 分开是个重要设计：

- 工具列表、provider `is_available()`、banner/status 刷新不能触发同步 OAuth 网络刷新。
- 真正要发 gateway 请求时才允许 refresh-aware 读取。

## Tool backend helpers

`tools/tool_backend_helpers.py` 提供一些共享选择逻辑。

`managed_nous_tools_enabled()`：

- 查询 Nous Portal account info。
- 只有 logged in 且 `tool_gateway_entitled` 时返回 true。
- 所有异常都 fail closed，避免启动被 Portal 网络问题卡死。

`prefers_gateway(config_section)`：

- 读取 `<section>.use_gateway`。
- 用于 image_gen、tts、browser、web 等工具决定是否偏好 managed path。

`nous_tool_gateway_unavailable_message()`：

- 根据账号 entitlement 状态生成用户提示。
- fallback 提示用户运行 `hermes model` 刷新 Portal 登录/计费状态。

## API key / OAuth / external process provider

auth 模块支持多种 provider 形态：

- 静态 API key：从 `.env`、环境变量或 auth pool 解析。
- OAuth provider：例如 Nous、xAI OAuth、OpenAI Codex、MiniMax OAuth。
- 外部 CLI provider：例如 Qwen CLI、Google Gemini CLI、GitHub Copilot。
- Local endpoint provider：LM Studio、Ollama Cloud 等。
- AWS/Azure 这类 SDK credential chain provider。

解析函数通常叫：

```text
resolve_<provider>_runtime_credentials()
```

它们返回统一 runtime dict，大致包括：

```text
{
  "provider": "...",
  "api_key": "...",
  "base_url": "...",
  "source": "...",
  "expires_at": "..."
}
```

有些 provider 返回 `api_key` callable。例如 MiniMax OAuth 的 access token 很短，`resolve_minimax_oauth_runtime_credentials(as_token_provider=True)` 可返回一个每次调用都重新读取/刷新 token 的 provider function。

## Credential source 删除与 suppression

Hermes 的凭证可能来自很多地方：

- `env:<VAR>`：环境变量或 `~/.hermes/.env`。
- `claude_code`：`~/.claude/.credentials.json`。
- `hermes_pkce`：Hermes 自己的 Anthropic OAuth 文件。
- `device_code`：`auth.json providers.<provider>`。
- `qwen-cli`：Qwen CLI 凭证文件。
- `gh_cli`：GitHub CLI token。
- `config:<name>`：custom provider config。
- `model_config`：`model.api_key`。
- `manual`：用户 `hermes auth add` 手动添加。

`agent/credential_sources.py` 统一了 removal contract。删除一个 pool entry 时，每个 source 的 `RemovalStep` 做三件事：

1. 清理外部状态，例如 `.env` 行、auth.json provider block、OAuth 文件。
2. 在 `auth.json.suppressed_sources` 中 suppress `(provider, source)`。
3. 返回 cleaned/hints 给用户。

为什么要 suppression？因为很多 pool entry 会在 `load_pool()` 时从外部源重新 seed。如果只删 pool entry，不删外部源或不 suppress，下次加载会“凭证复活”。

典型策略：

- `.env` source：尽量清 `.env`，如果 shell 环境仍有变量则提示用户去 shell/systemd/launchd 里删。
- Claude Code source：不删除 Claude Code 自己的文件，只 suppress。
- Hermes-owned OAuth file：可以删除。
- `providers.<provider>`：删除对应 auth store block。
- manual：通常不需要外部 cleanup。

## Credential files for remote sandboxes

远程 terminal 后端如 Docker、Modal、SSH 没有主机文件。`tools/credential_files.py` 负责把必要文件挂载或同步进去。

来源：

- skill frontmatter 的 `required_credential_files`。
- `terminal.credential_files` config。
- skills 目录。
- host-side cache 目录：uploads、browser screenshots、TTS audio、processed images。

安全设计：

- credential file path 必须相对 `HERMES_HOME`。
- 拒绝绝对路径。
- resolve symlink/`..` 后必须仍在 `HERMES_HOME` 内。
- skills 目录如果包含 symlink，会创建 sanitized copy，避免 bind mount 泄露任意主机文件。
- cache directories 通常 read-only mount。
- 已注册文件用 `ContextVar` 存储，防 gateway 多 session 串数据。

这是一个很重要的边界：skill 可以声明需要某些凭证文件，但不能借此挂载 `~/.ssh/id_rsa`。

## MCP OAuth

MCP OAuth 代码分两层：

- `tools/mcp_oauth.py`：OAuth 2.1 + PKCE 流程、token/client/meta 文件持久化、本地 redirect callback。
- `tools/mcp_oauth_manager.py`：围绕 MCP SDK auth provider 做管理增强。

Token 文件位置：

```text
$HERMES_HOME/mcp-tokens/<server>.json
$HERMES_HOME/mcp-tokens/<server>.client.json
$HERMES_HOME/mcp-tokens/<server>.meta.json
```

设计细节：

- token 文件写入使用临时文件 + chmod，避免 create/chmod 间隙泄露给其他本地用户。
- 保存 `expires_at`，避免 SDK 冷启动后只看 `expires_in` 导致过期 token 被当成有效。
- 保存 OAuth server metadata，尤其 token endpoint。否则某些 provider 的 refresh 会错误猜成 `{server_url}/token`。
- headless/SSH 环境会打印授权 URL 和手工 paste fallback。
- 非交互环境没有 cached token 时直接报错，让用户先交互登录。

`mcp_oauth_manager.py` 增强点：

- 跨进程 token reload：看 token 文件 mtime，如果外部进程刷新了，当前进程下次 auth flow 会重新初始化。
- thundering herd 401 去重：多个并发请求遇到同一个失败 access token 时，只做一次 recovery。
- cold-load 时预取 OAuth metadata，确保 refresh 走正确 endpoint。
- refresh 失败可 clear cached provider 和 disk token。

## Local Proxy

`hermes proxy` 是一个本地 OpenAI-compatible forward proxy。

入口：

- `hermes_cli/proxy/cli.py`
- `hermes_cli/proxy/server.py`
- `hermes_cli/proxy/adapters/base.py`
- `hermes_cli/proxy/adapters/nous_portal.py`
- `hermes_cli/proxy/adapters/xai.py`

默认监听：

```text
http://127.0.0.1:8645/v1
```

它的作用不是改写模型请求，而是：

- 客户端随便传一个 bearer。
- proxy 丢弃客户端 Authorization。
- 每次请求通过 adapter 获取新鲜 upstream credential。
- 转发到 upstream base URL。
- 原样 streaming response，保留 SSE。

`server.py` 明确不 mediates/logs/transforms request/response body。它是 credential-attaching forwarder。

## Proxy adapter contract

`UpstreamAdapter` 定义：

- `name`
- `display_name`
- `allowed_paths`
- `is_authenticated()`
- `get_credential()`
- `get_retry_credential()`
- `describe()`

`UpstreamCredential` 包含：

- `bearer`
- `base_url`
- `token_type`
- `expires_at`

`server.py` 只转发 adapter 声明允许的路径。Nous adapter 允许：

- `/chat/completions`
- `/completions`
- `/embeddings`
- `/models`

这样可以避免 stray client 把奇怪路径转发到上游。

如果上游返回 401 或 429，proxy 会调用 `adapter.get_retry_credential()` 尝试换一组凭证。Nous adapter 对 401 会 force-refresh invoke JWT 后重试一次。

## Dashboard Auth 与模型 Auth 的区别

Dashboard auth 位于 `hermes_cli/dashboard_auth/*`。

它解决的是“谁能访问 Dashboard 页面/API”，不是“agent 调模型用什么凭证”。

Dashboard gated 模式：

- OAuth/cookie session。
- access token + refresh token cookie。
- WebSocket ticket。
- auth providers 插件，例如 `plugins/dashboard_auth/nous`、`basic`、`self_hosted`。

模型/tool auth：

- `auth.json`。
- provider runtime credentials。
- credential pool。
- managed gateway token。

这两层可能都用 Nous，但不要混为一谈：Dashboard Nous login 是浏览器管理台登录；模型 Nous login 是 inference/tool gateway runtime credential。

## Secret 与日志安全

几个值得关注的安全点：

- `.env` 只放 API key/token/password，非 secret 配置放 `config.yaml`。
- 日志系统和 debug sharing 有 secret redaction。
- credential pool `to_dict()` 会调用 `sanitize_borrowed_credential_payload()`。
- `auth remove` 对 shell-exported env var 只提示，不擅自改用户 shell profile。
- tool gateway readiness 默认用 peek，不刷新，避免状态页/工具页造成 token 副作用。
- OAuth token refresh 要持锁，避免多进程同时写坏 auth store。
- terminal refresh failure 会 quarantine dead credentials，避免无限重试和污染池选择。

## 值得学习的工程点

- `auth.json` 用跨进程 reentrant lock，适配 CLI、gateway、cron、Dashboard 多进程同时读写。
- `providers.<provider>` 和 `credential_pool.<provider>` 分离，既保留 singleton 状态，又支持 runtime failover。
- Profile 读 fallback 到全局，但写入当前 profile，兼顾复用和隔离。
- Availability probe 和 real credential resolve 分离，避免 UI 刷新触发 OAuth 网络副作用。
- Credential removal 不只是 delete，还要 cleanup external source + suppress reseed。
- MCP OAuth 保存 metadata 和 expires_at，修补 SDK 默认行为在真实 provider 上的坑。
- Local proxy 只附加凭证不改请求体，降低“代理层变业务层”的复杂度。
- Adapter allowed_paths 白名单让 proxy 不成为任意 upstream request relay。
- Remote sandbox credential file mount 用 ContextVar 和路径 containment，防止跨 session 泄露和路径穿越。

## 阅读源码建议

建议按这个顺序读：

1. `hermes_cli/auth.py` 的 `ProviderConfig`、`PROVIDER_REGISTRY`、auth store 函数。
2. `agent/credential_pool.py` 的 `PooledCredential`、状态、选择策略、seed/mark failure。
3. `agent/credential_sources.py`：理解删除为什么需要 suppression。
4. `tools/managed_tool_gateway.py`：理解 peek vs refresh-aware token read。
5. `tools/tool_backend_helpers.py`：理解 managed entitlement 和 gateway preference。
6. `tools/credential_files.py`：理解 remote sandbox 文件挂载边界。
7. `tools/mcp_oauth.py` 和 `tools/mcp_oauth_manager.py`：理解 MCP OAuth token 生命周期。
8. `hermes_cli/proxy/server.py` 和 `hermes_cli/proxy/adapters/base.py`：理解本地 proxy 的最小转发模型。
9. `hermes_cli/dashboard_auth/middleware.py`：对比 Dashboard auth 和 model/tool auth。
