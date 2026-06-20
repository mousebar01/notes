# Security and Approval

本文整理 Hermes 的安全审批、危险命令检测、secret 脱敏、工具循环 guardrail。

核心源码：

- `tools/approval.py`：危险命令检测、审批状态、gateway 阻塞队列、smart approval。
- `tools/terminal_tool.py`：terminal 执行前调用审批系统，sudo 处理，输出截断/脱敏。
- `agent/redact.py`：日志和工具输出 secret redaction。
- `agent/tool_guardrails.py`：工具调用循环 guardrail。
- `agent/tool_executor.py`：工具执行前插件 block、guardrail block、checkpoint。
- `agent/agent_runtime_helpers.py`：并发工具路径和 agent-level tools 的统一 invoke helper。
- `run_agent.py`：session JSON snapshot redaction、guardrail halt 的 turn-level 收束。
- `tui_gateway/server.py` / `gateway/run.py`：审批请求路由到 TUI/gateway 用户界面。

如果只看整体设计：Hermes 的安全不是一个单点拦截器，而是多层安全门：

1. 执行前：hardline 永久阻断、sudo stdin 防护、dangerous pattern、tirith 扫描、execute_code 整体审批。
2. 执行中：CLI/gateway 同步或阻塞式审批、session/permanent allowlist、YOLO/off bypass 的边界控制。
3. 执行后：工具输出截断、ANSI 清理、secret redaction、工具循环 warning/halt、文件修改失败兜底。

## 审批系统入口

`tools/approval.py` 文件头注释写得很直白：它是 dangerous command system 的 single source of truth。

它负责：

- Pattern detection：`DANGEROUS_PATTERNS`、`detect_dangerous_command()`。
- Per-session approval state：线程安全，按 `session_key` 隔离。
- Approval prompting：CLI 交互 + gateway async。
- Smart approval：用 auxiliary LLM 自动批准低风险命令。
- Permanent allowlist persistence：写入 `config.yaml` 的 `command_allowlist`。

terminal 工具侧通过 `tools/terminal_tool.py::_check_all_guards()` 调用：

```python
from tools.approval import check_all_command_guards as _check_all_guards_impl

def _check_all_guards(command: str, env_type: str) -> dict:
    return _check_all_guards_impl(command, env_type,
                                  approval_callback=_get_approval_callback())
```

实际执行 terminal 命令前，先通过这个 guard 返回：

```python
{"approved": True, "message": None}
```

或：

```python
{"approved": False, "message": "BLOCKED: ..."}
```

## 配置项

默认配置在 `hermes_cli/config.py`：

```yaml
approvals:
  mode: manual
  timeout: 60
  cron_mode: deny
  mcp_reload_confirm: true
  destructive_slash_confirm: true

command_allowlist: []

security:
  allow_private_urls: false
  redact_secrets: true
  tirith_enabled: true
  tirith_path: tirith
  tirith_timeout: 5
  tirith_fail_open: true

tool_loop_guardrails:
  warnings_enabled: true
  hard_stop_enabled: false
  warn_after:
    exact_failure: 2
    same_tool_failure: 3
    idempotent_no_progress: 2
  hard_stop_after:
    exact_failure: 5
    same_tool_failure: 8
    idempotent_no_progress: 5
```

`approvals.mode` 有三种：

- `manual`：默认，危险命令询问用户。
- `smart`：先用 auxiliary LLM 判断低风险命令，无法确定再询问用户。
- `off`：跳过普通审批，类似 yolo。

`approvals.cron_mode` 控制 cron 无人值守场景：

- `deny`：默认，cron 里危险命令被挡住。
- `approve`：信任该 cron profile，自动批准危险命令。

`command_allowlist` 是永久允许的危险模式，用户选择 `always` 后会写入这里。

## 环境开关为什么要冻结

`tools/approval.py` 模块导入时读取：

```python
_YOLO_MODE_FROZEN = is_truthy_value(os.getenv("HERMES_YOLO_MODE", ""))
```

`agent/redact.py` 模块导入时读取：

```python
_REDACT_ENABLED = os.getenv("HERMES_REDACT_SECRETS", "true").lower() in ...
```

这两个都是 import-time snapshot，不是每次调用都读 `os.environ`。

工程原因很重要：

- 如果每次都读 env，模型或插件可以运行 `export HERMES_YOLO_MODE=1`，立刻绕过审批。
- 如果每次都读 env，模型可以运行 `export HERMES_REDACT_SECRETS=false`，让后续日志/工具输出泄漏 secret。

所以 Hermes 允许用户在启动前配置这些开关，但不允许运行中的工具调用动态改掉安全策略。

`hermes_cli/main.py` 会在 logging/redact 导入前，把 `security.redact_secrets` 桥接到
`HERMES_REDACT_SECRETS`。注释明确说：如果桥接晚了，`agent.redact` 已经 snapshot 过，
config toggle 就不会生效。

gateway 也有类似桥接：启动时读取 config，将 `security.redact_secrets` 写入 env。

## Session Key 与并发隔离

审批状态不是简单用全局变量保存“当前 session”。`tools/approval.py` 使用
`contextvars.ContextVar`：

```python
_approval_session_key = contextvars.ContextVar(...)
_approval_turn_id = contextvars.ContextVar(...)
_approval_tool_call_id = contextvars.ContextVar(...)
```

`get_current_session_key()` 的解析顺序：

1. approval-specific contextvars。
2. gateway `session_context` contextvars。
3. `os.environ` fallback。

这样 gateway 并发运行多个 agent turn 时，不会因为进程级 env 互相串 session。

这点是多平台 agent 很关键的细节：CLI 单线程时 env fallback 够用；gateway/TUI 并发时必须用
context-local 状态。

## Hardline Blocklist

`HARDLINE_PATTERNS` 是“永远不能由 agent 执行”的底线，先于 YOLO、`approvals.mode=off`、
cron approve 执行。

源码注释说得很清楚：YOLO 是用户信任 agent 处理文件和服务，不是信任它擦盘或关机。

hardline 覆盖非常小，故意只放无恢复路径的命令：

- `rm` 删除根目录或系统目录。
- `mkfs` 格式化文件系统。
- `dd of=/dev/sd...` 或重定向到 raw block device。
- fork bomb。
- `kill -1`。
- shutdown/reboot/halt/poweroff。
- `systemctl poweroff/reboot`。

命中后返回：

```python
{
  "approved": False,
  "hardline": True,
  "message": "BLOCKED (hardline): ..."
}
```

这个层级不能被任何普通 bypass 绕过。

## Sudo Stdin Guard

另一个无条件防护是 sudo stdin guard：

```python
_SUDO_STDIN_RE = re.compile(r'...sudo\s+-S\b')
```

如果没有配置 `SUDO_PASSWORD`，但命令显式使用 `sudo -S`，Hermes 会阻断：

```python
"BLOCKED: sudo password guessing via stdin (sudo -S)."
```

原因是模型可能尝试把猜测的密码 pipe 给 sudo，然后根据 “Sorry, try again” 迭代猜密码。

注意它也先于 YOLO/off 执行。这说明 Hermes 把“用户批准高风险操作”和“防止模型暴力猜密码”
视为两个不同安全层级。

## 普通 Dangerous Patterns

`DANGEROUS_PATTERNS` 是可审批的危险命令模式。

覆盖的类别包括：

- 递归删除：`rm -r`、`rm --recursive`。
- 宽权限：`chmod 777`、`chmod --recursive ... 777`。
- root chown：`chown -R root`。
- SQL destructive：`DROP TABLE`、无 WHERE 的 `DELETE FROM`、`TRUNCATE`。
- 写系统配置：`/etc/`、macOS `/private/etc/`。
- 写敏感文件：`~/.ssh`、`~/.hermes/.env`、`~/.hermes/config.yaml`、shell rc、`.netrc` 等。
- 写项目 `.env` 和 `config.yaml`。
- `systemctl stop/restart/disable/mask`。
- `curl|sh`、process substitution 执行远程脚本。
- `xargs rm`、`find -exec rm`、`find -delete`。
- Hermes gateway stop/restart/update。
- Docker container lifecycle：restart/stop/kill/down。
- 自杀式 kill hermes/gateway。
- `sed -i` / `perl -i` / `ruby -i` 编辑 Hermes config/env。
- heredoc 执行 Python/Perl/Ruby/Node。
- `git reset --hard`、force push、`git clean -f`、`git branch -D`。
- sudo privilege flags。

检测前会先 normalize：

```python
_normalize_command_for_detection(command)
```

它会：

- strip ANSI escape sequences。
- 去掉 null bytes。
- Unicode NFKC normalize，防止 fullwidth 等混淆字符绕过正则。

## Sensitive Path 设计

`tools/approval.py` 里有几个路径正则很值得看：

- `_HERMES_ENV_PATH`
- `_HERMES_CONFIG_PATH`
- `_PROJECT_ENV_PATH`
- `_PROJECT_CONFIG_PATH`
- `_SHELL_RC_FILES`
- `_CREDENTIAL_FILES`
- `_SYSTEM_CONFIG_PATH`

特别是 `~/.hermes/config.yaml` 被当作安全敏感文件，因为 approvals、YOLO、allowlist 都在这里。
源码注释说：config cache 是 mtime-keyed，所以如果 agent 能写 config，它可能立刻把
`approvals.mode` 改成 `off` 并绕过 gate。

因此 Hermes 不只拦 `write_file/patch` 写敏感路径，还在 terminal 侧覆盖：

- `tee`
- `>`
- `>>`
- `cp`
- `mv`
- `install`
- `sed -i`
- `perl -i`
- `ruby -i`

这避免了“文件工具被拦住，但 shell 重定向能绕过”的半截安全。

## 审批状态

审批状态由几个线程安全结构维护：

```python
_pending: dict[str, dict] = {}
_session_approved: dict[str, set] = {}
_session_yolo: set[str] = set()
_permanent_approved: set = set()
```

含义：

- `_pending`：老式 pending approval。
- `_session_approved`：某个 session 内批准过的 pattern。
- `_session_yolo`：某个 session 开启 YOLO。
- `_permanent_approved`：永久 allowlist，从 config 加载或写回 config。

`is_approved(session_key, pattern_key)` 会同时检查 permanent 和 session。

它还处理 legacy key alias：旧版本可能把 regex-derived key 写进 allowlist，新版本用更可读的
description string 做 canonical key，所以 `_approval_key_aliases()` 保证旧配置不失效。

## CLI 审批

CLI 交互审批使用：

```python
prompt_dangerous_approval(command, description, ...)
```

用户可以选：

- once：本次执行。
- session：本 session 同类 pattern 通过。
- always：写入永久 allowlist。
- deny：拒绝。

有一个很重要的 fail-closed 逻辑：如果当前 prompt_toolkit 已经接管终端，但没有注册
approval callback，Hermes 不会 fallback 到 `input()`，而是直接 deny。

原因是 `input()` 读不到 prompt_toolkit 管理的按键，会产生用户看不见的 60 秒死锁。

所以交互式 CLI 必须通过 `tools.terminal_tool.set_approval_callback()` 注册正确的 callback。

## Gateway/TUI 阻塞式审批

gateway 审批不是把 `approval_required` 返回给模型让模型等待，而是 agent 线程阻塞。

核心结构：

```python
class _ApprovalEntry:
    event = threading.Event()
    data = approval_data
    result = None

_gateway_queues: dict[str, list] = {}
_gateway_notify_cbs: dict[str, object] = {}
```

流程：

1. gateway/TUI 为 session 注册 notify callback：`register_gateway_notify(session_key, cb)`。
2. terminal guard 命中危险命令。
3. `_await_gateway_decision()` 创建 `_ApprovalEntry` 并放入 `_gateway_queues[session_key]`。
4. 触发 `pre_approval_request` plugin hook。
5. 调用 notify callback，把请求发给用户界面。
6. agent 线程用 `entry.event.wait()` 阻塞等待。
7. 用户在 TUI/gateway 里点击或调用 `/approve` / `/deny`。
8. `approval.respond` 调用 `resolve_gateway_approval(session_key, choice)`。
9. event 被 set，agent 线程继续。
10. 触发 `post_approval_response` hook。

`tui_gateway/server.py` 里：

```python
@method("approval.respond")
def _(rid, params):
    resolve_gateway_approval(
        session["session_key"],
        params.get("choice", "deny"),
        resolve_all=params.get("all", False),
    )
```

`resolve_all=True` 支持 `/approve all`，会 FIFO 队列里所有 pending approval 一次性 resolve。

## Silence Is Not Consent

gateway 阻塞等待有 timeout，默认 `gateway_timeout` 是 300 秒。

如果用户超时不响应，Hermes 返回明确 BLOCKED：

```text
Command timed out without user response. The user has NOT consented...
Silence is not consent.
```

并且提示模型：

- 不要 retry。
- 不要 rephrase。
- 不要尝试用不同命令达成同一效果。
- 停止当前 workflow，等用户响应。

这个措辞是安全设计的一部分：防止模型把“没批准”理解成“换个方式试试”。

## Smart Approval

当 `approvals.mode: smart` 时，Hermes 会调用 auxiliary LLM：

```python
_smart_approve(command, description)
```

prompt 要求安全 reviewer 只返回：

- `APPROVE`
- `DENY`
- `ESCALATE`

行为：

- APPROVE：本 session auto-approve 对应 warning pattern。
- DENY：阻断并告诉模型不要重试。
- ESCALATE：继续走人工审批。

这层用来减少 false positive，比如某些 `python -c "print('hello')"` 因为 `-c` 被 pattern 捕捉，
但实际风险很低。

## Tirith Security Scan

`check_all_command_guards()` 会同时收集：

- tirith 扫描结果。
- dangerous command regex 结果。

tirith 的 `block` 和 `warn` 都不是直接硬阻断，而是进入统一审批流。这样用户能看到 rich findings，
决定是否批准。

如果同时有 tirith 和 regex warning，Hermes 会合并成一个审批请求，避免用户批准了一个检查却绕过
另一个检查。

有 tirith warning 时，CLI 会隐藏 `[a]lways` 永久批准选项：

```python
allow_permanent=not has_tirith
```

因为内容级安全 findings 不适合永久 broad allowlist。

## Execute Code Guard

`execute_code` 是特殊风险，因为它运行任意 Python，代码内部可以：

- `subprocess`
- `os.system`
- 文件 API
- `ctypes`

这些不一定经过 terminal 的 shell string approval。

所以 `check_execute_code_guard(code, env_type)` 在 gateway/ask 上下文会对整个 script 做一次
one-shot approval。

例外：

- Docker/singularity/modal/daytona/vercel_sandbox 等隔离 backend 直接允许。
- CLI interactive 不做 whole-script prompt，因为 execute_code 内部 terminal 调用仍会走每次审批。
- local non-interactive 非 gateway 是一个文档化的 trusted-by-config 限制。
- cron 默认 deny，除非 `approvals.cron_mode: approve`。

`execute_code` 的 session/always approval 会用 pattern key `"execute_code"` 保存。

## YOLO 的边界

Hermes 有两种 YOLO：

- CLI `--yolo`：启动前设置 env，被 `_YOLO_MODE_FROZEN` 捕获，是 process-scoped。
- `/yolo`：调用 `enable_session_yolo(session_key)`，是 session-scoped。

CLI 里 `_toggle_yolo()` 注释明确说：不会修改 `HERMES_YOLO_MODE`，因为该 env 已在 module import
时冻结；运行时修改是 silent no-op。正确做法是改 `_session_yolo`。

YOLO/off 能绕过普通审批，但不能绕过：

- hardline blocklist。
- sudo stdin guard。

## Sudo Password 处理

`tools/terminal_tool.py::_transform_sudo_command()` 会把真实 sudo 调用改成：

```bash
sudo -S -p ''
```

并通过 stdin 提供密码。

密码来源：

- 如果配置了 `SUDO_PASSWORD`，从 env 读取。
- 如果没配置但有缓存，用缓存。
- local backend 如果 `sudo -n true` 类似 NOPASSWD 可用，则不强制走 password prompt。
- interactive 模式下可以提示用户输入 sudo password，并缓存本 session。
- 非 interactive 没密码则命令保持原样，让 sudo 自己失败。

这和前面的 sudo stdin guard 不冲突：guard 阻止模型自己写 `sudo -S` 猜密码；Hermes 自己在已配置/
已输入密码的情况下生成 `sudo -S` 是受控路径。

## Plugin Pre-Tool Block

工具执行前还有插件 hook block 层。

在 `agent.tool_executor` 和 `agent.agent_runtime_helpers.invoke_tool()` 中都会调用：

```python
get_pre_tool_call_block_message(function_name, function_args, ...)
```

如果插件返回 block message，Hermes 不执行工具，而是返回：

```python
{"error": block_message}
```

并发路径和顺序路径都要处理这个 hook，避免某一种执行方式绕过插件策略。

post hook 会通过 `_emit_post_tool_call_hook()` 发出，包含：

- `function_name`
- `function_args`
- `result`
- `task_id`
- `session_id`
- `tool_call_id`
- `turn_id`
- `api_request_id`
- `status`
- `error_type`
- `duration_ms`

这让外部审计/观测插件能看到工具被执行、被 block、失败或被 guardrail 拦截。

## Tool Loop Guardrails

`agent/tool_guardrails.py` 是纯状态控制器，不直接执行副作用。

它跟踪：

- 相同 tool + 相同 args 连续失败。
- 同一 tool 连续失败。
- idempotent/read-only tool 返回相同结果但模型重复调用。

默认配置：

- warnings enabled。
- hard stop disabled。
- 完全相同失败 2 次警告。
- 同 tool 失败 3 次警告。
- read-only no-progress 2 次警告。

hard stop 是 opt-in，避免交互式 session 过早中断。

`ToolCallSignature` 会对 canonical args 做 SHA-256：

```python
args_hash = sha256(canonical_tool_args(args))
```

metadata 里只暴露 hash，不暴露原始参数，避免 guardrail 诊断泄漏敏感参数。

执行前：

```python
decision = agent._tool_guardrails.before_call(function_name, function_args)
```

执行后：

```python
decision = agent._tool_guardrails.after_call(...)
```

warning 会追加到 tool result，halt/block 会在 agent loop 里转成 controlled halt response。

## 工具执行前 Checkpoint

`agent/tool_executor.py` 里有一个顺序很重要：

1. 先判断工具是否被 scope/plugin/guardrail block。
2. 如果不会执行，跳过 checkpoint。
3. 如果会执行，才为 `write_file` / `patch` 或 destructive terminal 创建 checkpoint。

源码注释写着：必须先知道工具是否会执行，再触碰 checkpoint state。

这避免了被 block 的工具调用制造多余 checkpoint，也避免 checkpoint 去重状态被无效调用污染。

## Terminal 输出安全

terminal 命令执行后，`tools/terminal_tool.py` 对输出做几步处理：

1. 如果输出过长，按 `tool_output.max_bytes` 截断，保留 40% head 和 60% tail。
2. `strip_ansi()` 去掉 ANSI escape sequences，防止模型把终端控制字符复制进文件。
3. `redact_sensitive_text(output.strip())` 对输出做 secret redaction。
4. 解释一些非零但非错误的 exit code，比如 grep=1、diff=1。
5. 返回 JSON：

```json
{
  "output": "...",
  "exit_code": 0,
  "error": null
}
```

也就是说模型看到的 terminal output 已经过脱敏和格式清理。

## Secret Redaction

`agent/redact.py` 是 regex-based redaction。它用于：

- logs。
- verbose output。
- gateway logs。
- terminal output。
- session JSON snapshot。

默认开启：

```python
security.redact_secrets: true
```

用户可在启动前关闭，但安全边界可以传 `force=True`，无视全局关闭。

匹配类别包括：

- 已知 API key 前缀：`sk-`、GitHub PAT、Slack、Google、AWS、Stripe、SendGrid、HF、
  npm、PyPI、xAI、mem0、byterover 等。
- env assignment：`OPENAI_API_KEY=...`、`TOKEN=...`、`SECRET=...`。
- JSON fields：`"apiKey": "..."`、`"token": "..."`。
- Authorization Bearer header。
- Telegram bot token。
- private key block。
- DB connection string password。
- JWT。
- form-urlencoded body 中敏感 key。
- E.164 phone numbers。

mask 规则：

- 短 token 全遮。
- 长 token 保留前若干和后若干字符，便于 debug。

`redact_sensitive_text()` 有 cheap substring gates，比如没有 `=` 就不跑 env assignment regex，
没有 `eyJ` 就不跑 JWT regex，降低日志热路径开销。

## URL Query Redaction 的取舍

源码里有 `_redact_url_query_params()`、`_redact_url_userinfo()` 等函数，但主流程里有一段注释：
Web URL query redaction intentionally off。

原因是很多合法 workflow 需要 opaque query token：

- magic-link checkout。
- OAuth callback。
- pre-signed share URL。
- agent 需要访问的临时 URL。

如果按参数名一刀切 redaction，会破坏这些流程。

因此 Hermes 当前仍会捕捉 URL 内符合已知 credential shape 的 token 或 JWT，但不会默认把所有
`?token=...` 形式都改掉。

这是一个实用取舍：安全和工具可用性之间不是越 aggressive 越好。

## Session JSON Snapshot Redaction

`run_agent.py::_save_session_log()` 保存 JSON snapshot 时，会对每条 message content 做
defence-in-depth redaction：

```python
if "content" in msg:
    msg["content"] = self._redact_message_content(msg.get("content"))
```

`_redact_message_content()` 同时支持：

- string content。
- multimodal list-of-parts。

它只 redacts 文本字段：

- `part["text"]`
- `part["content"]`

图片/二进制 part 不动。

session JSON 的 `system_prompt` 也会：

```python
"system_prompt": redact_sensitive_text(self._cached_system_prompt or "")
```

这防止 API key、PAT、Bearer token 从用户粘贴、工具输出或 assistant response 中漏进本地
session 文件。

## TUI/Gateway 文本强制脱敏

`tui_gateway/server.py` 有 `_redact_tui_verbose_text()`：

```python
redact_sensitive_text(str(text), force=True)
```

这里用 `force=True`，说明某些发往 UI 的 verbose 文本属于硬安全边界，即使用户全局关闭
redaction，也不应原样送到前端。

gateway 也会在日志/输出路径调用 `redact_sensitive_text()`。

## Secret Capture

TUI gateway 支持 secret prompt：

```python
@method("secret.respond")
def _(rid, params):
    return _respond(rid, params, "value")
```

`tools.skills_tool.set_secret_capture_callback()` 会让技能 setup 需要 secret 时走 TUI 的
`secret.request` 流程，而不是让模型明文看到用户输入。

这和 redaction 是两个层次：

- secret capture 尽量避免 secret 进入模型上下文。
- redaction 是 secret 已经进入文本时的兜底。

## Gateway Prompt Pending 清理

`tui_gateway/server.py::_clear_pending(sid)` 会释放 pending prompt。

细节：传入 sid 时只清理该 session 的 pending prompt，不能把其他 session 的 clarify/sudo/secret
prompt 一起取消。

这个点说明 gateway 是多 session 进程，任何 prompt/approval 状态都必须 session-scoped。

## 审批 Hook

approval 系统会触发两个 plugin hook：

- `pre_approval_request`
- `post_approval_response`

`_fire_approval_hook()` 会自动补：

- `turn_id`
- `tool_call_id`

hook 失败只记录 debug，不影响审批主流程。注释说得很明确：approval flow 是 safety-critical，
plugin observability 不是。

这也是安全系统常见原则：审计可以失败，但不能让审计失败导致安全门打开或主流程崩溃。

## 非交互与 Cron 行为

`check_all_command_guards()` 对环境做区分：

- docker/singularity/modal/daytona：跳过审批，因为隔离 backend 不能触碰 host。
- CLI/gateway/ask：执行完整审批流。
- cron：按 `approvals.cron_mode`。
- 非交互非 gateway 非 cron：保持旧行为，普通危险命令 auto-approved，但会记录 warning。

这最后一点是兼容性取舍。Hermes 并没有在所有 headless 场景 fail closed，否则很多自动化路径会
突然不可用。但 cron 被单独处理，因为它是明确无人值守任务。

## 安全设计上值得学习的点

第一，安全开关 import-time freeze。运行中模型不能通过 env mutation 关掉 redaction 或打开全局 yolo。

第二，hardline 和 approvable danger 分层。不是所有危险操作都能被用户批准，灾难性操作永远 block。

第三，session-scoped approval。gateway 并发时用 contextvars 和 session queue，避免跨用户串审批。

第四，silence is not consent。timeout 被视为拒绝，而且明确告诉模型不要换壳重试。

第五，terminal/file 两侧都要覆盖敏感写入。只拦文件工具是不够的，shell redirect/tee/sed/cp/mv
都要纳入。

第六，execute_code 需要整体审批。因为代码内部可以绕过 terminal string guard。

第七，安全结果也要喂给模型。BLOCKED message 写得非常具体，是为了约束模型下一步行为。

第八，redaction 是多出口兜底。terminal output、logs、session JSON、TUI verbose 都需要独立处理。

第九，工具循环 guardrail 不靠 prompt 劝说，而是在 runtime 里观察重复失败和 no-progress。

第十，插件可观测但不支配安全主流程。hook 异常不会打开安全门，也不会阻塞核心审批。

