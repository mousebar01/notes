# File and Terminal Execution

本文整理 Hermes 的文件工具、终端工具、执行环境后端、checkpoint 与跨 agent 文件状态协调。

核心源码：

- `tools/terminal_tool.py`：terminal 工具入口、审批调用、环境创建、前后台命令、sudo、输出处理。
- `tools/environments/base.py`：所有 terminal 后端的统一抽象。
- `tools/environments/local.py`：本地执行后端，环境变量过滤和本地 shell 执行。
- `tools/environments/docker.py`、`ssh.py`、`modal.py`、`daytona.py`、`singularity.py`：非本地后端。
- `tools/file_tools.py`：`read_file`、`write_file`、`patch`、`search_files` 工具入口。
- `tools/file_operations.py`：跨 terminal 后端的 shell-based 文件操作实现。
- `tools/file_state.py`：跨 agent/subagent 的文件读写状态协调。
- `tools/checkpoint_manager.py`：透明 checkpoint 与 rollback 基础设施。
- `tools/path_security.py`：通用 path traversal / containment 校验。
- `agent/tool_executor.py`：工具执行前的 checkpoint preflight。

## 总体分层

Hermes 把“模型调用工具”拆成几层：

1. `agent.conversation_loop` 校验模型 tool call。
2. `agent.tool_executor` 判断是否能并行、是否被插件/guardrail block、是否要 checkpoint。
3. `model_tools.handle_function_call()` 或 agent-level dispatch 找到具体工具。
4. `tools/terminal_tool.py` / `tools/file_tools.py` 执行实际操作。
5. terminal/file 工具内部再做路径、安全、输出、staleness、redaction、lint 等细节。

这层次很重要：安全审批不是只有 terminal 做，文件工具也有自己的写入防线；checkpoint 也不在工具内部，
而是在 executor 知道工具“确实会执行”后才触发。

## Terminal Tool 支持的后端

`tools/terminal_tool.py` 文件头列出支持环境：

- `local`：直接在宿主机执行，默认最快。
- `docker`：Docker container。
- `modal`：Modal cloud sandbox，包括 direct Modal 和 managed gateway。
- `ssh`：远程 SSH。
- `singularity`：Singularity sandbox。
- `daytona`：Daytona sandbox。

环境类型来自配置/env，由 `_get_env_config()` 读取，常见配置包括：

- `TERMINAL_ENV`
- `TERMINAL_CWD`
- `TERMINAL_TIMEOUT`
- backend image / cpu / memory / disk / persistence 等。

每个 task_id 对应一个 active environment：

```python
_active_environments: Dict[str, Any] = {}
```

默认情况下，subagent 的 task_id 会折叠回 `"default"`，这样顶层 agent 和 delegate_task 子 agent 共享同一个
container。只有注册了 env override 的 task 才会拥有隔离 sandbox。

## 环境创建锁

terminal 工具创建环境时使用两层锁：

- `_env_lock`：保护 `_active_environments`。
- `_creation_locks[task_id]`：同一个 task_id 只允许一个线程创建 sandbox。

流程：

1. 先在 `_active_environments` 查找已有 env。
2. 没有则拿 per-task creation lock。
3. 拿锁后 double-check，避免等待期间别的线程已经创建成功。
4. 创建 env。
5. 写回 `_active_environments`。

这个细节对 Modal/Docker 很重要：并发工具调用如果同时创建 sandbox，会浪费资源，还可能造成同一 turn
里不同工具在不同容器里运行。

## BaseEnvironment 的统一模型

`tools/environments/base.py` 文件头概括了设计：

```text
Unified spawn-per-call model: every command spawns a fresh bash -c process.
A session snapshot is captured once at init and re-sourced before each command.
CWD persists via in-band stdout markers or temp file.
```

也就是说 Hermes 不是维持一个长驻 interactive shell，而是每条命令都新起：

```bash
bash -c "<wrapped command>"
```

但为了让 `cd`、export、alias 等状态跨命令保留，它在初始化时创建 session snapshot：

- `export -p`
- shell functions
- aliases
- `shopt -s expand_aliases`
- `set +e`
- `set +u`
- 当前 cwd

后续每条命令先 `source snapshot`，执行后再写回 env snapshot 和 cwd marker。

这个模型的好处：

- 每次命令进程边界清晰。
- 超时/中断更容易 kill。
- local/docker/ssh/modal/daytona/singularity 可以共享同一个 execute flow。
- 不依赖某个真实 PTY shell 长期健康。

代价是：需要额外机制维护 cwd/env 状态。

## CWD 追踪

BaseEnvironment 在命令 wrapper 里追加：

```bash
pwd -P > <cwd_file>
printf '\n__HERMES_CWD_<session>__%s__HERMES_CWD_<session>__\n' "$(pwd -P)"
```

远程后端从 stdout marker 解析 cwd，本地后端可以读 temp file。

`terminal_tool._resolve_command_cwd()` 优先级：

1. 显式 `workdir`。
2. env 的 live `env.cwd`。
3. 默认配置 cwd。

源码注释提到历史 bug：以前每次 terminal 调用都重新传 init-time cwd，导致前一条命令 `cd` 后，
下一条命令又被强行拉回旧 cwd。现在优先用 live cwd 修复这一点。

## Workdir 注入防护

`terminal_tool._validate_workdir()` 用 allowlist 校验 `workdir`：

```python
_WORKDIR_SAFE_RE = re.compile(r'^[A-Za-z0-9/\\:_\-.~ +@=,]+$')
```

不允许 shell metacharacters。原因是 `workdir` 不是命令内容，不应该能通过 `;`、`$()` 等注入 shell。

如果 `workdir` 含非法字符，terminal 直接返回 blocked。

## Terminal 执行前审批

terminal 执行前调用：

```python
approval = _check_all_guards(command, env_type)
```

也就是 `tools.approval.check_all_command_guards()`，合并：

- hardline block。
- sudo stdin guard。
- dangerous command regex。
- tirith scan。
- smart/manual/gateway approval。

`force=True` 会跳过普通 dangerous check，但这个参数注释说是 internal only，不暴露给模型 schema。

审批通过后，结果里可能带：

- `approval`: 用户批准说明。
- `approval`: smart approval 自动批准说明。

审批失败返回：

```json
{
  "output": "",
  "exit_code": -1,
  "error": "...",
  "status": "blocked"
}
```

## Foreground Guardrails

terminal 对前台命令有几个防呆设计。

第一，前台 timeout 有硬上限：

```python
FOREGROUND_MAX_TIMEOUT = env TERMINAL_MAX_FOREGROUND_TIMEOUT or 600
```

如果模型给 foreground command 设置超过上限的 timeout，会被要求改用 background。

第二，检测长驻服务/ watcher：

- `npm run dev`
- `docker compose up`
- `next dev`
- `vite`
- `nodemon`
- `uvicorn`
- `gunicorn`
- `python -m http.server`

如果这些命令在 foreground 执行，Hermes 返回错误，建议使用 `background=true`，再单独做 health check/test。

第三，检测 shell-level background hack：

- `nohup`
- `disown`
- `setsid`
- `&`

Hermes 不希望模型在 foreground 里自己用 `&` 后台化，因为那样进程生命周期和输出无法被 Hermes 追踪。
正确做法是用 `terminal(background=true)`。

## Background Process

`background=True` 时，terminal 不直接 `env.execute()`，而是走 `tools.process_registry`：

- local：`process_registry.spawn_local(...)`
- 非 local：`process_registry.spawn_via_env(...)`

返回：

```json
{
  "output": "Background process started",
  "session_id": "...",
  "pid": ...,
  "exit_code": 0,
  "error": null
}
```

后台进程可以配：

- `notify_on_complete=True`
- `watch_patterns=[...]`

这两个互斥。如果都设置，Hermes 丢弃 `watch_patterns`，保留 `notify_on_complete`。

源码里有非常具体的 UX 防呆：如果 `background=True` 但没有 `notify_on_complete` 和 `watch_patterns`，
返回 hint，提醒模型这个进程会静默运行。对于 test/build/deploy/CI poller 这类有明确结束的任务，
应使用 `notify_on_complete=True`。

## Watch Pattern 限流

`watch_patterns` 只适合长驻进程的一次性信号，例如：

- server ready。
- migration done。

schema 描述里强调不要用于：

- end-of-run markers。
- 循环里的 `ERROR` / `Traceback`。
- batch job。

因为 watch pattern 有 rate limit：每进程每 15 秒最多 1 次通知，连续 3 个窗口被 drop 后会禁用
watch_patterns 并自动转为 notify-on-complete 行为。

这是为了防止 gateway/聊天平台被后台日志刷屏。

## PTY 特例

terminal 支持 `pty=True`，但某些命令不能用 PTY。

例如：

```bash
gh auth login --with-token
```

它期待 stdin pipe 和 EOF。如果用 PTY，`process.submit()` 只发换行，命令会挂住。

`_command_requires_pipe_stdin()` 会检测这类命令，自动禁用 PTY，并返回 `pty_note`。

## Sudo 处理

sudo 逻辑在 `terminal_tool._transform_sudo_command()` 和 `BaseEnvironment._prepare_command()`。

如果命令有真实 sudo 调用，Hermes 可能改写为：

```bash
sudo -S -p ''
```

密码来源：

- `SUDO_PASSWORD` env。
- 当前 session/callback/thread scope 的 sudo password cache。
- interactive prompt。
- local NOPASSWD sudo 可用时，不强制改写。

sudo password cache 不是全局裸 dict，而是 scoped：

- gateway session key。
- callback owner。
- callback id。
- thread id。

这样长驻进程里多个 ACP/CLI session 不会互相复用 sudo password。

如果 gateway 上 sudo 失败，输出会追加提示：

```text
Tip: To enable sudo over messaging, add SUDO_PASSWORD to ~/.hermes/.env
```

## Interrupt 和 Timeout

`BaseEnvironment._wait_for_process()` 用 poll loop 等待进程，期间：

- drain stdout。
- 检查 interrupt。
- 检查 timeout。
- 每 10 秒 touch activity，避免 gateway watchdog 误杀。
- interrupt/timeout 时 kill process。

本地后端会使用 process group kill，避免 Python 退出时留下孤儿进程。

stdout drain 也有一个很细的设计：不用 `for line in proc.stdout`，而是 select/os.read。
原因是如果用户命令自己后台化 grandchild，grandchild 会继承 stdout pipe，bash 退出但 pipe 不 EOF，
传统 readline 会一直卡住。

Hermes 的做法是 bash 退出且 pipe 空闲几轮后停止 drain，避免被 orphaned pipe 拖死。

## Terminal 输出处理

foreground 命令完成后，输出处理顺序：

1. `_handle_sudo_failure()` 添加 sudo 提示。
2. 插件 hook `transform_terminal_output` 有机会转换完整输出。
3. 按 `tool_output.max_bytes` 截断，保留 40% head 和 60% tail。
4. `strip_ansi()` 去掉 ANSI escape sequences。
5. `redact_sensitive_text()` 脱敏。
6. `_interpret_exit_code()` 给常见非错误 exit code 加解释。
7. 返回 JSON。

`_interpret_exit_code()` 覆盖：

- grep/rg/ag/ack exit 1：无匹配，不是错误。
- diff exit 1：文件不同，不是错误。
- find exit 1：部分目录不可访问，结果可能仍有效。
- test/[ exit 1：条件为 false。
- curl 常见错误码。
- git exit 1：常见于 diff 有变化。

这能减少模型看到 exit_code=1 后误以为失败而浪费回合。

## Local Environment 的 Env Sanitization

本地后端 `tools/environments/local.py` 会过滤 Hermes-managed secrets。

`_build_provider_env_blocklist()` 从多个来源构造 blocklist：

- provider registry 的 API key env vars。
- `OPTIONAL_ENV_VARS` 里 category 为 tool/messaging 的 secret。
- 常见 provider key：OpenAI、OpenRouter、Anthropic、Google、DeepSeek、Mistral 等。
- gateway credentials。
- Modal/Daytona key。

但它故意不屏蔽通用 AWS credential chain：

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `AWS_PROFILE`

源码注释解释：local terminal 是用户信任的 operator shell，用户期望 agent 能运行 aws/terraform/cdk/boto3。
只屏蔽 Bedrock inference 的 `AWS_BEARER_TOKEN_BEDROCK` 这种 Hermes inference secret。

技能 required env 可以通过 `tools.env_passthrough` 显式放行。

## File Tools 总览

`tools/file_tools.py` 注册四个工具：

- `read_file`
- `write_file`
- `patch`
- `search_files`

这些工具都属于 `file` toolset。

`read_file` schema 明确要求模型不要用 terminal 的 `cat/head/tail`。
`write_file` schema 要求不要用 `echo/cat heredoc`。
`patch` schema 要求不要用 `sed/awk`。
`search_files` schema 要求不要用 `grep/rg/find/ls`。

这不是单纯风格建议：file tools 有路径解析、安全、分页、dedup、staleness、lint、redaction 等能力，
比 shell 命令更可控。

## 文件路径解析

`file_tools._resolve_base_dir()` 的优先级：

1. 当前 task 的 live terminal cwd。
2. `$TERMINAL_CWD`。
3. Python process cwd。

如果 base 是相对路径，会立刻锚定到 process cwd 并 resolve。

这个设计修复了一个很常见的问题：terminal 已经 cd 到某个 worktree，但 Python 进程 cwd 仍在主 checkout。
如果 file tool 直接按 process cwd resolve 相对路径，就会改错仓库。

现在 file tools 会尽量使用 task live cwd，与 terminal 所在目录一致。

## Worktree CWD Divergence Warning

如果模型给的是相对路径，但解析结果在 live terminal cwd 外，`_path_resolution_warning()` 会返回 warning：

```text
Relative path 'x' resolved to '...', which is OUTSIDE the active workspace...
```

write/patch 仍可能继续，但结果里会显示绝对 `resolved_path`，让模型和用户看到实际写到哪里。

## Read File 防线

`read_file_tool()` 的防线包括：

第一，分页标准化：

```python
normalize_read_pagination(offset, limit)
```

第二，设备文件阻断：

- `/dev/zero`
- `/dev/random`
- `/dev/urandom`
- `/dev/stdin`
- `/dev/tty`
- `/dev/console`
- `/proc/*/fd/0-2`
- `/proc/*/environ`
- `/proc/*/cmdline`
- `/proc/*/maps`

这些要么会阻塞/无限输出，要么可能泄漏 host 进程 secret。

第三，二进制扩展阻断：

```python
has_binary_extension(path)
```

图片建议用 `vision_analyze`。

第四，Hermes internal read guard：

```python
get_read_block_error(resolved)
```

防止读取 credential store、hub metadata 等可能造成 prompt injection 或 secret leak 的内部路径。

第五，字符数上限：

默认 `_DEFAULT_MAX_READ_CHARS = 100_000`，可配置 `file_read_max_chars`。

超过则拒绝，并提示用 offset/limit 读取更小范围。

第六，redaction：

```python
redact_sensitive_text(result.content, code_file=True)
```

这里 `code_file=True` 会跳过一些容易误伤代码的 ENV/JSON field redaction，但仍会处理 key prefix、
private key、JWT、DB connstring 等更明确的 secret。

## Read Dedup 和重复读取阻断

每个 task 有 `_read_tracker`，记录：

- 最近一次 read/search key。
- 连续重复次数。
- read history。
- dedup cache：`(resolved_path, offset, limit) -> mtime`。
- dedup hits。
- read timestamps。

如果相同文件区域已读过且 mtime 没变，第二次会返回轻量 stub：

```json
{
  "status": "unchanged",
  "dedup": true,
  "content_returned": false
}
```

如果模型继续重复读相同 region，多次后会 hard block：

```text
BLOCKED: You have called read_file on this exact region ...
STOP calling read_file ...
```

上下文压缩后会调用 `reset_file_dedup()`，因为原始 read 内容可能已经被 summarise 掉；这时再返回
“你前面读过”就会指向不存在的上下文。

## Search Files 防循环

`search_files` 也有连续重复检测，key 包括：

- pattern
- target
- path
- file_glob
- limit
- offset

连续 3 次加 warning，连续 4 次 hard block。

如果结果 truncated，会追加明确 hint：

```text
Use offset=<next> to see more, or narrow with a more specific pattern or file_glob.
```

## Write File 防线

`write_file_tool()` 首先检查敏感路径：

```python
_check_sensitive_path(path, task_id)
```

硬拒绝写：

- `/etc/`
- `/boot/`
- `/usr/lib/systemd/`
- macOS `/private/etc/`、`/private/var/`
- `/var/run/docker.sock`
- `/run/docker.sock`
- Hermes config file。

Hermes config 被特别保护，因为 approvals/security 等配置都在这里；模型如果能写它，就可能关闭审批。

第二，cross-profile soft guard：

```python
_check_cross_profile_path(path, task_id)
```

默认阻止写另一个 Hermes profile 的：

- skills
- plugins
- cron
- memories

也阻止写 sandbox mirror 中看似是 `~/.hermes/...` 但其实不是 authoritative profile state 的路径。

模型可在用户明确要求后传：

```json
{"cross_profile": true}
```

这个是 soft guard，不是安全边界，因为 terminal 仍以同一 OS user 执行。

第三，拒绝把内部 `read_file` status stub 当成文件内容写入。

第四，per-path lock：

```python
with file_state.lock_path(resolved):
    ...
```

同一进程内相同文件的 read-modify-write 会串行化，不同文件可并行。

第五，staleness warning：

- sibling subagent 写过该文件。
- 外部 mtime 变化。
- 当前 agent 只读过 partial view。
- 当前 agent 从未读过文件。

第六，写后更新 timestamp、清 dedup，并记录 `file_state.note_write()`。

## Patch Tool 防线

`patch_tool()` 支持两种模式：

- `replace`：`path + old_string + new_string`。
- `patch`：V4A multi-file patch。

V4A patch header 里的路径来自 patch 内容本身，攻击面更大，所以如果 header 包含 `..` traversal，直接拒绝：

```text
V4A patch header contains '..' traversal...
```

patch 对所有目标路径做：

- sensitive path check。
- cross-profile guard。
- sorted per-path locks。
- stale warning。

sorted lock 顺序用于避免 multi-file patch 与并发 patch 之间死锁。

replace mode 使用 fuzzy matching：

```python
fuzzy_find_and_replace(...)
```

如果 old_string 找不到，会提示 read_file/search_files 验证当前内容。
同一路径连续失败 3 次后，提示升级：

- 停止换 old_string 盲试。
- 重新 read_file。
- 用更长上下文。
- 必要时用 write_file 替换整个文件。

## File Operations 跨后端实现

`tools/file_operations.py` 的核心洞察：

```text
all file operations can be expressed as shell commands,
so we wrap the terminal backend's execute() interface
```

`ShellFileOperations` 让 read/write/patch/search 都能跑在：

- local
- docker
- ssh
- singularity
- modal
- daytona

也就是说 file tools 不一定直接读宿主机文件；它们通过当前 task 的 terminal env 执行 shell 操作，
从而和 terminal 后端一致。

## 换行符和 BOM 保留

`file_operations.py` 有专门逻辑处理：

- `_detect_line_ending()`
- `_normalize_line_endings()`
- `_strip_bom()`
- `_has_bom()`

目的：

- read_file 不让模型看到 UTF-8 BOM 幻影字符。
- write_file/patch 保留原文件 CRLF/LF 风格。
- 如果原文件有 BOM，写回时保留。

这对 Windows 项目非常重要。否则 agent 一次 patch 可能把整个文件换行符规范化，制造巨大 diff。

## Lint 和 LSP 诊断

文件写入/patch 后会做诊断。

shell linter 表：

- `.py`: `python -m py_compile`
- `.js`: `node --check`
- `.ts`: `npx tsc --noEmit`
- `.go`: `go vet`
- `.rs`: `rustfmt --check`

但 `.ts`、`.go`、`.rs` 在 LSP 可用时会跳过 shell linter，因为单文件 shell linter 容易产生大量假阳性：

- `tsc FILE.ts` 不读 tsconfig。
- `go vet FILE.go` 在 module 外常失败。
- `rustfmt` 是格式检查，不是类型检查。

LSP 诊断单独放在 `lsp_diagnostics` 字段，不混进 `lint`。

## Cross-Agent File State

`tools/file_state.py` 是 process-wide registry，解决并发 subagent 文件冲突。

它记录：

- 每个 task 读过哪些文件、mtime、read timestamp、是否 partial。
- 每个 path 最近由哪个 task 写过。
- 每个 path 的 lock。

三个主要 hook：

- `record_read(task_id, path, partial=...)`
- `check_stale(task_id, path)`
- `note_write(task_id, path)`

它补的是另一个层面的漏洞：即使主 agent 同一批 tool calls 做了 path overlap 检测，delegate_task 子 agent
之间仍可能并发写同一文件。FileStateRegistry 能在 A 读后、B 写后、A 再写前发出 stale warning。

可用 env 关闭：

```bash
HERMES_DISABLE_FILE_STATE_GUARD=1
```

## Checkpoint Manager

`tools/checkpoint_manager.py` 文件头说明：这是透明 filesystem snapshots，不是 LLM 工具，模型看不到。

触发点：

- `write_file`
- `patch`
- destructive terminal command

由 `agent.tool_executor` 在工具真正执行前调用：

```python
agent._checkpoint_mgr.ensure_checkpoint(work_dir, f"before {function_name}")
```

如果工具被 plugin/guardrail/scope block，则不会 checkpoint。

## Checkpoint 存储结构

checkpoint 存在：

```text
~/.hermes/checkpoints/
  store/
    HEAD, config, objects/
    refs/hermes/<hash16>
    indexes/<hash16>
    projects/<hash16>.json
    info/exclude
  .last_prune
  legacy-<timestamp>/
```

它不是在每个项目目录建 shadow repo，也不会碰用户项目的 `.git`。

v2 设计使用单个共享 git object store：

- 每个 working directory 一个 ref。
- 每个 working directory 一个 index。
- git objects 跨项目/工作树共享。

源码解释原因：旧设计每个目录一个 shadow repo，相同 worktree 的 blob 重复存储，多个 worktree 会烧很多空间。
单 store 依赖 git content-addressable objects 去重。

## Checkpoint Dedup

`CheckpointManager.new_turn()` 会清空 `_checkpointed_dirs`。

`ensure_checkpoint()` 每个 turn 每个目录最多 snapshot 一次：

```python
if abs_dir in self._checkpointed_dirs:
    return False
```

这样一个 turn 内连续 patch 同一项目，不会每个文件都创建 checkpoint。

它还跳过：

- disabled。
- git 不存在。
- `/`。
- home directory。
- 文件数超过 `_MAX_FILES = 50_000` 的目录。

## Checkpoint Commit 机制

创建 checkpoint 时：

1. 初始化 store。
2. touch project metadata。
3. 用 per-project index 执行 `git add -A`。
4. 删除超过 `max_file_size_mb` 的 staged 文件。
5. 对比当前 ref tip，没有变化则跳过。
6. `git write-tree`。
7. `git commit-tree`。
8. `git update-ref refs/hermes/<hash>`。
9. prune old commits。
10. enforce global size cap。

使用 `GIT_DIR` + `GIT_WORK_TREE` + `GIT_INDEX_FILE`，所以不会在用户项目里写 git 状态。

## Checkpoint Excludes

默认 exclude 包括：

- `node_modules/`
- `dist/`
- `build/`
- `target/`
- `.next/`
- caches
- virtualenv
- `.git/`
- media/archive/binary
- `.env`
- `.env.*`
- logs

这避免 checkpoint 把依赖、构建产物、secret 和大文件吞进去。

另外单文件超过 `max_file_size_mb` 也会从 index 移除。

## Rollback

CheckpointManager 支持：

- `list_checkpoints(working_dir)`
- `diff(working_dir, commit_hash)`
- `restore(working_dir, commit_hash, file_path=None)`

restore 前会先创建 pre-rollback snapshot：

```python
self._take(abs_dir, f"pre-rollback snapshot ...")
```

这让用户可以“撤销 rollback”。

`restore(file_path=...)` 要求 file path 是相对路径，并且 resolve 后仍在 working_dir 内，防止 git checkout
把文件写到工作目录外。

## Checkpoint Pruning

有两类 pruning：

第一，每个项目保留 `max_snapshots`，超过后重写 ref，只保留最近 N 个 commits，并 `git gc --prune=now`。

第二，全局 size cap：如果 store 超过 `max_total_size_mb`，跨所有 project round-robin 删除最老 checkpoint，
但每个 project 至少保留一个 snapshot。

还有 auto-maintenance：

- 删除 working dir 不存在的 orphan。
- 删除超过 retention_days 的 stale refs。
- `git gc` 回收空间。

## Agent Executor 与 Checkpoint 的关系

`agent.tool_executor` 里的顺序是：

1. tool_search scope block。
2. plugin pre_tool_call block。
3. tool guardrail before_call block。
4. 如果没被 block，才 checkpoint。
5. 执行真实工具。

这很细：checkpoint 是为真实变更做准备，不应该因为一个被 block 的工具调用污染 checkpoint dedup 状态。

terminal checkpoint 的 working dir 取：

```python
function_args.get("workdir") or os.getenv("TERMINAL_CWD", os.getcwd())
```

file checkpoint 的 working dir 通过：

```python
agent._checkpoint_mgr.get_working_dir_for_path(file_path)
```

它会向上找项目 marker：

- `.git`
- `pyproject.toml`
- `package.json`
- `Cargo.toml`
- `go.mod`
- `Makefile`
- `pom.xml`
- `.hg`
- `Gemfile`

## 工程上值得学习的设计点

第一，terminal 使用 spawn-per-call + session snapshot，而不是脆弱的长驻 shell。

第二，terminal 后端统一抽象，把 interrupt、timeout、activity heartbeat、cwd tracking 下沉到 base class。

第三，file tools 和 terminal cwd 对齐，避免 process cwd 与 agent 实际工作目录不一致。

第四，文件工具比 shell 编辑多很多 runtime 防线：设备文件阻断、binary guard、read dedup、staleness、
cross-profile guard、path lock、lint/LSP。

第五，跨 agent 文件状态是单独模块，不和单 task read tracker 混在一起；这让“重复读防循环”和“并发写防覆盖”
成为两个独立关注点。

第六，checkpoint 是透明基础设施，不暴露给模型。模型只负责改文件，系统负责提供 rollback。

第七，checkpoint 不碰项目 `.git`，使用 shadow git store + per-project ref/index，兼顾安全和空间去重。

第八，后台进程必须由 process registry 管理，不能让模型用 `nohup`、`setsid`、`&` 自己逃逸。

第九，输出进入模型前要截断、去 ANSI、脱敏，并解释常见非错误 exit code。

第十，安全门按层分布：approval 管 shell 命令，file tools 管路径和 staleness，executor 管 checkpoint 和工具级 block。

