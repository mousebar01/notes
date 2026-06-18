# CLI and Slash Commands

This note explains the interactive CLI, the central slash-command registry, and
how command behavior is shared with gateway and skill command surfaces.

Primary source files:

- `cli.py`
- `hermes_cli/commands.py`
- `agent/skill_commands.py`
- `gateway/run.py`
- `ui-tui/`
- `tui_gateway/`

## Main CLI Object

`cli.py` defines `HermesCLI`, the classic prompt-toolkit CLI orchestrator.

It owns:

- startup configuration loading
- agent construction
- interactive input loop
- slash command dispatch
- session id and conversation history
- display skin/status handling
- model switching
- tool enable/disable commands
- memory/session lifecycle boundaries
- shutdown behavior

The CLI does not implement the model loop itself. It creates an `AIAgent` and
delegates actual turns to the agent runtime.

## Agent Construction From CLI

`HermesCLI` builds `AIAgent` with the current runtime settings:

- model/provider/base URL/API mode
- max turns
- enabled and disabled toolsets
- reasoning config
- service tier
- request overrides
- session id
- session database
- callbacks for clarify, reasoning, tool progress, tool start/complete, stream
  deltas, and tool generation
- `skip_context_files` and `skip_memory` when `--ignore-rules` is active

After construction, the CLI stores the active agent in a module-level reference
so `atexit` shutdown can flush memory providers.

Engineering detail: the CLI routes agent status output through prompt-toolkit
aware printing so ANSI sequences are not garbled inside the interactive TUI.

## Central Command Registry

Slash command definitions live in `hermes_cli/commands.py`.

The registry is a list of `CommandDef` objects:

```python
CommandDef(
    name="background",
    description="Run a prompt in the background",
    category="Session",
    aliases=("bg", "btw"),
    args_hint="<prompt>",
)
```

Fields:

- `name`: canonical command without slash.
- `description`: user-facing help text.
- `category`: help grouping.
- `aliases`: alternative names.
- `args_hint`: usage hint.
- `subcommands`: tab-completable subcommands.
- `cli_only`: hidden from gateway surfaces.
- `gateway_only`: hidden from CLI surfaces.
- `gateway_config_gate`: makes a CLI-only command available to gateway when a
  config key is truthy.

This registry is the single source of truth for:

- CLI help
- CLI autocomplete
- gateway known commands
- gateway help
- Telegram BotCommands
- Slack subcommand mapping
- Discord command surfacing
- alias resolution

Adding an alias is intentionally one-line: update the `aliases` tuple on the
existing `CommandDef`.

## Derived Lookups

At import time, `commands.py` builds:

- `_COMMAND_LOOKUP`: command and alias to `CommandDef`.
- `COMMANDS`: backwards-compatible `/command` to description mapping.
- `COMMANDS_BY_CATEGORY`: grouped help mapping.
- `SUBCOMMANDS`: tab completion hints.
- `GATEWAY_KNOWN_COMMANDS`: all gateway-recognized command names and aliases.

Gateway helpers include:

- `is_gateway_known_command()`
- `should_bypass_active_session()`
- `gateway_help_lines()`
- config-gate resolution for gateway-visible commands

The key gateway idea: recognized slash commands should bypass the active agent
queue. Queueing a command while the agent is running can lead to command text
being discarded by safety logic, so gateway dispatch handles recognized slash
commands immediately or returns a busy/catch-all response.

## CLI Command Dispatch

`HermesCLI.process_command()` is the main CLI dispatcher.

Flow:

1. Lowercase only for dispatch matching.
2. Preserve original command text for arguments and display.
3. Resolve aliases through `resolve_command()`.
4. Convert alias to canonical command name.
5. Clear stale pending `/resume` selection state for unrelated commands.
6. Dispatch through explicit `elif canonical == ...` branches.
7. Fall back to quick commands, plugin commands, skill bundles, skill slash
   commands, and prefix matching.

This design keeps command metadata centralized while command behavior remains
explicit in the CLI.

## Destructive Commands

Commands such as `/new`, `/clear`, and `/undo` run through confirmation helpers
before discarding current conversation state.

`/new` is not just a display reset. It:

- commits memory for the previous session when there is history
- fires session-finalize hooks
- ends the old session in SQLite
- creates a fresh session id
- clears conversation history
- resets agent session state
- resets todo store
- invalidates the cached system prompt
- creates a new DB session row when possible
- notifies memory providers with `on_session_switch(..., reset=True)`
- fires session-reset hooks

That lifecycle work is why session-changing commands live in CLI logic instead
of being simple aliases for clearing local variables.

## Tool Configuration Commands

`/tools` supports:

- no args: show current tool list
- `list`: show enabled/disabled state
- `disable <name...>`
- `enable <name...>`

After changing tool configuration, the CLI reloads platform tool settings and
starts a new session. This avoids mutating the tool surface mid-conversation,
which would make the cached system prompt and tool schemas disagree with prior
turns.

## Skill Slash Commands

Skill commands are scanned from installed skills by `agent/skill_commands.py`.

`scan_skill_commands()`:

- scans local `~/.hermes/skills/`
- scans configured external skill directories
- skips `.git`, `.github`, `.hub`, and `.archive`
- parses skill frontmatter
- filters by platform and runtime environment
- respects disabled skills
- normalizes command names to hyphen-separated slugs
- strips characters invalid for downstream platforms

A skill command such as `/gif-search` does not become a system prompt mutation.
It builds a user-message payload that loads the skill for the next turn. This
preserves system prompt caching.

`/reload-skills` rescans skill commands but intentionally does not invalidate
the skills system-prompt cache. Skills can still be invoked explicitly by name,
and avoiding prompt invalidation preserves prefix-cache reuse.

## Quick Commands and Plugin Commands

After built-in command dispatch, the CLI checks:

- user-defined `quick_commands`
- plugin-registered slash commands
- skill bundles
- skill slash commands
- unique prefix matches

Quick command types:

- `exec`: runs a user-defined shell snippet from config
- `alias`: rewrites to another slash command

The use of `shell=True` for quick command `exec` is intentional because the
source is user config, not LLM-generated content.

Plugin command handlers are resolved via `hermes_cli.plugins`.

## Prefix Matching

If an unknown command token uniquely prefixes a known command, skill command, or
bundle, the CLI expands it and redispatches.

The implementation prefers:

- exact matches
- otherwise a unique shortest match

This reduces friction while avoiding ambiguous command expansion.

## Gateway Sharing

Gateway command surfaces derive from the same command registry. This keeps
Telegram, Slack, Discord, and plain gateway help in sync with CLI command
metadata.

Important distinction:

- A command may appear in the registry.
- It may still be `cli_only`, `gateway_only`, or config-gated.
- Runtime handlers still live in the appropriate surface, such as `cli.py` or
  `gateway/run.py`.

## TUI Relationship

The Ink TUI is not a rewrite of the Python CLI loop.

The TUI process model is:

```text
Ink TypeScript UI <-> stdio JSON-RPC <-> Python tui_gateway <-> AIAgent
```

Client-side commands such as `/help`, `/quit`, `/clear`, `/resume`, `/copy`,
and `/paste` can be handled locally by the TUI. Other slash commands flow to
the gateway backend.

The dashboard embeds the real `hermes --tui` through a PTY bridge, so the
primary chat behavior belongs to the TUI, not to a separate React transcript.

## Engineering Lessons

Reusable patterns:

- keep command metadata centralized
- derive help, autocomplete, and gateway menus from one registry
- resolve aliases before dispatch
- keep command behavior explicit in the owning runtime
- reset sessions when tool surfaces change
- treat session reset as a lifecycle event, not a local clear
- expose skill invocations as user-message payloads rather than prompt rewrites
- let gateway commands bypass active agent queues
- include config gates for commands that are normally CLI-only but optionally
  useful in gateway contexts
