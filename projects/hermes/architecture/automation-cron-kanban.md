# Background Automation: Cron and Kanban

本文记录 Hermes Agent 里两套“后台自动化”机制：

- `cron/`：定时运行脚本或 agent prompt，把结果保存并投递给用户。
- `kanban/`：SQLite 任务板 + gateway 内嵌 dispatcher + profile worker，用于多代理协作、任务拆解、重试、回收和人工接管。

这两套机制的共同点是：它们都让 agent 在没有实时用户输入的情况下运行。因此源码里大量工程细节都围绕几个问题展开：

- 如何防止后台任务重复执行或互相踩状态。
- 如何把 prompt、skill、工作目录、profile、会话状态隔离清楚。
- 如何发现 worker 卡死、崩溃、退出但没汇报结果。
- 如何把模型输出重新落回结构化事实，而不是只相信自然语言。

相关入口：

- `cron/jobs.py`
- `cron/scheduler.py`
- `tools/cronjob_tools.py`
- `hermes_cli/kanban.py`
- `hermes_cli/kanban_db.py`
- `tools/kanban_tools.py`
- `gateway/run.py`
- `hermes_cli/config.py`

---

## 1. Cron 的定位

Cron 是“定时触发一段工作”的系统。它支持两类任务：

- `no_agent=True`：只跑脚本，不启动 LLM。
- 默认 agent 任务：构造 prompt，启动 `AIAgent`，允许工具循环，保存输出并投递结果。

这不是 Unix cron 的简单包装。Hermes cron 要额外解决这些问题：

- 定时任务可能来自 gateway 聊天上下文，要能投递回原平台。
- 定时任务可能带 skill、script、context_from、workdir、profile、toolsets、model 等 agent 专属参数。
- 定时任务在后台运行，不能弹出交互确认，因此要有专门的安全边界。
- 多个 gateway / daemon / 手动 tick 可能同时触发，要避免重复执行。

---

## 2. Cron Job 存储

`cron/jobs.py` 使用 JSON 文件存储任务：

- job 文件：`~/.hermes/cron/jobs.json`
- 输出目录：`~/.hermes/cron/output/{job_id}/{timestamp}.md`

安全细节：

- 目录权限设置为 `0700`。
- 文件权限设置为 `0600`。
- `job_id` 被当作路径组件使用，所以会拒绝 `..`、绝对路径、斜杠等危险形状。
- 保存 jobs 时使用临时文件 + `fsync` + 原子替换，避免写一半导致损坏。
- 读取 `jobs.json` 时，如果遇到 bare control chars 或顶层 bare list，会尝试自动修复。

Job 记录里比较重要的字段：

- `id`：短 UUID。
- `name`：展示名称。
- `prompt`：agent 要执行的自然语言任务。
- `skills` / `skill`：运行前加载的 skill。
- `script`：预运行脚本，或 `no_agent` 模式下的主体脚本。
- `no_agent`：跳过 LLM。
- `context_from`：把其他 job 的最近输出注入当前 prompt。
- `enabled_toolsets`：限制 agent 暴露的工具集。
- `workdir`：项目工作目录，影响上下文文件和终端 / 文件工具 cwd。
- `profile`：用哪个 Hermes profile 运行。
- `deliver` / `origin`：结果投递目标。
- `schedule` / `next_run_at` / `last_run_at`：调度状态。
- `repeat`：运行次数限制。
- `last_status` / `last_error` / `last_delivery_error`：最近运行结果。

---

## 3. Cron Schedule 解析

`parse_schedule()` 支持四种形式：

- 一次性 duration：`30m`、`2h`、`1d`
- 递归 interval：`every 30m`
- cron 表达式：`0 9 * * *`
- ISO 时间戳：`2026-02-03T14:00:00`

几个值得关注的时间细节：

- naive timestamp 会在解析时转成 timezone-aware，避免运行时依赖系统时区。
- 旧数据里的 naive timestamp 会按系统本地 wall time 解释，再转成 Hermes 配置时区。
- one-shot job 有一个 grace window，避免“刚创建就错过下一分钟 tick”。
- recurring job 会基于 `last_run_at` 计算下一次，而不是单纯从当前时间算，这样重启后行为更稳定。
- missed recurring job 有 catch-up grace。代码用“周期一半”并夹在 120 秒到 2 小时之间，避免短周期任务无限补跑，也避免日任务轻微错过就被永久跳过。

---

## 4. Cron Tick：不是简单循环

`cron/scheduler.py::tick()` 是调度入口。gateway 会大约每 60 秒调用一次。

它做了几层保护：

- 用 `~/.hermes/cron/.tick.lock` 文件锁避免多个进程同时 tick。
- 先调用 `get_due_jobs()` 找到到期任务。
- 对 recurring jobs，先在锁内 `advance_next_run()`，再开始执行。
- 用 `_running_job_ids` 做进程内 in-flight 去重，防止上一次还没跑完时下一次 tick 重复提交同一个 job。
- jobs 分成 parallel 和 sequential 两类。

为什么分 parallel / sequential：

- 普通 job 可以走 `_parallel_pool`。
- 带 `workdir` 或 `profile` 的 job 会触碰进程全局状态，例如 `TERMINAL_CWD`、profile home override、`.env` 重载，所以必须走 `_sequential_pool`。
- 这两个 pool 都是持久线程池，不是每次 tick 新建一堆线程。

这个设计的重点是：tick 本身可以很快返回，长任务在后台跑，但不会因为下一次 tick 到来而重复排队同一个 job。

---

## 5. Cron no_agent 模式

`no_agent=True` 是非常实用的模式：它完全跳过 LLM，只运行脚本。

行为：

- `script` 是必须字段。
- 脚本 stdout 作为最终输出。
- stdout 为空时静默成功，不投递。
- 脚本返回非零或超时时，投递错误告警。
- 如果 stdout 包含 `wakeAgent=false` gate，也会静默，不唤醒 agent。
- `workdir` 在这里表现为 subprocess cwd，而不是 agent 的 `TERMINAL_CWD`。

源码特意把 no-agent 分支放在 import `AIAgent` 和创建 `SessionDB` 之前。这个细节很重要：纯脚本 watchdog 不需要为 agent 运行时付启动成本。

---

## 6. Cron Agent 模式

默认路径会构造一次临时 `AIAgent`：

- 初始化 `SessionDB`，让 cron 对话可被 session store 记录和搜索。
- session id 形如 `cron_{job_id}_{timestamp}`。
- 设置 `HERMES_CRON_SESSION=1`，让 approval 系统使用 cron mode。
- 用 ContextVar 清空普通 gateway session vars，避免工具误以为这是某个真实用户正在发消息。
- 设置 cron 自动投递相关 ContextVar：`HERMES_CRON_AUTO_DELIVER_PLATFORM`、`HERMES_CRON_AUTO_DELIVER_CHAT_ID`、`HERMES_CRON_AUTO_DELIVER_THREAD_ID`。
- 如配置 `workdir`，临时设置 `TERMINAL_CWD`。
- 每次运行前重新加载 `~/.hermes/.env` 和 `config.yaml`，这样 provider / key / model 修改不需要重启 gateway。
- 加载 MCP tools 后再构造 agent。

构造 `AIAgent` 时有几个关键参数：

- `skip_context_files=not bool(workdir)`：没有 workdir 时不注入项目上下文文件；有 workdir 时注入该项目的 `AGENTS.md` / `CLAUDE.md` / `.cursorrules` 等。
- `load_soul_identity=True`：仍加载身份。
- `skip_memory=True`：cron 不写入 / 不使用普通记忆，避免后台系统 prompt 污染用户画像。
- `platform="cron"`：让 agent 和工具知道当前来源是 cron。
- `session_id=_cron_session_id`
- `session_db=_session_db`

这里很关键：cron 的 agent 是“临时 agent”。它运行完后会显式 close，释放 subprocess、terminal sandbox、browser daemon、OpenAI/httpx client，并清理 stale async clients，避免长期 gateway 进程 fd 泄漏。

---

## 7. Cron Prompt 构造与注入扫描

Cron prompt 可能来自多层：

- 用户设置的 prompt。
- attached skills 的完整内容。
- script 输出。
- `context_from` 引用的历史 job 输出。
- cron 自身的运行提示。

危险点在于：job 创建时扫描用户 prompt 还不够，因为 skill 内容是在运行时从磁盘加载的。某个 skill 后来被篡改，就可能在后台 cron 中注入恶意指令。

因此 `cron/scheduler.py` 在 assembled prompt 完成后还会调用 `_scan_assembled_cron_prompt()`：

- 没有 skill 时，使用更严格的 `_scan_cron_prompt()`。
- 有 skill 时，使用 `_scan_cron_skill_assembled()`，避免把安全文档 / runbook 里的命令示例误报成攻击。
- 对 skill 内容里的 invisible unicode 采取清理 + 记录，而不是直接永久阻断。
- 一旦命中明确 prompt-injection pattern，会抛出 `CronPromptInjectionBlocked`。

被阻断时，cron 不启动 agent，而是保存一份 `BLOCKED` 输出文档并向 operator 暴露原因。

这是一个很重要的工程模式：后台自动化不能只扫描用户输入，还要扫描“运行时拼好的最终 prompt”。

---

## 8. Cron Toolsets 与权限边界

Cron 默认禁用一些工具集：

- `cronjob`
- `messaging`
- `clarify`

然后叠加用户配置里的 `agent.disabled_toolsets`。

原因：

- cron job 本身不应该在运行时再创建 / 修改 cron job，避免自我复制式自动化。
- 后台任务不应该随便直接发消息，结果投递由 scheduler 管。
- cron 是非交互运行，`clarify` 没有人可以回答。

enabled toolsets 的优先级：

1. per-job `enabled_toolsets`
2. platform `cron` 的工具配置
3. `None`，让 `AIAgent` 使用默认工具集

这是一种“job 级显式限制优先”的设计。对后台任务来说，越能缩小工具面，越容易审计。

---

## 9. Cron Timeout：按不活跃时间，而不是总时长

Cron agent 运行时使用 inactivity timeout：

- 环境变量：`HERMES_CRON_TIMEOUT`
- 默认：600 秒
- `0` 表示无限制

它不是“总运行超过 10 分钟就杀”。如果 agent 持续有 API call、tool call、stream delta，它可以运行很久。只有当 `agent.get_activity_summary()` 显示长时间没有活动时，才触发超时。

触发后：

- 记录最后活动描述、距离上次活动时间、当前工具、迭代数。
- 调用 `agent.interrupt("Cron job timed out (inactivity)")`。
- 抛出 `TimeoutError`，进入失败输出路径。

这个设计适合长任务：允许真正在工作，但能抓住卡死 API call 或卡住工具。

---

## 10. Cron 输出保存与投递

每个 job 都会保存输出文档：

- 成功 agent job 包含 job id、运行时间、schedule、prompt、response。
- no-agent job 包含脚本输出。
- 失败 job 包含错误堆栈摘要。
- prompt 注入阻断 job 包含 scanner result。

投递逻辑：

- 成功时投递 `final_response`。
- 失败时投递 `⚠️ Cron job ... failed`。
- `SILENT_MARKER = "[SILENT]"` 会跳过投递，但仍保存输出。
- 空 final response 被视为 soft failure，避免 job 状态显示 ok 但用户什么都没收到。
- delivery error 单独记录到 `last_delivery_error`。

---

## 11. Kanban 的定位

Kanban 是 Hermes 的多代理协作内核。

它不是一个 UI 看板而已，而是一套调度系统：

- task 存在 SQLite board 里。
- dispatcher 轮询 ready tasks。
- 每个 ready task 被原子 claim。
- dispatcher 启动一个 `hermes -p <assignee> chat -q "work kanban task <id>"` worker。
- worker 通过 `kanban_complete` / `kanban_block` / `kanban_heartbeat` 等工具回写结构化状态。
- task 之间可用 parent-child link 表达依赖。
- 完成父任务后，子任务自动从 `todo` promotion 到 `ready`。

相关入口：

- CLI：`hermes_cli/kanban.py`
- DB / dispatcher：`hermes_cli/kanban_db.py`
- Agent tools：`tools/kanban_tools.py`
- Gateway dispatcher：`gateway/run.py::_kanban_dispatcher_watcher`
- Dashboard API：`plugins/kanban/dashboard/plugin_api.py`

---

## 12. Kanban Board 与 Profile 的关系

`hermes_cli/kanban_db.py` 的模块注释直接说明了核心设计：

- 默认 board 的 DB 是 `<root>/kanban.db`。
- 多 board 位于 `<root>/kanban/boards/<slug>/kanban.db`。
- workspaces、logs、attachments 也按 board 隔离。
- profile 不是各自拥有一份 board，而是共享同一个 root 下的 board。

这个设计很关键：Kanban 是跨 profile 协作原语。dispatcher 用某个 profile 启动 worker，但它们必须看到同一个 board，否则任务派发和 worker 回写会分裂。

board resolution 顺序：

1. 显式 `board=` 参数。
2. `HERMES_KANBAN_BOARD` 环境变量。
3. `HERMES_KANBAN_DB` 直接指定 DB 路径。
4. `<root>/kanban/current` 当前 board 文件。
5. `default`。

dispatcher 启动 worker 时会注入：

- `HERMES_KANBAN_DB`
- `HERMES_KANBAN_WORKSPACES_ROOT`
- `HERMES_KANBAN_BOARD`

这是 belt-and-braces 防御：即使 worker 激活 profile 后 `HERMES_HOME` 改了，Kanban 路径仍然被钉在 dispatcher claim 的那块 board 上。

---

## 13. Kanban SQLite 连接与一致性

Kanban 使用 SQLite，但不是随便 `connect()` 一下：

- 每个连接设置 `busy_timeout`，默认 120 秒，适合 worker stampede。
- 首次初始化有跨进程 init lock，避免多个 worker 同时跑 schema / WAL / migration。
- 开启 WAL，网络文件系统不兼容时会 fallback。
- `synchronous=FULL`
- `wal_autocheckpoint=100`
- `foreign_keys=ON`
- `secure_delete=ON`
- `cell_size_check=ON`

打开 DB 前还有健康检查：

- `_validate_sqlite_header()` 检查 header，不让 TLS record 或其他非 SQLite 文件被误当 DB。
- `_guard_existing_db_is_healthy()` 跑 `PRAGMA integrity_check`。
- 如果发现腐坏，会复制 DB 和 WAL/SHM sidecar 到 content-addressed backup，然后抛 `KanbanDbCorruptError`。
- gateway dispatcher 会把 corrupt board 暂停一段时间，避免每 tick 热循环打爆日志或反复碰坏文件。

写事务统一使用 `write_txn()`：

- `BEGIN IMMEDIATE`
- 异常时 rollback
- 成功 commit 后检查 SQLite header page count 和实际文件长度，捕捉 torn-extend corruption。

这里的核心思想是：Kanban DB 是协作总线，不是普通缓存。它不能 silent recreate，也不能在损坏时悄悄覆盖用户任务。

---

## 14. Kanban Schema

核心表：

- `tasks`：任务主体和当前状态。
- `task_links`：parent-child 依赖。
- `task_comments`：评论。
- `task_events`：事件流。
- `task_runs`：每次 worker attempt。
- `task_attachments`：附件元数据，文件放磁盘。
- `kanban_notify_subs`：gateway 通知订阅。

`tasks` 里比较重要的字段：

- `status`：`triage`、`todo`、`ready`、`running`、`blocked`、`review`、`done`、`archived` 等。
- `assignee`：Hermes profile，dispatcher 会用它启动 worker。
- `priority`：ready queue 排序。
- `workspace_kind` / `workspace_path`：scratch、worktree 或 dir。
- `claim_lock` / `claim_expires`：claim lease。
- `worker_pid`：dispatcher 启动的 worker PID。
- `current_run_id`：当前 attempt。
- `consecutive_failures` / `last_failure_error`：统一失败计数。
- `max_runtime_seconds`：worker 尝试的总运行上限。
- `last_heartbeat_at`：worker 活跃信号。
- `skills`：额外强制加载的 worker skills。
- `model_override`：单任务模型覆盖。
- `max_retries`：单任务 circuit breaker 阈值。
- `goal_mode` / `goal_max_turns`：goal-loop worker。
- `tenant`：多项目 / 多客户 namespace。它不是 profile，不是权限模型，只是一列可筛选、可继承、可注入 worker env 的任务上下文字段。
- `session_id`：从 agent loop 创建任务时记录来源会话。

`task_runs` 是一个非常重要的抽象。它把“任务当前状态”和“某一次尝试的过程”分开：

- 每次 claim 创建一条 run。
- complete / block / crash / timeout / reclaim / spawn_failed 会关闭 run。
- 下游 child worker 的上下文会读取父任务最近 completed run 的 summary / metadata。
- retry worker 会看到 prior attempts。

这比只在 `tasks.result` 里塞一段文本更适合多轮、多 worker、多失败恢复的场景。

---

## 15. Tenant：多项目上下文隔离

`tenant` 在当前实现里非常克制，基本符合 PDF 设计里的“single nullable column”思路。

源码落点：

- `hermes_cli/kanban_db.py::Task` 有 `tenant: Optional[str]` 字段。
- `SCHEMA_SQL` 的 `tasks` 表包含 `tenant TEXT`。
- `_migrate_add_optional_columns()` 会给旧 DB 补 `tenant TEXT`，并创建 `idx_tasks_tenant`。
- `create_task(..., tenant=...)` 把 tenant 原样写进 `tasks.tenant`。
- 创建任务时 `_append_event(..., "created", {"tenant": tenant, ...})` 把 tenant 写进事件 payload。
- `list_tasks(..., tenant=...)` 只是追加 `AND tenant = ?`，没有树查询、继承查询或权限判断。

CLI 层：

- `hermes kanban create ... --tenant <name>` 写入任务 namespace。
- `hermes kanban list --tenant <name>` 只筛该 namespace。
- `hermes kanban watch --tenant <name>` 只看该 namespace 的事件。
- `hermes kanban specify/decompose --all --tenant <name>` 只扫指定 tenant 的 triage 任务。

工具层：

- `tools/kanban_tools.py::kanban_create` 支持 `tenant` 参数。
- 如果 worker 自己创建后续任务且没显式传 tenant，代码会默认使用 `os.environ["HERMES_TENANT"]`。
- `kanban_list` schema 也暴露 `tenant` filter，让 orchestrator profile 可以只看某个项目/客户的任务。

派发层：

- `_default_spawn()` 在 task 有 tenant 时注入 `HERMES_TENANT=<task.tenant>`。
- `build_worker_context()` 会在 worker prompt 顶部显示 `Tenant: <tenant>`。

因此 tenant 的实际语义是：

```text
同一个 researcher / writer / reviewer profile
  + 不同 tasks.tenant
  + 不同 workspace_path
  + worker env HERMES_TENANT
= 同一套能力服务多个项目，但任务筛选、工作区、记忆命名空间和审计记录不混。
```

它没有做的事同样重要：

- 没有 tenant 树结构。
- 没有 tenant 级权限继承。
- 没有 tenant-scoped profile。
- 没有强制 workspace 必须在某个 tenant 目录下；这是创建任务时的约定 / orchestrator 责任。
- 没有禁止代码层面创建跨 tenant parent links；设计文档说 v1 不建议跨 tenant 依赖，但当前源码主要把 tenant 当筛选字段，不是强约束边界。

这个设计的工程美感在于：内核只保存 namespace 标签和索引，把复杂隔离放到 workspace 路径、profile 记忆前缀、orchestrator 传参和用户约定里。这样一个字段就能覆盖“小公司同一套 specialist fleet 服务多个客户”的常见场景，同时避免把 Kanban 变成组织 / 权限 / CRM 系统。

---

## 16. Claim：Kanban 的原子调度点

`claim_task()` 做 `ready -> running`。

它不是简单 update：

1. 检查所有 parent 是否 `done` 或 `archived`。
2. 如果发现 parent 未完成但 task 是 `ready`，把它 demote 回 `todo`，记录 `claim_rejected`。
3. 如果旧 run 泄漏，先把旧 run 标成 `reclaimed`，避免 orphan run。
4. 用 CAS 条件更新：
   - `WHERE id = ?`
   - `AND status = 'ready'`
   - `AND claim_lock IS NULL`
5. 更新成功后插入 `task_runs`。
6. 写回 `tasks.current_run_id`。
7. 记录 `claimed` event。

SQLite 的 WAL + `BEGIN IMMEDIATE` + CAS 保证：多个 dispatcher / worker 同时 claim 同一个 task 时，最多一个成功。

这就是为什么系统不需要额外 Redis lock 或分布式锁。协作边界落在 SQLite 事务里。

---

## 17. Dispatcher Tick

`dispatch_once()` 是 Kanban 调度核心。一次 tick 做这些事：

1. `reap_worker_zombies()` 回收已退出子进程。
2. `release_stale_claims()` 回收 TTL 过期 claim。
3. `detect_stale_running()` 按 heartbeat stale 检测卡住任务。
4. `detect_crashed_workers()` 检查 host-local PID 是否还活着。
5. `enforce_max_runtime()` 终止超过 `max_runtime_seconds` 的 worker。
6. `recompute_ready()` 把依赖满足的 `todo` / 非 sticky `blocked` 提升到 `ready`。
7. 按 priority / created_at 遍历 ready queue。
8. 对每个可 spawn 任务 claim、resolve workspace、spawn worker、记录 PID。
9. 额外处理 `review` 状态任务，启动 review agent。

并发限制：

- `max_spawn` 在代码里被解释为 live concurrency cap，不是单 tick spawn 数。它统计当前 running + 本 tick 新 spawn，避免每分钟新增 N 个 worker 无限叠加。
- `max_in_progress` 是全局 running cap。
- `max_in_progress_per_profile` 是每个 profile 的 running cap。

跳过原因会结构化记录到 `DispatchResult`：

- `skipped_unassigned`
- `skipped_nonspawnable`
- `skipped_per_profile_capped`
- `respawn_guarded`
- `auto_assigned_default`
- `auto_blocked`
- `rate_limited`

这让 CLI、dashboard、日志都能解释“为什么没派发”，而不是只显示 ready queue 卡住。

---

## 18. Gateway 内嵌 Dispatcher

独立 `hermes kanban daemon` 已经是 deprecated。默认是 gateway 内嵌 dispatcher：

- 配置：`kanban.dispatch_in_gateway: true`
- tick 间隔：`kanban.dispatch_interval_seconds`，默认 60 秒
- 环境变量 `HERMES_KANBAN_DISPATCH_IN_GATEWAY=0/false/no/off` 可禁用

`gateway/run.py::_kanban_dispatcher_watcher()` 的设计点：

- 配置在 gateway 启动时读一次，修改配置后需要重启。
- 每 tick 用 `asyncio.to_thread()` 调 `dispatch_once()`，避免 SQLite 阻塞事件循环。
- 每 tick 遍历所有非 archived boards，所以新建 board 后不需要重启 gateway。
- 对 corrupt board 做 fingerprint quarantine，文件没变时暂时跳过。
- 先跑 auto-decompose，再跑 dispatch。
- idle 时尽量静默，只在 spawned / reclaimed / crashed / promoted 等有事情发生时记 info。
- 如果 ready queue 连续多个 tick 非空但没有 spawn，会记录 health warning，提示检查 profile、venv、PATH、credentials。

这种设计的取舍：

- 好处：用户只要跑 gateway，就有后台 dispatcher，不需要额外 systemd。
- 好处：减少多个 dispatcher 抢 claim 的风险。
- 代价：gateway 成了后台自动化宿主，需要做好 DB / worker / zombie / corrupt board 的防御。

---

## 19. Worker Spawn

默认 spawn 函数是 `_default_spawn()`。

命令形状大致是：

```text
hermes -p <assignee> --accept-hooks [--skills kanban-worker] [--skills extra] [-m model] chat -q "work kanban task <task_id>"
```

实际 argv 会先解析 Hermes 可执行：

1. `$HERMES_BIN`
2. PATH 里的 `hermes`
3. `sys.executable -m hermes_cli.main`

Windows 上会避免直接把 `.cmd` / `.bat` shim 当 argv[0]，因为 task-derived 参数进入 shell shim 有额外风险。

worker env 会注入：

- `HERMES_HOME`：profile home。
- `HERMES_PROFILE`：用于评论作者等。
- `HERMES_TENANT`
- `HERMES_KANBAN_TASK`
- `HERMES_KANBAN_WORKSPACE`
- `HERMES_KANBAN_BRANCH`
- `HERMES_KANBAN_RUN_ID`
- `HERMES_KANBAN_CLAIM_LOCK`
- `HERMES_KANBAN_GOAL_MODE`
- `HERMES_KANBAN_GOAL_MAX_TURNS`
- `HERMES_KANBAN_DB`
- `HERMES_KANBAN_WORKSPACES_ROOT`
- `HERMES_KANBAN_BOARD`

worker stdout/stderr 会写到 board-specific log：

- default board：`<root>/kanban/logs/{task_id}.log`
- named board：`<root>/kanban/boards/<slug>/logs/{task_id}.log`

日志在 spawn 前按配置轮转：

- `kanban.worker_log_rotate_bytes`
- `kanban.worker_log_backup_count`

---

## 20. Worker 上下文

worker 收到的 prompt 不是只包含 task title。`build_worker_context()` 会构造完整上下文：

1. task title。
2. task body，最大 8 KB。
3. attachments，暴露绝对路径，worker 可用 file/terminal 工具读取。
4. 当前 task 的 prior attempts，最多最近 10 次。
5. parent task results，优先使用 parent completed run 的 summary / metadata。
6. 当前 assignee 最近完成的其他任务，最多 5 条。
7. comment thread，最多最近 30 条。

每个大字段都有 cap：

- prior attempt summary/error/metadata：4 KB。
- task body：8 KB。
- comment：2 KB。

这套上下文设计非常值得学习：它没有把整个 board 塞进 prompt，而是按 worker 决策需要组织局部事实：

- 当前任务是什么。
- 附件在哪里。
- 以前怎么失败过。
- 上游任务交付了什么。
- 这个 profile 最近做过什么类似工作。
- 人类 / worker 评论了什么。

---

## 21. Kanban Tools 的可见性

`tools/kanban_tools.py` 不是对所有 agent 默认暴露全套 Kanban 工具。

Kanban 工具可见条件：

- `HERMES_KANBAN_TASK` 已设置，说明这是 dispatcher-spawned worker。
- 或当前 profile 显式启用了 `kanban` toolset。

普通 `hermes chat` 默认看不到 Kanban 工具。这是减少工具面和误操作的重要边界。

工具分层：

- worker lifecycle 工具：complete、block、heartbeat、comment、create、link、show 等。
- orchestrator-only 工具：list、unblock 等，对 worker 隐藏。

还有所有权保护：

- `_enforce_worker_task_ownership()` 阻止 worker 修改别的 task。
- `kanban_comment` 的 author 来自 runtime profile/env，而不是模型传入参数，避免伪造评论作者。
- worker heartbeat 从 env 中读取 `HERMES_KANBAN_TASK`、`HERMES_KANBAN_RUN_ID`、`HERMES_KANBAN_CLAIM_LOCK`，并做 60 秒 rate limit。

工程上，Kanban 用 Python tools 而不是让 agent shell out 到 `hermes kanban ...`，主要原因：

- backend portable，Python 进程能直接访问 host `~/.hermes/kanban.db`。
- 避免 shell quoting。
- 错误可以结构化返回给模型。
- 可以做 ownership / run_id / profile author 等运行时校验。

---

## 22. Complete / Block：把自然语言落回结构化状态

worker 完成时调用 `complete_task()`：

- 支持 `running|ready|blocked -> done`。
- 保存 `result` 到 task。
- 保存 `summary` / `metadata` 到 run。
- 关闭当前 run。
- 记录 `completed` event。
- 清空 failure counter。
- 调 `recompute_ready()` 推进 child tasks。
- 清理 scratch workspace。

两个防幻觉细节很重要：

第一，`created_cards` 会被验证。

如果 worker 声称自己创建了某些 task id，`complete_task()` 会检查：

- task 是否真实存在。
- 是否由这个 worker 的 assignee profile 创建。

如果有 phantom cards，会抛 `HallucinatedCardsError`，阻止 completion，并记录 `completion_blocked_hallucination` event。

第二，summary / result 会被扫描。

如果自然语言里提到形如 `t_deadbeef` 的 task id，但 DB 里不存在，会记录 `suspected_hallucinated_references` event。这个检查是 advisory，不阻止完成。

这两层代表了两种策略：

- 对会影响结构化状态的声明，强校验并阻止。
- 对自然语言里的可疑引用，记录审计事件但不中断。

worker 阻塞时调用 `block_task()`：

- `running|ready -> blocked`
- 清 claim / pid
- 关闭 run，outcome 为 `blocked`
- 保存 reason
- 记录 `blocked` event

如果 operator 或 worker 明确 block，后续 `recompute_ready()` 会把它视为 sticky block，不会因为父任务完成而自动恢复。只有 `unblock_task()` 之类显式动作才能解除。

---

## 23. Heartbeat、TTL、Crash 与 Timeout

Kanban worker 可能卡住、崩溃、被 kill、API 限流、退出但忘记调用 complete/block。系统用了多层检测。

### Claim TTL

默认 `DEFAULT_CLAIM_TTL_SECONDS = 15 * 60`。

`release_stale_claims()` 查找 `claim_expires < now` 的 running tasks。

如果 worker PID 在本机仍然活着，并且 heartbeat 没有过旧，它不会直接 reclaim，而是延长 claim，并记录 `claim_extended`。这是为了避免长 LLM call 没有 tool heartbeat 时被误杀。

如果 heartbeat 超过 `DEFAULT_CLAIM_HEARTBEAT_MAX_STALE_SECONDS = 60 * 60`，即使 PID 活着也会 reclaim，防止逻辑循环。

### Heartbeat

`heartbeat_worker()` 会：

- 更新 `tasks.last_heartbeat_at`
- 更新 `task_runs.last_heartbeat_at`
- 记录 `heartbeat` event

这和 PID liveness 是互补关系：PID 活着只能说明进程没死，heartbeat 才说明 worker 还在推进。

### Crash detection

`detect_crashed_workers()` 只检查 host-local claims，因为别的主机 PID 在本机没有意义。

它区分几种 worker exit：

- clean exit 但 task 仍是 running：协议违规，说明 worker 没调用 `kanban_complete` / `kanban_block`，直接按 failure_limit=1 处理。
- rate-limited sentinel exit code `75`：认为是 quota wall，不算任务失败，不增加 consecutive failure，只 requeue 并通过 respawn guard 延迟。
- nonzero / signaled / unknown：记录 crashed，增加失败计数。

### Max runtime

`enforce_max_runtime()` 会终止超过 `max_runtime_seconds` 的 worker：

- 先 SIGTERM。
- grace 后 SIGKILL。
- 记录 `timed_out`。
- 回到 ready 或触发 circuit breaker。

---

## 24. Circuit Breaker：统一失败计数

旧设计可能只统计 spawn failure。现在 `_record_task_failure()` 统一统计：

- `spawn_failed`
- `crashed`
- `timed_out`

字段：

- `tasks.consecutive_failures`
- `tasks.last_failure_error`

阈值解析顺序：

1. task 自己的 `max_retries`
2. dispatcher 传入的 `failure_limit`
3. 默认 `DEFAULT_FAILURE_LIMIT`

达到阈值后：

- task 变成 `blocked`
- 记录 `gave_up` event
- run 关闭为相应 outcome

成功完成任务时才清空 failure counter。成功 spawn 不清空，因为“能启动 worker”不代表任务成功；如果每次都能启动但最终 timeout，清空会导致无限循环。

---

## 25. Workspace 与清理

workspace 有三种：

- `scratch`：临时目录，完成后清理。
- `worktree`：git worktree，保留。
- `dir`：已有目录，保留。

`scratch` 清理有强保护：

- 只删除 Kanban 管理的 workspaces root 的严格子目录。
- 不删除 workspaces root 本身。
- 不删除 board root、logs、attachments 等 sibling。
- 如果 `workspace_kind='scratch'` 但 path 指向用户源代码目录，会拒绝删除并记录 warning。

这是为了防止 board default_workdir 或错误配置导致 completion 时 `shutil.rmtree()` 删除用户真实项目。

第一次创建 scratch workspace 时，还会记录一次提示：

- scratch workspace 是临时的。
- 如需保留输出，用 `worktree` 或 `dir`。

---

## 26. Auto-Decompose 与 Review

Gateway dispatcher 还包含 auto-decompose：

- 配置：`kanban.auto_decompose`
- 每 tick 最多处理：`kanban.auto_decompose_per_tick`
- 目标：把 `triage` 任务拆成 child tasks 或补全 spec。

dispatch 还处理 `review` column：

- review task 会被 claim 为新的 run。
- 强制加载 `sdlc-review` skill。
- review agent 验证 PR / acceptance criteria。

这说明 Kanban 不是单一“任务执行队列”，而是开始演化成 workflow engine：

- triage / specification
- worker implementation
- review
- synthesis / downstream dependencies

---

## 27. 配置项

`hermes_cli/config.py` 里的 `kanban` 默认配置：

- `dispatch_in_gateway: True`
- `dispatch_interval_seconds: 60`
- `failure_limit: 2`
- `worker_log_rotate_bytes: 2 * 1024 * 1024`
- `worker_log_backup_count: 1`
- `orchestrator_profile: ""`
- `default_assignee: ""`
- `max_in_progress_per_profile: None`
- `auto_decompose: True`
- `auto_decompose_per_tick: 3`
- `dispatch_stale_timeout_seconds: 14400`

Cron 默认配置里相关项：

- `cron.max_parallel_jobs`
- 也可用 `HERMES_CRON_MAX_PARALLEL`
- `HERMES_CRON_TIMEOUT`

几个环境变量：

- `HERMES_CRON_SESSION`
- `HERMES_CRON_TIMEOUT`
- `HERMES_CRON_MAX_PARALLEL`
- `HERMES_KANBAN_DISPATCH_IN_GATEWAY`
- `HERMES_KANBAN_HOME`
- `HERMES_KANBAN_DB`
- `HERMES_KANBAN_BOARD`
- `HERMES_KANBAN_WORKSPACES_ROOT`
- `HERMES_KANBAN_ATTACHMENTS_ROOT`
- `HERMES_KANBAN_CLAIM_TTL_SECONDS`
- `HERMES_KANBAN_CRASH_GRACE_SECONDS`
- `HERMES_KANBAN_RATE_LIMIT_COOLDOWN_SECONDS`
- `HERMES_KANBAN_BUSY_TIMEOUT_MS`

---

## 28. 值得学习的工程细节

### 后台 prompt 必须扫描最终 assembled prompt

Cron 的注入扫描不是只扫创建时的 prompt，而是扫 runtime 拼接后的 prompt。skill 内容、script 输出、历史 job 输出都可能成为攻击面。

### 后台任务默认不进普通 memory

Cron 使用 `skip_memory=True`。后台系统任务如果写入用户长期记忆，很容易把“监控任务的系统表述”污染成“用户偏好 / 用户事实”。

### ContextVar 优于全局 env 存 session routing

Cron 会清空普通 `HERMES_SESSION_*`，用 ContextVar 存 cron delivery target。这样并行 job 不会互相覆盖投递目标。

### SQLite 可以当小型协作总线，但必须认真处理

Kanban 的 SQLite 用了 WAL、busy_timeout、init lock、integrity check、corrupt quarantine、CAS update、transaction wrapper。它不是玩具级 sqlite 用法。

### Run 表比 Result 字段更重要

`task_runs` 让系统能表达多次 attempt、失败原因、metadata、summary、worker PID、heartbeat。这是 agent 协作系统里非常关键的审计和恢复结构。

### 不只看 PID，还要看 heartbeat

PID alive 不等于工作正常。Kanban 同时用 PID、claim TTL、heartbeat stale、max runtime、worker exit classifier 判断状态。

### 模型输出要回到结构化事实

`created_cards` 验证和 phantom id 扫描说明：不要让模型自然语言直接改变系统事实。可以让模型声明，但系统必须验证。

### Dispatcher 应该能解释“不派发”

`skipped_unassigned`、`skipped_nonspawnable`、`respawn_guarded`、per-profile cap 等分类，让 operator 能知道 ready queue 为什么没有动。

### Worker 工具需要 ownership guard

Kanban tools 根据 env 限制 worker 只能操作自己 task。否则一个 worker hallucinate 出别的 task id，就可能污染整块 board。

### scratch workspace 删除必须有 containment guard

任何自动删除都应该证明路径属于系统管理目录，而且是严格子路径。Kanban 的 `_is_managed_scratch_path()` 是很好的防删库范例。

---

## 29. 一个简化流程图

Cron agent job：

```text
jobs.json
  ↓ tick()
due jobs
  ↓ file lock + next_run advance
parallel/sequential pool
  ↓ run_job()
build prompt + scan assembled prompt
  ↓
AIAgent(skip_memory=True, platform=cron)
  ↓
save output
  ↓
deliver final response or failure alert
  ↓
mark_job_run()
```

Kanban worker dispatch：

```text
task created
  ↓
todo / ready
  ↓ dispatch_once()
reclaim stale + detect crash + recompute dependencies
  ↓
claim_task(): ready -> running, create task_run
  ↓
_default_spawn(): hermes -p assignee chat -q "work kanban task <id>"
  ↓
worker reads build_worker_context()
  ↓
kanban_complete / kanban_block / kanban_heartbeat
  ↓
close run + append event + promote children
```

---

## 30. 和记忆系统的关系

这两套后台机制都和 memory 有边界：

- Cron 明确 `skip_memory=True`，避免定时任务污染用户记忆。
- Kanban worker 的连续性主要来自 `build_worker_context()`，不是普通长期记忆。
- Kanban 通过 parent run summary、prior attempts、comments、recent work by assignee 构造“任务局部记忆”。

所以可以这样理解：

- 普通聊天的记忆偏“用户长期画像 + 会话历史检索”。
- Cron 的上下文偏“job 配置 + 当前脚本/skill/context_from 输出”。
- Kanban 的上下文偏“任务图上的结构化历史 + worker attempt 记录”。

这也是 Hermes 比较成熟的一点：不同自动化场景没有都塞进同一个 memory 概念里，而是各自用更适合的状态结构。
