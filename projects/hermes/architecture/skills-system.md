# Skills System

本文整理 Hermes 的 skills/技能系统。它和 memory 很像都属于“跨会话可复用知识”，但工程定位不同：

- memory 记录事实、偏好、用户画像、长期上下文。
- skills 记录流程、操作步骤、命令、模板、脚本、坑点和验证方法。

一句话：skills 是 Hermes 的 procedural memory，也就是“怎么做某类任务”的可加载说明书。

核心源码：

- `tools/skills_tool.py`：`skills_list`、`skill_view`，技能发现与按需加载。
- `tools/skill_manager_tool.py`：`skill_manage`，让 agent 创建/编辑/删除技能。
- `agent/skill_commands.py`：把技能映射成 `/skill-name` slash command。
- `agent/skill_utils.py`：frontmatter 解析、平台/环境过滤、禁用列表、外部目录。
- `agent/skill_preprocessing.py`：模板变量和 inline shell 预处理。
- `agent/prompt_builder.py`：构建 system prompt 里的 skills index 和 snapshot cache。
- `agent/system_prompt.py`：决定 skills prompt 是否进入 stable system prompt。

## 目录与格式

技能主目录是 profile-aware 的：

```python
SKILLS_DIR = get_hermes_home() / "skills"
```

注释里强调：这是 single source of truth。安装的技能、agent 创建的技能、hub 安装的技能都在
`~/.hermes/skills/` 下，不污染 git repo。

典型结构：

```text
~/.hermes/skills/
├── my-skill/
│   ├── SKILL.md
│   ├── references/
│   ├── templates/
│   ├── scripts/
│   └── assets/
└── category-name/
    └── another-skill/
        └── SKILL.md
```

`SKILL.md` 使用 YAML frontmatter，兼容 agentskills.io 风格：

```yaml
---
name: skill-name
description: Brief description
version: 1.0.0
license: MIT
platforms: [macos, linux]
prerequisites:
  env_vars: [API_KEY]
  commands: [curl, jq]
metadata:
  hermes:
    tags: [fine-tuning, llm]
    related_skills: [peft, lora]
---

# Skill Title

Full instructions...
```

Hermes 对名称和描述有限制：

- `MAX_NAME_LENGTH = 64`
- `MAX_DESCRIPTION_LENGTH = 1024`

这个限制是为了 progressive disclosure：索引阶段只放短元数据，不把所有技能全文塞进 prompt。

## Progressive Disclosure

skills 系统分两层工具：

- `skills_list`：只列 name、description、category。
- `skill_view`：按需加载某个技能全文，或加载技能目录里的 supporting file。

`skills_list()` 返回最小信息：

```json
{
  "success": true,
  "skills": [
    {"name": "...", "description": "...", "category": "..."}
  ],
  "categories": [],
  "count": 1,
  "hint": "Use skill_view(name) to see full content, tags, and linked files"
}
```

`skill_view(name)` 返回：

- `content`
- `description`
- `tags`
- `related_skills`
- `path`
- `skill_dir`
- `linked_files`
- `required_environment_variables`
- `missing_required_environment_variables`
- `setup_needed`
- `readiness_status`

如果技能有 `references/`、`templates/`、`assets/`、`scripts/`，首次 `skill_view` 会只列出路径；
模型需要具体文件时再调用：

```python
skill_view(name="axolotl", file_path="references/dataset-formats.md")
```

这就是 progressive disclosure：先看索引，再看主说明，再按需看支持文件。

## System Prompt 里的 Skills Index

`agent/prompt_builder.py::build_skills_system_prompt()` 会把技能索引加入 stable system prompt。

它不是把所有 `SKILL.md` 全文放进去，而是放一个 `<available_skills>` 列表，并提示模型：

- 回答前扫描技能列表。
- 如果某个技能匹配或部分相关，必须用 `skill_view(name)` 加载并遵循。
- 如果任务涉及 Hermes 自身、skills、gateway、plugins 等，加载 `hermes-agent` skill。
- 如果技能有问题，用 `skill_manage(action='patch')` 修。

工程上，这是一种“轻量目录 + 按需全文”的设计。system prompt 知道有哪些技能，但不承载所有技能内容。

## Skills Prompt Snapshot Cache

`build_skills_system_prompt()` 有两层缓存：

1. 进程内 LRU dict，key 包含 skills dir、tools、toolsets。
2. 磁盘 snapshot：`~/.hermes/.skills_prompt_snapshot.json`。

snapshot 通过 manifest 校验：

```python
manifest[str(path.relative_to(skills_dir))] = [st.st_mtime_ns, st.st_size]
```

如果 `SKILL.md` / `DESCRIPTION.md` 的 mtime 或 size 变了，snapshot 失效。

外部技能目录 `skills.external_dirs` 也会扫描，但注释强调：

- 外部目录可以出现在 index。
- 新技能总是创建到本地 `~/.hermes/skills/`。
- 本地技能同名时优先。

这和 prompt cache 的关系很重要：技能索引属于 stable system prompt，所以 Hermes 尽量 snapshot，
避免每次启动或每轮都重新扫盘。

## `/reload-skills` 不重置 Prompt Cache

`agent/skill_commands.py::reload_skills()` 注释明确说：

```text
This does NOT invalidate the skills system-prompt cache.
Skills are called by name via /skill-name, skills_list, or skill_view.
Keeping the prompt cache intact preserves prefix caching across the reload.
```

也就是说，用户 `/reload-skills` 后，CLI 会给下一轮排一个 one-shot note，告诉模型哪些技能增删了，
而不是重建 system prompt。

这体现了 Hermes 的 prompt cache 策略：能用 user-message 动态通知解决的，就不要动 stable system。

## Skill Slash Commands

`agent/skill_commands.py::scan_skill_commands()` 会扫描：

- `~/.hermes/skills/`
- `skills.external_dirs`

然后把技能名转成 slash command：

```python
cmd_name = name.lower().replace(' ', '-').replace('_', '-')
cmd_name = _SKILL_INVALID_CHARS.sub('', cmd_name)
cmd_name = _SKILL_MULTI_HYPHEN.sub('-', cmd_name).strip('-')
_skill_commands[f"/{cmd_name}"] = {...}
```

例如 `Gif Search` 会变成 `/gif-search`。

兼容 Telegram 的限制，`resolve_skill_command_key()` 会把用户输入中的 `_` 当作 `-`：

```python
cmd_key = f"/{command.replace('_', '-')}"
```

这样 `/claude_code` 也能解析到 `/claude-code`。

## Slash Skill 如何注入对话

用户输入 `/some-skill extra instruction` 时，CLI 不会改 system prompt，而是调用：

```python
build_skill_invocation_message(cmd_key, user_instruction, ...)
```

返回一个 user message，开头是：

```text
[IMPORTANT: The user has invoked the "skill_name" skill, indicating they want
you to follow its instructions. The full skill content is loaded below.]
```

后面拼：

- skill 内容。
- `[Skill directory: ...]`。
- skill config values。
- setup note。
- supporting files list。
- 用户在 slash command 后附带的 instruction。
- runtime note。

这也是一个关键 prompt 设计：slash skill 是用户显式调用，所以作为 user message 注入，避免污染
session stable system prompt。

## CLI `--skills` 预加载

CLI 启动时可以传：

```bash
python cli.py --skills hermes-agent-dev,github-auth
```

`build_preloaded_skills_prompt()` 会加载多个技能，生成 session-wide guidance。

activation note 不同：

```text
[IMPORTANT: The user launched this CLI session with the "skill_name" skill
preloaded. Treat its instructions as active guidance for the duration of this
session unless the user overrides them.]
```

这类预加载通常会并入 CLI 初始 system prompt，因此更像“本 session 的稳定工作模式”。

## Skill Message 组装细节

`_build_skill_message()` 会做几件事。

第一，读取 `loaded_skill["content"]`。

第二，按配置做预处理：

- `skills.template_vars` 默认 true。
- `skills.inline_shell` 默认 false。

第三，加入 `[Skill directory: ...]`，并提示相对路径要按这个目录解析：

```text
Resolve any relative paths in this skill (e.g. `scripts/foo.js`,
`templates/config.yaml`) against that directory...
```

第四，注入 skill-declared config：

如果 frontmatter 的 `metadata.hermes.config` 声明了配置项，Hermes 会解析当前 config.yaml 中的值，
并追加：

```text
[Skill config (from ~/.hermes/config.yaml):
  key = value
]
```

这样模型不用自己读 config，也能知道技能配置。

第五，处理 setup note：

- `setup_skipped`
- `gateway_setup_hint`
- `setup_needed`

第六，列出 supporting files：

- frontmatter linked files。
- 或自动扫描 `references/`、`templates/`、`scripts/`、`assets/`。

## Template Vars

`agent/skill_preprocessing.py` 支持两个模板变量：

- `${HERMES_SKILL_DIR}`
- `${HERMES_SESSION_ID}`

替换函数是：

```python
substitute_template_vars(content, skill_dir, session_id)
```

如果没有具体值，就保留原 token，不替换成空字符串。这样技能作者能发现未解析变量。

## Inline Shell

技能内容可以包含：

```text
!`date +%Y-%m-%d`
```

但 inline shell 默认不启用，必须配置：

```yaml
skills:
  inline_shell: true
  inline_shell_timeout: 10
```

执行实现：

```python
subprocess.run(["bash", "-c", command], cwd=skill_dir, timeout=...)
```

安全/稳定限制：

- 只匹配单行 backtick，不能跨行。
- timeout 至少 1 秒。
- 输出最大 4000 chars，超出截断。
- 出错返回 `[inline-shell error: ...]`，不会抛异常破坏整个技能加载。

这是一个强能力，所以默认关闭是合理的。

## 平台和环境过滤

`agent/skill_utils.py` 支持两个过滤层。

第一，平台过滤：

```yaml
platforms: [macos, linux, windows]
```

如果没有 `platforms`，默认所有平台可用。Termux 特判为 Linux userland。

第二，环境相关性过滤：

```yaml
environments: [kanban, docker, s6]
```

它是 offer-time filter，不是硬兼容 gate：

- 控制技能是否出现在 skills index / autocomplete / slash-command list。
- 显式 `skill_view` 或 `--skills` 仍可加载。

注释说得很清楚：显式加载就是显式同意；某些 dispatcher 强制加载技能也必须能成功。

## Disabled Skills

禁用技能从 config 读取：

```yaml
skills:
  disabled:
    - skill-a
  platform_disabled:
    telegram:
      - skill-b
```

`get_disabled_skill_names()` 会优先按平台读 `platform_disabled`，平台来自：

- 显式参数。
- `HERMES_PLATFORM`
- gateway session context 的 `HERMES_SESSION_PLATFORM`。

`agent/skill_commands.get_skill_commands()` 会检测 platform scope 是否变化；如果 gateway 进程同时服务
Telegram 和 Discord，会按平台重新扫描，避免某个平台看到不该出现的技能。

## Skill Discovery 排除目录

扫描 `SKILL.md` 时会跳过：

- `.git`
- `.github`
- `.hub`
- `.archive`
- `.venv`
- `venv`
- `node_modules`
- `site-packages`
- `__pycache__`
- `.tox`
- `.nox`
- `.pytest_cache`
- `.mypy_cache`
- `.ruff_cache`

这避免把依赖目录、缓存目录、VCS 目录中的文件误识别成技能。

## Skill View 查找策略

`skill_view(name)` 的查找比较细。

如果 name 含 `:`，先尝试 plugin skill：

```text
plugin:skill
```

找不到 plugin skill 时，会 fallback 到本地 categorized path：

```text
category/skill
```

本地查找策略：

1. 直接路径：`search_dir / name / SKILL.md`。
2. categorized fallback：`namespace/bare`。
3. 递归按父目录名找 `SKILL.md`。
4. legacy flat `<name>.md`。

如果找到多个 candidate，Hermes 不猜，直接返回 ambiguous error，并列出 matches。

这避免了本地技能和 external_dirs 同名时“列表显示 A，加载却加载 B”的隐蔽 bug。

## Supporting File 安全

`skill_view(name, file_path=...)` 读取支持文件时有两个 path traversal 防护：

```python
has_traversal_component(file_path)
validate_within_dir(target_file, skill_dir)
```

如果包含 `..`，直接拒绝：

```text
Path traversal ('..') is not allowed.
```

如果 resolve 后不在 skill_dir 内，也拒绝。

这保证模型只能读取技能目录内的 supporting files，不能通过 `../../.env` 逃逸。

## Plugin Skills

plugin 可以提供技能，使用 qualified name：

```text
namespace:skill
```

`skill_view()` 会：

- 校验 namespace 格式。
- `discover_plugins()`。
- 用 plugin manager 找 skill。
- 如果 plugin disabled，返回错误。
- 给内容加 bundle context banner，告诉模型 sibling skills。

例如：

```text
[Bundle context: This skill is part of the 'namespace' plugin.
Sibling skills: a, b.
Use qualified form to invoke siblings (e.g. namespace:a).]
```

plugin skill 也会做 platform check 和 prompt injection pattern warning。

## Prompt Injection Warning

skills 系统有一个轻量 prompt injection pattern 列表：

- `ignore previous instructions`
- `you are now`
- `forget your instructions`
- `system prompt:`
- `<system>`
- `]]>`

命中后会 warning log，但仍然 serve 技能。

这不是硬安全 gate，更像安装/审计提示。原因也现实：第三方 skill 里可能有合法示例文本包含这些词。

真正强风险主要由 `tools/skills_guard.py` 和 `skills_guard_agent_created` 等路径处理。

## Required Environment Variables

技能可以声明：

```yaml
required_environment_variables:
  - name: EXAMPLE_API_KEY
    prompt: Enter API key
    help: https://example.com
    required_for: API access
```

也兼容旧格式：

```yaml
prerequisites:
  env_vars: [EXAMPLE_API_KEY]
```

`skill_view()` 会检查：

- `~/.hermes/.env`
- 当前 `os.environ`

缺失时返回：

- `missing_required_environment_variables`
- `setup_needed`
- `setup_note`
- `readiness_status: setup_needed`

如果有 secret capture callback，Hermes 会尝试安全采集。

## Secret Capture 与 Gateway

`tools.skills_tool.set_secret_capture_callback()` 注册 secret capture。

缺失 required env 时：

- 普通 CLI/TUI/desktop 可以弹 secure secret prompt。
- 大多数 messaging gateway 不能安全输入 secret，会返回 `gateway_setup_hint`。

源码注释说：desktop app / TUI 会设置 `HERMES_INTERACTIVE` 并注册 secure `secret.request` overlay，
所以能安全提示；普通 messaging surface 没有这个能力。

采集成功后，相关 env 会持久化到 `.env`，技能加载继续；用户跳过则 `setup_skipped=True`。

## Env Passthrough 和 Credential Files

如果 required env 已经可用，`skill_view()` 会：

```python
register_env_passthrough(available_env_names)
```

这让 sandboxed execution environments，如 `execute_code`、`terminal`，能拿到技能需要的 env。

技能还可以声明：

```yaml
required_credential_files:
  - ~/.aws/credentials
```

Hermes 会调用 `register_credential_files()`，让 Modal/Docker 等远程 sandbox 挂载这些凭证文件。

如果远程 backend 缺少必要 env/file，setup note 会追加：

```text
DOCKER-backed skills need these requirements available inside the remote environment as well.
```

## Skill Usage Telemetry

`skill_view` wrapper `_skill_view_with_bump()` 会在成功加载后：

- `bump_view()`
- `bump_use()`

slash skill 和 preloaded skill 也会 `bump_use()`。

这不是模型上下文的一部分，而是给 Curator 生命周期管理使用，比如判断技能 stale、archive、pin 等。

## Skill Manage

`tools/skill_manager_tool.py` 提供 `skill_manage`，让 agent 把成功经验转成技能。

支持 action：

- `create`
- `edit`
- `patch`
- `delete`
- `write_file`
- `remove_file`

文件头注释写得很清楚：skills 是 agent 的 procedural memory，捕获基于经验验证过的任务流程。

新技能写入 `~/.hermes/skills/`，已有技能可以在 bundled、hub-installed、user-created、external
目录里修改或删除。

## Skill Manage 校验

创建/编辑技能时会检查：

- name 必填。
- name 长度不超过 64。
- name 只能用小写字母、数字、hyphen、dot、underscore，且必须字母或数字开头。
- category 必须是单个目录名，不能含 `/` 或 `\`。
- `SKILL.md` 必须以 YAML frontmatter 开头。
- frontmatter 必须有 `name` 和 `description`。
- description 不超过 1024。
- body 不能为空。
- `SKILL.md` 内容不超过 `MAX_SKILL_CONTENT_CHARS = 100_000`。
- supporting file 不超过 `MAX_SKILL_FILE_BYTES = 1_048_576`。

supporting file 只能写到：

- `references`
- `templates`
- `scripts`
- `assets`

并且同样禁止 `..` path traversal。

## Atomic Writes 与 Rollback

`skill_manage` 写文件用 `_atomic_write_text()`：

1. 在同目录创建 temp file。
2. 写入内容。
3. `atomic_replace(temp_path, file_path)`。
4. 出错清理 temp file。

创建/编辑后，如果 security scan block，会 rollback：

- create：删除新 skill_dir。
- edit：写回 original content。

这样避免留下半写入或被 scanner 拒绝但文件已经落盘的技能。

## Agent-Created Skill Guard

`tools/skill_manager_tool.py` 会尝试导入：

```python
from tools.skills_guard import scan_skill, should_allow_install, format_scan_report
```

但是 agent-created skill 的 guard 默认关闭：

```yaml
skills:
  guard_agent_created: false
```

源码注释解释：agent 本来就能通过 terminal 执行同样代码路径，所以对 agent-created skill 默认扫描会增加摩擦，
但安全收益有限。用户如果要 belt-and-suspenders，可以开启。

外部 hub install 的扫描策略更严格，这里文档只覆盖 `skill_manage` 的 agent-created 路径。

## Pinned Skills

`_pinned_guard(name)` 会阻止删除 pinned skill。

注释强调：pin 只保护 deletion，不阻止 patch/edit。原因是 pinned skill 可能仍需要修正和演化，
但不应该被 curator auto-archive 或 agent delete。

如果要删除 pinned skill，需要用户运行：

```bash
hermes curator unpin <name>
```

## Prompt Cache 与 Skill Manage

`skill_manage()` 成功修改技能后会：

```python
clear_skills_system_prompt_cache(clear_snapshot=True)
```

这会清掉进程内 skills prompt cache，并可选删除 disk snapshot。

这和 `/reload-skills` 不同：

- `/reload-skills` 是用户显式刷新 slash command map，不重建 system prompt。
- `skill_manage` 是实际修改技能文件，必须让 skills index snapshot 失效。

## Skills 与 Memory 的区别

源码里有一句非常关键的 prompt 文案：

```text
workflows belong in skills, not memory.
```

可以这样理解：

- “用户喜欢简洁回答”属于 memory。
- “部署这个项目要先运行 X，再改 Y，再验证 Z”属于 skill。
- “某个 API key 在哪里配置”可能属于 config/env，不应该写入 memory 或 skill 正文。
- “某类任务的常见错误和修复步骤”属于 skill。

所以 memory 更像事实库，skill 更像操作 SOP。

## 工程上值得学习的设计点

第一，skills 用 progressive disclosure 控制 token。system prompt 只放技能索引，全文通过
`skill_view` 按需加载。

第二，slash skill 是 user message 注入，不改 system prompt。这保护 prompt cache，也保持“用户显式调用”
的语义。

第三，skills 支持 profile-aware 和 external dirs，但创建默认写本地 profile，避免改错配置域。

第四，offer-time filter 和 explicit load 分开。平台/环境不匹配的技能可以从列表隐藏，但用户显式加载仍可成功。

第五，supporting files 有 path traversal 防护，并且写入只允许固定子目录。

第六，inline shell 默认关闭，启用后也有 timeout 和输出上限。

第七，required env/credential files 不只是提示模型，还会注册 passthrough/mount，让后续工具执行真的拿到依赖。

第八，agent-created skills 有结构校验、原子写、可选安全扫描和 rollback，避免技能库被写坏。

第九，skill usage telemetry 给 curator 使用，让技能库可以演化，而不是只堆积。

第十，skills 和 memory 明确分工：事实进 memory，流程进 skills。

