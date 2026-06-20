# Web / Browser / Media / Computer-Use 工具链

本文记录 Hermes 中“外部世界交互”相关工具的工程设计：Web 搜索/抽取、浏览器自动化、图像生成、TTS、Computer Use。它们有一个共同特点：agent 看到的是稳定工具名和稳定 schema，具体后端则通过 config、provider registry、插件、managed gateway 或本地依赖决定。

## 总体模式

这些工具大致分成两类。

第一类是 provider 化工具：

- Web Search：`tools/web_tools.py` + `agent/web_search_provider.py` + `agent/web_search_registry.py`。
- Browser Automation：`tools/browser_tool.py` + `agent/browser_provider.py` + `agent/browser_registry.py`。
- Image Generation：`tools/image_generation_tool.py` + `agent/image_gen_provider.py` + `agent/image_gen_registry.py`。
- TTS：`tools/tts_tool.py` + `agent/tts_provider.py` + `agent/tts_registry.py`。

它们的共同形状是：

```text
agent tool schema
  -> tools/<tool>.py wrapper
  -> read config.yaml / env / managed gateway
  -> provider registry lookup
  -> provider implementation in plugins/<category>/<name>/
  -> normalized JSON / media path / multimodal result
```

第二类是专用工具：

- Computer Use：`tools/computer_use_tool.py` 只是 discovery shim，真实实现拆到 `tools/computer_use/` 包里。
- 它不是多个 provider 竞争，而是一个 `computer_use` 工具，用 `action` 参数区分 capture/click/type/key/list_apps 等动作。
- 默认 backend 是 macOS 的 `cua-driver`，通过 MCP stdio 调用。

## Toolset 暴露

这些能力在 `toolsets.py` 里作为单独 toolset：

- `web`：`web_search`、`web_extract`。
- `browser`：`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type`、`browser_scroll` 等。
- `vision`：视觉分析工具。
- `image_gen`：`image_generate`。
- `tts`：`text_to_speech`。
- `computer_use`：`computer_use`。

好处是 token 预算和权限面可以按场景收缩。比如 cron job 可以只开 `web`，不必把 browser、terminal、file 全部塞进去。

## Web Search / Extract

Web 工具的核心文件是 `tools/web_tools.py`。

暴露给 agent 的工具：

- `web_search_tool(query, limit)`。
- `web_extract_tool(urls, format, include_raw, max_chars, ...)`。

provider 抽象在 `agent/web_search_provider.py`，它定义：

- `name`：稳定配置名，例如 `firecrawl`、`tavily`、`exa`。
- `is_available()`：只能做便宜检查，不能发网络请求。
- `supports_search()` / `supports_extract()`：同一个 provider 可以只支持搜索、只支持抽取，或两者都支持。
- `search()`：返回统一搜索 shape。
- `extract()`：返回统一抽取 shape。
- `get_setup_schema()`：给 `hermes tools` picker 生成选项、badge、env prompt。

配置选择有三层：

- `web.search_backend`：只控制 search。
- `web.extract_backend`：只控制 extract。
- `web.backend`：共享 fallback。

`tools/web_tools.py` 的 `_get_capability_backend()` 会先看 capability-specific key，再 fallback 到 shared backend，再 fallback 到 env auto-detect。

支持的 provider 包括：

- `plugins/web/firecrawl`
- `plugins/web/tavily`
- `plugins/web/exa`
- 代码中还保留 Parallel、SearXNG、Brave Free、DDGS、xAI 等兼容路径。

重要工程细节：

- Web provider 从旧的 `tools/web_providers/*` 迁移到了插件目录，但 `tools/web_tools.py` 仍 re-export 一些旧名字，保证测试和外部 patch surface 不炸。
- Firecrawl 可以直连，也可以通过 Nous managed tool gateway 派生 gateway URL。
- 可用性检查尽量避免网络刷新，因为工具注册和 `hermes tools` 刷新会频繁调用。
- `web_extract` 使用 auxiliary LLM 做内容压缩/摘要，减少把网页原文全部塞进主模型上下文的 token 压力。
- URL 安全检查通过 `tools.url_safety`，避免工具被拿去访问危险地址。

## Browser Automation

Browser 工具的核心文件是 `tools/browser_tool.py`。

它面向 agent 提供页面级自动化：

- `browser_navigate(url)`
- `browser_snapshot(full, user_task)`
- `browser_click(ref)`
- `browser_type(ref, text)`
- `browser_scroll(direction)`
- `browser_back()`
- `browser_press(key)`
- `browser_console(...)`
- `browser_get_images()`
- `browser_vision(question, annotate)`
- `browser_close()`

默认交互模型不是“截图看图点击”，而是 `agent-browser` 的 accessibility tree / ariaSnapshot。页面元素会被表示成 `@e1`、`@e2` 这类 ref，agent 点击 ref，比直接猜坐标可靠。

## Browser 后端选择

Browser provider 抽象在 `agent/browser_provider.py`。它定义 cloud browser 生命周期：

- `create_session(task_id)`：创建云浏览器 session，返回 session metadata。
- `close_session(session_id)`：释放 provider session。
- `emergency_cleanup(session_id)`：进程退出时 best-effort 清理。
- `is_available()`：便宜检查。
- `get_setup_schema()`：给工具配置 picker 用。

session metadata 保持 legacy shape：

```text
{
  "session_name": "...",
  "bb_session_id": "...",
  "cdp_url": "...",
  "features": {...},
  "external_call_id": "..."
}
```

`bb_session_id` 虽然名字像 Browserbase，但被保留为通用 provider session id 字段，避免老代码和测试大改。

浏览器模式：

- Local：本地 headless Chromium，通过 `agent-browser` CLI。
- Cloud：Browserbase、Browser Use、Firecrawl 等 provider。
- CDP override：`BROWSER_CDP_URL` 或 `browser.cdp_url` 直接连接现有 Chrome DevTools endpoint。
- Camofox：当 `CAMOFOX_URL` 存在时，走 `tools/browser_camofox.py` 的 anti-detection REST API。

`_get_cloud_provider()` 会读 `browser.cloud_provider`。显式 `local` 会关闭 cloud provider。未配置时会尽量从可用凭证推断，但用户配置优先。

## Browser 会话与混合路由

Browser 工具按 `task_id` 隔离 session。会话状态保存：

- `session_name`
- `bb_session_id`
- `cdp_url`
- engine 信息
- fallback/local sidecar 信息

有一个很实用的混合路由设计：即使全局配置了 cloud browser，如果访问 LAN / localhost / private URL，也可以创建本地 Chromium sidecar，避免把内网地址发给云 provider。公共 URL 仍然走云 session。

安全上有两层：

- always-blocked floor：云 metadata / IMDS 端点直接拒绝。
- URL safety / website policy：根据配置决定是否允许访问。

这类设计很值得借鉴：云浏览器强但有隐私边界，内网地址应尽量留在本机。

## Browser 截图和视觉

`browser_vision()` 会截图并根据主模型能力选择返回路径：

- 如果主模型支持 native vision，返回 multimodal tool-result envelope，把截图直接塞给主模型。
- 如果主模型不支持 vision，则调用 auxiliary vision 模型分析截图，返回文本分析。

截图会保存到 `$HERMES_HOME/cache/screenshots`，并有 24 小时清理逻辑。清理还做了 throttling，避免 screenshot-heavy 工作流每次都全目录扫描。

Lightpanda 这种无图形 renderer 的 engine 会被预路由到 Chrome fallback 做截图，因为 text snapshot 可以用 Lightpanda，但视觉截图需要真实 renderer。

输出中会包含 `screenshot_path`，用户可以通过 `MEDIA:<path>` 分享截图。

## Browser 依赖与 PATH

`tools/browser_tool.py` 里有一套 PATH 发现逻辑：

- Termux 路径。
- Homebrew `/opt/homebrew/bin`。
- Homebrew versioned Node，例如 `node@20`、`node@24`。
- `$HERMES_HOME/node/bin`。
- `$HERMES_HOME/node_modules/.bin`。
- 常见 `/usr/local/bin`、`/usr/bin`。

原因是 browser 工具依赖 `agent-browser`、Node、npx、Chromium，在 systemd、Docker、SSH、Homebrew 未 link 的环境里 PATH 经常不完整。

`hermes_cli/tools_config.py` 的 browser post-setup 会：

- 安装 Node/browser 相关依赖。
- 对 local browser 安装 Chromium / headless shell。
- 对 Camofox 提示 `npx @askjo/camofox-browser` 或 Docker 启动。

## Image Generation

图像生成的 wrapper 是 `tools/image_generation_tool.py`，provider 抽象是 `agent/image_gen_provider.py`。

agent 看到的是 `image_generate`，统一输入大致是：

- `prompt`
- `aspect_ratio`: `landscape` / `square` / `portrait`

provider 返回统一 shape：

```text
{
  "success": true,
  "image": "<url or absolute file path>",
  "model": "...",
  "prompt": "...",
  "aspect_ratio": "...",
  "provider": "..."
}
```

失败时：

```text
{
  "success": false,
  "error": "...",
  "error_type": "...",
  "provider": "..."
}
```

provider 抽象提供：

- `name`
- `display_name`
- `is_available()`
- `list_models()`
- `default_model()`
- `get_setup_schema()`
- `generate(prompt, aspect_ratio, **kwargs)`

插件路径包括：

- `plugins/image_gen/fal`
- `plugins/image_gen/openai`
- `plugins/image_gen/xai`
- `plugins/image_gen/krea`
- `plugins/image_gen/openai-codex`

## FAL 图像生成兼容层

`tools/image_generation_tool.py` 里仍保留 FAL 的大量 model catalog。每个模型声明：

- `display`
- `speed`
- `strengths`
- `price`
- `size_style`
- `sizes`
- `defaults`
- `supports`
- `upscale`

`size_style` 解决不同模型参数不一致的问题：

- `image_size_preset`：FLUX、Z-Image、Qwen、Recraft、Ideogram 等。
- `aspect_ratio`：Nano Banana / Gemini 风格。
- `gpt_literal`：GPT Image 1.5 这类字面尺寸字符串。

`supports` 是关键工程细节：构造 payload 时只保留该模型支持的 key，避免不同 FAL 模型因为未知参数报错。这个比“统一大 payload 全发过去”稳很多。

图像落盘辅助在 `agent/image_gen_provider.py`：

- `save_b64_image()`：base64 bytes 保存到 `$HERMES_HOME/cache/images`。
- `save_url_image()`：下载 provider 返回的临时 URL，限制最大 25MB，并检查/推断图片扩展名。

下载临时 URL 的原因是很多 provider 返回的 CDN URL 会很快过期；工具完成时就物化成本地文件，后续 Telegram/Discord/浏览器预览更可靠。

## Image provider dispatch

`image_generate_tool()` 会先看 `image_gen.provider`。

如果显式配置了 plugin provider：

- 去 `agent.image_gen_registry.get_provider()` 查找。
- 找不到时会尝试强制刷新插件发现。
- 仍找不到返回 `provider_not_registered`。
- provider 抛异常会变成 `provider_exception`。
- provider 返回非 dict 会变成 `provider_contract`。

如果没有显式 provider，则保留 legacy/FAL 路径和 managed gateway fallback。

这说明 Hermes 在做迁移时不是一次性删除旧实现，而是通过“显式配置走新 provider，否则旧路径继续工作”降低升级风险。

## TTS

TTS wrapper 是 `tools/tts_tool.py`，provider 抽象是 `agent/tts_provider.py`。

TTS 有三层扩展面，优先级非常明确：

1. Built-in providers：`edge`、`openai`、`elevenlabs`、`minimax`、`mistral`、`gemini`、`xai`、`neutts`、`kittentts`、`piper` 等。
2. Command providers：用户在 `tts.providers.<name>: type: command` 配置本地命令模板。
3. Plugin providers：通过 `agent.tts_registry.register_provider()` 注册。

Built-in 永远赢。插件不能 shadow built-in 名字，注册时会拒绝，dispatch 时也会再次防御性检查。Command provider 也优先于同名 plugin provider，因为 config 比插件安装更贴近用户意图。

## TTS 输出与限制

`text_to_speech_tool()` 的输出是媒体路径，schema 描述里明确：

- 返回 `MEDIA:<path>`，平台可以把它作为原生音频发送。
- Telegram voice bubble 用 Opus/Ogg。
- CLI、Discord、WhatsApp 等更多用 MP3 或普通附件。

TTS 做了 provider-specific 文本长度限制：

- OpenAI 约 4096。
- xAI 约 15000。
- MiniMax 约 10000。
- ElevenLabs 根据模型不同 5000/10000/30000/40000。
- local 小模型如 NeuTTS/KittenTTS 更保守。

用户可以通过 `tts.<provider>.max_text_length` 或 command provider config 覆盖。

依赖采用 lazy import：

- Edge TTS 只有用到时才 import/install。
- ElevenLabs、Mistral 等通过 `tools.lazy_deps.ensure()` 尝试延迟安装。
- 本地 KittenTTS/Piper 也是按需加载。

这个设计避免“仅仅导入工具注册表”就因为音频库、PortAudio、SDK 缺失而崩。

## Command TTS

Command provider 是很实用的本地扩展机制。

用户在 `config.yaml` 中配置一个命令，Hermes 会：

- 把输入文本写到临时文件。
- 约定输出文件路径。
- 运行 shell command。
- 检查输出音频文件。
- 返回标准 JSON envelope。

它适合把任意本地 TTS CLI 接进来，而不需要写 Python plugin。真正需要 SDK、streaming、OAuth、voice listing 的时候才用 plugin provider。

## Computer Use

Computer Use 是单独的一套工具，入口是 `tools/computer_use_tool.py`，真实实现是：

- `tools/computer_use/schema.py`
- `tools/computer_use/tool.py`
- `tools/computer_use/backend.py`
- `tools/computer_use/cua_backend.py`
- `tools/computer_use/vision_routing.py`

它面向任意 tool-calling 模型，不依赖 Anthropic 原生 `computer_...` schema。Hermes 自己定义一个 OpenAI function-calling schema：

```text
computer_use({
  "action": "capture" | "click" | "type" | "key" | ...,
  ...
})
```

支持动作：

- `capture`
- `click`
- `double_click`
- `right_click`
- `middle_click`
- `drag`
- `scroll`
- `type`
- `key`
- `set_value`
- `wait`
- `list_apps`
- `focus_app`

推荐流程是：

```text
capture(mode="som")
  -> 得到带编号 overlay 的截图和 AX elements
  -> click(element=N)
```

比直接用坐标更可靠。

## Computer Use backend

`tools/computer_use/backend.py` 定义抽象：

- `CaptureResult`
- `ActionResult`
- `UIElement`
- `ComputerUseBackend`

默认实现是 `tools/computer_use/cua_backend.py`：

- macOS only。
- 通过 `cua-driver mcp` stdio 通信。
- `cua-driver` 底层使用 macOS SkyLight SPI，可以后台控制窗口。
- 目标是“不偷用户鼠标、键盘焦点或 Space”。

backend 生命周期：

- `_get_backend()` 懒加载。
- 默认 `HERMES_COMPUTER_USE_BACKEND=cua`。
- 测试可用 `noop` backend。
- backend 启动后缓存到进程内。

requirements check：

- `check_computer_use_requirements()` 只检查 `cua-driver` binary 是否可用。
- `hermes_cli/tools_config.py` 的 `cua_driver` post-setup 会运行安装器。
- 非 macOS 静默跳过或提示不可用。

## Computer Use 审批和硬阻断

`tools/computer_use/tool.py` 里内置安全层。

安全动作：

- `capture`
- `wait`
- `list_apps`

变更用户可见状态的动作需要审批：

- click / double_click / right_click / middle_click
- drag
- scroll
- type
- key
- set_value
- focus_app

审批 callback 通过 `set_approval_callback()` 注入，形状和 terminal tool 类似。返回值支持：

- `approve_once`
- `approve_session`
- `always_approve`
- `deny`

硬阻断不受审批影响：

- `cmd+shift+backspace`：清空废纸篓。
- `cmd+option+backspace`：强制删除。
- `cmd+ctrl+q`：锁屏。
- `cmd+shift+q`：登出。
- `cmd+option+shift+q`：强制登出。

`type` 文本也会检查危险 shell pattern：

- `curl ... | bash`
- `curl ... | sh`
- `wget ... | bash`
- `sudo rm -rf`
- `rm -rf /`
- fork bomb。

这里的设计点是：审批解决“是否允许变更”，硬阻断解决“即使用户误批也不应该做”的动作。

## Computer Use Multimodal Tool Result

Computer Use capture 或 `capture_after=True` 可以返回 multimodal envelope：

```text
{
  "_multimodal": true,
  "content": [
    {"type": "text", "text": "..."},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
  ],
  "text_summary": "..."
}
```

`run_agent.py` 构造 tool message 时会识别 `_multimodal`：

- OpenAI-compatible provider 得到 list-shaped content。
- Anthropic adapter 会把 base64 image 拼进 `tool_result` block。
- 不支持 multimodal tool result 的模型至少能看到 `text_summary`。

`tools/computer_use/vision_routing.py` 还会决定是否把截图预先交给 auxiliary vision 分析。这样可以避免主模型不支持 tool-result image 时直接报错，同时又不让支持 vision 的主模型丢掉截图。

## 与工具配置页的关系

`hermes_cli/tools_config.py` 是这些能力的 setup hub。

它会把 provider registry 注入 picker：

- `_plugin_web_search_providers()`
- `_plugin_browser_providers()`
- `_plugin_image_gen_providers()`
- `_plugin_tts_providers()`

同时保留一些 hardcoded rows：

- TTS built-ins。
- Browser local / Camofox 等本地模式。
- Computer Use 的 `cua-driver`。

选择 provider 时会写配置：

- `web.backend` / `web.search_backend` / `web.extract_backend`
- `browser.cloud_provider`
- `image_gen.provider`
- `image_gen.model`
- `tts.provider`
- `tts.use_gateway`

post-setup hook 会安装必要依赖：

- `agent_browser`
- `browserbase`
- `camofox`
- `kittentts`
- `piper`
- `cua_driver`

这是一个很有代表性的“配置 UI 不是静态表单，而是根据 plugin registry 动态生成 provider row”的设计。

## Managed Gateway 与 BYOK

这些工具中多处支持 Nous managed tool gateway：

- Web / Firecrawl。
- Browser / Browser Use。
- Image Gen / FAL。
- TTS / OpenAI audio 等。

通常有两个路径：

- BYOK：用户自己的 API key。
- Managed：订阅用户通过 Nous token 走托管 gateway。

`tools.tool_backend_helpers` 负责一些共同判断：

- 是否 prefer gateway。
- managed feature 是否启用。
- gateway 不可用时给出统一提示。
- provider 名称兼容/normalize。

工程上的好处是：agent tool schema 不需要暴露“你是 BYOK 还是订阅 gateway”，这只是后端路由细节。

## 值得学习的工程点

- Provider ABC 保持响应 shape 稳定，迁移 backend 时 wrapper 不必为每个 vendor 写分支。
- `is_available()` 必须便宜，避免 CLI 启动和工具列表刷新被网络请求拖慢。
- Wrapper re-export legacy names，给测试和外部 monkeypatch 留兼容期。
- Browser 用 accessibility tree ref，而不是纯视觉坐标，显著降低 agent 操作错误率。
- Cloud browser 遇到 private/LAN URL 自动本地 sidecar，保护内网隐私。
- 截图路径持久化并定期清理，让用户和平台都能复用证据文件。
- 图像生成使用 per-model `supports` 白名单，避免统一 payload 被某个模型拒绝。
- TTS 把 built-in、command、plugin 三层优先级写清楚，避免 shadowing 混乱。
- Computer Use 把高风险操作放在审批层前后双重处理：先硬阻断，再审批。
- Multimodal tool result 通过 `_multimodal` envelope 穿过统一 tool pipeline，而不是给每个 provider 写特殊逻辑。

## 阅读源码建议

建议按这个顺序读：

1. `agent/web_search_provider.py`、`agent/browser_provider.py`、`agent/image_gen_provider.py`、`agent/tts_provider.py`：先看 provider contract。
2. `tools/web_tools.py`：看 capability backend fallback 和旧 provider 迁移兼容。
3. `tools/browser_tool.py`：看 session、CDP、cloud/local/camofox、screenshot/vision。
4. `tools/image_generation_tool.py`：看 FAL catalog、payload whitelist、plugin dispatch。
5. `tools/tts_tool.py`：看 built-in/command/plugin 优先级和 lazy deps。
6. `tools/computer_use/schema.py`：看单工具 action discriminator schema。
7. `tools/computer_use/tool.py`：看审批、硬阻断、multimodal envelope。
8. `tools/computer_use/cua_backend.py`：看 macOS `cua-driver mcp` backend。
9. `hermes_cli/tools_config.py`：看 setup picker 如何把 plugin provider 注入 UI。
