# Prompt Architecture

This note explains how Hermes Agent builds its system prompt and why the prompt
is split into stable identity rules, project context, and volatile session data.

Primary source files:

- `agent/system_prompt.py`
- `agent/prompt_builder.py`
- `hermes_cli/default_soul.py`

## High-Level Shape

`agent.system_prompt.build_system_prompt_parts()` returns three ordered blocks:

- `stable`: identity, tool guidance, skills index, model-specific operating
  guidance, environment hints, profile hints, and platform hints.
- `context`: caller-provided `system_message` and project context files such as
  `.hermes.md`, `AGENTS.md`, `CLAUDE.md`, and `.cursorrules`.
- `volatile`: built-in memory snapshot, user profile snapshot, external memory
  provider static block, timestamp, session id, model, and provider.

`build_system_prompt()` joins them in this order:

```text
stable

context

volatile
```

This is cache-friendly: stable content appears first, then session-stable
project context, then content that can vary per session.

Important invariant: the full system prompt is built once per `AIAgent` session
and cached on `agent._cached_system_prompt`. Hermes does not re-render parts of
the prompt every turn because that would destroy provider prompt-cache reuse.

## Stable Tier

The stable tier answers: "Who is the agent, and what are its durable operating
rules?"

The first slot is identity:

- Hermes tries `load_soul_md()` first.
- If `SOUL.md` is missing or empty, it falls back to
  `DEFAULT_AGENT_IDENTITY`.

The default identity text is:

```text
You are Hermes Agent, an intelligent AI assistant created by Nous Research. You are helpful, knowledgeable, and direct. You assist users with a wide range of tasks including answering questions, writing and editing code, analyzing information, creative work, and executing actions via your tools. You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful over being verbose unless otherwise directed below. Be targeted and efficient in your exploration and investigations.
```

Engineering details worth noticing:

- `SOUL.md` is treated as the identity slot, not as ordinary project context.
  This keeps user/persona customization separate from repository-specific
  instructions.
- If `SOUL.md` was already loaded into the stable tier, context loading receives
  `skip_soul=True` so it is not injected twice.
- The identity slot has a safe fallback, so first-run or damaged-profile cases
  still get a coherent prompt.
- `load_soul_md()` calls the same context threat scanner used for project
  files. A poisoned `SOUL.md` is replaced with a blocked placeholder rather than
  injected verbatim.

After identity, stable guidance is appended conditionally.

Always or broadly included:

- Hermes docs/help guidance.
- Task-completion guidance when tools are available and the config enables it.
- Environment hints.
- Active profile hint.
- Platform hints.

Tool-conditioned guidance:

- `MEMORY_GUIDANCE` only appears when the `memory` tool is available.
- `SESSION_SEARCH_GUIDANCE` only appears when `session_search` is available.
- `SKILLS_GUIDANCE` only appears when `skill_manage` is available.
- Kanban guidance appears only when the Kanban tool surface is present.
- Computer-use guidance appears only when `computer_use` is present.

Model-conditioned guidance:

- Tool-use enforcement can be forced, disabled, or auto-selected by model name.
- Gemini/Gemma get Google-family operational guidance.
- GPT/Codex/Grok get OpenAI-style execution discipline guidance.
- Alibaba gets an explicit model identity workaround because that backend may
  return a misleading model name.

This pattern is useful: the system prompt describes capabilities only when the
agent actually has them. That reduces prompt noise and avoids asking the model
to follow behaviors that are impossible in the current toolset.

## Project Context Tier

The context tier answers: "What local rules apply in this workspace?"

`build_context_files_prompt()` discovers project context in priority order:

1. `.hermes.md` or `HERMES.md`
2. `AGENTS.md` or `agents.md`
3. `CLAUDE.md` or `claude.md`
4. `.cursorrules` or `.cursor/rules/*.mdc`

The first source found wins. Hermes intentionally loads one project context
type rather than merging every possible rule file.

Why that matters:

- It reduces conflicting instructions from parallel ecosystems.
- It limits system prompt growth.
- It makes prompt provenance easier to reason about.

Discovery scopes differ:

- `.hermes.md` / `HERMES.md` are searched from the current directory upward to
  the git root. These are treated as Hermes-native project-level rules.
- `AGENTS.md`, `CLAUDE.md`, and `.cursorrules` are loaded from the current
  working directory only. This avoids accidentally importing unrelated rules
  from parent directories.
- `.cursor/rules/*.mdc` files are sorted and concatenated only when the
  `.cursorrules` family wins.

Each loaded file is rendered with a source heading such as:

```markdown
## AGENTS.md

...
```

The final context block starts with:

```markdown
# Project Context

The following project context files have been loaded and should be followed:
```

## Context Safety

Project context files are powerful because they enter the system prompt. Hermes
therefore treats them as untrusted input.

Before injection, context content passes through `_scan_context_content()`,
which uses shared threat patterns from `tools/threat_patterns.py`.

If a file matches prompt-injection or promptware patterns:

- The original content is not injected.
- A placeholder is injected instead:

```text
[BLOCKED: <filename> contained potential prompt injection (...). Content not loaded.]
```

This is an important agent-engineering pattern: repository-local Markdown should
not automatically be trusted just because it is local.

## Context Truncation

Each context source is capped at `CONTEXT_FILE_MAX_CHARS`, currently 20,000
characters.

The truncation strategy preserves:

- 70 percent from the head
- 20 percent from the tail
- a marker in the middle explaining what was removed

This is better than pure prefix truncation because rule files often put global
policy at the top and exceptions or operational notes near the bottom.

## Volatile Tier

The volatile tier currently includes:

- Built-in `MEMORY.md` snapshot if memory is enabled.
- Built-in `USER.md` snapshot if user profile memory is enabled.
- External memory provider static system prompt block, if configured.
- Date-only timestamp.
- Optional session id.
- Model and provider identifiers.

The timestamp intentionally uses date precision instead of minute precision.
Minute-level timestamps would make otherwise identical prompts differ every
time the prompt is rebuilt, reducing prompt-cache reuse.

## Per-Turn Injection Is Separate

External memory recall and plugin-provided per-turn context do not rewrite the
cached system prompt. They are injected into the current user message at API
call time.

This preserves the cached system prompt while still letting the agent see
turn-relevant information.

## Design Lessons

Key engineering ideas worth reusing:

- Separate identity from project context.
- Give identity a fallback.
- Avoid duplicate injection when a file can be loaded through multiple paths.
- Load project context conservatively, with a clear priority order.
- Scan prompt-bound local files for injection.
- Truncate with head/tail preservation and an explicit marker.
- Add tool guidance only when the tool actually exists.
- Put volatile data late in the prompt.
- Keep per-turn retrieval out of the cached system prompt.
