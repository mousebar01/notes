# Observability and Logging

本文记录 Hermes Agent 的日志、脱敏、日志查询、debug 上传，以及 opt-in observability 插件机制。

这部分的核心问题是：

- 默认情况下，怎么留下足够的本地排障信息。
- 日志里怎么避免泄露 API key、token、私钥、连接串等敏感信息。
- CLI、gateway、dashboard、TUI、desktop 等不同运行面如何分流日志。
- 插件如何基于 hook 采集 LLM call、tool call、approval、subagent 等事件。
- 外部观测系统为什么必须 opt-in，而不是默认上传。

相关入口：

- `hermes_logging.py`
- `agent/redact.py`
- `hermes_cli/logs.py`
- `hermes_cli/debug.py`
- `hermes_cli/main.py`
- `cli.py`
- `gateway/run.py`
- `hermes_cli/web_server.py`
- `hermes_cli/plugins.py`
- `plugins/observability/langfuse/`
- `plugins/observability/nemo_relay/`
- `agent/conversation_loop.py`
- `run_agent.py`

---

## 1. 总体分层

Hermes 的观测体系可以分成三层：

- 本地文件日志：默认启用，写入 profile-aware `~/.hermes/logs/`。
- 日志查看 / debug 工具：`hermes logs`、dashboard `/api/logs`、`hermes debug`。
- 外部 observability 插件：Langfuse、NeMo Relay，必须显式启用，并且依赖额外 SDK / credentials。

这个分层很重要：

- 默认本地日志用于个人排障，不需要联网。
- debug 上传会明确给隐私提示。
- 外部 trace 只有 operator opt-in 后才启用，避免默认把对话和工具输出送到第三方。

---

## 2. 日志文件

集中初始化入口是 `hermes_logging.py::setup_logging()`。

日志目录：

```text
<HERMES_HOME>/logs/
```

常见文件：

- `agent.log`：主日志，默认 INFO+，几乎所有 agent/tool/session 活动都会进来。
- `errors.log`：WARNING+，用于快速 triage。
- `gateway.log`：gateway mode 下创建，只包含 gateway-component records。
- `gui.log`：gui mode 下创建，包含 dashboard、PTY bridge、TUI gateway、uvicorn 相关日志。
- `desktop.log`：Electron desktop 相关日志，`hermes logs` 支持查看。

设计重点：

- `agent.log` 是 catch-all。
- `errors.log` 是快速看问题的窄视图。
- `gateway.log` 和 `gui.log` 是 component-specific 文件，不替代 `agent.log`。
- 所有文件都使用 `RotatingFileHandler`。
- 所有 formatter 都是 `RedactingFormatter`，写盘前做敏感信息脱敏。

---

## 3. 初始化时机

日志初始化非常早。

`hermes_cli/main.py` 在大多数子命令真正执行前会：

1. 尝试读取 `config.yaml` 里的 `security.redact_secrets`。
2. 如果 env 里没有 `HERMES_REDACT_SECRETS`，就把配置桥接到 env。
3. 调用 `setup_logging()`。
4. 根据子命令决定 mode：
   - `dashboard` / `gui` / `desktop` → `mode="gui"`
   - 其他 → `mode="cli"`

`cli.py` 也会早期调用 `setup_logging(mode="cli")`，保证 classic CLI session 在 `AIAgent` 构造前也已经有日志。

`gateway/run.py` 启动时调用：

```python
setup_logging(hermes_home=_hermes_home, mode="gateway")
```

这意味着：

- setup/config/gateway 等子命令的早期失败通常也能进 `agent.log` / `errors.log`。
- gateway 额外有 `gateway.log`，方便平台消息、adapter、delivery、dispatcher 相关排障。
- logging setup 是 idempotent，重复调用不会重复挂同一个文件 handler。

---

## 4. 配置项

`hermes_cli/config.py` 的默认 logging 配置：

```yaml
logging:
  level: INFO
  max_size_mb: 5
  backup_count: 3
```

含义：

- `level` 控制 `agent.log` 最低级别。
- `max_size_mb` 控制主日志轮转大小。
- `backup_count` 控制保留多少轮转文件。

`errors.log` 当前固定为：

- level：WARNING
- size：2 MB
- backups：2

`gateway.log` 当前固定为：

- level：INFO
- size：5 MB
- backups：3

`gui.log` 当前固定为：

- level：INFO
- size：10 MB
- backups：5

---

## 5. Component Filter

`hermes_logging.COMPONENT_PREFIXES` 定义了组件到 logger name prefix 的映射：

- `gateway`：`gateway`、`hermes_plugins`
- `agent`：`agent`、`run_agent`、`model_tools`、`batch_runner`
- `tools`：`tools`
- `cli`：`hermes_cli`、`cli`
- `cron`：`cron`
- `gui`：`hermes_cli.web_server`、`hermes_cli.pty_bridge`、`tui_gateway`、`uvicorn`

用途有两个：

- `gateway.log` / `gui.log` 文件 handler 用 `_ComponentFilter` 做写入分流。
- `hermes logs --component tools` 这类查询用同一份 prefix 表过滤。

这种设计避免了“日志文件分流逻辑”和“日志查询过滤逻辑”各写一套、以后漂移。

---

## 6. Session Tag

`hermes_logging.py` 在 import 时立刻安装 LogRecord factory：

```python
_install_session_record_factory()
```

它会给每条 LogRecord 注入 `session_tag` 字段。

格式：

```text
2026-... INFO [session_id] logger.name: message
```

如果当前 thread 没有 session，则 `session_tag` 是空字符串。

公开 API：

- `set_session_context(session_id)`
- `clear_session_context()`

为什么用 LogRecord factory 而不是 handler filter：

- factory 对进程里所有 record 生效，包括 child logger 和第三方 handler。
- formatter 里可以安全使用 `%(session_tag)s`，不会因为某个 handler 没加 filter 而 KeyError。

这是一个小但很关键的 logging 工程细节。

---

## 7. Rotating Handler 的增强

Hermes 没直接用标准 `RotatingFileHandler`，而是封装了 `_ManagedRotatingFileHandler`。

它做两件事：

第一，managed mode 下修权限。

- NixOS / managed stateDir 可能依赖 setgid group。
- Python `open()` 受 umask 影响，可能创建 `0644` 文件。
- handler 在 `_open()` 和 `doRollover()` 后尝试 `chmod 0660`。

第二，检测外部轮转。

标准 `RotatingFileHandler` 会持有打开的 fd。如果用户用 `logrotate` 或手动 `mv` 外部轮转，进程可能继续写旧 inode，导致大家看的 `gateway.log` 不再增长。

Hermes 的 handler 每次 emit 前会：

- `stat(baseFilename)`
- 对比当前 stream 的 dev/inode
- 如果文件被替换、移动或删除，就重新打开

这相当于把 `WatchedFileHandler` 的 reopen 思路移植到 rotating handler 上。

---

## 8. Verbose Logging

`setup_verbose_logging()` 会增加一个 DEBUG console handler。

特点：

- 只影响 console verbose handler，不改变文件 handler 的脱敏策略。
- 避免重复添加 handler。
- root logger level 降到 DEBUG。
- noisy third-party loggers 仍保持 WARNING。
- `rex-deploy` 保持 INFO，用于 sandbox 状态。

CLI 里还有一个容易混淆的点：

- `-v` / `--verbose` 控制全局 DEBUG logging。
- `/verbose` 类交互命令控制工具结果、thinking block 等 UI 细节。
- `/verbose-logging` 是另一层显式日志开关。

源码注释特别提醒：quiet mode 不应该提高 per-logger level，因为那会导致 `agent.log` / `errors.log` 也失去可见性。console 安静应该由 handler / UI 控制，而不是把 logger 本身关掉。

---

## 9. 脱敏系统

日志 formatter 使用 `agent.redact.RedactingFormatter`。它调用：

```python
redact_sensitive_text(original)
```

默认开启。控制入口：

- `security.redact_secrets: false`
- 或 `HERMES_REDACT_SECRETS=false`

但 `_REDACT_ENABLED` 是模块 import 时 snapshot：

- 默认 true。
- 运行中模型即使生成 `export HERMES_REDACT_SECRETS=false`，也不能关闭当前进程的脱敏。
- CLI / gateway 启动时会尽早把 config 桥接到 env，确保 redactor import 前能读到。

`redact_sensitive_text(..., force=True)` 可绕过全局 opt-out，用于必须强制脱敏的安全边界。

---

## 10. 脱敏规则

`agent/redact.py` 覆盖了多类敏感信息。

已知 token prefix：

- OpenAI / OpenRouter / Anthropic：`sk-...`
- GitHub：`ghp_`、`github_pat_`、`gho_`、`ghu_`、`ghs_`、`ghr_`
- Slack：`xox...`
- Google：`AIza...`
- Perplexity：`pplx-...`
- Fal、Firecrawl、BrowserBase、Stripe、SendGrid、HuggingFace、Replicate、npm、PyPI、DigitalOcean、AgentMail、ElevenLabs、Tavily、Exa、Groq、Matrix、RetainDB、Hindsight、Mem0、ByteRover、xAI 等。

其他模式：

- ENV assignment：`OPENAI_API_KEY=...`
- JSON secret fields：`"apiKey": "..."`
- `Authorization: Bearer ...`
- Telegram bot token
- private key block
- DB connection string password
- JWT
- form-urlencoded body 里的敏感 key
- E.164 phone number

mask 策略：

- 短 token 通常完全变成 `***`。
- 长 token 保留前 6 和后 4 个字符，便于排障时区分是哪把 key。

性能细节：

- 每类 regex 前都有便宜的 substring gate。
- 例如没有 `=` 就不跑 ENV assignment regex。
- 没有 `eyJ` 就不跑 JWT regex。
- 这样普通日志行的扫描成本明显降低。

---

## 11. URL Query 的取舍

源码里有 `_redact_url_query_params()` 和 HTTP request target query redactor，但主 `redact_sensitive_text()` 里明确把 Web URL query redaction 关掉了。

注释里的理由很实际：

- 很多合法 workflow 会把 opaque token 放在 query string。
- 例如 magic-link checkout、OAuth callback、pre-signed share URL。
- 如果按参数名 blanket-redact，agent 可能无法继续完成任务。

当前策略是：

- URL 里的已知 credential shape 仍会被 prefix / JWT / DB connstr 规则抓住。
- form-urlencoded body 仍会对敏感 key redaction。
- Web URL query param 不做泛化按 key 脱敏。

这是“安全”和“agent 可用性”的明显权衡。写工具或平台 adapter 时，如果会把 access log 写入日志，需要意识到 query string 可能不是全量脱敏的。

---

## 12. `hermes logs`

CLI 子命令由 `hermes_cli/main.py::cmd_logs()` 调到 `hermes_cli/logs.py`。

支持：

```bash
hermes logs
hermes logs -f
hermes logs errors
hermes logs gateway -n 100
hermes logs gui -f
hermes logs desktop -f
hermes logs --level WARNING
hermes logs --session abc123
hermes logs --component tools
hermes logs --since 1h
hermes logs --since 30m -f
hermes logs list
```

已知 log name：

- `agent`
- `errors`
- `gateway`
- `gui`
- `desktop`

过滤逻辑：

- `--level`：按 DEBUG / INFO / WARNING / ERROR / CRITICAL 顺序过滤。
- `--session`：按字符串包含过滤，通常匹配 `[session_id]`。
- `--component`：用 `COMPONENT_PREFIXES` 从 logger name 过滤。
- `--since`：支持 `s`、`m`、`h`、`d` 相对时间。

读取 tail 的细节：

- 小于 1 MB 的日志直接读全文件。
- 大文件从末尾按 chunk 逆向读取，避免整个文件入内存。
- 有 filter 时会多读一些原始行，再过滤到目标行数。
- follow 模式用 0.3 秒 polling。

---

## 13. Dashboard Log API

`hermes_cli/web_server.py` 提供 `/api/logs`：

参数：

- `file`
- `lines`
- `level`
- `component`
- `search`

它复用 `hermes_cli.logs._read_tail()` 和 `LOG_FILES`。

细节：

- `file` 必须在 known log files 里。
- 不存在日志文件时返回空 lines，不抛 500。
- `level=ALL` / `component=all` 会被归一化为不过滤。
- `lines` 非 search 时最多 500。
- search 时先读 2000 行再做 case-insensitive substring filter。

Dashboard 因此不是另写一套日志读取，而是复用 CLI logs 的核心 tail 逻辑。

---

## 14. Debug Share

`hermes_cli/debug.py` 负责生成 debug report 和可选 paste 上传。

隐私提示非常明确：

- 会上传系统信息。
- 会上传最近 log lines。
- CLI 版本可能上传 full `agent.log` / `gateway.log` / `desktop.log`，每个最多约 512 KB。
- 日志可能包含 conversation fragments、tool outputs、file paths。
- paste 会 6 小时后自动删除。

Gateway 侧 privacy notice 更保守：

- 从 gateway 上传时只包含 system info + recent log tails。
- 不包含 full logs。
- 如果要 full log upload，需要用户从 CLI 运行 `hermes debug share`。

这体现了一个不错的产品安全边界：远程聊天触发的 debug 分享不默认上传完整日志。

---

## 15. OAuth Trace

`hermes_cli/auth.py` 里有一个专门的 OAuth trace：

```python
HERMES_OAUTH_TRACE=true
```

启用后 `_oauth_trace()` 会写：

```text
oauth_trace {"event": "...", ...}
```

到 logger。

安全细节：

- token 只通过 `_token_fingerprint()` 生成 sha256 前 12 位 fingerprint。
- 不记录原始 token。
- trace 需要显式 env 开启，不是默认噪声。

这类局部 trace 对定位 login / refresh / shared auth store 问题很有用，同时不会把 OAuth secret 直接写日志。

---

## 16. Plugin Hook 观测面

外部 observability 依赖 Hermes plugin hook 系统。

`hermes_cli/plugins.py` 里和观测直接相关的 hooks 包括：

- `on_session_start`
- `on_session_end`
- `on_session_finalize`
- `on_session_reset`
- `pre_llm_call`
- `post_llm_call`
- `pre_api_request`
- `post_api_request`
- `api_request_error`
- `pre_tool_call`
- `post_tool_call`
- `pre_approval_request`
- `post_approval_response`
- `subagent_start`
- `subagent_stop`

每次 `invoke_hook()` 会自动补：

```python
telemetry_schema_version = OBSERVER_SCHEMA_VERSION
```

hook callback 独立 try/except：

- 一个插件异常不会打断 agent loop。
- 异常会写 warning。

`pre_llm_call` 有特殊语义：

- callback 可以返回 context。
- context 会注入 user message。
- 不注入 system prompt。
- 这样可以保留 system prompt cache prefix。

这对观测插件也有影响：同一个 hook 名在不同 Hermes 版本 / 阶段可能表示 turn-level 或 request-level，所以 Langfuse 插件会同时兼容 `pre_api_request` 和旧式 `pre_llm_call`。

---

## 17. API Request Hook 的安全形状

`agent/conversation_loop.py` 在真正调用模型 API 前触发 `pre_api_request`。

重要细节：

- 它会 shallow-copy 外层 messages list，避免插件异步保留引用时看到后续 mutation。
- 旧字段 `request_messages` / `conversation_history` 是 raw passthrough，保留给已有 Langfuse 插件。
- 新消费者更应该读 sanitised view：`request["body"]["messages"]`。

API response hook：

- `post_api_request` 会传模型、provider、base_url、api_mode、duration、finish_reason、usage、assistant content char count、tool call count、response payload 等。
- `api_request_error` 在 API 错误路径触发，带 error type/message、status code、retry count、retryable、reason 等。

`run_agent.py` 里有 `_api_response_payload_for_hook()`、`_usage_summary_for_api_request_hook()` 等 sanitizer / summary 方法。目的不是把原始 SDK response 无脑塞给插件，而是给 observability 一个 JSON-friendly、相对安全、可版本化的事件形状。

---

## 18. Langfuse 插件

目录：

- `plugins/observability/langfuse/__init__.py`
- `plugins/observability/langfuse/plugin.yaml`
- `plugins/observability/langfuse/README.md`

启用方式：

```bash
hermes plugins enable observability/langfuse
```

或通过 tools UI 启用。

必需 env：

- `HERMES_LANGFUSE_PUBLIC_KEY`
- `HERMES_LANGFUSE_SECRET_KEY`

可选 env：

- `HERMES_LANGFUSE_BASE_URL`
- `HERMES_LANGFUSE_ENV`
- `HERMES_LANGFUSE_RELEASE`
- `HERMES_LANGFUSE_SAMPLE_RATE`
- `HERMES_LANGFUSE_MAX_CHARS`
- `HERMES_LANGFUSE_DEBUG`

插件挂的 hooks：

- `pre_api_request`
- `post_api_request`
- `pre_llm_call`
- `post_llm_call`
- `pre_tool_call`
- `post_tool_call`

---

## 19. Langfuse Trace 结构

Langfuse 插件维护：

```python
_TRACE_STATE: Dict[str, TraceState]
```

`TraceState` 里有：

- `trace_id`
- `root_ctx`
- `root_span`
- `generations`
- `tools`
- `pending_tools_by_name`
- `turn_tool_calls`
- `last_updated_at`

trace key：

- 有 `task_id` 用 task id。
- 否则有 `session_id` 用 `session:{session_id}`。
- 否则退到 thread id。

root trace：

- 名称：`Hermes turn`
- type：`chain`
- metadata：source、task_id、platform、provider、model、api_mode。
- `session_id` 会放进 Langfuse trace context，用于 session grouping。

每个 API request 是 generation：

- name：`LLM call {api_call_count}`
- input：最近最多 12 条序列化 messages。
- model / provider / api_mode / base_url 进 metadata。
- output：assistant content、reasoning、tool_calls。
- usage：input/output/cache/reasoning tokens。
- cost：如果 pricing 可解析，按 input/output/cache 等分项估算。

每个 tool call 是 tool observation：

- input：tool args。
- output：tool result。
- metadata：tool name、tool_call_id。

如果 assistant 最终没有 tool call 且有 content，trace 会结束并 flush。若有 tool calls，则会把 tool output 回填到 `turn_tool_calls` 里，最后合并进 root trace output。

---

## 20. Langfuse 数据裁剪

插件不是把所有东西原样上传。

`_safe_value()` 做了几层限制：

- 默认每个字段最多 `HERMES_LANGFUSE_MAX_CHARS`，默认 12000。
- dict 最多前 50 个 key。
- list / tuple / set 最多前 50 个元素。
- depth 超过 4 返回 `<max-depth>`。
- bytes 只记录 type 和长度。
- 支持 JSON string 解析，但仍会递归裁剪。

`read_file` tool result 有特殊 normalization：

- 识别带 `content`、`total_lines`、`file_size`、`is_binary`、`is_image` 的 payload。
- 把 `N|line text` 解析成 line objects。
- 行数多时只保留 head 25 行和 tail 15 行。
- `base64_content` 不上传内容，只记录 omitted 和 length。

这对隐私和成本都重要：文件读取结果可能非常大，甚至包含图片 base64。

---

## 21. Langfuse 凭证保护

Langfuse SDK 可能在构造 client 时不验证 key，等 flush 时才失败。插件做了前置校验：

- public key 必须以 `pk-lf-` 开头。
- secret key 必须以 `sk-lf-` 开头。

如果看起来是 placeholder：

- 只记录一次 warning。
- warning 里只显示安全 preview。
- 设置 `_LANGFUSE_CLIENT = _INIT_FAILED`。
- 后续 hook 快速 return，避免每次重复初始化和刷日志。

这类“先识别 placeholder，避免 silent failure”的体验很实用。

---

## 22. NeMo Relay 插件

目录：

- `plugins/observability/nemo_relay/__init__.py`
- `plugins/observability/nemo_relay/plugin.yaml`
- `plugins/observability/nemo_relay/README.md`

启用方式：

```bash
hermes plugins enable observability/nemo_relay
```

主要 env：

- `HERMES_NEMO_RELAY_PLUGINS_TOML`
- `HERMES_NEMO_RELAY_ATOF_ENABLED`
- `HERMES_NEMO_RELAY_ATOF_OUTPUT_DIRECTORY`
- `HERMES_NEMO_RELAY_ATOF_FILENAME`
- `HERMES_NEMO_RELAY_ATOF_MODE`
- `HERMES_NEMO_RELAY_ATIF_ENABLED`
- `HERMES_NEMO_RELAY_ATIF_OUTPUT_DIRECTORY`
- `HERMES_NEMO_RELAY_ATIF_FILENAME_TEMPLATE`
- `HERMES_NEMO_RELAY_ATIF_SUBAGENT_EXPORT_MODE`
- `HERMES_NEMO_RELAY_ATIF_AGENT_NAME`
- `HERMES_NEMO_RELAY_ATIF_AGENT_VERSION`
- `HERMES_NEMO_RELAY_ATIF_MODEL_NAME`

插件挂的 hooks 比 Langfuse 更广：

- session start/end/finalize/reset
- LLM call
- API request/response/error
- tool call
- approval request/response
- subagent start/stop

---

## 23. NeMo Relay Runtime

NeMo Relay 插件维护一个 `_Runtime`：

- 懒加载 `nemo_relay` SDK。
- 读取 env settings。
- 可从 `plugins.toml` 初始化 relay plugin config。
- 可配置 ATOF exporter。
- 每个 session 维护 `_SessionState`。
- 支持 ATIF per-session export。
- 维护 subagent parent mapping，让 embedded subagent 可以挂在父 scope 下。

Session scope：

- `ensure_session()` 会创建 `hermes-session-{session_id}` 的 Agent scope。
- metadata 包含 session、platform、task、model、provider、turn、child/parent subagent 等。
- `close_session()` 会 pop scope，导出 ATIF，并 deregister subscriber。

LLM / tool spans：

- `on_pre_api_request` 创建 `nemo_relay.llm.call` span。
- `on_post_api_request` 用 `llm.call_end` 结束。
- `on_api_request_error` 用 error payload 结束。
- `on_pre_tool_call` 创建 `nemo_relay.tools.call` span。
- `on_post_tool_call` 用 `tools.call_end` 结束。

Approval 和 subagent：

- approval hooks 只记录事件，不参与决策。
- subagent start 会记录 parent-child metadata，并让 child session scope 可以嵌入父 scope。

所有 hook 都通过 `_safe()` 包裹，失败只写 debug，不影响主流程。

---

## 24. 本地日志 vs 外部 Trace

本地日志和外部 trace 的边界可以这样理解：

- 本地日志默认开启，主要服务排障和审计。
- 外部 trace 默认不开，需要 plugin enable + env。
- 本地日志由 `RedactingFormatter` 做统一字符串级脱敏。
- 外部 trace 插件自己还要做结构裁剪和字段安全处理。
- 本地日志更完整但本地可控；外部 trace 更结构化但隐私风险更高。

工程上不要假设“开了 Langfuse 就不需要 agent.log”。两者解决的问题不同：

- `agent.log` 看启动、配置、异常、hook warning、gateway delivery、工具内部日志。
- Langfuse / NeMo Relay 看 turn、generation、tool observation、usage、cost、session trace。

---

## 25. 排障路径

常见排障顺序：

1. `hermes logs errors`
2. `hermes logs gateway -n 100`
3. `hermes logs --session <id>`
4. `hermes logs --component tools --level INFO`
5. dashboard `/api/logs` 查看最近 web/gateway 日志。
6. 必要时 `hermes debug share`，并确认隐私提示。
7. 如果是 OAuth 问题，临时设置 `HERMES_OAUTH_TRACE=true` 复现。
8. 如果是模型/tool latency 或 cost 问题，再启用 Langfuse / NeMo Relay。

注意：

- 日志可能包含 conversation fragments、file paths、tool outputs。
- 脱敏不是“所有隐私都消失”，它主要针对 secret/token/key。
- 上传 debug paste 前仍然要人工确认。

---

## 26. 值得学习的工程细节

### 日志初始化要足够早

很多系统只在主业务对象构造后才初始化日志，导致启动失败无记录。Hermes 在 `main.py` 很早初始化，所以 setup / config / gateway boot 的错误也能留下。

### 脱敏配置要在 redactor import 前桥接

`agent.redact` 在 import 时 snapshot env。Hermes 先读 config 再 import logging formatter，保证配置能影响当前进程，同时防止运行时被模型生成的 env mutation 关闭。

### Formatter 级脱敏比调用点脱敏更稳

调用点可能漏，但 formatter 是写盘前最后一道统一边界。当然它不是替代结构化字段安全，observability 插件仍要自己裁剪和规避大字段。

### LogRecord factory 解决 formatter 字段一致性

所有 record 都有 `session_tag`，避免某些第三方 logger 触发 formatter KeyError。

### Component prefix 表复用

同一份 `COMPONENT_PREFIXES` 同时服务文件分流和查询过滤，降低漂移。

### 外部 rotation 要考虑 open fd

长进程写日志时，外部 `logrotate` 很常见。Hermes 在 rotating handler 里做 inode 检测，避免继续写旧文件。

### Observability 插件必须 fail-open

Langfuse / NeMo Relay hook 失败不能影响 agent 回答。插件内部大量 try/except 和 `_INIT_FAILED` sentinel 就是为这个目的。

### 大字段要结构化缩略，而不是直接截断整坨

Langfuse 对 `read_file` 的 head/tail normalization 比简单截断更有用：排障时还能看到文件开头和结尾，base64 则只记录长度。

### Approval hook 是 observer，不是决策者

`pre_approval_request` / `post_approval_response` 明确 return ignored。要阻止工具，应使用 `pre_tool_call`，不要让 observability hook 变成隐藏策略引擎。

---

## 27. 简化流程图

本地日志：

```text
main.py / cli.py / gateway.run
  ↓ setup_logging()
root logger handlers
  ↓ RedactingFormatter
agent.log / errors.log / gateway.log / gui.log
  ↓
hermes logs / dashboard /api/logs / debug share
```

Langfuse：

```text
plugin enabled + env ok
  ↓
pre_api_request
  ↓ start root trace + generation
post_api_request
  ↓ end generation with output/usage/cost
pre_tool_call / post_tool_call
  ↓ tool observations
final assistant response
  ↓ finish root trace + flush
```

NeMo Relay：

```text
plugin enabled + nemo_relay import ok
  ↓
on_session_start
  ↓ Agent scope
pre_api_request / post_api_request / error
  ↓ LLM span
pre_tool_call / post_tool_call
  ↓ tool span
approval / subagent hooks
  ↓ events + parent-child metadata
on_session_finalize/reset
  ↓ close scope + optional ATIF export
```

