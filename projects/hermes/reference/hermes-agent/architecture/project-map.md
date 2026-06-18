# Project Map

This note gives a codebase-level map of Hermes Agent: where requests enter,
where the agent loop lives, where tools come from, and which directories own
major subsystems.

Primary source files:

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

## Core Runtime

`run_agent.py` exposes the public `AIAgent` class and keeps many compatibility
forwarders. The large conversation body has been extracted to
`agent/conversation_loop.py`, but the runtime still resolves several symbols
through `run_agent` so older tests and patches keep working.

Important `AIAgent` entrypoints:

- `chat(message)`: simple one-shot interface returning a final response string.
- `run_conversation(...)`: full interface returning response data and message
  state.

The conversation loop handles:

- system prompt restore/build
- message history assembly
- context compression preflight
- plugin pre-LLM hooks
- external memory prefetch
- model API calls
- tool-call execution
- retry/fallback logic
- post-turn persistence
- external memory sync
- background memory/skill review

The loop is synchronous. Long-running or slow subsystems usually move latency
into background threads rather than making the loop itself async.

## Agent Initialization

`agent/agent_init.py` is responsible for attaching most runtime state to the
`AIAgent` instance.

Key initialization areas:

- tool definitions and valid tool names
- context compressor
- todo store
- built-in memory store
- external memory manager
- active context engine
- prompt cache state
- model/provider/runtime settings

The agent object is intentionally stateful. Extracted helper modules usually
take `agent` as their first argument and read/write attributes directly.

Engineering tradeoff: this preserves compatibility with a very large existing
`AIAgent` surface, but it means helper modules need careful attribute naming and
defensive fallbacks.

## System Prompt

Prompt assembly lives in:

- `agent/system_prompt.py`
- `agent/prompt_builder.py`

The system prompt is built as:

```text
stable identity and operating rules
project context files
volatile memory/session metadata
```

The final string is cached on the agent for the session. It is normally rebuilt
only after context compression invalidates the prompt cache.

See `prompt-architecture.md` for the detailed prompt design.

## Conversation State

Short-term conversation state is the OpenAI-style `messages` list:

```python
{"role": "system" | "user" | "assistant" | "tool", ...}
```

The system prompt is prepended for API calls. User and assistant turns are
persisted to the session database by higher-level runtime logic.

Important distinction:

- Persistent session history stores the real conversation.
- Per-turn injected context, such as external memory recall, is added to the
  API request copy of the current user message and is not persisted as if the
  user typed it.

## Tool Layer

Tool registration and dispatch are split across:

- `tools/registry.py`: central self-registration registry.
- `model_tools.py`: tool discovery, filtering, schema assembly, dispatch.
- `toolsets.py`: named groups of tools.
- `agent/agent_runtime_helpers.py`: agent-loop tools such as memory and todo.

Every tool handler should return a JSON string.

See `tool-system.md` for details.

## Built-In Tools

Most tools live in `tools/*.py`.

The discovery rule is source-based:

- `tools/registry.py.discover_builtin_tools()` scans tool modules.
- A module is imported only if it contains a top-level `registry.register(...)`
  call.
- Importing the module performs registration.

This avoids maintaining a manual import list while skipping helper modules that
do not register tools.

## Toolsets

`toolsets.py` groups tool names into named toolsets.

Important concept: registering a tool is not enough to expose it to the model.
It must also be included through a resolved toolset.

The shared `_HERMES_CORE_TOOLS` list defines the base default tools for CLI and
messaging platform toolsets.

Toolsets can:

- list direct tools
- include other toolsets
- be resolved recursively
- be supplied by plugins through the registry
- use aliases for dynamically registered MCP servers

## CLI

`cli.py` owns the classic interactive CLI. It uses:

- Rich for panels and display
- prompt_toolkit for interactive input
- central slash-command registry in `hermes_cli/commands.py`
- `AIAgent` for actual conversation execution

The CLI also owns lifecycle behavior such as committing memory on reset/new
session and shutting down memory providers at exit.

## TUI

The TUI is under:

- `ui-tui/`
- `tui_gateway/`

The process model is:

```text
Node Ink UI <-> stdio JSON-RPC <-> Python tui_gateway <-> AIAgent/tools
```

TypeScript owns rendering and interaction. Python owns sessions, tools, model
calls, and slash-command execution.

The dashboard embeds the real TUI through a PTY bridge rather than rebuilding
the primary chat surface in React.

## Gateway

`gateway/` contains messaging platform integrations.

Key ideas:

- platform adapters translate Telegram/Discord/Slack/etc. events into Hermes
  session events
- gateway sessions create or reuse `AIAgent` instances
- config is profile-aware
- command handling shares the central slash-command registry where possible
- gateway mode must be careful about working directory because the daemon's cwd
  may differ from the user's intended tool cwd

## Plugins

There are several plugin surfaces:

- general plugins in `plugins/<name>/`
- memory providers in `plugins/memory/<name>/`
- model providers in `plugins/model-providers/<name>/`
- context engines in `plugins/context_engine/<name>/`
- image generation providers in `plugins/image_gen/<name>/`

General plugins register through `hermes_cli/plugins.py` and may add tools,
hooks, and CLI subcommands.

Memory providers use a separate `MemoryProvider` interface and are selected by
`config.memory.provider`.

Model-provider plugins use another discovery path under `providers/` and
`plugins/model-providers/`; they are intentionally not imported by the general
plugin manager to avoid double registration.

## Persistent State

Profile-aware paths are important throughout the project.

Use:

- `get_hermes_home()` for filesystem state
- `display_hermes_home()` for user-facing path text

Avoid hardcoding `Path.home() / ".hermes"` in new code.

Common state:

- `config.yaml`
- `.env`
- `logs/`
- `memories/`
- session SQLite database
- skills
- plugins
- cron data

## Engineering Themes

Patterns that appear repeatedly:

- build stable prompt components once and cache them
- keep tool discovery declarative through registration
- gate runtime capabilities with `check_fn`
- fail open when optional systems are unavailable
- keep profile paths explicit and profile-aware
- avoid plugin-specific hardcoding in core
- preserve compatibility through forwarders and lazy imports
- separate static system prompt content from per-turn ephemeral context
