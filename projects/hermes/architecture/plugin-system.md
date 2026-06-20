# 插件系统工程细节

本文整理 Hermes Agent 的插件体系。Hermes 不是只有一个统一插件入口，而是把不同风险和生命周期的扩展拆成多条发现路径：

- 普通插件：`hermes_cli/plugins.py`
- memory provider：`plugins/memory/__init__.py`
- context engine：`plugins/context_engine/__init__.py`
- model provider：`providers/__init__.py` + `plugins/model-providers/<name>/`
- image/video/search/browser/TTS/STT 等后端：普通插件通过 registry 注册 provider

这个拆分一开始会显得复杂，但背后的工程目标很清楚：不同插件类型有不同的启用方式、隔离边界、覆盖规则和导入副作用。

---

## 1. 普通插件系统入口

普通插件核心在 `hermes_cli/plugins.py`。

模块说明里列出的插件来源：

1. Bundled plugins：`<repo>/plugins/<name>/`
2. User plugins：`~/.hermes/plugins/<name>/`
3. Project plugins：`./.hermes/plugins/<name>/`
4. Pip plugins：`hermes_agent.plugins` entry-point group

目录插件要求：

- 有 `plugin.yaml` 或 `plugin.yml`
- 有 `__init__.py`
- `__init__.py` 里定义 `register(ctx)`

`register(ctx)` 是插件向宿主声明能力的唯一入口。

---

## 2. 插件来源与覆盖顺序

`PluginManager.discover_and_load()` 会按顺序扫描：

1. repo bundled plugins
2. bundled platform plugins
3. user plugins
4. project plugins
5. pip entry points

随后用 `winners` 做 key 去重：

```python
winners: Dict[str, PluginManifest] = {}
for manifest in manifests:
    winners[manifest.key or manifest.name] = manifest
```

后扫描到的同 key 插件会覆盖前面的。这让用户插件或项目插件可以替换 bundled 插件。

不过不是所有类型都真的在通用 manager 里 import。memory、model-provider 等有自己的专用路径。

---

## 3. plugin.yaml manifest

manifest 被解析成 `PluginManifest`：

- `name`
- `version`
- `description`
- `author`
- `requires_env`
- `provides_tools`
- `provides_hooks`
- `source`
- `path`
- `kind`
- `key`

`kind` 合法值：

- `standalone`
- `backend`
- `exclusive`
- `platform`
- `model-provider`

`key` 是路径派生的 registry key。普通扁平插件如：

```text
plugins/disk-cleanup/plugin.yaml
```

key 是：

```text
disk-cleanup
```

分类插件如：

```text
plugins/image_gen/openai/plugin.yaml
```

key 是：

```text
image_gen/openai
```

这个 key 设计避免不同分类下同名插件冲突，例如 `image_gen/openai` 和 `tts/openai`。

---

## 4. 插件目录布局

`_scan_directory()` 支持两种布局：

### 4.1 Flat

```text
plugins/<plugin-name>/plugin.yaml
plugins/<plugin-name>/__init__.py
```

适合 standalone 插件，例如 disk cleanup、security guidance。

### 4.2 Category

```text
plugins/<category>/<plugin-name>/plugin.yaml
plugins/<category>/<plugin-name>/__init__.py
```

适合 backend 类插件，例如 image generation provider、observability backend。

扫描深度限制为两层，避免无限递归。

---

## 5. 安全与启用策略

普通插件不是发现了就全部加载。加载策略按 `kind/source` 区分。

### 5.1 disabled 总是优先

配置里的 `plugins.disabled` 是强 deny-list。只要 key 或 legacy bare name 命中，就不加载。

### 5.2 standalone 默认 opt-in

用户安装的 standalone 插件、entry-point 插件等，默认不加载，必须在 `plugins.enabled` 中显式启用。

这点很重要，因为插件是任意 Python 代码。发现插件不等于执行插件。

### 5.3 bundled backend/platform 自动加载

bundled `backend` 和 `platform` 会自动加载：

- backend：它们是 Hermes 自带后端，应该开箱可用。
- platform：gateway 自带平台适配器也应开箱可用。

真正选择哪个 backend 服务请求，通常由对应配置决定，例如 `<category>.provider`。

### 5.4 exclusive 不由普通 manager 加载

`kind="exclusive"` 表示一个分类只能激活一个，例如 memory provider。普通 manager 只记录 manifest，不 import。激活由 `memory.provider` 这类配置决定。

### 5.5 model-provider 不由普通 manager 加载

`kind="model-provider"` 也只记录 manifest，不 import。原因是 model provider 在 `providers/__init__.py` 中有 lazy discovery 和 last-writer-wins 语义；通用 manager 如果再 import 一遍，会创建重复 `ProviderProfile`，破坏覆盖规则。

---

## 6. 自动识别插件类型

如果 manifest 没写 `kind`，`_parse_manifest()` 会轻量读 `__init__.py` 前 8192 字符做启发式判断：

- 含 `register_memory_provider` 或 `MemoryProvider`：当作 `exclusive`
- 含 `register_provider` 且含 `ProviderProfile`：当作 `model-provider`

这样用户安装的 memory/model provider 即使 manifest 较旧，也能被路由到正确发现系统。

---

## 7. 插件导入隔离

目录插件不是直接按原目录名 import，而是导入到 synthetic namespace：

```python
_NS_PARENT = "hermes_plugins"
slug = key.replace("/", "__").replace("-", "_")
module_name = f"hermes_plugins.{slug}"
```

例如：

```text
image_gen/openai -> hermes_plugins.image_gen__openai
disk-cleanup -> hermes_plugins.disk_cleanup
```

好处：

- 避免和 repo 包名冲突。
- 分类插件之间不会因为同名冲突。
- relative imports 仍然可用，因为设置了 `submodule_search_locations`。

---

## 8. PluginContext 能注册什么

插件的 `register(ctx)` 拿到的是 `PluginContext`。它提供宿主允许的能力，而不是把整个 agent 暴露给插件。

主要注册能力：

- `register_tool(...)`
- `register_hook(...)`
- `register_cli_command(...)`
- `register_command(...)`
- `register_context_engine(...)`
- `register_image_gen_provider(...)`
- `register_video_gen_provider(...)`
- `register_web_search_provider(...)`
- `register_browser_provider(...)`
- `register_tts_provider(...)`
- `register_transcription_provider(...)`
- `register_dashboard_auth_provider(...)`
- `register_skill(...)`
- `register_auxiliary_task(...)`

还有一些运行期能力：

- `ctx.llm`：宿主控制的 LLM facade。
- `inject_message(...)`：在 CLI 模式把消息注入当前会话。
- `dispatch_tool(...)`：让插件命令通过工具 registry 调用工具。

这是一种 capability-based 设计：插件只拿到明确开放的能力。

---

## 9. 插件注册工具

`PluginContext.register_tool()` 最终调用：

```python
from tools.registry import registry
registry.register(...)
```

同时把工具名加入：

```python
self._manager._plugin_tool_names.add(name)
```

它支持 `override=True`。默认同名冲突会被 registry 拒绝；显式 override 可替换 built-in tool，例如用自定义浏览器后端替换默认实现。

插件工具和内置工具进入同一个 registry，所以后续 schema 收集、toolset 开关、dispatch 都走统一路径。

---

## 10. 插件注册 hook

`VALID_HOOKS` 定义了当前稳定 hook：

- `pre_tool_call`
- `post_tool_call`
- `transform_terminal_output`
- `transform_tool_result`
- `transform_llm_output`
- `pre_llm_call`
- `post_llm_call`
- `pre_api_request`
- `post_api_request`
- `api_request_error`
- `on_session_start`
- `on_session_end`
- `on_session_finalize`
- `on_session_reset`
- `subagent_start`
- `subagent_stop`
- `pre_gateway_dispatch`
- `pre_approval_request`
- `post_approval_response`

未知 hook 名不会直接报错，而是 warning 后仍存储：

```python
if hook_name not in VALID_HOOKS:
    logger.warning(...)
self._manager._hooks.setdefault(hook_name, []).append(callback)
```

这是 forward-compatible 设计：新版本插件用到新 hook 时，在旧版本 Hermes 上不会立刻崩。

---

## 11. hook 调用的容错

`PluginManager.invoke_hook(...)` 调用每个 callback，单独 try/except：

```python
for cb in callbacks:
    try:
        ret = cb(**kwargs)
        if ret is not None:
            results.append(ret)
    except Exception as exc:
        logger.warning(...)
```

一个坏插件不会打断核心 agent loop。

`pre_llm_call` 有特殊语义：插件可以返回 context 注入当前 user message，但不会注入 system prompt。源码注释说明原因：保持 system prompt prefix 稳定，保护 prompt cache；注入 context 是 ephemeral，不写入 session DB。

这和记忆/上下文设计是一致的：动态内容尽量放 user turn，而不是破坏稳定 system prefix。

---

## 12. pre_tool_call 阻断

`get_pre_tool_call_block_message(...)` 会调用 `pre_tool_call` hooks。

插件如果返回：

```python
{"action": "block", "message": "Reason the tool was blocked"}
```

就可以阻止工具调用。

此外还有 thread-local tool whitelist：

```python
set_thread_tool_whitelist(allowed, deny_msg_fmt)
```

如果当前线程设置了 allowed，而 tool 不在名单里，会直接返回 deny message。

这给 delegation/subagent/security plugin 提供了工具权限边界。

---

## 13. 插件 slash command

`ctx.register_command(...)` 注册的是会话内 slash command，例如 `/lcm`，不是终端级 `hermes xxx` 子命令。

它会：

- 规范化名字：小写、去掉 `/`、空格换成 `-`
- 拒绝空名字
- 拒绝和 built-in command 冲突
- 存入 `_plugin_commands`

异步 handler 会由 `resolve_plugin_command_result(...)` 处理：

- 如果当前没有事件循环，直接 `asyncio.run`
- 如果已有事件循环，开 helper thread 跑自己的 loop
- 30 秒超时，防止插件命令卡死终端

这是为了同时兼容 CLI/TUI/gateway 的同步和异步调用环境。

---

## 14. 插件 CLI 子命令

`ctx.register_cli_command(...)` 注册的是终端命令：

```text
hermes <plugin-command> ...
```

它和 slash command 不同：

- slash command 是对话内 `/xxx`
- CLI command 是 argparse 子命令

插件提供 `setup_fn` 配置 argparse parser，`handler_fn` 处理命令。

---

## 15. 插件 skill

`ctx.register_skill(name, path, description)` 注册 read-only skill。

它不会进入扁平的 `~/.hermes/skills/` 树，也不会列入 system prompt 的 `<available_skills>`。它只能通过命名空间显式引用：

```text
<plugin_name>:<skill_name>
```

限制：

- skill name 不能包含 `:`
- 只能是 `[a-zA-Z0-9_-]+`
- path 必须存在

这避免插件技能自动污染全局技能列表。

---

## 16. memory provider 插件

memory provider 有专用发现系统：`plugins/memory/__init__.py`。

发现来源：

1. bundled providers：`plugins/memory/<name>/`
2. user-installed providers：`$HERMES_HOME/plugins/<name>/`

只允许一个 active provider，由配置决定：

```yaml
memory:
  provider: honcho
```

bundled provider 在同名冲突时优先于用户 provider。源码注释写的是 first-seen wins。

判断用户目录是否像 memory provider 使用轻量启发式：

```python
"register_memory_provider" in source or "MemoryProvider" in source
```

加载时支持两种写法：

- module 有 `register(ctx)`，调用 fake `_ProviderCollector`
- module 里有 `MemoryProvider` 子类，直接实例化

fake collector 只实现：

```python
register_memory_provider(provider)
```

其他 `register_tool/register_hook/register_cli_command` 是 no-op。memory provider 的工具暴露、CLI 暴露另有路径。

---

## 17. memory provider CLI 命令

`discover_plugin_cli_commands()` 只为当前 active memory provider 注册 CLI 命令。

它读取：

```python
memory.provider
```

然后只找该 provider 目录下的：

```text
cli.py
```

并寻找：

```python
register_cli(subparser)
```

这样 disabled memory providers 不会污染 `hermes --help`。

这是一个非常细的 UX 设计：插件目录可以很多，但命令行只展示当前用户真的启用的 provider。

---

## 18. MemoryManager 的 provider 编排

`agent/memory_manager.py` 里 `MemoryManager` 负责运行期编排。

它的原则：

- builtin provider 总是 first。
- 只允许一个 non-builtin external provider。
- 某个 provider 失败不阻塞其他 provider。
- provider 输出要被包进 `<memory-context>` fence，并清理嵌套 fence。

`build_memory_context_block(raw_context)` 会生成：

```text
<memory-context>
[System note: The following is recalled memory context, NOT new user input. Treat as authoritative reference data ...]

...
</memory-context>
```

还有 `StreamingContextScrubber` 用于流式输出时清理泄露的 `<memory-context>` 块。它用状态机处理跨 chunk 的开闭标签，避免 memory context 在流式 delta 边界中漏到 UI。

这个设计说明 memory context 是给模型看的，不应该原样暴露给用户界面。

---

## 19. context engine 插件

context engine 有专用发现系统：`plugins/context_engine/__init__.py`。

它只扫描：

```text
plugins/context_engine/<name>/
```

每个目录要有 `__init__.py`，并实现 `ContextEngine`。

加载支持两种写法：

- module 有 `register(ctx)`，用 `_EngineCollector` 收集 `register_context_engine(engine)`
- module 里有 `ContextEngine` 子类，直接实例化

context engine 和普通插件关系比较特殊：

- `plugins/context_engine` 是 repo-shipped engine 的专用目录。
- 普通插件也可以通过 `ctx.register_context_engine(engine)` 注册 context engine。
- 真正选择哪个 engine 由 `context.engine` 配置决定。
- 一次只能有一个 engine。

`_EngineCollector` 还允许 context engine 注册 slash command，会转发到全局 plugin command registry。这样 `/lcm` 这类命令可以和普通插件命令走同一套 dispatch。

---

## 20. model provider 插件

model provider 由 `providers/__init__.py` 管。

来源：

1. bundled：`plugins/model-providers/<name>/`
2. user：`$HERMES_HOME/plugins/model-providers/<name>/`
3. legacy：`providers/<name>.py`

每个 provider plugin 的 `__init__.py` 在 import 时调用：

```python
register_provider(profile)
```

`ProviderProfile` 里声明 provider 名字、别名、认证、模型获取方式、默认 auxiliary model 等。

发现是 lazy 的：

```python
get_provider_profile(...)
list_providers()
```

第一次调用才 `_discover_providers()`。

覆盖规则是 last-writer-wins：

```python
_REGISTRY[profile.name] = profile
for alias in profile.aliases:
    _ALIASES[alias] = profile.name
```

因为发现顺序是 bundled -> user -> legacy，后面的同名注册会覆盖前面的。这允许用户 provider 替换内置 provider profile。

---

## 21. 为什么 model provider 不走普通插件 import

普通 plugin manager 会扫描到 model provider manifest，但不会 import：

```python
if manifest.kind == "model-provider":
    loaded = LoadedPlugin(manifest=manifest, enabled=True)
    self._plugins[lookup_key] = loaded
    continue
```

源码注释给出原因：

- model provider 有自己的 lazy discovery。
- 如果普通 manager 也 import，会创建两份 `ProviderProfile`。
- 这会破坏 last-writer-wins 的覆盖语义。

所以普通插件系统只做 introspection，真正加载归 `providers/__init__.py`。

---

## 22. backend provider 注册

普通插件可以注册各种后端 provider，例如：

- image gen：`ctx.register_image_gen_provider(provider)`
- video gen：`ctx.register_video_gen_provider(provider)`
- web search：`ctx.register_web_search_provider(provider)`
- browser：`ctx.register_browser_provider(provider)`
- TTS：`ctx.register_tts_provider(provider)`
- transcription/STT：`ctx.register_transcription_provider(provider)`
- dashboard auth：`ctx.register_dashboard_auth_provider(provider)`

这些方法都会先检查类型是否匹配对应 ABC，再写入对应 registry。

错误行为通常 warning 后忽略，不让坏插件 crash host。

---

## 23. project plugins 的安全开关

项目插件目录：

```text
./.hermes/plugins/
```

默认不扫描。必须设置：

```text
HERMES_ENABLE_PROJECT_PLUGINS=1
```

这是合理的安全边界：项目目录可能来自不可信 repo，自动执行里面的 Python 插件风险太高。

---

## 24. 插件 debug

设置：

```text
HERMES_PLUGINS_DEBUG=1
```

会把插件发现日志额外输出到 stderr，并保留详细 traceback。

面向插件作者排查：

- 扫描了哪些目录。
- manifest 如何解析。
- 插件为什么被跳过。
- register(ctx) 注册了哪些工具/hook/命令。
- 加载失败 traceback。

---

## 25. 插件系统与核心代码的边界

AGENTS.md 里强调：插件不应修改 core 文件。如果插件需要能力，应该扩展通用 plugin surface，而不是在 `run_agent.py`、`cli.py`、`gateway/run.py` 等核心文件里写插件特例。

这和当前实现一致：

- 工具通过 registry 注册。
- 生命周期通过 hook 注册。
- slash/CLI 命令通过 command registry 注册。
- provider 通过对应 registry 注册。
- context engine 通过 ABC 替换。
- memory provider 通过 MemoryProvider ABC 替换。

也就是说，Hermes 的插件架构目标是让核心保持“框架能力”，插件只接入公开扩展点。

---

## 26. 工程上值得学习的细节

1. **不同插件类型用不同发现系统**：因为它们的生命周期、副作用和覆盖语义不同。
2. **发现不等于执行**：standalone/user 插件默认 opt-in，避免任意代码自动运行。
3. **manifest key 用路径派生**：避免不同 category 下同名插件冲突。
4. **model provider lazy discovery**：避免启动时加载所有 provider，也保护 override 语义。
5. **memory provider exclusive**：一次只启用一个，防止多个长期记忆后端互相污染。
6. **hook 单独 try/except**：坏插件不能打断 agent loop。
7. **pre_llm_call 注入 user message 而非 system**：保护 prompt cache 和 system prefix 稳定性。
8. **context engine 是可替换策略**：不是普通工具插件，而是替换上下文管理算法。
9. **插件命令 async/sync 兼容**：统一支持 CLI/TUI/gateway 调用环境。
10. **project plugins 必须显式开关**：防止 repo 级代码自动执行。

---

## 27. 一句话总结

Hermes 的插件系统不是一个单点 registry，而是一组按风险和语义分层的扩展面：普通插件负责 hooks/tools/commands/backends，memory/context/model provider 走专用发现和激活路径；核心通过 ABC、registry、hook 和 manifest key 把扩展能力开放出去，同时尽量避免自动执行、不受控覆盖和插件故障拖垮主流程。
