# Tool System

本文解释 Hermes 的工具系统：工具如何注册、如何被组织成 toolset、如何按 session 过滤、如何暴露给模型，以及最终如何 dispatch。

核心源码：

- `tools/registry.py`
- `model_tools.py`
- `toolsets.py`
- `tools/*.py`
- `agent/agent_runtime_helpers.py`

## 核心思路

Hermes 把工具机制拆成四层：

1. 各工具文件把 schema 和 handler 注册到 `tools.registry.registry`。
2. `model_tools.py` 导入工具模块，触发注册副作用。
3. `toolsets.py` 决定哪些工具名属于哪些使用场景。
4. `model_tools.get_tool_definitions()` 根据当前 agent/session 过滤可用 schema。

这个分层很重要：一个工具可以存在于 registry 中，但不一定会暴露给模型。是否暴露由 toolset 解析和 availability check 决定。

## 工具注册

每个内置工具模块在 import 时调用：

```python
registry.register(...)
```

注册信息包括：

- `name`
- `toolset`
- OpenAI 风格的 `schema`
- `handler`
- 可选 `check_fn`
- 可选 `requires_env`
- 可选 `is_async`
- 可选展示元数据，例如 `emoji`
- 可选 `max_result_size_chars`
- 可选 `dynamic_schema_overrides`

所有 handler 预期返回 JSON 字符串。

## 内置工具发现

`discover_builtin_tools()` 会扫描 `tools/*.py`。

只有当一个模块的 AST 里包含顶层 `registry.register(...)` 表达式时，才会 import 这个模块。

排除文件包括：

- `__init__.py`
- `registry.py`
- `mcp_tool.py`

这样既避免手写 import 清单，也避免导入只包含 helper、不会注册工具的文件。

工具注册本质上依赖 import side effect。

## Registry 内部结构

`ToolRegistry` 维护：

- `_tools`：tool name 到 `ToolEntry` 的映射。
- `_toolset_checks`：toolset 名称到 availability check 的映射。
- `_toolset_aliases`：动态 toolset 的别名。
- `_generation`：mutation counter，用于 cache invalidation。
- `_lock`：可重入锁，用于线程安全的 mutation 和 snapshot。

`_generation` 会在这些情况下递增：

- register
- deregister
- register toolset alias

调用方可以把 `_generation` 放进 cache key，这样 MCP 或 plugin 工具变化时，schema cache 能自动失效。

## 防止意外覆盖

`registry.register()` 会拒绝意外 shadowing。

如果同名工具已经存在于另一个 toolset：

- MCP 覆盖 MCP 是允许的，因为 MCP server refresh 可能替换动态工具。
- `override=True` 表示插件有意替换。
- 其他情况会拒绝注册并记录 error。

这个设计防止插件或 MCP server 悄悄替换内置工具。

## Availability Check

工具可以带 `check_fn`。

`registry.get_definitions()` 只返回 check 通过的 schema。

check 结果会缓存大约 30 秒。这样不会在每次组装 schema 时反复探测 Docker、Modal、浏览器二进制、凭证等昂贵外部状态，同时又能让人类尺度的环境变化较快生效。

同一次 schema assembly pass 里还有 per-call check cache，多个工具共享同一个 check function 时不会重复探测。

## 动态 Schema 覆盖

有些工具 schema 依赖运行时配置。

`dynamic_schema_overrides` 允许工具提供一个无参 callable，在生成定义时把返回值合并进 schema。

典型场景：

- `delegate_task` 的描述需要包含当前 concurrency/depth 限制。
- 某些 schema 的可选项依赖 config。

这样配置变化后，模型看到的操作限制不会过期。

## Toolset

`toolsets.py` 定义命名工具组。

例子：

- `web`
- `browser`
- `file`
- `terminal`
- `memory`
- `skills`
- `research`
- platform-specific toolsets

`_HERMES_CORE_TOOLS` 是 CLI 和消息平台共享的默认工具列表。新增一个核心内置工具通常需要：

1. 创建一个会自注册的工具模块。
2. 把工具名加入合适的 toolset，通常是 `_HERMES_CORE_TOOLS`。

仅仅注册工具还不够。

## Toolset 解析

`resolve_toolset(name)` 会：

- 支持特殊别名 `all` 和 `*`。
- 通过 `visited` 防止循环引用。
- 递归解析被 include 的 toolset。
- 去重工具名。
- 支持插件注册的 toolset。
- 可以为平台插件自动生成 `hermes-<platform>` toolset。

`get_all_toolsets()` 会把静态 toolset 和 registry 里发现的插件 toolset 合并。

`validate_toolset()` 接受：

- 静态 toolset 名称。
- 插件 toolset 名称。
- registry alias。
- `all`。
- `*`。

## 构造模型可见的工具定义

`model_tools.get_tool_definitions()` 是主要的 schema assembly 函数。

输入包括：

- `enabled_toolsets`
- `disabled_toolsets`
- `quiet_mode`
- `skip_tool_search_assembly`

当提供 `enabled_toolsets` 时：

- Hermes 只解析这些 toolset。
- 如果设置了 `HERMES_KANBAN_TASK`，Kanban worker 会自动获得 `kanban` toolset。

当没有提供 `enabled_toolsets` 时：

- Hermes 从所有已知 toolset 开始。

然后在最后减去 `disabled_toolsets`。这个顺序很重要，因为一个 composite enabled toolset 可能包含用户明确禁用的 toolset。

最后，registry 根据 `check_fn` 过滤，返回 OpenAI 格式 schema：

```json
{"type": "function", "function": {...}}
```

## Schema Cache

`get_tool_definitions()` 会缓存 quiet-mode 结果。

cache key 包括：

- enabled toolsets
- disabled toolsets
- registry generation
- config 文件 mtime/size fingerprint
- 是否设置 `HERMES_KANBAN_TASK`
- 是否跳过 tool-search assembly

函数返回 shallow copy，避免某个 agent 修改本地工具列表时污染进程级 cache。

这对长时间运行的 gateway 进程很重要。

## 过滤后的 Schema 重建

availability filtering 之后，`model_tools` 会基于“实际可用工具名”重建部分 schema。

例如：`execute_code` 的描述应该只提到真正可用的 sandbox 工具。否则模型可能因为 schema 描述里出现了不可用工具名，而尝试在 sandbox 内调用它们。

这是一个可复用模式：生成的 schema 应该反映最终暴露给模型的工具面，而不是理论全集。

## Tool Search Bridge

`tool_search`、`tool_describe`、`tool_call` 组成延迟工具桥。

关键安全行为：

- catalog read 受当前 session 的 enabled/disabled toolsets 限制。
- `tool_call` 会 unwrap 到底层真实工具名。
- pre/post hooks 看到的是真实工具名。
- 受限 session 不能通过 bridge 调用越权工具。

这防止受限 subagent 或 gateway session 通过桥接工具逃逸，发现或调用完整进程 registry。

## Dispatch

`model_tools.handle_function_call()` 是主要 dispatcher。

流程：

1. 按 schema 声明把字符串参数转换成目标类型。
2. 内联处理 tool-search bridge 调用。
3. 拒绝必须由 agent loop 直接处理的工具。
4. 触发插件 `pre_tool_call` hook，除非之前已经触发。
5. 文件变更时执行 ACP/Zed edit approval。
6. 非 read 工具执行时通知 read-loop tracking。
7. 设置 approval/tool instrumentation 的 observability context。
8. 通过 `registry.dispatch()` 分发。
9. 触发 post-tool hook 并转换结果。

`registry.dispatch()` 负责 async bridging 和异常捕获，返回 JSON error，而不是把异常抛回 agent loop。

## Agent-Loop Tools

有些工具由 agent loop 截获，而不是走普通 registry dispatch。

例子：

- `memory`
- `todo`
- `session_search`
- `clarify`
- `delegate_task`

这些工具需要访问 agent-owned state，例如：

- memory store
- todo store
- session database
- delegation context
- clarification callbacks

所以它们在 `agent/agent_runtime_helpers.py` 里处理。这也解释了为什么 registry 能知道一个工具，但最终执行路径仍然可能走 agent-specific logic。

## 插件工具

普通插件可以通过 plugin context API 注册工具。注册后，插件工具和内置工具一样参与 registry/toolset resolution。

这是有意设计的：插件工具也会尊重 `enabled_toolsets` 和 `disabled_toolsets`。

## 工程经验

可复用模式：

- 让工具自注册，避免手工 import 表。
- 用源码扫描只导入真正注册工具的模块。
- 区分“已注册”和“已暴露”。
- 把 availability check 放在工具附近。
- 用短 TTL 缓存昂贵探测。
- 用 registry generation counter 做 cache invalidation。
- 拒绝意外工具 shadowing。
- 把 deferred tool bridge 限制在 session 已授权 toolset 内。
- 用实际可用工具面重建动态 schema。
- 把有状态 agent 工具交给 agent-owned dispatch path。
