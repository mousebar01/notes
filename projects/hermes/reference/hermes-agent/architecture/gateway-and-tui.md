# Gateway、TUI 与多端会话架构

本文整理 Hermes Agent 在 CLI 之外的运行面：Gateway、TUI、dashboard embedded TUI、desktop JSON-RPC backend。重点不是列出所有平台适配器，而是理解消息如何从外部平台进入 `AIAgent.run_conversation()`，以及系统如何处理并发、会话、审批、slash command、流式输出和压缩后的 session 轮转。

核心源码：

- `gateway/run.py`：多平台消息 gateway 主运行器。
- `gateway/session.py`：平台来源、session context、动态 prompt 构造。
- `tui_gateway/server.py`：TUI/desktop/dashboard 的 Python JSON-RPC backend。
- `tui_gateway/entry.py`：stdio JSON-RPC 入口。
- `tui_gateway/slash_worker.py`：TUI slash command worker。
- `ui-tui/src/app.tsx` 与 `ui-tui/src/app/*`：Ink 前端状态与渲染。
- `hermes_cli/pty_bridge.py` 与 dashboard `/api/pty`：dashboard 嵌入真实 `hermes --tui`。

---

## 1. 三种主要交互面

Hermes 至少有三种不同层级的交互面：

1. **Classic CLI**：`cli.py` 直接持有 `AIAgent`，用 prompt_toolkit/Rich 交互。
2. **Gateway**：`gateway/run.py` 接收 Telegram/Discord/Slack/WhatsApp/Email/API 等平台消息，然后在线程池中运行 `AIAgent`。
3. **TUI / desktop / dashboard backend**：TypeScript/React/Ink 前端通过 JSON-RPC 调用 `tui_gateway/server.py`，Python backend 持有 `AIAgent`。

AGENTS.md 特别强调 dashboard 的 `/chat` 不要重写聊天体验，而是嵌入真实 `hermes --tui`。也就是说：

- primary chat transcript/composer 属于 Ink TUI。
- dashboard 只是通过 PTY 把 TUI 嵌进去。
- 周边 React UI 可以做 sidebar、inspector、status panel，但不应复制主聊天面。

---

## 2. Gateway 的基本职责

`GatewayRunner` 负责：

- 启动各平台 adapter。
- 接收 `MessageEvent`。
- 构造 `SessionSource` 和 `SessionContext`。
- 做 slash command 分发。
- 做权限、配对、auth、thread/topic 路由。
- 加载历史。
- 创建或复用 `AIAgent`。
- 把 tool progress、streaming、approval、final response 发回平台。
- 管理后台进程通知和 synthetic events。

可以把 Gateway 理解成：

```text
Platform Adapter
  -> MessageEvent
  -> GatewayRunner
  -> SessionStore / SessionDB
  -> AIAgent.run_conversation()
  -> Adapter.send/edit/reply
```

---

## 3. SessionSource

`gateway/session.py` 中 `SessionSource` 描述消息来源。

字段包括：

- `platform`
- `chat_id`
- `chat_name`
- `chat_type`
- `user_id`
- `user_name`
- `thread_id`
- `chat_topic`
- `user_id_alt`
- `chat_id_alt`
- `is_bot`
- `guild_id`
- `parent_chat_id`
- `message_id`

这些信息用于：

1. 把回复发回正确平台和 thread。
2. 构造动态 system prompt。
3. 让 cron/background task 知道输出投递位置。
4. 管理多用户共享 session。
5. 做 approval/slash/session key 路由。

`description` 会根据 DM/group/channel/thread 生成可读描述。

---

## 4. SessionContext prompt

`build_session_context_prompt(context, redact_pii=False)` 会生成动态 system prompt section：

```markdown
## Current Session Context

**Source:** ...
**User:** ...
**Platform notes:** ...
```

它告诉 agent：

- 消息来自哪里。
- 当前是 DM、群组、频道还是 thread。
- 是否多用户共享 session。
- 哪些平台已连接。
- 哪些 home channel 可投递。
- 当前平台有哪些能力或限制。

这属于 system prompt 的动态部分，但要注意 prompt cache：多用户共享 session 下不会把每轮 user name 写死在 system prompt 里，而是提示“messages are prefixed with [sender name]”。这样每个发言人的变化不会频繁 bust prompt cache。

---

## 5. PII redaction

`SessionContext` 支持 PII redaction。

默认安全可 redaction 的平台：

- WhatsApp
- Signal
- Telegram
- BlueBubbles

Discord 被排除，因为 Discord mention 需要真实 ID，例如 `<@user_id>`。

redaction 用稳定 hash：

- sender id -> `user_<12hex>`
- chat id -> 保留 platform prefix 后 hash

关键点：routing 仍然用原始 ID，只有发给 LLM 的 prompt 可以 redacted。

---

## 6. 平台能力说明必须诚实

`build_session_context_prompt()` 对 Slack/Discord 等平台会加入“你没有平台 API 能力”的说明，除非对应工具真的启用。

Discord 特别检查两件事：

1. `discord` 或 `discord_admin` toolset 对 Discord 平台启用。
2. `DISCORD_BOT_TOKEN` 设置。

只有两者都满足，才把 guild/channel/thread/message IDs 注入给模型使用工具。否则 system prompt 明确说明不能搜索历史、pin、管理角色、列用户等。

这是防止模型“看见自己在 Discord 里”就虚构平台 API 能力。

---

## 7. Gateway 并发隔离：contextvars

`GatewayRunner._set_session_env(context)` 不直接写 `os.environ`，而是使用 `contextvars`：

```python
from gateway.session_context import set_session_vars
return set_session_vars(...)
```

原因：Gateway 会并发处理不同平台/不同用户消息。如果用全局 env 保存当前 session，两个消息会互相覆盖。

阻塞工作进入 thread pool 时，用：

```python
ctx = copy_context()
loop.run_in_executor(None, ctx.run, func, *args)
```

这样 async task 的 session contextvars 能带到 executor 线程。

---

## 8. Gateway 的 AIAgent 缓存

Gateway 会缓存 `AIAgent`，目的是复用：

- system prompt 和工具 schema，提升 prompt cache 命中。
- terminal/browser/tool resources。
- memory provider per-session 状态。

但缓存 key 不能只看 `session_key`。源码中的 `_agent_cache_signature(...)` 会把这些信息纳入 fingerprint：

- model
- api key 的 SHA256 fingerprint
- base_url
- provider
- api_mode
- enabled_toolsets
- ephemeral_prompt
- cache-busting config
- user_id / user_id_alt

user_id 纳入 cache signature 的原因很具体：某些共享 thread session intentionally 不按用户拆 session，但 Honcho memory provider 会在初始化时冻结 user identity。如果不同用户复用同一个 cached agent，会把第二个用户消息归到第一个用户的 Honcho peer 上。

这里的工程权衡是：多用户共享 thread 中，为了正确 memory attribution，宁愿牺牲一些 prompt-cache 热度。

---

## 9. 运行代际 run_generation

Gateway 用 per-session run generation 防止旧 turn 的晚到结果污染新 session。

相关方法：

- `_begin_session_run_generation(session_key)`
- `_invalidate_session_run_generation(session_key, reason=...)`
- `_is_session_run_current(session_key, generation)`

每个 top-level gateway turn 都拿一个递增 token。如果用户 `/stop`、`/new` 或 session boundary 变化，generation 会被 bump。旧 worker unwind 时如果 generation 已过期，就不能再清理/写入当前 session 状态。

这个设计解决的是异步世界里的“迟到结果”问题。

---

## 10. running agent 状态清理

`_release_running_agent_state(...)` 统一清理：

- `_running_agents`
- `_running_agents_ts`
- `_busy_ack_ts`

源码注释说，以前这些清理散落各处，容易遗漏造成长期小泄漏。

它支持 `run_generation` ownership guard：只有当前 generation 才能清理 slot，避免旧 run 清掉新 run 的 running 状态。

---

## 11. Gateway 调用 AIAgent 的主路径

`GatewayRunner._run_agent(...)` 最终会：

1. 读取 gateway config。
2. 解析平台 toolsets。
3. 配置 tool progress、interim assistant messages。
4. 准备 progress queue。
5. 准备 approval callback。
6. 把 gateway transcript 转成 agent history。
7. 处理图片、语音、附件。
8. 注册当前 session key 给 approval 工具。
9. 调用：

```python
result = agent.run_conversation(_api_run_message, **_conversation_kwargs)
```

其中 `_conversation_kwargs` 至少包含：

```python
{
    "conversation_history": agent_history,
    "task_id": session_id,
}
```

如果有 observed group context，会传 `persist_user_message`，避免观察到的群聊上下文被当成真实 replayable user turn 写入历史。

---

## 12. 多媒体消息处理

Gateway 对图片有两种模式：

- native：把图片作为 OpenAI-style multimodal content parts 传给主模型。
- text：用 `vision_analyze` 预分析图片，把描述 prepend 到用户消息。

选择逻辑由 `agent/image_routing.py` 的 `decide_image_input_mode(...)` 决定。

语音消息类似：

- 如果 STT 启用，调用 transcription 工具，把 transcript prepend。
- 如果 STT 不可用，注入说明，让模型知道用户发了语音但当前不能听。

这里的设计目标是：平台 adapter 负责下载/缓存媒体，Gateway 负责把媒体转成模型可消费的输入形式。

---

## 13. Gateway approval 桥接

危险命令审批工具是同步阻塞 agent 线程的，但 gateway 平台发送消息是 async。

Gateway 在 agent run 里注册：

```python
register_gateway_notify(_approval_session_key, _approval_notify_sync)
```

`_approval_notify_sync` 会：

- 暂停 typing indicator。
- 优先调用 adapter 的 button-based approval，例如 Discord `send_exec_approval`。
- 失败则发送文本说明 `/approve`、`/approve session`、`/approve always`、`/deny`。

agent turn 结束后：

```python
unregister_gateway_notify(_approval_session_key)
clear clarify session
reset_current_session_key(...)
```

这保证审批 prompt 不会跨 turn 泄漏。

---

## 14. Gateway tool progress

Gateway 支持 tool progress，但和 CLI spinner 不同：平台消息通常会持久保留，所以要更克制。

配置会解析 per-platform：

- `display.platforms.<platform>.tool_progress`
- global `display.tool_progress`
- env fallback `HERMES_TOOL_PROGRESS_MODE`

模式包括：

- off
- all
- new
- verbose

如果 adapter 不支持 `edit_message`，Gateway 会跳过 progress，避免每个工具进度都变成一条新聊天消息。

还有一些 UX 细节：

- Telegram 等可清理 progress bubble。
- progress edit 有 throttle，避免 flood control。
- 相同 progress line 会 dedup。
- 长工具首次超过阈值时可提示 `/verbose`。

---

## 15. Gateway slash command

Gateway 的 slash dispatch 在 `gateway/run.py` 中。

它会做：

- alias 解析。
- quick command expansion。
- per-platform slash access control。
- command hook。
- destructive slash confirm。
- built-in command handler。
- plugin slash command。
- skill slash command。
- unknown slash command 友好提示。

`gateway/slash_access.py` 支持每个平台/用户控制哪些 slash command 可用。plain chat 不受影响，只有 slash command gate。

destructive slash 如 `/new`、`/reset`、`/undo` 可以通过 slash-confirm 保护，避免误触导致 session 边界变化。

---

## 16. TUI 的进程模型

TUI 是 Node/Ink 前端 + Python backend：

```text
hermes --tui
  -> Node Ink UI
  -> stdio JSON-RPC
  -> Python tui_gateway
  -> AIAgent + tools + sessions
```

`ui-tui/src/app.tsx` 很薄，只组合：

- `GatewayProvider`
- `useMainApp(gw)`
- `AppLayout`

真正的状态和行为在 `ui-tui/src/app/*`、`gatewayClient`、Python `tui_gateway/server.py` 中。

---

## 17. TUI JSON-RPC stdout 保护

`tui_gateway/server.py` 有一个非常关键的工程细节：

```python
_real_stdout = sys.stdout
sys.stdout = sys.stderr
```

真实 stdout 只保留给 JSON-RPC。任何库或工具误 `print()` 到 stdout，都会被重定向到 stderr，避免污染 JSON-RPC 协议。

同时有 panic hook：

- 未捕获异常写入 `~/.hermes/logs/tui_gateway_crash.log`
- stderr 发一行摘要给 TUI activity

这解决了 headless subprocess 崩溃时“用户界面只看到断了，但没有诊断”的问题。

---

## 18. TUI RPC 长任务线程池

`tui_gateway/server.py` 将某些慢 RPC 放入线程池：

- `browser.manage`
- `cli.exec`
- `session.branch`
- `session.compress`
- `session.resume`
- `shell.exec`
- `skills.manage`
- `slash.exec`

原因：如果这些 handler 在 dispatcher 主循环里阻塞，`approval.respond`、`session.interrupt` 等快速 RPC 会卡在 stdin pipe 里读不到。

只有慢 handler 进 thread pool，快路径留在主线程，尽量保持顺序简单。

---

## 19. TUI session 创建与懒 DB row

TUI backend 有自己的 `_sessions` dict。session 创建后不立刻写 DB row，而是在第一次 `prompt.submit` 时：

```python
_ensure_session_db_row(session)
```

源码注释解释：如果用户只是打开 composer 又放弃，立即创建 DB row 会留下空的 Untitled session。

这就是“懒持久化”：有真实用户消息才持久化 session。

---

## 20. prompt.submit 路径

`@method("prompt.submit")` 的流程：

1. 找到 session。
2. 如果当前 session running，返回 `session busy`。
3. 可选 truncate 到某个 user ordinal 前。
4. 设置 `running=True`。
5. 记录 inflight turn。
6. 懒创建 DB row。
7. 启动 agent build。
8. 后台线程等 agent ready。
9. 调 `_run_prompt_submit(...)`。

`_run_prompt_submit(...)` 会：

- 复制当前 history 和 history_version。
- 处理 attached images。
- 设置 approval session key。
- 设置 session context。
- wire sudo/secret callbacks。
- 预处理 `@file` context references。
- 根据模型决定图片 native/text 路由。
- 通过 `stream_callback` 发送 `message.delta`。
- 调用 `agent.run_conversation(...)`。

---

## 21. TUI streaming

TUI 的 streaming callback：

```python
def _stream(delta):
    _append_inflight_delta(session, delta)
    payload = {"text": delta}
    if streamer and (r := streamer.feed(delta)) is not None:
        payload["rendered"] = r
    _emit("message.delta", sid, payload)
```

它一边保存 inflight delta，一边把渲染后的 markdown/diff 片段发给前端。

最终结果通过 `message.complete` 类事件收尾。若 history 在 turn 中被外部修改，`history_version` mismatch 会阻止 agent output 覆盖 session history，并通过 stderr/status 提醒用户。

这是防御性并发控制：UI 可见响应不等于一定写入历史。

---

## 22. TUI slash.exec 与 slash worker

TUI 的 slash 命令有两条路。

### 22.1 不走 slash worker 的命令

这些命令不能进 worker：

- skill slash commands。
- `_PENDING_INPUT_COMMANDS`。
- 会 mutate live state 的某些命令，如 snapshot restore。
- plugin command。

它们走 `command.dispatch` 或直接 plugin handler。

### 22.2 走 slash worker 的命令

普通 CLI slash 命令通过 `_SlashWorker`。

`_SlashWorker` 是一个持久 subprocess：

```text
python -m tui_gateway.slash_worker --session-key <session_key> --model <model>
```

它内部持有一个 HermesCLI，用于复用 classic CLI 的 slash command 实现。

原因：TUI 不想重写所有 classic CLI slash 行为，但又不能让 slash command 阻塞主 gateway。

---

## 23. command.dispatch

`command.dispatch` 是 TUI 后端提供的另一条命令路径，用于那些需要直接操作当前 live session 的命令。

典型场景：

- skill command 解析成 prompt。
- pending-input command 注入下一轮。
- session state mutation。
- worker 不安全命令 fallback。

AGENTS.md 中说 desktop app 也用 `tui_gateway` backend 走 JSON-RPC，所以 desktop 的 slash command palette 最终也会落到这些后端方法。

---

## 24. TUI 压缩后的 session re-anchor

压缩会让 `AIAgent._compress_context` 结束旧 SessionDB session，创建新 continuation session，并旋转 `agent.session_id`。

TUI backend 有自己的 `session["session_key"]`，用于：

- approval routing
- slash worker init
- DB title/history lookup
- yolo state

如果压缩后不更新，后续操作会继续指向已经结束的 parent session。

所以有 `_sync_session_key_after_compress(...)`：

```python
new_session_id = getattr(agent, "session_id", None)
old_key = session.get("session_key", "")
if new_session_id and new_session_id != old_key:
    session["session_key"] = new_session_id
```

它还会：

- unregister old approval notify。
- 迁移 yolo state。
- register new approval notify。
- 可选清 pending title。
- restart slash worker。

`prompt.submit` 路径在 `run_conversation()` 后调用它，确保自动压缩后的下一轮落到新 session。

---

## 25. TUI background process notification

TUI backend 有 notification poller 监听 `process_registry.completion_queue`。

多个 desktop/TUI session 共享同一进程级 queue，所以它会检查 event 的 `session_key`：

- 如果属于其他 live session，重新放回 queue。
- 如果属于当前 session，则发 `status.update`。
- 如果当前 session idle，可以自动链一个 agent turn 处理完成通知。

还会 dedup completion event，避免 busy session 反复重发同一通知。

这个设计解决“后台任务在 A session 启动，完成通知却出现在 B session”的问题。

---

## 26. Dashboard 嵌入 TUI

AGENTS.md 描述 dashboard `/chat`：

```text
browser xterm.js
  -> /api/pty websocket
  -> hermes_cli/pty_bridge.py
  -> spawn hermes --tui
  -> Node Ink + Python tui_gateway
```

WebSocket 传 PTY bytes，不是重写聊天协议。

resize 用特殊帧：

```text
\x1b[RESIZE:<cols>;<rows>]
```

server 拦截后用 `TIOCSWINSZ` 调整 PTY 大小。

这意味着 dashboard chat 的主体验和 terminal TUI 是同一个实现，修 Ink 就会同时影响 dashboard。

---

## 27. Desktop app 与 TUI 的区别

AGENTS.md 里说 desktop app 是独立 chat surface：

- Electron + React + nanostore。
- 使用 `@assistant-ui/react`。
- 不嵌入 `hermes --tui`。
- 通过 `tui_gateway` JSON-RPC backend 通信。

所以它和 dashboard embedded TUI 不同：

- dashboard `/chat` 是 PTY 里跑真实 TUI。
- desktop 是自己的 composer/transcript/slash palette。
- 两者共享 Python `tui_gateway` 能力，但前端层不同。

---

## 28. 工程上值得学习的细节

1. **Gateway 用 contextvars 而不是 env 保存当前 session**：避免并发消息互相覆盖。
2. **动态 session context 放 system prompt，但多用户字段避免频繁变化**：兼顾上下文准确和 prompt cache。
3. **平台能力说明必须由工具实际可用性决定**：防止模型虚构 Slack/Discord API。
4. **AIAgent 缓存 key 包含 auth/model/tool/user identity**：既保 prompt cache，又避免跨用户 memory attribution 错误。
5. **run_generation 防迟到结果污染新 session**：异步系统非常需要这种 ownership token。
6. **Gateway approval 是 sync agent thread 到 async platform 的桥**：button 优先，文本 fallback。
7. **TUI stdout 只给 JSON-RPC**：把 stray print 重定向到 stderr 是稳定协议的关键。
8. **慢 RPC 单独线程池**：避免 slash/session resume 阻塞 approval/interrupt。
9. **TUI slash worker 复用 classic CLI 行为**：减少两套 slash 实现漂移。
10. **压缩后必须 re-anchor session_key**：否则 approval、slash、history、title 都会指向旧 session。
11. **dashboard 不重写聊天面**：通过 PTY 嵌入真实 TUI，降低多 UI 行为分叉。

---

## 29. 一句话总结

Hermes 的多端架构把“平台接入”和“Agent 核心循环”分开：Gateway/TUI/desktop 负责 session、transport、权限、审批、媒体、流式和命令分发，最终都把规范化后的 message/history 送进 `AIAgent.run_conversation()`；为了长会话和多端一致性，系统额外维护 agent cache、run generation、session context prompt、slash worker，以及压缩后的 session re-anchor。
