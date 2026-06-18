# Subagent Delegation / `delegate_task` 机制

本文记录 Hermes Agent 内部的 subagent delegation 设计。它和 Kanban worker 都是“多 agent”，但语义不同：

- `delegate_task`: 当前父 agent 的一个同步工具调用。子 agent 是本轮对话的临时执行者，父 agent 等它们结束后拿 summaries 继续回答。
- Kanban worker: 面向持久任务队列的外部 worker 进程，可跨 turn、跨进程、跨时间运行。详见 `automation-cron-kanban.md`。

核心源码：

- `tools/delegate_tool.py`: `delegate_task` 工具、子 agent 构造、并发、深度、进度、结果汇总。
- `agent/tool_executor.py`: `delegate_task` 的工具分发入口和 UI spinner。
- `run_agent.py`: `AIAgent._dispatch_delegate_task()`、中断传播、active child cleanup。
- `tools/file_tools.py`: 子 agent 文件状态协调和 sibling write 检测。
- `tools/thread_context.py`: 工具 worker thread 的上下文传播。

## 1. 定位

`delegate_task` 是一个“当前 turn 内同步 fan-out”的工具：

```text
parent AIAgent
  -> tool call: delegate_task(...)
  -> build child AIAgent(s)
  -> run child agent(s)
  -> collect result summaries
  -> return JSON to parent
  -> parent synthesizes final answer
```

设计目标：

- 让父 agent 把推理重、上下文噪声大、可并行的任务分给临时子 agent。
- 子 agent 的中间工具调用和 reasoning 不进入父上下文，只把最终 summary 返回。
- 子 agent 默认没有父对话历史，必须通过 `goal` 和 `context` 显式传入所需信息。
- 子 agent 与父 agent 共享当前项目/会话必要能力，但受工具隔离和预算限制。

这不是后台任务系统。源码的 tool schema 明确提醒：`delegate_task` 在父 turn 内同步运行；如果父被 `/stop`、新消息或 `/new` 打断，子任务会被中断或丢弃。需要长期运行时应该用 cron 或 terminal background。

## 2. 工具 schema 和两种调用模式

`tools/delegate_tool.py` 注册 `delegate_task` 到 `delegation` toolset。参数包括：

- `goal`: 单个子任务目标。
- `context`: 子任务背景，必须自包含。
- `toolsets`: 给子 agent 的工具集。
- `tasks`: batch 模式，数组里每项可有自己的 `goal`、`context`、`toolsets`、`role`、ACP override。
- `role`: `leaf` 或 `orchestrator`。
- `acp_command` / `acp_args`: 子 agent 使用 ACP subprocess transport 的显式 override。

两种模式：

- Single: 提供 `goal`，直接创建一个子 agent。
- Batch: 提供 `tasks`，并行创建多个子 agent。

`DELEGATE_TASK_SCHEMA` 的描述不是固定文本。`dynamic_schema_overrides=_build_dynamic_schema_overrides` 会在每次 `get_definitions()` 时重写 description，让模型看到当前用户真实的：

- `delegation.max_concurrent_children`
- `delegation.max_spawn_depth`
- `delegation.orchestrator_enabled`

这个细节很重要：如果 schema 写死默认并发 3，用户把配置调到 8，模型仍可能自我限制。Hermes 选择动态 schema，把运行时配置反馈给模型。

## 3. 并发、深度和角色

### 并发上限

`_get_max_concurrent_children()` 读取：

1. `config.yaml` 的 `delegation.max_concurrent_children`
2. 环境变量 `DELEGATION_MAX_CONCURRENT_CHILDREN`
3. 默认值 3

只设 floor 1，没有硬 ceiling。超过 10 会 warning，因为每个子 agent 都独立消耗 API tokens。

`delegate_task()` 会在 batch 入口检查 `len(tasks) > max_children`，直接返回错误。`run_agent.py` 的 `_cap_delegate_task_calls()` 还会处理另一种情况：模型同一轮发出多个独立 `delegate_task` tool calls，总数超过并发上限时会截断多余 delegate calls，但保留非 delegate tool calls。

这是一层“schema 之外的硬约束”：即使模型绕过 schema 或 provider 缓存了旧 schema，运行时仍能兜住。

### 深度上限

`_get_max_spawn_depth()` 读取 `delegation.max_spawn_depth`，默认 `MAX_DEPTH = 1`。含义：

- depth 0: 父 agent。
- depth 1: 父创建的 child。
- `max_spawn_depth = N` 表示 depth `< N` 的 agent 能 spawn。

默认是 flat delegation：父可以创建孩子，孩子不能继续创建孙子。配置提高后，配合 `role="orchestrator"` 才能嵌套。

### `leaf` 和 `orchestrator`

`role` 控制子 agent 是否保留 `delegate_task`：

- `leaf`: 默认角色，不能继续 delegation。
- `orchestrator`: 在 `orchestrator_enabled=True` 且深度允许时，会重新加入 `delegation` toolset，使子 agent 能继续分解任务。

`_build_child_agent()` 是角色降级的唯一位置：

- 如果请求 `orchestrator`，但 kill switch 关闭，降级为 `leaf`。
- 如果当前 depth 已经到上限，降级为 `leaf`。
- 如果 role 是未知字符串，`_normalize_role()` warning 后转成 `leaf`。

这让规则集中、可预测。

## 4. 子 agent 的 prompt

`_build_child_system_prompt()` 为子 agent 构造临时 system prompt。它包含：

- 固定身份：“focused subagent working on a specific delegated task”。
- `YOUR TASK`: 目标。
- `CONTEXT`: 父 agent 显式传入的上下文。
- `WORKSPACE PATH`: 如果能解析到本地绝对工作目录。
- 输出要求：总结做了什么、发现/完成什么、修改了哪些文件、遇到哪些问题。
- workspace 规则：不要假设 repo 在 `/workspace/...`，没有明确路径就先发现。
- 如果是 orchestrator，额外加入何时继续 delegate、何时不要 delegate、深度上限说明。

注意：子 agent 构造时设置：

- `ephemeral_system_prompt=child_prompt`
- `skip_context_files=True`
- `skip_memory=True`
- `quiet_mode=True`
- `clarify_callback=None`

所以子 agent 不会自动加载父 agent 的上下文文件和记忆，也不能向用户澄清。父 agent 必须把语言、文件路径、错误信息、约束写进 `context`。tool schema 特别提醒：如果用户用中文/日文等语言，父 agent 要在 `context` 里告诉子 agent，否则子 summary 可能默认英文，污染最终回答。

## 5. 工具隔离

`DELEGATE_BLOCKED_TOOLS` 定义子 agent 永远不能用的工具：

- `delegate_task`: 防递归，除非 role 是 orchestrator 并且深度允许。
- `clarify`: 子 agent 不能直接问用户。
- `memory`: 子 agent 不能写共享 `MEMORY.md`。
- `send_message`: 子 agent 不能跨平台主动发消息，避免副作用失控。
- `execute_code`: 注释里说子 agent 应 step-by-step reasoning，不写脚本批量执行。

`_strip_blocked_tools()` 会移除包含 blocked tools 的 toolset，比如：

- `delegation`
- `clarify`
- `memory`
- `code_execution`

当父 agent 显式给 `toolsets` 时，子 agent 还要和父 agent 已启用工具集取交集。父没有的工具，孩子不能凭空获得。

特殊处理：

- 如果父启用了 composite toolset，例如 `hermes-cli`，`_expand_parent_toolsets()` 会展开成具体工具集，避免孩子请求 `web` 时被误判不在父工具集中。
- `inherit_mcp_toolsets` 默认 true，子 agent narrowed toolsets 时保留父的 MCP toolsets。
- orchestrator 角色会重新加入 `delegation` toolset，但仍不能用 `clarify`、`memory`、`send_message`、`execute_code`。

这是能力最小化原则：子 agent 获得完成任务所需能力，但不能越过父 agent 的权限边界。

## 6. 子 agent 的运行时配置继承

`_build_child_agent()` 创建新的 `AIAgent`，继承或重写这些配置：

- model/provider/base_url/api_key/api_mode
- max_tokens
- reasoning_config
- prefill_messages
- fallback_model
- platform
- session_db
- parent_session_id
- OpenRouter provider filters
- credential pool
- tool_progress_callback

### Delegation provider override

`_resolve_delegation_credentials()` 可通过 `delegation.provider` / model 配置让子 agent 走不同 provider/model。典型用法是父 agent 用强模型，子 agent 用便宜/快模型。

关键坑位：

- 如果子 provider 和父 provider 不同，不能继承父 `api_mode`，否则可能把 MiniMax/DeepSeek 等 provider 路由到错误 endpoint。
- 如果设置了 `delegation.provider`，子 agent 不能无条件继承父的 ACP transport，否则 override credentials 会被绕过。
- 如果明确传 `acp_command`，provider 会被设为 `copilot-acp`，api_mode 为 `chat_completions`。
- 父 agent 的 fallback chain 会继承给子 agent，子也能在 rate limit/credential exhaustion 时 fallback。

### Credential pool

`_resolve_child_credential_pool()` 尽量让子 agent 共享父 credential pool。`_run_single_child()` 会 `acquire_lease()`，并在子 agent 上 `_swap_credential()`，避免多个子 agent 全部挤同一个 key。

这对 batch delegation 很重要：并发子任务如果不租赁 credential，很容易同时撞 rate limit。

## 7. 运行与并发模型

子 agent 构造在主线程完成，实际运行分两种：

- 单任务：直接调用 `_run_single_child()`，没有 ThreadPoolExecutor 额外开销。
- 多任务：`ThreadPoolExecutor(max_workers=max_children)` 并行运行 `_run_single_child()`。

为什么构造要在主线程：

- `AIAgent()` 初始化会触发工具定义、全局 `model_tools._last_resolved_tool_names` 等状态。
- `delegate_task()` 在构造前保存父工具名，构造完再恢复，避免子 agent 初始化污染父工具解析状态。

batch 等待也不是简单 `as_completed()`：

- `as_completed()` 会一直阻塞到所有 future 完成。
- Hermes 用 `wait(..., timeout=0.5, return_when=FIRST_COMPLETED)` 轮询。
- 每轮检查父 agent 是否被 interrupt。
- 如果父已 interrupt，已完成的 child 取结果，未完成的 child 生成 `interrupted` 结果，不无限等待。

这是很好的中断友好型并发写法。

## 8. 子 agent 中断和 cleanup

父 agent 的 `interrupt()` 会传播到子 agent：

- `run_agent.py` 先给当前 agent 执行线程设置 interrupt。
- 再把 interrupt fan-out 到并发 tool worker threads。
- 然后遍历 `_active_children`，对每个 child 调 `child.interrupt(message)`。

`delegate_tool.py` 还有全局 active subagent registry：

- `_active_subagents`: `subagent_id -> record`
- `list_active_subagents()`: 给 TUI/Gateway 查询。
- `interrupt_subagent(subagent_id)`: 精准中断某个子 agent。
- `set_spawn_paused(paused)`: 暂停新的 delegation spawn，不影响已运行孩子。

`AIAgent.close()` 和 `release_for_cache_eviction()` 都会清理 active children：

- session 结束或 `/new` 时关闭子 agent。
- gateway agent cache eviction 时释放子 agent 的 clients/resources。

关键设计：Python 不能安全强杀 thread，所以 interrupt 是协作式的。子 agent 会在下一次 agent iteration/tool boundary 看到 interrupt；卡死的外部调用仍依赖 timeout。

## 9. Timeout、heartbeat 和诊断

子 agent 有 `delegation.child_timeout_seconds`，默认 600 秒，floor 30 秒。

`_run_single_child()` 里还有 heartbeat 机制：

- 子 agent 工作时定期 touch 父 agent activity。
- 这样 gateway 不会因为父 agent 正在等待 delegation 而误判“长时间无 activity”。
- stale heartbeat 分两种阈值：
  - idle between turns: 15 * 30s = 450s。
  - stuck in same tool: 40 * 30s = 1200s。
- hard cap 仍由 child timeout 控制。

如果子 agent timeout 且没有发起任何 API call，`_dump_subagent_timeout_diagnostic()` 会写专门诊断日志到 `~/.hermes/logs/subagent-timeout-<id>-<ts>.log`，包含：

- timeout 配置和实际耗时。
- goal 预览。
- child model/provider/api_mode/base_url/max_iterations/toolsets。
- prompt/schema 大小。
- activity summary。
- worker thread Python stack。

这专门解决“子 agent 0 API call 卡死，用户完全不知道发生了什么”的可观测性问题。

## 10. 进度回传和 UI

子 agent 的 progress callback 由 `_build_child_progress_callback()` 构造，兼容两种显示路径：

- CLI: 在父 agent delegation spinner 上方打印树状进度。
- Gateway/TUI: 通过父 `tool_progress_callback` 批量转发事件。

事件包括：

- `subagent.spawn_requested`
- `subagent.start`
- `subagent.thinking`
- `subagent.tool`
- `subagent.progress`
- `subagent.complete`

每个事件都携带身份字段：

- `subagent_id`
- `parent_id`
- `depth`
- `task_index`
- `task_count`
- `goal`
- `model`
- `toolsets`
- `tool_count`

TUI 可以用这些字段重建 subagent tree，并对单个 branch 做 kill/pause/status 控制。

工具事件会 batch：每 5 个工具名汇总一次，减少 gateway UI 噪声。完成时 `_flush()` 把剩余 batch 发出去。

## 11. 文件状态协调

子 agent 有自己的 task/session id：

- `_build_child_agent()` 生成 `subagent_id = sa-<idx>-<uuid>`。
- `_run_single_child()` 使用这个稳定 id 作为 child task id。

`tools/file_tools.py` 中有注释说明：subagent task ids 会参与文件工具状态协调，避免 sibling subagents 交错写同一文件时互相覆盖。

工程意义：

- 子 agent 有自己的文件读取/写入 cache。
- 父 agent 可以检测 sibling-subagent writes。
- 对同一路径的写操作需要锁，避免并行子 agent 把同一文件写坏。

这也是为什么 batch delegation 对代码修改类任务要谨慎：适合并行读/分析，多个 child 同时改同一文件风险很高。

## 12. 结果结构、记忆通知和成本汇总

`delegate_task()` 返回 JSON：

```json
{
  "results": [
    {
      "task_index": 0,
      "status": "completed",
      "summary": "...",
      "error": null,
      "api_calls": 3,
      "duration_seconds": 12.34
    }
  ],
  "total_duration_seconds": 12.5
}
```

父 agent 只看到这个 JSON，不看到子 agent 的完整 messages。

完成后还有几件事：

- 如果父 agent 有 memory manager，调用 `parent_agent._memory_manager.on_delegation(task, result, child_session_id)`。
- 触发 plugin hooks：`subagent_start` 和 `subagent_stop`。
- 汇总子 agent 成本到父 agent 的 `session_estimated_cost_usd`。
- nested delegation 的成本自然逐层 roll up。

工具 schema 强调：子 agent summary 是 self-report，不是事实证明。对外部副作用、远程写入、文件创建等，父 agent 应要求子 agent 返回可验证 handle，然后自己验证。

## 13. 子线程审批：默认 auto-deny

这是一个非常实际的工程坑。

CLI 的危险命令审批 callback 存在 `tools/terminal_tool.py` 的 thread-local。子 agent 在 `ThreadPoolExecutor` worker 里运行，不继承父线程的 interactive approval callback。

如果不处理，子线程里触发危险命令审批会 fallback 到 `input()`，而 stdin 被父 TUI/prompt_toolkit 持有，可能死锁。

Hermes 的处理：

- `ThreadPoolExecutor(initializer=_set_subagent_approval_cb, initargs=(cb,))` 给子 worker 安装非交互 callback。
- 默认 `delegation.subagent_auto_approve=false`，使用 `_subagent_auto_deny()`。
- 如果用户显式配置 `delegation.subagent_auto_approve=true`，使用 `_subagent_auto_approve()`，返回 `once`。
- 两者都会 `logger.warning`，留下审计线索。

这体现了一个原则：子 agent 不应该从后台线程直接抢用户输入。默认拒绝比默认卡死安全。

## 14. 和 Kanban Worker 的区别

| 维度 | `delegate_task` | Kanban worker |
|---|---|---|
| 生命周期 | 父 turn 内同步 | 持久任务队列 |
| 运行位置 | 父进程内 child `AIAgent` | 独立 Hermes worker 进程 |
| 父是否等待 | 等待所有 child 完成 | dispatcher/board 管理，不阻塞同一 turn |
| 上下文 | 只通过 goal/context | worker context 由 Kanban DB 构造 |
| 中断 | 父 interrupt 会传给 child | worker 有 claim/heartbeat/stale/crash 机制 |
| 结果 | JSON summaries 回父 agent | task summary/handoff 写入 Kanban DB |
| 适用场景 | 并行分析、局部调研、短期推理 | 长任务、多人/多 worker、可恢复任务 |

如果任务必须跨越当前对话 turn、需要重启恢复、需要 dashboard 追踪，应该用 Kanban，不应该用 `delegate_task`。

## 15. 值得学习的工程细节

### 1. 子 agent 默认无记忆、无上下文文件

这减少 prompt 污染和 token 成本，也避免孩子读到不必要的人格/长期记忆。但代价是父 agent 必须传好 context。这个设计强迫任务边界清晰。

### 2. 动态 schema 让模型看到真实配置

并发和深度不是写死在 prompt，而是每次 tool definitions 生成时动态覆盖。这是“prompt 与运行时配置一致”的好例子。

### 3. 两层并发限制

`delegate_task()` 限制单个 batch 的 `tasks` 数量；`run_agent.py` 还限制同一轮多个 `delegate_task` tool calls。模型不可靠时，运行时必须多层防线。

### 4. 子线程不能交互审批

Thread-local callback 不会自动跨线程。Hermes 显式在 worker initializer 安装 auto-deny/auto-approve callback，避免 TUI stdin deadlock。

### 5. 进度事件带身份

`subagent_id`、`parent_id`、`depth` 让 UI 能重建树，而不是只能显示“某个子任务调用了工具”。这是为可控多 agent 做的基础设施。

### 6. 中断是协作式传播

父 interrupt 不只是设置父线程标记，还传播到 tool worker threads 和 active children。否则一个卡住的子 agent 会让父无法停止。

### 7. Provider override 不能继承错误 transport

子 agent 换 provider 时必须重新推导 `api_mode`，并且不能不小心继承父 ACP command。这类 bug 很隐蔽，因为它只在“父子 provider 不同”时出现。

### 8. Summary 必须被验证

源码 schema 明确说 subagent summaries 是 self-reports。父 agent 不能把“我已经上传成功”当事实，应该验证 URL、文件、HTTP status 或 read-back 内容。

## 16. 阅读源码路线

建议这样看：

1. `tools/delegate_tool.py` 顶部：blocked tools、approval callback、active subagent registry。
2. `_build_top_level_description()` 和 `DELEGATE_TASK_SCHEMA`: 看模型如何被告知使用边界。
3. `delegate_task()`: 看任务规范化、并发限制、子 agent 构造、batch poll。
4. `_build_child_agent()`: 看 prompt、toolset、provider、credential、progress callback 如何组装。
5. `_run_single_child()`: 看 timeout、heartbeat、registry、文件状态、结果结构。
6. `agent/tool_executor.py` 的 `delegate_task` 分支：看父 agent 工具调用如何进入 delegation。
7. `run_agent.py` 的 interrupt/close/release 逻辑：看 child 生命周期如何被父 agent 管理。

这一块最值得学的是：多 agent 不是简单开几个线程跑 LLM，而是要同时处理能力隔离、上下文边界、中断、审批、成本、UI 可观测性和结果可信度。
