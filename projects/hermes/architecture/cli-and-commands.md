# CLI 与 Slash Commands

本文解释 Hermes 的交互式 CLI、中心 slash-command registry，以及命令行为如何被 CLI、gateway 和 skill command 共享。

核心源码：

- `cli.py`
- `hermes_cli/commands.py`
- `agent/skill_commands.py`
- `gateway/run.py`
- `ui-tui/`
- `tui_gateway/`

## 主 CLI 对象

`cli.py` 定义 `HermesCLI`，也就是经典 prompt-toolkit CLI 编排器。

它负责：

- 启动时加载配置。
- 构造 agent。
- 交互式输入循环。
- slash command 分发。
- session id 和 conversation history。
- display skin/status 处理。
- model switching。
- tool enable/disable commands。
- memory/session 生命周期边界。
- shutdown 行为。

CLI 自己不实现模型循环。它创建 `AIAgent`，把真正的 turn 交给 agent runtime。

## CLI 构造 Agent

`HermesCLI` 会用当前 runtime settings 构建 `AIAgent`：

- model/provider/base URL/API mode。
- max turns。
- enabled 和 disabled toolsets。
- reasoning config。
- service tier。
- request overrides。
- session id。
- session database。
- clarify、reasoning、tool progress、tool start/complete、stream deltas 和 tool generation callbacks。
- 当 `--ignore-rules` 启用时传入 `skip_context_files` 和 `skip_memory`。

构造后，CLI 会把 active agent 存到模块级引用中，这样 `atexit` shutdown 可以 flush memory providers。

一个工程细节：CLI 会通过 prompt-toolkit aware printing 路由 agent status 输出，避免 ANSI 序列在交互式 TUI 中显示错乱。

## 中心命令注册表

Slash command 定义位于 `hermes_cli/commands.py`。

registry 是一组 `CommandDef`：

```python
CommandDef(
    name="background",
    description="Run a prompt in the background",
    category="Session",
    aliases=("bg", "btw"),
    args_hint="<prompt>",
)
```

字段含义：

- `name`：不带 slash 的规范命令名。
- `description`：用户可见 help 文本。
- `category`：help 分组。
- `aliases`：别名。
- `args_hint`：用法提示。
- `subcommands`：可 tab 补全的子命令。
- `cli_only`：对 gateway surface 隐藏。
- `gateway_only`：对 CLI surface 隐藏。
- `gateway_config_gate`：当某个 config key 为真时，让 normally CLI-only 的命令对 gateway 可见。

这个 registry 是这些能力的 single source of truth：

- CLI help。
- CLI autocomplete。
- gateway known commands。
- gateway help。
- Telegram BotCommands。
- Slack subcommand mapping。
- Discord command surfacing。
- alias resolution。

新增 alias 有意设计成一行改动：更新现有 `CommandDef` 的 `aliases` tuple。

## 派生查找表

`commands.py` import 时会构建：

- `_COMMAND_LOOKUP`：command 和 alias 到 `CommandDef`。
- `COMMANDS`：向后兼容的 `/command` 到 description 映射。
- `COMMANDS_BY_CATEGORY`：按类别分组的 help。
- `SUBCOMMANDS`：tab completion hints。
- `GATEWAY_KNOWN_COMMANDS`：gateway 识别的 command name 和 alias。

Gateway helper 包括：

- `is_gateway_known_command()`
- `should_bypass_active_session()`
- `gateway_help_lines()`
- gateway-visible command 的 config-gate resolution。

Gateway 的关键思想：已识别的 slash command 应该绕过 active agent queue。agent 正在运行时把命令文本排队，可能导致命令被安全逻辑丢弃，所以 gateway dispatch 会立即处理已识别命令，或返回 busy/catch-all 响应。

## CLI 命令分发

`HermesCLI.process_command()` 是主要 CLI dispatcher。

流程：

1. 只对 dispatch matching 做 lowercase。
2. 保留原始 command text，用于参数和显示。
3. 通过 `resolve_command()` 解析 alias。
4. 把 alias 转成 canonical command name。
5. 对无关命令清理过期的 `/resume` pending selection state。
6. 通过显式 `elif canonical == ...` 分支分发。
7. 最后再 fallback 到 quick commands、plugin commands、skill bundles、skill slash commands 和 prefix matching。

这种设计让命令元数据集中管理，同时命令行为仍然显式保留在 CLI 中。

## 破坏性命令

`/new`、`/clear`、`/undo` 这类命令在丢弃当前 conversation state 前会经过确认 helper。

`/new` 不只是清屏。它会：

- 如果有历史，先为上一 session 提交 memory。
- 触发 session-finalize hooks。
- 在 SQLite 中结束旧 session。
- 创建新 session id。
- 清空 conversation history。
- 重置 agent session state。
- 重置 todo store。
- 使缓存 system prompt 失效。
- 如果可以，创建新的 DB session row。
- 用 `on_session_switch(..., reset=True)` 通知 memory providers。
- 触发 session-reset hooks。

这就是为什么 session-changing commands 放在 CLI 逻辑中，而不是简单清空几个局部变量。

## 工具配置命令

`/tools` 支持：

- 无参数：显示当前工具列表。
- `list`：显示 enabled/disabled 状态。
- `disable <name...>`
- `enable <name...>`

修改工具配置后，CLI 会重新加载平台工具设置，并开启新 session。这样可以避免在对话中途改变 tool surface，导致缓存 system prompt 和工具 schema 与之前 turn 不一致。

## Skill Slash Commands

Skill command 由 `agent/skill_commands.py` 从已安装 skills 中扫描。

`scan_skill_commands()` 会：

- 扫描本地 `~/.hermes/skills/`。
- 扫描配置的外部 skill 目录。
- 跳过 `.git`、`.github`、`.hub`、`.archive`。
- 解析 skill frontmatter。
- 按 platform 和 runtime environment 过滤。
- 尊重 disabled skills。
- 把 command name 归一化成 hyphen-separated slug。
- 去掉下游平台不接受的字符。

像 `/gif-search` 这样的 skill command 不会变成 system prompt mutation。它会构造一个 user-message payload，让下一轮加载该 skill。这样可以保持 system prompt cache。

`/reload-skills` 会重新扫描 skill commands，但有意不让 skills system-prompt cache 失效。skill 仍然可以通过名字显式调用，而避免 prompt invalidation 能保留 prefix-cache 复用。

## Quick Commands 和 Plugin Commands

内置命令分发后，CLI 会检查：

- 用户定义的 `quick_commands`。
- 插件注册的 slash commands。
- skill bundles。
- skill slash commands。
- 唯一 prefix matches。

Quick command 类型：

- `exec`：运行用户在 config 中定义的 shell snippet。
- `alias`：重写为另一个 slash command。

quick command `exec` 使用 `shell=True` 是有意的，因为来源是用户配置，不是 LLM 生成内容。

Plugin command handler 通过 `hermes_cli.plugins` 解析。

## Prefix Matching

如果未知 command token 能唯一匹配某个已知 command、skill command 或 bundle 的前缀，CLI 会展开它并重新分发。

实现优先级：

- 精确匹配。
- 否则选择唯一最短匹配。

这样既减少输入成本，又避免歧义命令展开。

## Gateway 共享

Gateway command surface 来自同一个 command registry。这样 Telegram、Slack、Discord 和普通 gateway help 能与 CLI command metadata 保持同步。

需要区分：

- 一个命令可能出现在 registry 中。
- 它仍然可能是 `cli_only`、`gateway_only` 或 config-gated。
- 运行时 handler 仍然属于对应 surface，例如 `cli.py` 或 `gateway/run.py`。

## 与 TUI 的关系

Ink TUI 不是 Python CLI loop 的重写。

TUI 进程模型：

```text
Ink TypeScript UI <-> stdio JSON-RPC <-> Python tui_gateway <-> AIAgent
```

`/help`、`/quit`、`/clear`、`/resume`、`/copy`、`/paste` 这类 client-side commands 可以由 TUI 本地处理。其他 slash commands 会流向 gateway backend。

Dashboard 通过 PTY bridge 嵌入真正的 `hermes --tui`，所以主聊天行为属于 TUI，而不是另一个 React transcript。

## 工程经验

可复用模式：

- 命令元数据集中管理。
- help、autocomplete、gateway menus 都从同一个 registry 派生。
- 先解析 alias，再 dispatch。
- 命令行为保留在拥有该 runtime 的模块中。
- tool surface 变化时重置 session。
- 把 session reset 当作生命周期事件，而不是局部 clear。
- skill invocation 表示为 user-message payload，而不是改写 prompt。
- gateway commands 绕过 active agent queues。
- 对通常 CLI-only、但在 gateway 场景也有用的命令提供 config gate。
