# Prompt 架构

本文解释 Hermes Agent 如何构建 system prompt，以及为什么要把 prompt 拆成稳定身份规则、项目上下文和易变 session 数据。

核心源码：

- `agent/system_prompt.py`
- `agent/prompt_builder.py`
- `hermes_cli/default_soul.py`

## 总体结构

`agent.system_prompt.build_system_prompt_parts()` 返回三个有顺序的区块：

- `stable`：身份、工具指导、skills index、模型相关操作指导、环境提示、profile 提示和平台提示。
- `context`：调用方提供的 `system_message`，以及 `.hermes.md`、`AGENTS.md`、`CLAUDE.md`、`.cursorrules` 等项目上下文文件。
- `volatile`：内置 memory 快照、用户 profile 快照、外部 memory provider 静态块、日期、session id、model 和 provider。

`build_system_prompt()` 按这个顺序拼接：

```text
stable

context

volatile
```

这个顺序对 prompt cache 友好：稳定内容在最前面，然后是 session 内基本稳定的项目上下文，最后才是每个 session 可能变化的内容。

一个重要不变量是：完整 system prompt 在每个 `AIAgent` session 内构建一次，并缓存在 `agent._cached_system_prompt`。Hermes 不会每轮重新渲染 prompt 的各个部分，因为那会破坏 provider 的 prompt cache 复用。

## Stable 层

stable 层回答的是：“这个 agent 是谁？它有哪些长期稳定的操作规则？”

第一个位置是 identity：

- Hermes 优先尝试 `load_soul_md()`。
- 如果 `SOUL.md` 缺失或为空，回退到 `DEFAULT_AGENT_IDENTITY`。

默认 identity 文本大意是：

```text
你是 Hermes Agent，由 Nous Research 创建的智能 AI 助手。你有帮助、知识丰富、表达直接。你可以回答问题、写代码、编辑代码、分析信息、做创意工作，并通过工具执行行动。你应该清楚沟通，在不确定时承认不确定，优先真正有用，而不是无谓冗长。
```

值得注意的工程细节：

- `SOUL.md` 被当作 identity slot，而不是普通项目上下文。这让用户/persona 定制和仓库规则分开。
- 如果 `SOUL.md` 已经进入 stable 层，context loading 会收到 `skip_soul=True`，避免重复注入。
- identity slot 有安全 fallback，所以首次运行或 profile 损坏时仍然有可用 prompt。
- `load_soul_md()` 会调用和项目上下文相同的威胁扫描器。被污染的 `SOUL.md` 会被替换成 blocked placeholder，而不是原样注入。

identity 之后，会按条件追加 stable guidance。

通常会包含：

- Hermes docs/help guidance。
- 当工具可用且配置启用时的任务完成指导。
- 环境提示。
- 当前 profile 提示。
- 平台提示。

和工具相关的 guidance 只在工具可用时出现：

- `MEMORY_GUIDANCE` 只在 `memory` 工具可用时出现。
- `SESSION_SEARCH_GUIDANCE` 只在 `session_search` 可用时出现。
- `SKILLS_GUIDANCE` 只在 `skill_manage` 可用时出现。
- Kanban guidance 只在 Kanban 工具面存在时出现。
- Computer-use guidance 只在 `computer_use` 存在时出现。

和模型相关的 guidance 会根据模型族调整：

- tool-use enforcement 可以强制、禁用或根据模型名自动选择。
- Gemini/Gemma 使用 Google-family 操作指导。
- GPT/Codex/Grok 使用 OpenAI-style 执行纪律指导。
- Alibaba 有显式模型身份 workaround，因为后端可能返回误导性的模型名。

这个模式很值得复用：system prompt 只描述当前 agent 真正拥有的能力。这样能减少 prompt 噪声，也避免要求模型遵守当前 toolset 无法支持的行为。

## Project Context 层

context 层回答的是：“这个 workspace 里有哪些本地规则？”

`build_context_files_prompt()` 按优先级发现项目上下文：

1. `.hermes.md` 或 `HERMES.md`
2. `AGENTS.md` 或 `agents.md`
3. `CLAUDE.md` 或 `claude.md`
4. `.cursorrules` 或 `.cursor/rules/*.mdc`

找到的第一个来源获胜。Hermes 有意只加载一种项目上下文类型，而不是把所有规则文件都合并。

这样做的好处：

- 减少不同生态规则文件之间的冲突。
- 控制 system prompt 增长。
- 让 prompt 来源更容易推理。

不同文件的发现范围也不同：

- `.hermes.md` / `HERMES.md` 会从当前目录向上搜索到 git root，被视为 Hermes-native 项目规则。
- `AGENTS.md`、`CLAUDE.md`、`.cursorrules` 只从当前工作目录加载，避免误引入父目录无关规则。
- `.cursor/rules/*.mdc` 只有在 `.cursorrules` 家族获胜时才会排序并拼接。

每个加载文件都会带上来源标题，例如：

```markdown
## AGENTS.md

...
```

最终 context block 会以类似下面的说明开头：

```markdown
# Project Context

The following project context files have been loaded and should be followed:
```

## Context Safety

项目上下文文件会进入 system prompt，所以 Hermes 把它们视为不可信输入。

注入前，context 内容会经过 `_scan_context_content()`，该函数使用 `tools/threat_patterns.py` 中的共享威胁模式。

如果文件匹配 prompt injection 或 promptware 模式：

- 原始内容不会被注入。
- 取而代之的是 placeholder：

```text
[BLOCKED: <filename> contained potential prompt injection (...). Content not loaded.]
```

这是一个重要的 agent 工程模式：仓库里的本地 Markdown 不应该因为“本地”就自动被信任。

## Context 截断

每个 context source 有 `CONTEXT_FILE_MAX_CHARS` 限制，目前是 20,000 字符。

截断策略保留：

- 头部 70%。
- 尾部 20%。
- 中间插入说明被移除内容的 marker。

这比纯前缀截断更好，因为规则文件常常在开头放全局政策，在结尾放例外或操作说明。

## Volatile 层

volatile 层当前包括：

- 如果启用 memory，则包含内置 `MEMORY.md` 快照。
- 如果启用 user profile memory，则包含内置 `USER.md` 快照。
- 如果配置了外部 memory provider，则包含 provider 的静态 system prompt block。
- 日期级 timestamp。
- 可选 session id。
- model 和 provider 标识。

timestamp 有意只用日期精度，而不是分钟精度。分钟级 timestamp 会让原本相同的 prompt 每次重建都不同，从而降低 prompt cache 复用。

## Per-Turn 注入是另一条路径

外部 memory recall 和插件提供的 per-turn context 不会重写缓存的 system prompt。它们会在 API 调用时注入当前 user message。

这样既能保留 system prompt cache，又能让 agent 看见当前 turn 相关信息。

## 设计经验

值得复用的关键工程思路：

- 把 identity 和 project context 分开。
- identity 要有 fallback。
- 避免同一文件通过多条路径重复注入。
- 保守加载项目上下文，并有清晰优先级。
- 对会进入 prompt 的本地文件做 injection 扫描。
- 截断时保留 head/tail，并插入显式 marker。
- 只有工具真实存在时才加入工具 guidance。
- 易变数据放在 prompt 后面。
- per-turn retrieval 不要写进缓存的 system prompt。
