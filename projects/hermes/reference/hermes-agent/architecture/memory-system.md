a.

Drift is detected when:

- Parsing and serializing with `ENTRY_DELIMITER` changes the bytes after
  stripping.
- A single parsed entry exceeds the target's whole-store character limit.

The second condition catches cases where someone appended large free-form text
through a shell, patch tool, manual edit, or another session.

When drift is detected:

- The raw file is backed up to `.bak.<timestamp>`.
- The mutation is refused.
- The tool response explains how to recover.

This prevents accidental data loss from a model rewriting a file whose shape is
no longer controlled by the memory tool.

## Memory Extraction

Built-in memory extraction is model-mediated, not embedding-based and not
purely rule-based.

There are two write paths:

- The main agent may call the `memory` tool directly during a conversation.
- A background review agent may inspect a completed conversation snapshot and
  call the `memory` tool if it finds durable facts.

The background prompt asks the review agent to look for:

- User persona, desires, preferences, and personal details.
- Expectations about agent behavior.
- Work style or operating preferences.

If nothing is worth saving, the review agent should say "Nothing to save." and
stop.

## Review Cadence

The main conversation loop tracks `_turns_since_memory`.

When:

- memory nudging is enabled,
- the `memory` tool is available,
- and the built-in memory store exists,

the counter increments on user turns. When it reaches
`_memory_nudge_interval`, a memory review is scheduled and the counter resets.

The default interval is initialized as 10 and can be read from
`config.memory.nudge_interval`.

When resuming sessions, Hermes hydrates the counter from prior user turns so a
fresh gateway-created agent does not forget the cadence.

## Session Search vs Memory

Memory is for critical facts that should always be in context.

Session search is for finding exact past conversation details.

The distinction is important:

- Memory is small and costs prompt tokens every session.
- Session search queries SQLite FTS on demand and returns actual messages.
- Memory should avoid task logs, PR numbers, commit SHAs, and stale details.
- Session search is better for "what did we discuss last week?" questions.

## External Memory Providers

External providers are additive. They do not replace built-in memory.

Configuration:

```yaml
memory:
  provider: honcho
```

Only one external provider can be active at a time. `MemoryManager` enforces
this to prevent tool-schema bloat and conflicting backends.

Provider discovery lives in `plugins/memory/__init__.py`.

It scans:

- bundled providers under `plugins/memory/<name>/`
- user-installed providers under `$HERMES_HOME/plugins/<name>/`

Bundled providers take precedence on name collisions.

## MemoryProvider Contract

`MemoryProvider` defines the lifecycle:

- `is_available()`: check local config/dependencies without network calls.
- `initialize(session_id, **kwargs)`: initialize session-scoped resources.
- `system_prompt_block()`: return static provider guidance for the system
  prompt.
- `prefetch(query, session_id="")`: return relevant context for the upcoming
  turn.
- `queue_prefetch(query, session_id="")`: warm recall for the next turn.
- `sync_turn(user_content, assistant_content, ...)`: persist a completed turn.
- `get_tool_schemas()`: expose provider-specific tools.
- `handle_tool_call()`: route provider tool calls.
- `shutdown()`: flush/close resources.

Optional hooks:

- `on_turn_start`
- `on_session_end`
- `on_session_switch`
- `on_pre_compress`
- `on_memory_write`
- `on_delegation`

Providers should use the injected `hermes_home` rather than hardcoding
`~/.hermes`.

## MemoryManager Responsibilities

`MemoryManager` handles:

- Registering at most one external provider.
- Building external provider static prompt blocks.
- Running prefetch across providers.
- Queueing next-turn prefetch.
- Syncing completed turns.
- Collecting provider tool schemas.
- Routing provider tool calls.
- Forwarding lifecycle hooks.
- Shielding the main agent from provider failures.

Most provider failures are logged and treated as non-fatal. A broken external
memory backend should not stop the user from receiving an answer.

## Turn-Level External Memory Flow

During a user turn:

1. The conversation loop calls `memory_manager.on_turn_start(...)`.
2. It calls `memory_manager.prefetch_all(original_user_message)`.
3. The prefetched context is wrapped in a `<memory-context>` block.
4. That block is appended to the current user message only for the API call.
5. The persistent `messages` list is not mutated with that injected context.
6. After a successful final response, `_sync_external_memory_for_turn()` calls
   `sync_all(...)`.
7. It then calls `queue_prefetch_all(...)` to warm the next turn.

Interrupted turns are not synced. A partial response or aborted tool chain is
not treated as durable conversational truth.

## Memory Context Fencing

External memory recall is wrapped with:

```xml
<memory-context>
[System note: The following is recalled memory context, NOT new user input. Treat as authoritative reference data ...]

...
</memory-context>
```

`sanitize_context()` strips any provider-supplied memory-context fences before
Hermes wraps the block itself.

There is also a streaming scrubber to prevent split `<memory-context>` spans
from leaking into visible output when model deltas arrive in chunks.

## Built-In Writes Mirrored to External Providers

When the built-in `memory` tool performs an `add` or `replace`, Hermes calls
`memory_manager.on_memory_write(...)` for external providers.

The manager skips a provider named `builtin`, then adapts to three possible hook
signatures:

- modern keyword metadata
- positional metadata
- legacy no-metadata

This keeps older provider plugins compatible while allowing newer provenance
metadata to flow through.

## Engineering Lessons

Reusable patterns:

- Keep short-term conversation state separate from long-term curated memory.
- Bound always-in-prompt memory aggressively.
- Preserve prompt-cache stability with frozen snapshots.
- Make memory writes immediate and durable, but avoid hot-updating the current
  system prompt.
- Use explicit delimiters for model-managed list files.
- Refuse writes when external edits make the file unsafe to round-trip.
- Mirror built-in writes to external providers, but keep provider failure
  best-effort.
- Treat interrupted turns as non-durable.
- Put external recall in per-turn context, not the cached system prompt.
- Fence internal context and scrub it