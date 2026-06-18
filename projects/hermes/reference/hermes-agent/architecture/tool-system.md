# Tool System

This note explains how Hermes tools are registered, grouped into toolsets,
filtered for a session, exposed to the model, and dispatched.

Primary source files:

- `tools/registry.py`
- `model_tools.py`
- `toolsets.py`
- `tools/*.py`
- `agent/agent_runtime_helpers.py`

## Core Idea

Hermes separates tool mechanics into four layers:

1. Tool files register schemas and handlers with `tools.registry.registry`.
2. `model_tools.py` imports tool modules to trigger registration.
3. `toolsets.py` decides which registered tool names belong to each scenario.
4. `model_tools.get_tool_definitions()` filters available schemas for the
   current agent/session.

This separation matters because a tool can exist in the registry without being
exposed to the model. Exposure is controlled by toolset resolution and
availability checks.

## Registration

Each built-in tool module calls `registry.register(...)` at module import time.

Registration includes:

- `name`
- `toolset`
- OpenAI-style `schema`
- `handler`
- optional `check_fn`
- optional `requires_env`
- optional `is_async`
- optional display metadata such as `emoji`
- optional `max_result_size_chars`
- optional `dynamic_schema_overrides`

All handlers are expected to return a JSON string.

## Built-In Discovery

`discover_builtin_tools()` scans `tools/*.py`.

A module is imported only if its AST contains a top-level
`registry.register(...)` expression.

Excluded files include:

- `__init__.py`
- `registry.py`
- `mcp_tool.py`

This design avoids a manual import list and avoids importing helper-only files
that do not register tools.

Import side effect is the registration mechanism.

## Registry Internals

`ToolRegistry` stores:

- `_tools`: tool name to `ToolEntry`
- `_toolset_checks`: toolset name to availability check
- `_toolset_aliases`: aliases for dynamic toolsets
- `_generation`: mutation counter for cache invalidation
- `_lock`: reentrant lock for thread-safe mutation and snapshots

`_generation` increments on:

- register
- deregister
- register toolset alias

Callers can include `_generation` in cache keys to invalidate schema caches
when MCP or plugin tools change.

## Shadowing Protection

`registry.register()` rejects accidental shadowing.

If a tool name already exists under a different toolset:

- MCP-to-MCP overwrite is allowed, because MCP server refreshes can replace
  dynamic tools.
- `override=True` allows an intentional plugin replacement.
- otherwise registration is rejected and logged as an error.

This prevents a plugin or MCP server from silently replacing a built-in tool.

## Availability Checks

A tool can have a `check_fn`.

`registry.get_definitions()` only returns schemas whose checks pass.

Check results are cached for roughly 30 seconds. This avoids repeatedly probing
expensive external state such as Docker, Modal, browser binaries, or credentials
while still allowing human-scale environment changes to propagate soon.

There is also a per-call check cache so multiple tools sharing a check function
do not repeat the same probe during one schema assembly pass.

## Dynamic Schema Overrides

Some tool schemas depend on runtime config.

`dynamic_schema_overrides` lets a tool provide a zero-argument callable whose
result is merged into the schema at definition time.

Example use cases:

- `delegate_task` descriptions that mention current concurrency/depth limits.
- schemas whose allowed options depend on config.

This keeps the model from seeing stale operational limits after config changes.

## Toolsets

`toolsets.py` defines named groups of tools.

Examples:

- `web`
- `browser`
- `file`
- `terminal`
- `memory`
- `skills`
- `research`
- platform-specific toolsets

`_HERMES_CORE_TOOLS` is the shared default list used by CLI and messaging
platforms. Adding a core built-in tool generally requires:

1. Creating a tool module that registers itself.
2. Adding the tool name to an appropriate toolset, often `_HERMES_CORE_TOOLS`.

Registration alone is not enough.

## Toolset Resolution

`resolve_toolset(name)`:

- supports the special aliases `all` and `*`
- prevents cycles through a `visited` set
- recursively resolves included toolsets
- deduplicates tool names
- supports plugin-registered toolsets
- can auto-generate `hermes-<platform>` toolsets for platform plugins

`get_all_toolsets()` merges static toolsets with plugin toolsets discovered from
the registry.

`validate_toolset()` accepts:

- static toolset names
- plugin toolset names
- registry aliases
- `all`
- `*`

## Building Model Tool Definitions

`model_tools.get_tool_definitions()` is the main schema assembly function.

Inputs:

- `enabled_toolsets`
- `disabled_toolsets`
- `quiet_mode`
- `skip_tool_search_assembly`

When `enabled_toolsets` is provided:

- Hermes resolves only those toolsets.
- Kanban workers automatically receive the `kanban` toolset when
  `HERMES_KANBAN_TASK` is set.

When `enabled_toolsets` is not provided:

- Hermes starts from all known toolsets.

Then `disabled_toolsets` are subtracted at the end. This is important because a
composite enabled toolset may include a toolset the user explicitly disabled.

Finally, the registry filters by `check_fn` and returns OpenAI-format schemas:

```json
{"type": "function", "function": {...}}
```

## Schema Cache

`get_tool_definitions()` caches quiet-mode results.

The cache key includes:

- enabled toolsets
- disabled toolsets
- registry generation
- config file mtime/size fingerprint
- whether `HERMES_KANBAN_TASK` is set
- whether tool-search assembly is skipped

The function returns shallow copies so later mutation of an agent's local tool
list does not poison the process-wide cache.

This matters for long-lived gateway processes.

## Post-Filtering Schema Rebuilds

After availability filtering, `model_tools` rebuilds some schemas using the
actually available tool names.

Example: `execute_code` should mention only sandbox tools that are really
available. Without this, the model may try to call unavailable tools from inside
the sandbox because the schema description told it they existed.

This is a good pattern: generated schemas should reflect the final exposed tool
surface, not the theoretical full catalog.

## Tool Search Bridge

`tool_search`, `tool_describe`, and `tool_call` form a deferred tool bridge.

Important safety behavior:

- catalog reads are scoped to the session's enabled/disabled toolsets
- `tool_call` unwraps to the underlying tool name
- pre/post hooks see the real tool name
- a restricted session cannot invoke an out-of-scope tool through the bridge

This prevents a limited subagent or gateway session from discovering the full
process registry through a bridge escape hatch.

## Dispatch

`model_tools.handle_function_call()` is the main dispatcher.

Flow:

1. Coerce string arguments to schema-declared types.
2. Handle tool-search bridge calls inline.
3. Reject tools that must be handled directly by the agent loop.
4. Fire plugin `pre_tool_call` hooks unless already fired.
5. Run ACP/Zed edit approval for file mutations when applicable.
6. Notify read-loop tracking when non-read tools execute.
7. Set observability context for approval/tool instrumentation.
8. Dispatch through `registry.dispatch()`.
9. Emit post-tool hooks and transform results.

`registry.dispatch()` handles async bridging and catches exceptions, returning
JSON errors rather than raising into the agent loop.

## Agent-Loop Tools

Some tools are intercepted by the agent loop instead of normal registry
dispatch.

Examples include:

- `memory`
- `todo`
- `session_search`
- `clarify`
- `delegate_task`

The code path in `agent/agent_runtime_helpers.py` handles these because they
need access to agent-owned state such as:

- memory store
- todo store
- session database
- delegation context
- clarification callbacks

This is why the registry can know about a tool while the final execution path
still goes through agent-specific logic.

## Plugin Tools

General plugins can register tools via plugin context APIs. Once registered,
plugin tools participate in the same registry/toolset resolution path as
built-ins.

This is deliberate: plugin tools respect `enabled_toolsets` and
`disabled_toolsets` like any other tool.

## Engineering Lessons

Reusable patterns:

- self-register tools to avoid manual import tables
- use source scanning to import only modules that register tools
- keep "registered" separate from "exposed"
- put availability checks close to the tool
- cache expensive availability probes with a short TTL
- use registry generation counters for cache invalidation
- reject accidental tool shadowing
- scope deferred tool bridges to the session's granted toolsets
- rebuild dynamic schemas from the actual available tool surface
- route stateful agent tools through agent-owned dispatch paths
