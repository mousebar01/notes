# ACP Adapter

本文记录 `acp_adapter/` 的实现。ACP 是 Agent Client Protocol，面向 Zed、VS Code、JetBrains 等编辑器集成。Hermes 的 ACP adapter 不是另写一个 agent，而是把现有 `AIAgent` 包装成 ACP stdio server：编辑器通过 ACP JSON-RPC 发 session/prompt/permission 请求，Hermes 在后台跑同步 agent loop，并把消息、思考、工具、计划、权限请求等转换成 ACP session updates。

## 1. 入口与 stdio 约束

入口有两个：

- `python -m acp_adapter`
- `hermes acp`
- `hermes-acp`

对应文件：

- `acp_adapter/__main__.py`
- `acp_adapter/entry.py`
- `hermes_cli/main.py` 里的 `acp` 子命令
- `pyproject.toml` 里的 console script：`hermes-acp = "acp_adapter.entry:main"`

`entry.py` 的第一条工程约束是：stdout 必须保留给 ACP JSON-RPC transport。所有日志都写 stderr：

```text
ACP stdio:
  stdout = protocol frames only
  stderr = logs / diagnostics
```

因此 `_setup_logging()` 清空 root handlers，只挂 stderr handler，并把 httpx/httpcore/openai 降到 warning。

另一个细节：`hermes_bootstrap` 必须尽早 import，用来在 Windows 上设置 UTF-8 stdio。如果处在半更新状态导致模块不存在，会优雅跳过，POSIX 不受影响。

## 2. 命令行辅助模式

`entry.py` 支持几个非 server 模式：

- `--version`：打印 Hermes version。
- `--check`：验证 `acp` dependency 和 adapter import。
- `--setup`：调用 Hermes 的交互式 model/provider setup。
- `--setup-browser`：通过 `hermes_cli.dep_ensure.ensure_dependency()` 安装 Node / browser tools。
- `--yes`：用于 browser setup 时自动确认。

这服务于 ACP registry / 编辑器首次安装体验：即使用户还没配置 provider，Hermes 也可以在认证阶段告诉客户端“打开终端跑 setup”。

## 3. 认证方法

`auth.py` 负责构造 ACP auth methods。

核心函数：

- `detect_provider()`
- `has_provider()`
- `build_auth_methods()`

`detect_provider()` 调 `resolve_runtime_provider()`，只要能解析出 provider 且 API key 可用，就认为已有 runtime credentials。这里还特意把 callable `api_key` 视为有效凭据，因为 Azure Foundry Entra ID bearer token provider 就可能是 callable，而不是字符串。

`build_auth_methods()` 的策略：

1. 如果已有 provider credentials，广告一个 `AuthMethodAgent(id=<provider>)`。
2. 总是广告一个 `TerminalAuthMethod(id="hermes-setup", args=["--setup"])`。

这样新机器上没有配置 Hermes 时，ACP client 也能看到至少一个可用 auth method，走终端 setup。

`server.authenticate()` 只接受 initialize 阶段广告过的 provider 或 `hermes-setup`。这不是强安全边界，因为 ACP 是本地 stdio 信任模型，但能避免 API 行为混乱。

## 4. 会话模型：一个 ACP session 对应一个 AIAgent

`session.py` 定义：

```python
@dataclass
class SessionState:
    session_id: str
    agent: Any
    cwd: str = "."
    model: str = ""
    history: List[Dict[str, Any]] = field(default_factory=list)
    cancel_event: Any = None
    is_running: bool = False
    queued_prompts: List[str] = field(default_factory=list)
    runtime_lock: Any = field(default_factory=Lock)
    current_prompt_text: str = ""
    interrupted_prompt_text: str = ""
```

`SessionManager` 同时维护：

- 内存态 `_sessions`
- 持久态 `~/.hermes/state.db`

持久化使用共享 `SessionDB`，source 写成 `acp`。这有几个效果：

- ACP 会话会出现在 `session_search`。
- ACP 进程重启后可以从 DB 恢复 history。
- `list_sessions()` 可以合并内存 session 和 DB-only session。
- 同一套搜索/自动标题/上下文压缩相关工具能复用。

创建 session 时：

1. 生成 UUID。
2. 创建 `AIAgent(platform="acp", enabled_toolsets=["hermes-acp"], quiet_mode=True, session_id=...)`。
3. 注册 task cwd override。
4. 持久化 session record。

恢复 session 时：

1. `db.get_session(session_id)`。
2. 只恢复 `source == "acp"` 的 session。
3. 从 `model_config` 中恢复 `cwd`、provider、base_url、api_mode。
4. 从 DB 读取 OpenAI-style conversation history。
5. 重新创建 AIAgent。
6. 注册 task cwd override。

## 5. 工作目录与 WSL 路径转换

ACP client 可能运行在 Windows 编辑器里，但 Hermes ACP 进程跑在 WSL。此时 client 传来的 cwd 可能是：

```text
E:\Projects\POTI
```

Hermes 工具在 WSL 内需要：

```text
/mnt/e/Projects/POTI
```

`session.py` 提供：

- `_win_path_to_wsl()`
- `_translate_acp_cwd()`
- `_normalize_cwd_for_compare()`
- `_register_task_cwd(task_id, cwd)`
- `_clear_task_cwd(task_id)`

`_register_task_cwd()` 调 `tools.terminal_tool.register_task_env_overrides(task_id, {"cwd": ...})`。这样 terminal/file 相关工具按 ACP session 的 cwd 执行，而不是按启动 Hermes 的目录。

## 6. ACP toolset

`toolsets.py` 里 `hermes-acp` 是编辑器集成专用工具集：

```text
web_search, web_extract
terminal, process
read_file, write_file, patch, search_files
vision_analyze
skills_list, skill_view, skill_manage
browser_*
todo, memory, session_search
execute_code, delegate_task
```

它刻意排除了 messaging、audio、clarify UI 等更适合 CLI/gateway 的能力。这里的思想是：ACP 是 coding/editor surface，所以默认暴露 coding-focused tools。

如果配置或 ACP client 提供 MCP servers，会扩展 toolsets：

```text
["hermes-acp", "mcp-<server-name>", ...]
```

## 7. MCP server 注册

`server._register_session_mcp_servers()` 支持 ACP session 请求中带 `mcp_servers`：

- `McpServerStdio`
- `McpServerHttp`
- `McpServerSse`

它会把 ACP schema 转成 Hermes `tools.mcp_tool.register_mcp_servers()` 的 config map，然后刷新当前 agent 的 tool surface：

1. 更新 `state.agent.enabled_toolsets`。
2. 调 `model_tools.get_tool_definitions()`。
3. 更新 `state.agent.tools`。
4. 更新 `state.agent.valid_tool_names`。
5. 调 `_invalidate_system_prompt()`，让下次请求重建 system prompt。

入口 `entry.py` 也会在 server 启动前先做一次 config.yaml 中 MCP discovery，避免 ACP 首次导入 model_tools 时阻塞 gateway event loop。

## 8. Initialize 响应

`HermesACPAgent.initialize()` 返回：

- protocol version
- agent info：`hermes-agent` + version
- capabilities：
  - `load_session=True`
  - prompt supports image
  - session supports fork/list/resume
- auth methods

它也读取 client_info，记录是哪个 client 初始化连接。

这意味着编辑器可以：

- 新建 session
- 加载已有 session
- 恢复 session
- fork session
- 列 session
- 发送图片 prompt
- 调 model/mode/config 相关 ACP 方法

## 9. Session lifecycle 方法

ACP server 实现的方法包括：

- `new_session(cwd, mcp_servers=None)`
- `load_session(cwd, session_id, mcp_servers=None)`
- `resume_session(cwd, session_id, mcp_servers=None)`
- `fork_session(cwd, session_id, mcp_servers=None)`
- `list_sessions(cursor=None, cwd=None)`
- `cancel(session_id)`

`load_session()` 和 `resume_session()` 有一个关键实现：会在响应返回前 `await _replay_session_history(state)`。

源码注释解释了原因：ACP spec 期望 `session/load` 在 request lifetime 内通过 `session/update` 把 prior conversation 发回客户端。Zed 等客户端会在等待 load response 之前注册 session-update routing，如果 replay 延后到 call_soon，某些客户端会错过同步通知。

因此 Hermes 的做法是：

```text
load/resume request
  -> restore state
  -> register MCP if any
  -> replay history as session/update notifications
  -> return response
```

replay 是 best-effort。某条消息形状异常不能让 load/resume 整体失败。

## 10. History replay

`_replay_session_history()` 会把持久化的 OpenAI-style history 转成 ACP updates：

- `role=user`：发送 `UserMessageChunk`
- `role=assistant`：
  - 先发送 reasoning/thought，如果存在 `reasoning_content` 或 `reasoning`
  - 再发送 assistant text
  - 如果有 `tool_calls`，重建 tool start
- `role=tool`：
  - 找到之前 active tool call 的 name/args
  - 发送 tool complete
  - 如果 tool 是 `todo`，额外发送 ACP native plan update

这个 replay 解决了两个层面：

- 服务器恢复 history，让 agent 有上下文。
- 客户端也看见历史 transcript，而不是空白编辑器线程。

## 11. Prompt 执行流程

`server.prompt()` 是核心方法。

整体流程：

1. 根据 `session_id` 找 `SessionState`。
2. 把 ACP content blocks 转成 Hermes/OpenAI user content。
3. 如果是 text-only slash command，先本地处理。
4. 如果 session 已在 running，普通 prompt 进入 `queued_prompts`，避免并发跑两个 AIAgent loop 写同一份 history。
5. 设置 `state.is_running = True` 和 `current_prompt_text`。
6. 构造 callbacks：tool progress、thinking/reasoning、step、message delta、approval、edit approval。
7. 设置 agent callbacks。
8. 在线程池里运行同步 `agent.run_conversation()`。
9. 更新 `state.history` 并持久化。
10. 自动标题，发送 `session_info_update`。
11. 如果 streaming 没发最终内容，或 response 被插件转换，再发送 final response。
12. 置 idle。
13. 依次 drain queued prompts。
14. 发送 usage update。
15. 返回 `PromptResponse(stop_reason, usage)`。

为什么用线程池：AIAgent 是同步 loop，而 ACP server 是 asyncio。`_executor = ThreadPoolExecutor(max_workers=4)` 允许最多几个 ACP session 并行运行。

## 12. Content blocks 转换

ACP prompt 支持多种 block：

- `TextContentBlock`
- `ImageContentBlock`
- `AudioContentBlock`
- `ResourceContentBlock`
- `EmbeddedResourceContentBlock`

Hermes 转换逻辑：

- 纯文本 prompt 保持字符串，兼容 slash 命令和 text-only provider。
- 图片 block 转成 OpenAI-style `{"type": "image_url", "image_url": {"url": ...}}`。
- resource link 如果是本地 file URI，会读取文件内容。
- image resource 会转 data URL，让 vision model 真能看见图片。
- 非图片文本资源内联为 `[Attached file: ...]`。
- 二进制资源会给 “binary omitted” 说明。
- 单个 resource 读取上限 `_MAX_ACP_RESOURCE_BYTES = 512 * 1024`。
- Windows file URI / drive path 会转成 WSL `/mnt/<drive>/...`。

这块的设计目的是让编辑器附件成为模型真正可见的上下文，而不只是 UI 里的一个链接。

## 13. Slash 命令

ACP 内建一组轻量 slash 命令：

- `/help`
- `/model`
- `/tools`
- `/context`
- `/reset`
- `/compact`
- `/steer`
- `/queue`
- `/version`

这些命令不会调用 LLM，而是在 `server._handle_slash_command()` 内同步处理，并通过 ACP update 返回文本。

几个细节：

- 未识别的 `/command` 返回 `None`，会作为普通消息发给模型。这样用户写路径或文本时不容易被误伤。
- slash 只在 text-only prompt 下处理。如果 prompt 同时带图片/资源，就整体交给 agent。
- `/compact` 会调用 agent 的 `_compress_context()`，但临时把 `agent._session_db = None`，避免 ACP session 被核心压缩逻辑拆分成新的 SQLite session id。ACP 需要稳定 session id。
- `/context` 用 `estimate_request_tokens_rough()` 估算 system prompt、history、tools 的真实请求压力。
- `/steer` 如果有 active turn，会调用 `agent.steer()`；否则排队。

## 14. Cancel 与 /steer salvage

`cancel(session_id)` 会：

1. 如果当前 running，把 `current_prompt_text` 保存到 `interrupted_prompt_text`。
2. 设置 `cancel_event`。
3. 如果 agent 有 `interrupt()`，调用它。

之后如果用户发 `/steer xxx`，且 session 已 idle，`prompt()` 有一个特殊 rewrite：

- 如果存在 `interrupted_prompt_text`，把原 prompt 与 steer guidance 合并成一个普通用户 prompt：

```text
<interrupted prompt>

User correction/guidance after interrupt: <steer text>
```

- 如果没有 interrupted prompt，就把 steer payload 当普通 prompt。

这个设计是为 Zed 交互修复的：用户可能先 cancel，再立刻 steer。如果不 salvage，原来的工作会丢，`/steer` 又没有 active turn 可注入。

## 15. Queued prompts

同一 ACP session 不允许并发跑两个 `AIAgent.run_conversation()`。如果用户在 running 时发普通 prompt：

- 进入 `state.queued_prompts`
- 立即返回一条 agent message：`Queued for the next turn.`
- 当前 turn 结束后，`prompt()` 用递归方式按 FIFO drain queue
- drain 时先发送 `update_user_message_text(next_prompt)`，再作为普通 prompt 跑

这保证 history 的 role alternation 和工具状态不会被并发写乱。

## 16. Agent callbacks 到 ACP updates

`events.py` 提供 callback factories：

- `make_tool_progress_cb()`
- `make_thinking_cb()`
- `make_step_cb()`
- `make_message_cb()`

AIAgent 在 worker thread 中运行，而 ACP connection 在 event loop thread，所以 `_send_update()` 用 `agent.async_utils.safe_schedule_threadsafe()` 把 coroutine 投回主 loop。

工具事件映射：

- `tool.started` -> `build_tool_start()`
- step callback 看到 prev_tools -> `build_tool_complete()`
- 同名并发工具用 `tool_call_ids[name]` 的 FIFO deque 来匹配 start/complete
- `todo` 完成后额外构造 `AgentPlanUpdate`

reasoning 映射：

- provider/model 的 reasoning delta -> `update_agent_thought_text()`
- 本地 kawaii waiting/status 不发给 ACP thought pane。否则编辑器里会出现假的 thinking。

message 映射：

- stream delta -> `update_agent_message_text(text)`
- 如果 provider 不 stream 或插件 transform 了 final response，prompt 结束后补发 final response。

## 17. Tool rendering

`tools.py` 负责把 Hermes tool call 变成 ACP tool call 内容。

主要能力：

- `TOOL_KIND_MAP`：把 Hermes tool name 映射到 ACP `ToolKind`，如 read/edit/search/execute/fetch/think。
- `build_tool_title()`：为 terminal、read_file、patch、web_search、delegate_task、session_search 等生成可读标题。
- `_tool_result_failed()`：保守判断工具是否失败。
- 各类 `_format_*_result()`：把 JSON 工具结果压缩成适合编辑器 UI 的 Markdown。
- `build_tool_start()`：构造 tool start/update。
- `build_tool_complete()`：构造 completion update，包含 status、content、raw_output。
- diff 工具可以输出 ACP `tool_diff_content()`。

一个重要 UI 策略：对 `_POLISHED_TOOLS`，ACP 会尽量展示结构化摘要，而不是把完整 JSON/raw output 塞给用户。比如 `skill_view` 只展示 skill 名称、文件、描述、章节，并说明完整内容已给 agent，但在 ACP UI 中隐藏。

## 18. Todo 转 ACP Plan

Hermes 有自己的 `todo` 工具；ACP/Zed 有 native plan UI。`events._build_plan_update_from_todo_result()` 会读取 todo 工具 JSON：

```json
{"todos": [{"content": "...", "status": "pending"}]}
```

转成：

```text
AgentPlanUpdate(session_update="plan", entries=[...])
```

状态映射：

- `pending` -> `pending`
- `in_progress` -> `in_progress`
- `completed` -> `completed`
- `cancelled` -> `completed`，但 content 前加 `[cancelled]`

这是一个“把内部工具状态提升成宿主原生 UI”的好例子。

## 19. 危险命令审批

`permissions.py` 把 Hermes dangerous-command approval 桥接到 ACP `request_permission()`。

流程：

1. AIAgent 工具层触发 approval callback。
2. ACP callback 构造一个 pending tool call，内容里显示 command/description。
3. 提供选项：
   - allow once
   - allow for session
   - allow always，可选
   - deny
   - deny always，如果当前 ACP SDK 支持
4. 等待 client outcome，默认 60 秒。
5. 映射回 Hermes approval 字符串：
   - `once`
   - `session`
   - `always`
   - `deny`
6. 超时或异常默认 deny。

server.prompt() 里有两个关键设置：

- approval callback 必须在 executor thread 内设置，因为 terminal tool 的 callback 是 thread-local。
- 设置 `HERMES_INTERACTIVE=1`，让 `tools.approval` 走交互式 callback 路径，而不是非交互自动 approve 分支。

源码注释明确提到这是为了避免 GHSA 相关的线程/审批绕过风险回归。

## 20. 编辑审批：write_file / patch 前置 diff

ACP 还有独立的 edit approval 机制，位于 `edit_approval.py`。

它不是通用 tool registry 的一部分，而是通过 ContextVar：

```python
_EDIT_APPROVAL_REQUESTER: ContextVar[EditApprovalRequester | None]
```

在 ACP agent run 内绑定。CLI、gateway 等路径不绑定，因而不受影响。

`model_tools.handle_function_call()` 在真正执行工具前调用：

```python
maybe_require_edit_approval(function_name, function_args)
```

如果当前 ContextVar 有 requester，且工具是 `write_file` 或 replace-mode `patch`：

1. 构造 `EditProposal`。
2. 读取 old_text。
3. 对 patch 用 `fuzzy_find_and_replace()` 预演 new_text。
4. 发 ACP permission request，内容是 `tool_diff_content(path, old_text, new_text)`。
5. 允许则继续执行工具。
6. 拒绝或超时则返回 JSON error，文件不修改。

auto-approve policy：

- `ask`：总是问。
- `workspace_session`：workspace 和 temp 下自动允许。
- `session`：本 session 内自动允许。

但敏感路径仍然不自动 approve：

- `.git`
- `.ssh`
- `.env`
- `.env.local`
- `.env.production`
- `id_rsa`
- `id_ed25519`

ACP modes 映射到 edit approval policy：

- `Default` -> `ask`
- `Accept Edits` -> `workspace_session`
- `Don't Ask` -> `session`

Zed 的 model picker 和 config UI 有位置冲突，所以 Hermes 把 edit policy 暴露为 ACP session modes，而不是 config options。

## 21. Session context 隔离

在 executor thread 运行 agent 时，server 做了几件隔离工作：

- `contextvars.copy_context()` 包住 `_run_agent()`，避免共享 ThreadPoolExecutor 中多个 ACP session 的 ContextVar 互相污染。
- 调 `gateway.session_context.set_session_vars(session_key=session_id)`，让 sudo password cache 等 per-session cache 绑定到 ACP session。
- 设置并最终恢复 `HERMES_SESSION_ID`，供 kanban 等工具给副作用打 session 标记。
- 设置并最终恢复 `HERMES_INTERACTIVE`。
- 设置并最终恢复 terminal tool approval callback。
- 设置并最终 reset ACP edit approval requester。

这个区块非常重要：ACP 虽然是单进程 server，但多个 editor session 可能并发跑，所有“看起来像全局”的状态都必须被作用域化并恢复。

## 22. Context usage 与 native indicator

`server._build_usage_update()` 会用 agent 的 context compressor metadata：

- `context_length`
- `estimate_request_tokens_rough(history, system_prompt, tools)`

构造 ACP `UsageUpdate(session_update="usage_update", size=..., used=...)`。

Zed 的圆形 context indicator 依赖这个 update。它估算的不是纯 transcript，而是接近真实 provider request 的压力：system prompt + history + tool schemas。

`/context` 命令也复用类似估算，告诉用户还差多少 token 到 compression threshold。

## 23. Model switching

ACP 支持 native model picker。Hermes 实现：

- `_build_model_state(state)`：基于当前 provider 的 curated models 构造 `SessionModelState`。
- `_encode_model_choice(provider, model)`：用 `provider:model` 保留 provider 上下文。
- `_resolve_model_selection(raw_model, current_provider)`：解析 provider/model，必要时自动检测 provider。
- `set_session_model(model_id, session_id)`：重建 AIAgent，并持久化。

如果 provider 变化，会丢弃旧 agent 的 base_url/api_mode，避免把旧 provider 的连接参数带到新 provider。

## 24. 持久化细节

`SessionManager._persist()`：

1. 如果 session 不存在，`db.create_session(source="acp", model=model_str, model_config={"cwd": cwd})`。
2. 如果存在，`db.update_session_meta()` 更新 cwd/model/provider/base_url/api_mode。
3. `db.replace_messages(session_id, state.history)` 原子替换消息。

注释提到：原子 replace 是为了避免中途失败导致半截 transcript 覆盖已有会话。

自动标题发生在 prompt 完成后：

- `agent.title_generator.maybe_auto_title()`
- 成功后通过 `SessionInfoUpdate(session_update="session_info_update", title=..., updated_at=now)` 通知 client。

## 25. 测试覆盖点

相关测试目录：

- `tests/acp_adapter/`
- `tests/acp/`
- `tests/tools/test_terminal_task_cwd.py`
- `tests/test_hermes_state.py` 中包含 source=`acp` 搜索覆盖

覆盖主题包括：

- ACP image/resource block 转 OpenAI multimodal content。
- ACP commands：steer、queue、drain。
- edit approval proposal、拒绝、异常、auto-approve。
- model/mode/config update。
- MCP e2e。
- provider detection under Azure Foundry Entra ID。
- terminal task cwd override。
- ACP registry release manifest version lockstep。

## 26. 值得学习的工程设计点

1. stdio 协议面要绝对干净：stdout 只给 JSON-RPC，日志走 stderr。
2. 同步 agent loop 可以通过线程池嵌进 async protocol server，但 callback 必须 thread-safe 投递回 event loop。
3. editor session id、tool cwd、approval callback、sudo cache、环境变量都要按 session 隔离。
4. 持久化到共享 SessionDB，让 ACP 会话自然进入搜索、历史和自动标题体系。
5. `load/resume` 不只恢复 server state，还要 replay transcript 给 client UI。
6. 编辑审批放在 tool execution 前，而不是执行后补救；diff 由 proposal 预演生成。
7. ACP modes 被用来表达 edit policy，避免挤占编辑器的 model picker。
8. todo 工具状态映射到 ACP native plan，是“内部工具状态适配宿主 UI”的典型桥接。
9. 多模态附件转换保持 text-only 快路径，只有真的有非文本内容时才转 structured content。
10. slash 命令只处理 text-only，未识别命令落回模型，避免协议层过度拦截用户意图。
