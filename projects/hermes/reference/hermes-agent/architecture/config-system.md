# 配置系统工程细节

本文整理 Hermes Agent 的配置系统。它表面上是 `~/.hermes/config.yaml` 和 `~/.hermes/.env`，但实际包含 profile 隔离、缓存、迁移、YAML 容错、env 安全写入、custom provider 兼容层、CLI/Gateway 多加载路径等设计。

核心源码：

- `hermes_cli/config.py`：主配置读写、默认值、迁移、`.env` 管理。
- `hermes_constants.py`：`HERMES_HOME`、profile-aware 路径、context-local override。
- `hermes_cli/profiles.py`：多 profile 管理。
- `cli.py`：classic CLI 自己的 `load_cli_config()`。
- `gateway/config.py` 与 `gateway/run.py`：gateway runtime 配置读取与桥接。

---

## 1. 配置文件分工

Hermes 明确区分：

- `config.yaml`：普通配置、行为开关、模型、工具、显示、压缩、gateway、plugins 等。
- `.env`：secrets only，例如 API key、token、password。

AGENTS.md 中也强调：非 secret 设置应该进 `config.yaml`，不要进 `.env`。

路径由 `get_hermes_home()` 决定：

```text
config.yaml -> get_hermes_home() / "config.yaml"
.env        -> get_hermes_home() / ".env"
```

所以 profile、Docker、自定义 `HERMES_HOME` 都会影响配置位置。

---

## 2. HERMES_HOME 是路径总开关

`hermes_constants.py` 中 `get_hermes_home()` 的优先级：

1. context-local override
2. `HERMES_HOME` env var
3. platform default

platform default：

- Windows：`%LOCALAPPDATA%/hermes`
- POSIX：`~/.hermes`

context-local override 用 `ContextVar`：

```python
_HERMES_HOME_OVERRIDE = ContextVar("_HERMES_HOME_OVERRIDE", default=_UNSET)
```

这比修改 `os.environ` 安全，因为 Gateway/TUI 会并发处理多个 session/profile。如果直接改全局 env，线程之间会串 profile。

---

## 3. active_profile fallback 警告

如果 `HERMES_HOME` 没设置，但默认 home 下 `active_profile` 指向非 default，`get_hermes_home()` 会向 stderr 打一次强警告。

原因：

- 如果某个 subprocess 没继承 `HERMES_HOME`，它会落回默认 profile。
- 这会把记忆、session、日志写到错误 profile。
- 这个错误很隐蔽，所以源码选择 loud one-shot warning。

这不是抛异常，因为 `get_hermes_home()` 被很多模块在 import time 调用；抛异常会让启动更脆。

---

## 4. profile 设计

`hermes_cli/profiles.py` 定义多 profile：

```text
default profile: ~/.hermes
named profile:  ~/.hermes/profiles/<name>
```

每个 profile 是完整隔离的 Hermes home，包含：

- `config.yaml`
- `.env`
- `SOUL.md`
- `memories/MEMORY.md`
- `memories/USER.md`
- `sessions`
- `skills`
- `skins`
- `logs`
- `plans`
- `workspace`
- `cron`
- `home`

`home` 是给 subprocess 用的 per-profile HOME，隔离 git/ssh/gh/npm 等工具配置，防止不同 profile 的凭证互相泄漏。

profile name 规则：

```python
^[a-z0-9][a-z0-9_-]{0,63}$
```

并且 `hermes`、`default`、`test`、`tmp`、`root`、`sudo` 以及 Hermes subcommands 不能用作 profile alias。

---

## 5. get_default_hermes_root()

`get_default_hermes_root()` 用于 profile-level 操作。

它要解决的问题：当前 `HERMES_HOME` 可能本身就是某个 profile，例如：

```text
~/.hermes/profiles/coder
/opt/data/profiles/coder
```

此时 profile list/create/delete 应该看 profile root，而不是当前 profile 子目录。

规则：

- 如果没设置 `HERMES_HOME`：返回 platform default。
- 如果 `HERMES_HOME` 在 `~/.hermes` 下：返回 `~/.hermes`。
- 如果是 Docker/custom 且路径形如 `<root>/profiles/<name>`：返回 `<root>`。
- 否则返回 `HERMES_HOME` 自身。

---

## 6. DEFAULT_CONFIG

`hermes_cli/config.py` 的 `DEFAULT_CONFIG` 是主默认配置。

它包含很多顶层 section，例如：

- `model`
- `agent`
- `terminal`
- `compression`
- `display`
- `stt`
- `tts`
- `memory`
- `security`
- `delegation`
- `smart_model_routing`
- `checkpoints`
- `auxiliary`
- `curator`
- `skills`
- `gateway`
- `logging`
- `cron`
- `profiles`
- `plugins`
- `honcho`

当前 `_config_version` 在源码里是 `27`。

配置迁移靠 `_config_version` 判断，但添加普通新 key 通常不需要 bump，因为 `load_config()` 会把 `DEFAULT_CONFIG` 和用户配置 deep-merge。

---

## 7. load_config()

`load_config()` 是大多数 CLI 子命令和运行时代码使用的主入口。

流程：

1. `ensure_hermes_home()`
2. 找到 `get_config_path()`
3. 用 `(mtime_ns, size)` 查 cache
4. 从 `DEFAULT_CONFIG` 深拷贝开始
5. 读取用户 YAML
6. 兼容 root-level `max_turns`
7. `_deep_merge(DEFAULT_CONFIG, user_config)`
8. `_normalize_root_model_keys(...)`
9. `_normalize_max_turns_config(...)`
10. `_expand_env_vars(...)`
11. 写入 `_LAST_EXPANDED_CONFIG_BY_PATH`
12. 更新 `_LOAD_CONFIG_CACHE`
13. 返回 deepcopy

这个设计的核心是：用户只需要写 override，未写字段自动继承默认值。

---

## 8. load_config_readonly()

`load_config_readonly()` 是性能优化版。

区别：

- `load_config()` 返回 cached config 的 deepcopy。
- `load_config_readonly()` 直接返回 cached dict。

源码警告很明确：调用者绝对不能 mutate 返回值，否则会污染进程内缓存。

它存在的原因是 agent loop 热路径会频繁读配置，如 timeout、feature flags。deepcopy 本身会带来可测的分配和 GC 压力。

---

## 9. 配置读取缓存

配置模块有两个缓存：

- `_LOAD_CONFIG_CACHE`：merged/normalized/expanded config
- `_RAW_CONFIG_CACHE`：raw YAML dict

key 都是：

```text
str(config_path) + (mtime_ns, size)
```

好处：

- profile 切换后路径不同，不会撞 cache。
- 文件没变时不重复 YAML parse/deep merge。
- `save_config()` 和迁移用 atomic write，mtime/inode 会变，cache 自动失效。

还有 `_CONFIG_LOCK = threading.RLock()`，保护所有读写路径。源码注释说 libyaml C extension 对同一文件并发 `safe_load()` 不是线程安全的，而且工具线程、approval、browser、setup flows 都可能同时读写配置。

---

## 10. read_raw_config()

`read_raw_config()` 读取用户 on-disk YAML，不合并默认值、不迁移。

用途：

- 只需要看用户实际写了什么。
- 保存配置时避免把所有默认值 dump 回文件。
- 保留 `${VAR}` 模板。

同样有 `(mtime_ns, size)` cache，并返回 deepcopy。

---

## 11. YAML 损坏处理

如果 `config.yaml` parse 失败，`load_config()` 会 fallback 到 `DEFAULT_CONFIG`，但会调用 `_warn_config_parse_failure(...)`。

这个 helper 会：

- 每个 `(path, mtime_ns, size)` 只警告一次，避免并发刷屏。
- 写 warning 到 logger。
- 写 stderr。
- 尝试备份坏文件到：

```text
config.yaml.corrupt.<timestamp>.bak
```

它不会自动修复或覆盖原文件。源码注释强调：Hermes 不 silently mutate 用户配置，坏文件留在原地，用户手修后下一次 load 会重新读。

这是“容错但不吞错”的设计。

---

## 12. deep merge 语义

`_deep_merge(base, override)` 递归合并 dict：

- override key 优先。
- 如果两边都是 dict，递归合并。
- 否则 override 替换 base。

例子：

```yaml
tts:
  elevenlabs:
    voice_id: "abc"
```

只覆盖 voice_id，`model_id` 等 default 仍保留。

---

## 13. env var 模板展开

`_expand_env_vars(obj)` 会递归展开字符串中的：

```text
${VAR}
```

未定义 env var 保持原样，不会替换成空字符串。

保存时 `_preserve_env_ref_templates(...)` 会尽量保留原始 `${VAR}` 模板，避免把展开后的 secret 明文写回 `config.yaml`。

例如用户原本写：

```yaml
api_key: ${OPENROUTER_API_KEY}
```

运行时 load 出来可能是真实 key，但如果用户保存了其他无关配置，Hermes 会保留 `${OPENROUTER_API_KEY}`，而不是把 key dump 进 YAML。

---

## 14. cfg_get()

`cfg_get(cfg, *keys, default=None)` 是安全读取嵌套配置的 helper。

它解决三个问题：

1. 中间 key 缺失。
2. 中间值不是 dict。
3. cfg 为 None。

注意：显式 `None` 会原样返回，default 只在 key 缺失或路径断裂时返回。

这比到处写：

```python
cfg.get("agent", {}).get("reasoning_effort")
```

更稳，因为用户可能把 `agent` 写成字符串，普通 `.get()` 链会 AttributeError。

---

## 15. save_config()

`save_config(config)` 写 `config.yaml`。

关键步骤：

1. managed install 下拒绝写。
2. `ensure_hermes_home()`
3. normalize root model keys / max_turns。
4. 读取 raw existing。
5. 保留 `${VAR}` 模板。
6. 生成 optional commented sections。
7. `atomic_yaml_write(...)`
8. `_secure_file(config_path)`
9. 更新 `_LAST_EXPANDED_CONFIG_BY_PATH`

它使用 atomic write，避免配置写一半被中断。

managed install 指 NixOS/Homebrew 之类外部包管理器控制配置，Hermes 会提示用户去包管理配置里改，而不是直接写本地文件。

---

## 16. set_config_value()

`hermes config set <key> <value>` 由 `set_config_value()` 处理。

它先判断 key 是否像 secret：

- 在 API key 列表中。
- 以 `_API_KEY` 或 `_TOKEN` 结尾。
- 以 `TERMINAL_SSH` 开头。

secret 写 `.env`。

普通配置写 `config.yaml`，但注意：它读取 raw user config，不读取 merged config。这样不会把所有默认值写入用户文件。

类型转换规则：

- `true/yes/on` -> bool true
- `false/no/off` -> bool false
- 纯数字 -> int
- 浮点形式 -> float
- 其他 -> string

---

## 17. _set_nested()

`_set_nested(config, dotted_key, value)` 支持：

```text
a.b.c
a.0.b
providers.1
```

它可以进入 list，但不会自动增长 list。list index 必须已存在。

这个函数修复过一个重要 bug：以前设置 indexed path 时，非 dict 节点会被无条件替换成 `{}`，导致 `custom_providers` 这种 list 配置被悄悄破坏。

现在逻辑是：保留 dict 和 list，只有 missing/scalar 才替换成新 dict。

---

## 18. .env 加载与修复

`.env` 由 `load_env()` 读取。

它会：

- 用 UTF-8-SIG 读取，兼容 Windows Notepad BOM。
- 调 `_sanitize_env_lines(...)` 修复坏行。
- parse `KEY=VALUE`。
- 按 `(path, mtime, size)` memoize。

`.env` 修复处理两个常见问题：

1. 多个 `KEY=VALUE` 被拼到一行。
2. 设置向导留下 `KEY=***` 之类占位符。

拼接拆分依赖已知 key 集合：

```python
OPTIONAL_ENV_VARS.keys() | _EXTRA_ENV_KEYS
```

这样避免把普通 value 中看起来像大写变量的内容误拆。

---

## 19. .env 写入安全 denylist

配置模块有 `_ENV_VAR_NAME_DENYLIST`，禁止通过 env writer 写入危险变量。

包括：

- Linux/macOS loader：`LD_PRELOAD`、`LD_LIBRARY_PATH`、`DYLD_INSERT_LIBRARIES` 等。
- Python：`PYTHONPATH`、`PYTHONHOME`、`PYTHONSTARTUP` 等。
- Node：`NODE_OPTIONS`、`NODE_PATH`。
- General：`PATH`、`SHELL`、`BROWSER`、`EDITOR`、`VISUAL`、`PAGER`。
- Git：`GIT_SSH_COMMAND`、`GIT_EXEC_PATH`。
- Hermes runtime location：`HERMES_HOME`、`HERMES_PROFILE`、`HERMES_CONFIG`、`HERMES_ENV`。

源码明确说不是 blanket 禁止 `HERMES_*`，因为很多合法集成凭证以 `HERMES_` 开头。

这是 dashboard/config writer 的安全边界：不能通过 Web UI 写一个会影响下次 subprocess 执行的环境变量来升级成 RCE。

---

## 20. OPTIONAL_ENV_VARS

`OPTIONAL_ENV_VARS` 定义 setup/wizard 可提示的 env var 元数据。

此外，代码会从 provider profiles 和 platform plugin manifests 动态注入 env vars：

- provider auth env
- bundled platform plugin env

这样添加新的 model provider 或 platform plugin 时，不必手写所有 setup env var 列表。

---

## 21. terminal.cwd 与 env bridge

AGENTS.md 强调：

- CLI 工作目录：进程当前目录 `os.getcwd()`。
- Messaging/Gateway 工作目录：`terminal.cwd`。
- `MESSAGING_CWD` 已移除。
- `TERMINAL_CWD` 在 `.env` 中也 deprecated，canonical setting 是 `terminal.cwd`。

`set_config_value()` 同步了一些 terminal config 到 `.env`，因为老的 terminal tool 还直接读 env var。但它故意排除了：

```text
terminal.cwd
```

原因：把 cwd 持久化到 `.env` 会让 child process 长期带 stale cwd，污染后续会话。

---

## 22. custom_providers 与 providers 新旧兼容

Hermes 有两种 custom provider 配置形态：

旧：

```yaml
custom_providers:
  - name: myapi
    base_url: https://...
```

新：

```yaml
providers:
  myapi:
    base_url: https://...
```

`get_compatible_custom_providers(config)` 返回统一 list-shaped view，供 runtime 和 picker 使用。

它会：

- 规范化 legacy `custom_providers`。
- 把 `providers` dict 转成 custom provider shape。
- 用 `provider_key` 和 `(name, base_url, model)` 去重。
- 不把兼容层 materialize 回 config.yaml，避免 UI 中重复。

---

## 23. custom provider 字段规范化

`_normalize_custom_provider_entry(...)` 支持一些别名：

- `apiKey` -> `api_key`
- `baseUrl` -> `base_url`
- `apiMode` / `transport` -> `api_mode`
- `keyEnv` / `apiKeyEnv` / `api_key_env` -> `key_env`
- `defaultModel` -> `default_model`
- `contextLength` -> `context_length`
- `rateLimitDelay` -> `rate_limit_delay`

它也会警告 unknown keys。

URL 必须有 scheme 和 host，否则跳过。

`models` 可以是 dict，也可以是 list。如果用户写 list，会转换成：

```python
{model_name: {}}
```

避免 `/model` 显示 provider 有 0 个模型。

---

## 24. custom provider context_length

`get_custom_provider_context_length(model, base_url, ...)` 是 custom provider per-model context override 的单一来源。

它按 `base_url` 匹配 provider entry，再找：

```yaml
models:
  <model>:
    context_length: 256000
```

使用位置包括：

- `AIAgent.__init__`
- `AIAgent.switch_model`
- `/model` 确认展示
- gateway `/info`
- `agent.model_metadata.get_model_context_length`

这个 helper 出现是因为过去 startup path 有 override，但 `/model` 切换等路径忘了同步，导致又掉回 128K 默认。

---

## 25. 配置版本与迁移

`check_config_version()` 读取 raw config 的 `_config_version`，不能用 merged config。原因：`load_config()` 会从 `DEFAULT_CONFIG` 开始 deep-merge，如果用 merged config，就永远会看到最新 version，无法知道用户文件是否旧。

`migrate_config(...)` 根据版本做迁移，例如：

- custom_providers list -> providers dict
- plugins enabled 默认值迁移
- curator/auxiliary defaults 补齐

迁移后写入 latest version。

原则：

- 添加普通 key 通常不需要 bump。
- 需要主动转换结构/重命名 key 时才 bump。

---

## 26. load_cli_config()

Classic CLI 在 `cli.py` 里还有自己的 `load_cli_config()`。

查找顺序：

1. `{HERMES_HOME}/config.yaml`
2. `./cli-config.yaml`

如果设置 `HERMES_IGNORE_USER_CONFIG=1`，会跳过 user config，但 `.env` credentials 仍会加载。

它有一份 CLI-specific defaults，并解析：

- model
- terminal
- browser
- compression
- agent
- display
- clarify
- code_execution
- auxiliary

这和 `hermes_cli.config.load_config()` 不完全等价，所以调试“CLI 看得到配置但 gateway 看不到”时，要确认走的是哪个 loader。

---

## 27. Gateway 配置路径

AGENTS.md 提醒有三条加载路径：

- `load_cli_config()`：CLI mode。
- `load_config()`：`hermes tools`、`hermes setup`、多数 CLI 子命令。
- Direct YAML load：gateway runtime。

Gateway 的一些运行配置直接读 YAML raw，并有自己的 dataclass/config parser。它还会桥接 `terminal.cwd` 到 child tools 所需环境。

所以新增配置时，必须确认：

- `DEFAULT_CONFIG` 有默认值。
- CLI loader 是否需要。
- Gateway parser 是否读取。
- TUI/gateway backend 是否另有缓存。

---

## 28. Managed install

`is_managed()` 检查：

- `HERMES_MANAGED` env var
- `HERMES_HOME/.managed`

如果是 NixOS/Homebrew 等 managed install，保存配置、更新等动作会给出包管理器指导，而不是直接改本地文件。

这避免 Hermes 自己改了由系统配置声明式管理的文件，造成下一次 rebuild 又被覆盖。

---

## 29. 工程上值得学习的细节

1. **配置读取有 RLock 和 stat cache**：兼顾线程安全和热路径性能。
2. **坏 YAML 会备份但不覆盖**：保护用户唯一的手写配置。
3. **load_config 返回 deepcopy，readonly 返回 cache object**：明确区分安全和性能路径。
4. **保存时保留 `${VAR}` 模板**：避免把 secret 展开后写进 `config.yaml`。
5. **`.env` writer 有危险变量 denylist**：防止 Web/Dashboard 写入影响 subprocess 的变量。
6. **custom provider 有兼容层但不回写兼容层**：避免新旧 schema 在 UI 中重复。
7. **profile 用独立 HERMES_HOME 和 per-profile HOME**：隔离 Hermes 状态和外部工具凭证。
8. **多 loader 并存**：CLI、子命令、Gateway 读配置方式不同，新增配置必须跨路径检查。
9. **terminal.cwd 不写 `.env`**：避免 stale cwd 长期污染 child processes。
10. **context-local HERMES_HOME override**：支持并发 profile/session，而不是全局 env mutation。

---

## 30. 一句话总结

Hermes 的配置系统本质上是一个 profile-aware、线程安全、可迁移、secret-aware 的状态层：`config.yaml` 管行为，`.env` 管凭证，`HERMES_HOME` 管隔离边界，`load_config()` 提供默认合并和兼容规范化，而 save/env writer 则尽量避免破坏用户手写配置、泄露 secrets 或引入 subprocess 安全风险。
