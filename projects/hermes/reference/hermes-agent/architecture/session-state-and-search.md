# Session State and Search

This note explains Hermes' SQLite session store, system prompt persistence,
history search, and resume behavior.

Primary source files:

- `hermes_state.py`
- `tools/session_search_tool.py`
- `agent/conversation_loop.py`
- `cli.py`

## Purpose

`hermes_state.py` replaces per-session JSONL storage with a SQLite database.

It stores:

- session metadata
- full message history
- model configuration
- system prompt snapshot
- token and cost counters
- title and cwd metadata
- parent/child session links for compression and branching

Batch runner and RL trajectories are not stored here; they have separate
systems.

## Database Location

Default path:

```text
$HERMES_HOME/state.db
```

The path is profile-aware through `get_hermes_home()`.

## Core Tables

`sessions` stores one row per session.

Important columns:

- `id`
- `source`
- `user_id`
- `model`
- `model_config`
- `system_prompt`
- `parent_session_id`
- `started_at`
- `ended_at`
- `end_reason`
- token counters
- cost fields
- `cwd`
- `title`
- handoff fields
- `rewind_count`
- `archived`

`messages` stores OpenAI-style conversation records.

Important columns:

- `id`
- `session_id`
- `role`
- `content`
- `tool_call_id`
- `tool_calls`
- `tool_name`
- `timestamp`
- token count
- finish reason
- reasoning fields
- platform message id
- `observed`
- `active`

`compression_locks` coordinates compression work across processes.

`state_meta` stores schema/version metadata.

## WAL Mode and Fallback

Hermes tries to use SQLite WAL mode because the gateway and multiple profiles
can create concurrent readers and writers.

Some filesystems do not support WAL reliably:

- NFS
- SMB/CIFS
- some FUSE mounts
- WSL1-like setups

If `PRAGMA journal_mode=WAL` raises known locking errors, Hermes falls back to
`journal_mode=DELETE`.

This preserves functionality at the cost of lower concurrency.

The warning is deduplicated per database label so repeated short-lived
connections do not flood logs.

## Write Contention Strategy

`SessionDB` uses:

- short SQLite timeout
- `BEGIN IMMEDIATE`
- application-level retry
- randomized 20-150ms jitter
- periodic WAL checkpoints

This avoids long deterministic SQLite busy waits and helps stagger competing
writers across CLI, gateway, dashboard, and worktree agents.

## Schema Migration

`SCHEMA_VERSION` tracks the current schema.

Schema init does more than execute `CREATE TABLE IF NOT EXISTS`:

- reconciles missing columns on old databases
- repairs FTS triggers
- creates deferred indexes after columns exist
- backfills FTS indexes when schema changes require it
- handles runtimes where FTS5 is unavailable

The code treats FTS availability as optional. Message storage should keep
working even when full-text search cannot be initialized.

## FTS Search

Hermes uses FTS5 over message content plus tool metadata:

```text
content + tool_name + tool_calls
```

Triggers keep FTS tables updated on insert, delete, and update.

There are two FTS tables:

- `messages_fts`: normal unicode tokenizer.
- `messages_fts_trigram`: trigram tokenizer for CJK and substring search.

The trigram table exists because standard tokenization can split CJK text into
unhelpful single-character tokens.

## System Prompt Persistence

The system prompt is persisted in `sessions.system_prompt`.

This is critical for gateway behavior. Gateway often constructs a fresh
`AIAgent` per message, so the agent cannot rely on in-process prompt cache
between turns.

`agent.conversation_loop._restore_or_build_system_prompt()` handles this.

State distinction:

- `missing`: no session row yet; legitimate first turn.
- `null`: session row exists but `system_prompt` is NULL.
- `empty`: session row exists but prompt is an empty string.
- `present`: usable prompt exists and is reused verbatim.

If a stored prompt is present, Hermes reuses it exactly. This keeps provider
prefix caches valid across turns.

If the prompt is missing, null, or empty, Hermes rebuilds it and attempts to
persist the rebuilt prompt. Failures log warnings because persistent write
failure means future turns will keep missing the prompt cache.

## Resume and Compression Chains

Compression can split a session into a descendant session. The original session
may become a parent in a chain while the descendant holds the current
transcript.

When resuming, the CLI calls `resolve_resume_session_id()` so a request for an
old compressed head can resume the descendant with actual messages.

This prevents the user from resuming an apparently valid session id that has no
current transcript because it was compressed forward.

## Titles

Session titles are sanitized by `SessionDB.sanitize_title()`.

The CLI handles two cases:

- If the session row exists, `/title` writes immediately.
- If no row exists yet, title is queued and applied after the first message
  creates the DB session.

The CLI checks title uniqueness early so feedback is immediate.

## Session Search Tool

`session_search` is the agent-facing recall tool over SQLite history.

It has no explicit `mode` parameter. Mode is inferred from arguments.

Modes:

- Discovery: pass `query`.
- Scroll: pass `session_id` and `around_message_id`.
- Browse: pass no args.
- Read: pass `session_id` for whole-session bounded read behavior.

All modes return actual database messages. There is no LLM summarization path.

## Discovery Mode

Discovery mode:

- runs FTS5
- deduplicates hits by session lineage
- returns top sessions
- includes an FTS-highlighted snippet
- includes a window around the anchor message
- includes session bookends from the start and end

Bookends help a hit from the middle of a long session carry enough context to
understand what the session was about.

## Scroll Mode

Scroll mode takes:

- `session_id`
- `around_message_id`
- `window`

It returns messages around the anchor id. To scroll, the model anchors on the
first or last returned message id and calls again.

There is no FTS and no bookend expansion in scroll mode.

## Browse Mode

Browse mode lists recent sessions chronologically with:

- title
- preview
- timestamps
- source
- message count

Hidden session sources such as `tool` are excluded by default so integration
sessions do not clutter user-facing history.

## Cross-Profile Reads

`session_search` can resolve profile-qualified session references.

It can open another profile's `state.db` read-only. Read-only mode skips schema
initialization and DDL, which avoids taking write locks against another live
profile.

If a bare session id is passed without profile information, the tool can scan
profile databases read-only to locate the owning profile.

## Memory vs Session Search

Session search is the source of truth for historical conversation detail.

Built-in memory is small and curated. Session search is broad and factual.

Use memory for durable high-value facts. Use session search for exact past
discussion, historical tool results, and details that should not live in every
future prompt.

## Engineering Lessons

Reusable patterns:

- persist the system prompt to recover prefix cache across fresh agent objects
- distinguish missing/null/empty stored prompt states for debugging
- use SQLite FTS for zero-LLM historical recall
- keep search responses grounded in real messages
- make read-only cross-profile DB access avoid write locks
- resolve compressed session chains during resume
- fall back from WAL on incompatible filesystems
- use jittered application-level write retry for shared SQLite databases
