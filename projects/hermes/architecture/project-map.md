# 项目地图

本文给出 Hermes Agent 的代码库级地图：请求从哪里进入，agent loop 在哪里，工具从哪里来，哪些目录负责主要子系统。

核心源码：

- `run_agent.py`
- `agent/conversation_loop.py`
- `agent/agent_init.py`
- `model_tools.py`
- `toolsets.py`
- `tools/registry.py`
- `cli.py`
- `hermes_cli/`
- `gateway/`
- `plugins/`

## 核心运行时

`run_agent.py` 暴露公开的 `AIAgent` 类，并保留许多兼容转发。庞大的 conversation body 已经抽到 `agent/conversation_loop.py`，但运行时仍然通过 `run_agent` 解析一些符号，这样旧测试和 monkey patch 还能继续生效。

重要的 `AIAgent` 入口：

- `chat(message)`：简单的一次性接口，返回最终字符串。
- `run_conversation(...)`：完整接口，返回 response data 和 message state。

conversation loop 负责：

- 恢复或构建 system prompt。
- 组装消息历史。
- 上下文压缩 preflight。
- 插件 pre-LLM hooks。
- 外部 memory prefetch。
- 模型 API 调用。
- 工具调用执行。
- retry / fallback。
- turn 后持久化。
- 外部 memory sync。
- 后台 memory / skill review。

这个 loop 是同步的。长耗时或慢系统通常把延迟移到后台线程，而不是把 loop 本身改成 async。

## Agent 初始化

`agent/agent_init.py` 负责把大多数运行时状态挂到 `AIAgent` 实例上。

关键初始化区域包括：

- tool definitions 和 valid tool names。
- context compressor。
- todo store。
- 内置 memory store。
- 外部 memory manager。
- active context engine。
- prompt cache state。
- model/provider/runtime settings。

agent 对象有意保持 stateful。抽出来的 helper module 通常把 `agent` 作为第一个参数，并直接读写其属性。

工程取舍是：这样能保留庞大既有 `AIAgent` 表面的兼容性，但也意味着 helper module 需要谨慎命名属性，并做好 defensive fallback。

## System Prompt

prompt 组装位于：

- `agent/system_prompt.py`
- `agent/prompt_builder.py`

system prompt 按这个结构构建：

```text
稳定身份和操作规则
项目上下文文件
易变 memory/session 元数据
```

最终字符串会缓存在 agent 上，通常只在上下文压缩 invalidates prompt cache 后重建。

详细设计见 `prompt-architecture.md`。

## 会话状态

短期会话状态是 OpenAI-style `messages` 列表：

```python
{"role": "system" | "user" | "assistant" | "tool", ...}
```

API 调用时会前置 system prompt。user 和 assistant turn 由更高层运行时逻辑持久化到 session database。

重要区别：

- 持久化 session history 保存真实对话。
- 每轮注入的上下文，例如外部 memory recall，只会加入 API request copy 的当前 user message，不会像用户输入一样持久化。

## 工具层

工具注册和分发拆在这些位置：

- `tools/registry.py`：中心自注册 registry。
- `model_tools.py`：工具发现、过滤、schema assembly、dispatch。
- `toolsets.py`：命名工具组。
- `agent/agent_runtime_helpers.py`：memory、todo 等 agent-loop tools。

每个工具 handler 应该返回 JSON 字符串。

详见 `tool-system.md`。

## 内置工具

大多数工具位于 `tools/*.py`。

发现规则基于源码：

- `tools/registry.py.discover_builtin_tools()` 扫描工具模块。
- 只有包含顶层 `registry.register(...)` 调用的模块才会被 import。
- import 模块时触发注册。

这样避免维护手写 import 列表，同时跳过不会注册工具的 helper 模块。

## Toolset

`toolsets.py` 把工具名组织成命名 toolset。

关键概念：注册一个工具不等于暴露给模型。它还必须通过解析后的 toolset 被包含。

共享的 `_HERMES_CORE_TOOLS` 列表定义 CLI 和消息平台 toolset 的基础默认工具。

toolset 可以：

- 直接列出工具。
- include 其他 toolset。
- 递归解析。
- 由插件通过 registry 提供。
- 为动态注册的 MCP server 使用 alias。

## CLI

`cli.py` 拥有经典交互式 CLI。它使用：

- Rich 显示 panel 和状态。
- prompt_toolkit 处理交互输入。
- `hermes_cli/commands.py` 中心 slash-command registry。
- `AIAgent` 执行真正对话。

CLI 还负责生命周期行为，例如 reset/new session 时提交 memory，以及退出时关闭 memory providers。

## TUI

TUI 位于：

- `ui-tui/`
- `tui_gateway/`

进程模型：

```text
Node Ink UI <-> stdio JSON-RPC <-> Python tui_gateway <-> AIAgent/tools
```

TypeScript 负责渲染和交互；Python 负责 sessions、tools、model calls 和 slash-command execution。

Dashboard 通过 PTY bridge 嵌入真正的 TUI，而不是在 React 里重写主聊天界面。

## Gateway

`gateway/` 包含消息平台集成。

关键思路：

- platform adapter 把 Telegram/Discord/Slack 等事件转换成 Hermes session events。
- gateway session 创建或复用 `AIAgent` 实例。
- 配置是 profile-aware 的。
- command handling 尽量共享中心 slash-command registry。
- gateway 模式必须小心 working directory，因为 daemon 的 cwd 可能和用户期望的工具 cwd 不同。

## Plugins

Hermes 有多个插件面：

- 普通插件：`plugins/<name>/`
- memory providers：`plugins/memory/<name>/`
- model providers：`plugins/model-providers/<name>/`
- context engines：`plugins/context_engine/<name>/`
- image generation providers：`plugins/image_gen/<name>/`

普通插件通过 `hermes_cli/plugins.py` 注册，可以添加工具、hooks 和 CLI subcommands。

Memory providers 使用单独的 `MemoryProvider` 接口，并通过 `config.memory.provider` 选择。

Model-provider 插件通过 `providers/` 和 `plugins/model-providers/` 走另一条发现路径；它们不会被普通 plugin manager 导入，避免重复注册。

## 持久状态

profile-aware 路径在整个项目里都很重要。

使用：

- `get_hermes_home()` 处理文件系统状态。
- `display_hermes_home()` 处理用户可见路径文本。

不要在新代码里硬编码 `Path.home() / ".hermes"`。

常见状态包括：

- `config.yaml`
- `.env`
- `logs/`
- `memories/`
- session SQLite database
- skills
- plugins
- cron data

## 工程主题

反复出现的模式：

- 构建稳定 prompt component 后缓存。
- 通过注册机制让工具发现保持声明式。
- 用 `check_fn` gate 运行时能力。
- 可选系统不可用时尽量 fail open。
- profile 路径显式且 profile-aware。
- 核心逻辑避免写死插件细节。
- 通过 forwarder 和 lazy import 保持兼容。
- 区分静态 system prompt 内容和 per-turn ephemeral context。
