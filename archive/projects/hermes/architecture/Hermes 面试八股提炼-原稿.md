# Hermes 面试八股提炼

这篇笔记从 Hermes 架构里提炼一些可能在面试中被问到的“八股点”。重点不是背 Hermes 的源码，而是借 Hermes 的设计复习 Agent 系统里常见的协议、状态管理、并发、安全和工程边界。

## 1. MCP 是什么，解决什么问题？

MCP 是 Model Context Protocol，可以理解为把外部工具、资源和 prompt 以统一协议暴露给模型应用。

面试可以这样答：

> MCP 解决的是工具生态标准化问题。没有 MCP 时，每个 Agent 框架都要自己接数据库、浏览器、文件系统、GitHub、搜索服务等工具。有 MCP 后，外部服务可以实现 MCP server，Agent 作为 MCP client 连接它，再把 MCP tools 转成模型可调用的工具 schema。

Hermes 里的关键点：

- 支持 stdio、Streamable HTTP、SSE 多种 transport。
- MCP tools 最终被归一化成 Hermes 内部工具。
- 支持 tools/list_changed 动态刷新。
- MCP server 是可选能力，没装 SDK 时要 graceful no-op。
- stdio MCP subprocess 不能继承全部环境变量，否则可能泄露 API key。

可追问：

- stdio MCP 和 HTTP MCP 的区别？
- 为什么 MCP discovery 不应该阻塞主启动流程？
- MCP tool schema 为什么要做 provider 兼容转换？
- MCP server 反向请求 LLM 的 sampling 是什么？

## 2. ACP 是什么，和 MCP 有什么区别？

ACP 是 Agent Client Protocol，更偏“编辑器客户端如何接入 Agent”。MCP 是“Agent 如何接入外部工具”。两者方向不同。

可以这样区分：

```text
MCP: Agent <-> Tool/Resource Server
ACP: Editor/Client <-> Agent
```

Hermes 的 ACP adapter 把现有 `AIAgent` 包装成 ACP stdio server。编辑器通过 JSON-RPC 发送 session、prompt、permission 请求，Hermes 在后台跑 agent loop，再把消息、工具调用、权限请求、计划更新转换成 ACP session updates。

面试回答重点：

- ACP 面向 Zed、VS Code、JetBrains 这类编辑器集成。
- 它不是重新实现一个 agent，而是协议适配层。
- stdout 必须只输出 JSON-RPC protocol frames，日志只能写 stderr。
- 一个 ACP session 对应一个 `AIAgent`，并持久化到 SessionDB。
- ACP 可以把编辑器传入的 cwd、MCP server、图片 prompt 等信息转成 Hermes 内部状态。

可追问：

- 为什么 stdio 协议要求 stdout 纯净？
- ACP session 为什么要持久化？
- 编辑器传 Windows 路径而 Agent 跑在 WSL 时怎么处理？

## 3. JSON-RPC 适合做什么？

JSON-RPC 是一种轻量 RPC 协议，常用于本地进程、编辑器插件、stdio server、WebSocket 后端之间的命令调用。

它的特点：

- 请求和响应都有 `id`。
- 方法名用 `method` 表示。
- 参数用 `params` 表示。
- 支持 notification，也就是没有响应的事件。
- 可以跑在 stdio、HTTP、WebSocket 等 transport 上。

Hermes 中 ACP、TUI gateway、desktop backend 都能看到 JSON-RPC 风格的设计。

面试可以这样说：

> JSON-RPC 适合做“结构化命令通道”。它比自然语言稳定，比 REST 更适合双向会话和本地进程通信。Agent 场景里，客户端需要发送 prompt、cancel、load session、permission decision，同时服务端也需要推送 streaming update、tool progress、approval request，这种双向事件流很适合 JSON-RPC 或 JSON-RPC-like 协议。

可追问：

- JSON-RPC request 和 notification 的区别？
- 为什么日志不能混到 stdio JSON-RPC stdout 里？
- JSON-RPC 和 REST 在交互式 Agent 场景下的差异？

## 4. Gateway / Adapter 模式解决什么问题？

Gateway 负责把不同消息平台的事件统一接入 Agent。

典型链路：

```text
Telegram / Slack / Discord / Email / Webhook
  -> platform adapter
  -> MessageEvent
  -> SessionSource / SessionContext
  -> AIAgent.run_conversation()
  -> adapter.send / edit / reply
```

这个设计解决的是“平台差异爆炸”问题。Telegram 有 topic，Slack 有 thread_ts，Discord 有 channel/thread/forum，Email 有 thread，Webhook 有 request body。如果这些差异直接进入 agent loop，核心逻辑会很乱。

Hermes 的做法是：

- adapter 负责平台 SDK 和平台细节。
- `MessageEvent` 表示统一入站消息。
- `SessionSource` 表示平台、用户、群聊、线程信息。
- `SessionContext` 负责生成平台上下文 prompt。
- Agent loop 只处理统一后的会话。

可追问：

- 为什么群聊默认按用户隔离 session？
- Slack thread 和 Hermes session history 有什么区别？
- 平台附件为什么要先下载到本地缓存？
- 多平台消息并发时为什么不能用全局环境变量保存当前 session？

## 5. contextvars 是什么，为什么 Agent Gateway 需要它？

`contextvars` 是 Python 用来保存“当前异步上下文局部变量”的机制。它类似 thread-local，但更适合 async task。

Hermes 在 gateway、approval、profile、session context 里使用 contextvars，原因是 gateway 会并发处理多个用户、多个平台、多个线程。

如果用 `os.environ` 或全局变量保存当前 session：

```text
用户 A 的消息还在跑
用户 B 的消息进来覆盖全局 session_id
用户 A 的工具调用可能拿到用户 B 的上下文
```

所以 Hermes 用 contextvars 保存：

- 当前 session key
- 当前 user/chat/thread
- approval session
- profile/HERMES_HOME override
- task cwd override

面试可以这样答：

> 在异步或线程池混合场景里，全局变量会串上下文，thread-local 又不能自然跨 async task。contextvars 可以让每个请求/会话持有自己的上下文，并通过 copy_context 传入 executor，适合 gateway 这类并发 Agent runtime。

可追问：

- thread-local 和 contextvars 区别？
- async task 切换时上下文如何保持？
- 进入 thread pool 时为什么要 `copy_context()`？

## 6. SQLite WAL 是什么，为什么适合 Agent 状态？

WAL 是 Write-Ahead Logging。SQLite 使用 WAL 后，写入会先进入 WAL 文件，读者可以继续读旧快照，提升读写并发能力。

Hermes 用 SQLite 保存：

- session metadata
- messages
- system prompt snapshot
- token/cost counters
- compression lineage
- Kanban task state

Agent 场景适合 SQLite 的原因：

- 本地部署简单，不需要额外数据库服务。
- 状态可以持久化和恢复。
- 事务可以保证任务状态更新的原子性。
- FTS 可以做历史搜索。
- WAL 可以支持 gateway、CLI、dashboard 并发读写。

但 SQLite 也有限制：

- 多写并发能力不如服务端数据库。
- NFS/SMB/FUSE 等文件系统上 WAL 可能不可靠。
- 需要处理 busy retry、timeout、checkpoint。

Hermes 的做法：

- 尝试启用 WAL。
- WAL 不可用时 fallback 到 DELETE journal。
- 写入使用 `BEGIN IMMEDIATE`、短 timeout、jitter retry。
- FTS5 不可用时，message storage 仍然要能工作。

可追问：

- WAL 和 rollback journal 的区别？
- SQLite 为什么适合单机 Agent，不一定适合大规模多租户？
- `BEGIN IMMEDIATE` 和普通 deferred transaction 有什么区别？
- 为什么要有 FTS trigram 表支持 CJK？

## 7. OAuth 2.1 / PKCE 在 MCP 里有什么作用？

MCP 可能连接远程服务，例如 GitHub、Notion、Linear、内部 API。这些服务需要认证。OAuth 2.1 + PKCE 可以让本地 Agent 安全地获得访问令牌，而不需要把用户密码交给 Agent。

核心概念：

- Authorization Code Flow：用户在浏览器授权，应用拿 code 换 token。
- PKCE：客户端生成 code verifier / challenge，防止授权码被截获后滥用。
- access token：短期访问令牌。
- refresh token：用于刷新 access token。

Hermes 的 MCP OAuth 设计点：

- token 持久化在 Hermes home 下。
- 支持 token refresh。
- 感知外部刷新和 401。
- Authorization redirect 要防泄漏。
- 错误和日志要脱敏。

面试可以这样说：

> OAuth 适合第三方服务授权，PKCE 解决本地或 public client 没有 client secret 时授权码被劫持的问题。Agent 接 MCP server 时，如果 server 需要用户授权，就可以通过 OAuth 获取 token，再在后续 MCP 请求中携带。

可追问：

- OAuth access token 和 refresh token 区别？
- PKCE 防的是什么攻击？
- 为什么本地 CLI/桌面应用通常不能安全保存 client secret？

## 8. Provider / Transport 分层是什么？

Hermes 把模型调用拆成 provider profile 和 transport。

```text
ProviderProfile: 这个 provider 有什么特性、认证方式、默认 endpoint、特殊参数
Transport:       怎么把 messages/tools 转成具体 API 请求并解析响应
```

这么做的原因是不同模型服务都长得像 OpenAI API，但细节不同：

- reasoning 参数位置不同。
- temperature 有的支持，有的不能传。
- base_url、headers、auth_type 不同。
- vision 支持不同。
- fallback model 不同。
- auxiliary model 选择不同。

如果每个地方都写 if provider == xxx，代码会失控。ProviderProfile 用声明式配置集中表达 provider 差异，transport 专注请求构造。

可追问：

- 为什么要区分主对话模型和 auxiliary client？
- 为什么压缩、标题、搜索摘要可以走辅助模型？
- OpenAI-compatible provider 为什么仍然需要 profile？

## 9. Tool Schema 为什么要动态生成？

Agent 的工具 schema 不是越固定越好。很多工具能力取决于当前配置、环境、session 和 profile。

Hermes 动态生成 tool schema 的原因：

- 当前 session 可能禁用了某些 toolset。
- 某些工具依赖 Docker、浏览器、凭证、MCP server 是否可用。
- `delegate_task` 的并发上限和深度上限来自运行时配置。
- Kanban worker、cron、ACP、CLI 暴露的工具面不同。
- MCP/plugin 工具会动态注册或刷新。

所以 Hermes 的流程是：

```text
registry 中存在工具
  -> toolset 解析
  -> enabled / disabled 过滤
  -> availability check
  -> dynamic schema override
  -> 暴露给模型
```

面试可以这样说：

> 工具注册只是能力全集，模型可见 schema 应该是当前会话真实可用能力的快照。否则模型会调用不存在、无权限或当前环境不可用的工具。

可追问：

- 注册工具和暴露工具为什么要分开？
- dynamic schema override 适合什么场景？
- availability check 为什么要缓存？

## 10. Agent 的安全审批系统怎么设计？

Hermes 的安全审批不是一个开关，而是多层防线：

```text
hardline block
sudo stdin guard
dangerous pattern
manual / smart approval
cron unattended policy
secret redaction
tool loop guardrail
```

面试回答重点：

- 有些命令永远不能执行，比如擦系统盘、关机、fork bomb。
- 有些命令危险但可审批，比如 `rm -r`、写 `.env`、改 `/etc`、`curl | sh`。
- YOLO/off 只能跳过普通审批，不能绕过 hardline。
- 后台 cron 没有人交互，所以要有单独策略。
- secret redaction 要在日志写盘前做。
- 安全开关不能每次读环境变量，否则模型可以通过 shell 动态关闭安全。

可追问：

- hardline block 和 approval 有什么区别？
- 为什么 `sudo -S` 要单独拦截？
- smart approval 的风险是什么？
- 工具循环 guardrail 解决什么问题？

## 11. Foreground / Background Process 为什么要分开？

Agent 执行 terminal 命令时，需要区分前台命令和后台进程。

前台适合：

- `ls`
- `pytest`
- `python script.py`
- `git status`

后台适合：

- `npm run dev`
- `vite`
- `uvicorn`
- `python -m http.server`
- watcher / daemon / server

Hermes 不鼓励模型在前台命令里自己写 `&`、`nohup`、`disown`，而是要求用 terminal tool 的 `background=true`。

原因：

- 生命周期要可追踪。
- 输出要能读取。
- 超时和中断要可控。
- 进程结束状态要能管理。

可追问：

- 为什么长驻服务不能直接前台跑？
- shell `&` 后台化有什么问题？
- inactivity timeout 和 total timeout 有什么区别？

## 12. Session、Memory、Search 的区别

这是 Agent 面试里很常见的问题。

Hermes 的分工：

```text
Session history  当前会话完整消息历史
Memory           少量长期事实，每次都值得进入上下文
Session search   从 SQLite 里按需查历史消息
```

可以这样答：

> Memory 不应该保存所有历史。Memory 是 curated long-term facts，适合用户偏好、长期规则、稳定背景。Session search 用于查具体历史对话，避免把 PR 编号、commit、临时任务日志这种容易过期的信息塞进 always-in-prompt memory。

可追问：

- 为什么 memory 太大不好？
- 为什么外部 memory recall 不应该污染原始 messages？
- 中断的 turn 为什么不应该同步到长期 memory？

## 13. 上下文压缩如何避免破坏工具调用？

LLM API 对 tool call 有结构约束。比如 assistant 发出 tool_call 后，后面必须有对应 tool result。如果压缩时删掉一半，API 会报错。

Hermes 的压缩关注：

- 保护开头重要消息。
- 保护最近 tail。
- 中间消息生成摘要。
- 修复 tool_call / tool_result 配对。
- 压缩失败要 fallback 或 abort，不能静默丢状态。
- 压缩后建立 parent/child session lineage。

面试可以这样说：

> 上下文压缩不是简单截断数组，而是一次状态迁移。它要保留任务目标、最近上下文、工具调用结构合法性，还要让 session resume 和历史搜索知道新旧会话关系。

可追问：

- 为什么压缩后要创建新 session？
- 为什么 preflight rough token estimate 可能误触发压缩？
- anti-thrashing 是什么？

## 14. 多 Agent 协作为什么要区分同步和持久？

Hermes 区分：

```text
delegate_task: 当前 turn 内同步 fan-out
Kanban worker: SQLite 持久任务队列
```

`delegate_task` 适合临时并行：

- 多个子 agent 搜资料。
- 多个子 agent 分析不同文件。
- 父 agent 等结果回来后汇总。

Kanban 适合持久任务：

- 任务拆解。
- 依赖关系。
- worker claim。
- heartbeat。
- crash recovery。
- comment thread。
- human unblock。

面试回答重点：

> 同步子任务依赖父 turn 的生命周期，父 agent 被中断，子任务也应该结束。持久任务队列则必须把状态落到数据库，通过 pending/processing/done/failed 等状态和 claim/heartbeat 恢复执行。

可追问：

- 为什么子 agent 默认不应该写共享 memory？
- Kanban 为什么要用 SQLite claim？
- worker crash 后如何恢复？
- fan-out 和 fan-in 分别是什么？

## 15. 配置和 Secret 为什么要分开？

Hermes 区分：

```text
config.yaml   普通配置、行为开关、模型、工具、插件
.env          secrets only，比如 API key、token、password
auth.json     登录态和 provider 凭证
```

原因：

- 普通配置可以分享、版本化、迁移。
- secret 不应该进入普通配置或日志。
- 不同 profile 要隔离配置、记忆、日志、凭证。
- gateway 并发时不能通过全局 env 临时切 profile。

可追问：

- 为什么 profile-aware `HERMES_HOME` 很重要？
- 为什么 subprocess 没继承 `HERMES_HOME` 会危险？
- `.env` 和 `auth.json` 分别适合保存什么？

## 16. Observability 为什么要默认本地、外部 opt-in？

Agent 日志可能包含：

- 用户隐私
- prompt
- tool output
- file path
- API key / token
- 命令输出
- 错误堆栈

Hermes 的观测分层：

- 本地 rotating logs 默认启用。
- `errors.log` 便于快速 triage。
- debug 上传需要显式动作和隐私提示。
- Langfuse / NeMo Relay 这类外部 trace 插件必须 opt-in。
- 所有 formatter 写盘前做 redaction。

面试可以这样答：

> Agent observability 不能默认上传，因为 trace 里可能包含完整对话和工具输出。比较稳妥的设计是默认本地日志，外部观测显式启用，写盘和上传前都做 secret redaction。

可追问：

- 为什么日志要带 session tag？
- 为什么 redaction 要尽早初始化？
- 本地日志和外部 trace 的边界是什么？

## 17. 可以总结成一句话的架构八股

如果面试里让你总结 Hermes 这类 Agent 系统的工程重点，可以这样说：

> 一个可靠的 Agent 系统，核心不是只把模型接上工具，而是要管理好协议边界、会话状态、工具权限、长期记忆、并发上下文、安全审批和可恢复任务。MCP/ACP/Gateway 解决外部协议接入，SQLite/SessionDB/Kanban 解决持久状态，tool registry/toolset 解决能力暴露，contextvars 解决并发上下文隔离，approval/redaction/observability 解决安全和排障。

