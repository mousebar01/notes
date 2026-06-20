# Messaging Platforms / Gateway Adapter 机制

本文记录 Hermes Agent 的消息平台接入层：Telegram、Slack、Discord、LINE、Teams、Email、SMS、Webhook、API Server 等是怎样被统一接到同一个 Agent 会话循环里的。

核心源码：

- `gateway/run.py`: GatewayRunner，长驻消息入口、adapter 生命周期、agent 缓存、流式输出、审批/澄清桥接。
- `gateway/session.py`: `SessionSource`、`SessionContext` 和注入到 system prompt 的平台上下文。
- `gateway/config.py`: `Platform`、`PlatformConfig`、`GatewayConfig`、home channel、reset policy、streaming 配置。
- `gateway/platforms/base.py`: `MessageEvent`、`SendResult`、`BasePlatformAdapter`、媒体缓存和平台通用发送能力。
- `gateway/platform_registry.py`: 插件平台注册表，平台插件通过 `PlatformEntry` 接入。
- `gateway/platforms/helpers.py`: 去重、文本批处理、Markdown stripping、thread participation tracking。
- `tools/send_message_tool.py`: 主动发送工具和 cron/out-of-process delivery 兜底。
- `plugins/platforms/*/adapter.py`: Discord、LINE、Teams、Mattermost、IRC、ntfy 等插件平台实现。

## 1. 总体定位

Gateway 是 Hermes 的“消息平台常驻入口”，它和 CLI/TUI/Desktop 都不是同一层：

- CLI/TUI/Desktop 是交互式本地界面。
- Gateway 是长驻进程，连接多个外部消息平台，接收异步消息，把它们归一化成 `MessageEvent`，再交给 `GatewayRunner` 调用 `AIAgent`。
- 外部平台的线程、频道、群聊、DM、附件、按钮、状态消息、打字提示，都先在 adapter 层转换成统一语义，主 runner 尽量只处理“会话”和“响应”。

一个典型链路是：

```text
Telegram/Slack/Discord/LINE/... SDK event
  -> platform adapter
  -> MessageEvent(text, source, media_urls, media_types, reply_to, auto_skill, channel_prompt)
  -> GatewayRunner message handler
  -> session key / agent cache / memory / prompt context
  -> AIAgent.run_conversation()
  -> adapter.send / edit_message / send_exec_approval / send_clarify / send media
```

这个设计的关键不是“支持很多平台”，而是“平台差异只在边界层爆炸”。Agent loop 不需要知道 Telegram forum topic 或 Slack `thread_ts` 的细节，只看一个归一化后的 source/thread/session 模型。

## 2. 统一事件模型

### `SessionSource`

`gateway/session.py` 的 `SessionSource` 是平台身份上下文，字段包括：

- `platform`: 平台名，比如 `telegram`、`slack`、`discord`。
- `chat_id`: 平台聊天室、频道、DM、conversation id。
- `chat_name`: 人类可读名称。
- `chat_type`: `dm`、`group`、`thread`、`forum` 等抽象类型。
- `user_id` / `user_name`: 发送者身份。
- `thread_id`: 平台线程/topic/thread_ts/forum thread id。
- `chat_topic`: 频道 topic 或 Telegram/Discord thread/topic 名。
- `guild_id`、`parent_chat_id`、`message_id`: Discord/Slack/Telegram 这类平台需要的补充元数据。

`SessionSource` 是“会话怎么分桶”的输入。比如同一个 Slack channel 的不同 thread，或者 Telegram supergroup 的不同 topic，会被映射到不同的 `thread_id`，然后影响 session key。

### `SessionContext`

`SessionContext` 聚合当前来源、连接中的平台、home channels、是否共享 multi-user session 等信息。`build_session_context_prompt()` 会把这些平台上下文注入 system prompt，让模型知道：

- 当前对话来自哪个平台。
- 当前是 DM、群聊、频道还是线程。
- 哪些平台处于连接状态。
- 哪些 home channel 可用于主动通知。
- 某些平台是否可用专属工具，例如 Discord 工具在 token/toolset 可用时才提示。

这不是“记忆”，而是当前消息入口的运行上下文。它会影响模型如何称呼用户、是否应该使用平台工具、是否理解 group/thread 语境。

### `MessageEvent`

`gateway/platforms/base.py` 的 `MessageEvent` 是所有 adapter 输出的统一 inbound event：

- `text`: 归一化文本。
- `message_type`: `TEXT`、`COMMAND`、`PHOTO`、`AUDIO`、`VIDEO`、`DOCUMENT` 等。
- `source`: `SessionSource`。
- `raw_message`: 平台原始对象，保留给需要深挖的平台逻辑。
- `message_id`: 平台消息 id。
- `platform_update_id`: Telegram update id，用于 `/restart` 规避重复处理。
- `media_urls`: 本地缓存路径，通常供 vision/STT/document 工具读取。
- `media_types`: MIME type。
- `reply_to_message_id` / `reply_to_text`: 回复上下文。
- `auto_skill`: 频道/topic 绑定的技能。
- `channel_prompt`: 频道级临时 prompt，不写入历史。
- `channel_context`: 由于 require-mention 等策略补回来的上下文。
- `internal`: 内部合成事件，可跳过普通用户授权检查。

值得关注的细节：`MessageEvent.get_command()` 会处理 `/cmd@botname` 这种 Telegram 风格命令，也会拒绝包含 `/` 的“命令名”，避免把文件路径误识别成 slash command。

## 3. Adapter 契约

`BasePlatformAdapter` 是所有平台的抽象基类，核心职责是：

- `connect()` / `disconnect()`: 连接平台、启动接收循环。
- `send(chat_id, content, reply_to, metadata)`: 发送文本。
- `edit_message(chat_id, message_id, content, finalize=False)`: 可选，支持流式编辑。
- `delete_message(chat_id, message_id)`: 可选，支持临时系统消息清理和 streaming preview 清理。
- `send_typing(chat_id, metadata)`: 可选，打字/状态提示。
- `send_exec_approval(...)`: 可选，用平台原生按钮/卡片渲染危险命令审批。
- `send_slash_confirm(...)`: 可选，用按钮确认昂贵但非破坏性的 slash command。
- `send_clarify(...)`: 可选，用按钮或文本实现澄清问题。
- `send_image` / `send_image_file` / `send_voice` / `send_video` / `send_document`: 平台原生媒体投递。
- `supports_draft_streaming()` / `send_draft()`: 可选，Telegram Bot API draft streaming 这类平台原生预览。
- `format_tool_event()` / `render_message_event()`: 平台自定义 streaming/tool-progress 呈现。

`SendResult` 是统一发送结果：

- `success`: 是否成功。
- `message_id`: 平台可编辑/可引用的消息 id。
- `error`: 错误文本。
- `retryable`: 是否可安全重试。
- `continuation_message_ids`: 超长消息拆分时的后续消息 id。

这个契约把“发送一条回应”拆成多个可选能力。平台能力强就覆盖更多方法，能力弱就只实现 `send()`，runner 会退化到文本 fallback。

## 4. 会话 key、群聊、线程和 topic

消息平台最大的复杂度不是 SDK，而是“这条消息属于哪个对话上下文”。Hermes 用 `SessionSource` + config 选项来统一处理。

### 群聊是否按用户隔离

`GatewayConfig` 有两个关键开关：

- `group_sessions_per_user`: 默认 `True`，群聊/频道中按用户隔离 session，避免多人共用一条上下文。
- `thread_sessions_per_user`: 默认 `False`，线程默认由所有参与者共享，因为 thread 本身通常就是一个协作上下文。

这两个开关会影响 session key 的构造，也会影响 adapter 的文本批处理 key。

### 平台线程映射

Hermes 没有强行定义一个抽象“Thread 对象”，而是用 `metadata["thread_id"]` 作为跨平台路由信号：

- Telegram forum topic: `message_thread_id`。
- Telegram DM topic: `message_thread_id` 或 `direct_messages_topic_id`，并带 `telegram_dm_topic_reply_fallback` 等额外标记。
- Slack thread: `thread_ts`。
- Discord thread/forum post: thread channel id。
- Feishu/Mattermost 等平台也尽量映射到 `thread_id`。

`gateway/platforms/base.py` 的 `_thread_metadata_for_source()` 会根据 `SessionSource` 生成发送 metadata。它对 Telegram DM topic 特别小心：有时需要 `reply_to_message_id`，有时需要 `direct_messages_topic_id`，否则 Telegram 会把消息发到错误 lane 或报 thread not found。

### Telegram 的 topic 细节

`gateway/platforms/telegram.py` 是线程/topic 复杂度最高的 adapter：

- forum group 中 General topic 的 `message_thread_id` 常是 `1`，但 Telegram `sendMessage` 对 `message_thread_id=1` 的处理和 `sendChatAction` 不一致。
- `_message_thread_id_for_send()` 会把 General topic id 映射成 `None`，但 `_message_thread_id_for_typing()` 保留 `1`，否则 typing bubble 可能显示不到 General topic。
- DM topic 需要区分“真实 topic message”和普通 reply UI anchor。代码检查 `is_topic_message`，避免把普通回复误当成持久 session thread。
- `allowed_topics` / `ignored_threads` 可以限制 bot 只处理某些 topic。
- `ignore_root_dm` 可以让启用 DM topics 的私聊根窗口不触发 agent。
- `group_topics` / `dm_topics` 可以把 topic 绑定到 skill 或自动创建/持久化 topic id。

这部分很有工程学习价值：它没有把 Telegram 的异常行为藏起来，而是在 helper 方法中明确表达“发送、打字、回复、topic fallback 是不同语义”。

### Slack 的 thread 细节

`gateway/platforms/slack.py` 把 Slack thread 映射为 session 维度：

- `thread_ts` 是 thread id。
- channel 顶层消息可回退到自己的 `ts`，使每个 DM 顶层回复 thread 成为独立 session。
- `reply_in_thread` 控制是否把回复发进 thread。
- bot 会记录自己参与过的 thread，后续 thread 回复可以不再每轮 @mention。
- 如果 bot 第一次被拉进一个已有 thread，`_fetch_thread_context()` 会拉取最近 thread 历史并作为“未在会话历史中的 thread context” prepend 到触发消息。
- Slack Assistant lifecycle events 会携带 assistant thread identity，adapter 会缓存并 seed session store，避免 assistant thread 失去 user/thread 作用域。

Slack 的设计亮点是：平台自身有“线程上下文”，但 Hermes session store 也有“会话历史”。二者不同步时，只在首次进入 thread 时补一段上下文，避免每轮重复注入。

### Discord 的 thread/forum 细节

Discord 作为插件平台在 `plugins/platforms/discord/adapter.py`，但实现非常重：

- 普通 channel 中被 @mention 后可自动创建 thread，把长对话隔离到 thread。
- forum channel 不能直接 `channel.send()`，需要创建 forum thread/post。
- 线程参与状态用 `ThreadParticipationTracker("discord")` 持久化到 `$HERMES_HOME/discord_threads.json`，重启后仍知道哪些 thread 可以免 @mention。
- `DISCORD_AUTO_THREAD`、`DISCORD_NO_THREAD_CHANNELS`、`thread_require_mention`、`free_channels` 等配置共同决定是否自动触发。
- Discord voice channel 状态、TTS、voice receiver 也挂在 adapter 内，voice 输入最终仍转成文本事件。

Discord 的难点是“channel、thread、forum post、voice channel”都有不同 API 行为；adapter 把这些差异压到 send/receive 两侧，runner 仍只看 `MessageEvent`。

## 5. 入站媒体：平台 CDN 到本地缓存

Hermes 的统一策略是：入站媒体先下载到本地 cache，再把本地路径放进 `MessageEvent.media_urls`。

原因：

- Vision/STT/document 工具通常需要本地文件路径。
- 平台附件 URL 可能需要 bot token，或者过期。
- 直接把平台私有 URL 暴露给模型不可靠，也可能有安全风险。

`gateway/platforms/base.py` 提供多类缓存工具：

- `cache_image_from_bytes()` / `cache_image_from_url()`
- `cache_audio_from_bytes()` / `cache_audio_from_url()`
- `cache_document_from_bytes()`
- `cache_media_bytes()`
- `cleanup_image_cache()` / `cleanup_document_cache()`

安全细节：

- 图片缓存会检查 magic bytes，拒绝把 HTML/error page 当图片保存。
- URL 下载会走 `tools.url_safety.is_safe_url()`，并通过 redirect guard 防 SSRF。
- Discord 附件优先用 discord.py authenticated `att.read()`，绕过 CDN URL 被 SSRF guard 误判的问题，同时保留鉴权语义。
- Slack 私有文件下载带 bot token，并区分 401/403/404/HTML 登录页，给用户更可操作的错误提示。

### Telegram 媒体批处理

Telegram album 会以多个 update 到达，但共享 `media_group_id`。如果逐个转给 agent，第二张图会变成“用户打断第一轮”。Telegram adapter 因此有 `_media_group_events` 和 `_media_group_tasks`，短暂 buffer 后合并成一个 `MessageEvent`。

普通照片 burst 也会合并，caption 用 `_merge_caption()` 合并，`media_urls` 追加。

### Slack 附件

Slack adapter 会处理：

- 图片、音频、文档附件。
- Link unfurl / rich attachment，把预览文本追加到 message text。
- Block Kit 中的 quoted/forwarded content，把 WYSIWYG 结构提取成可读文本。
- 附件下载失败时把诊断信息注入 `[Slack attachment notice]`，而不是静默丢失。

### LINE 媒体

LINE 插件 adapter 的入站媒体由 message id 下载二进制内容，缓存成本地文件。LINE 的出站媒体更特殊，见下一节。

## 6. 出站媒体：`MEDIA:<path>` 和平台原生附件

Agent 或工具可以在消息里放 `MEDIA:<local_path>` 指令。`BasePlatformAdapter.extract_media()` 会把媒体路径从文本中剥离出来，发送层再调用平台原生媒体方法。

`tools/send_message_tool.py` 也复用同一套规则：

- `MEDIA:/tmp/report.pdf` 表示发送原生附件。
- `[[as_document]]` 强制当文档发。
- `[[audio_as_voice]]` 标记音频按 voice note 发。
- `filter_media_delivery_paths()` 会筛掉不可投递路径。

平台支持差异：

- Telegram: 图片、音频、voice、video、animation、document；media group 最多 10 个。
- Slack: `files_upload_v2`，支持批量图片和 thread upload。
- Discord: 文件 attachment；forum channel 需要把附件放到 starter message 或 thread 内。
- Matrix/Signal/Feishu/Yuanbao/Weixin 等有各自 adapter 路径。
- LINE: Messaging API 不接受本地上传，只接受公网 HTTPS URL。

### LINE 的公网 URL/token 设计

`plugins/platforms/line/adapter.py` 明确指出：LINE 出站媒体必须是公网 HTTPS URL。Hermes 的做法：

- `_register_media()` 为本地文件生成 token，记录 `token -> path, expiry`。
- `_media_url()` 生成 `/line/media/<token>/<filename>` 的公网 URL。
- `_handle_media()` 通过 aiohttp app serving 文件。
- token 有 TTL，默认 30 分钟。
- handler 有 traversal guard，确保请求不能通过 filename 越权访问其他路径。
- 如果配置没有 `LINE_PUBLIC_URL` 且 webhook 绑定 `0.0.0.0`，adapter 会提示“LINE 只接受公网 HTTPS URL”。

这是一种很实用的插件平台模式：平台要求公网 URL，但核心系统只持有本地文件，于是 adapter 自己实现 tokenized temporary serving。

## 7. 流式输出和工具进度

Gateway 支持把模型输出流式展示到消息平台。配置在 `GatewayConfig.streaming`：

- `enabled`: 是否启用。
- `transport`: `auto`、`draft`、`edit`、`off`。
- `edit_interval`: 编辑节流间隔，默认 0.8 秒。
- `buffer_threshold`: 累积多少 token/字符后编辑。
- `cursor`: 流式 cursor。
- `fresh_final_after_seconds`: 长时间 preview 后最终回复改发新消息，让平台显示完成时刻。

Adapter 能力分层：

- 支持 `send_draft()` 的平台可用原生 draft streaming，Telegram Bot API 9.5+ 是主要目标。
- 支持 `edit_message()` 的平台走“先发 preview，再持续 edit”。
- 不支持 edit 的平台只能 final send，或者 tool progress 退化成独立消息/不显示。

`BasePlatformAdapter.render_message_event()` 和 `format_tool_event()` 把 streaming event 的“呈现”交给平台。默认 tool progress 是 `emoji tool_name: preview`，但 plain text 平台可以选择吞掉，避免刷屏。

值得注意：adapter 渲染的 streaming/tool-progress 不持久化到 conversation history。历史由 agent loop 负责，平台 UI 怎么展示只是输出层策略。

## 8. Busy session、打断和文本批处理

外部消息平台用户会连续发多条消息。Hermes 在 adapter 基类里处理忙碌 session：

- `_active_sessions`: session -> interrupt event。
- `_session_tasks`: session -> 当前处理 task。
- `_pending_messages`: session -> 忙碌期间排队的新消息。
- `_busy_text_mode`: 默认 `queue`。
- `_busy_text_debounce_seconds`: 短 debounce，避免用户连续输入时每个碎片都触发。
- `_busy_text_hard_cap_seconds`: debounce 最大等待。

平台还会有自己的文本批处理：

- `gateway/platforms/helpers.py` 的 `TextBatchAggregator` 是通用实现。
- Telegram、Discord 等平台有类似逻辑，把用户快速连续发送的 text 合并成一个 event。
- 对“客户端拆分的长消息”使用更长 `split_delay`。

这能减少“用户一句话分三条发，agent 对第一条立刻开始回答”的糟糕体验。

## 9. 审批和澄清：同步 agent 线程到异步平台 UI

危险命令审批和 clarify 是跨线程/跨事件循环的桥。

Agent loop 是同步调用工具；Gateway adapter 是 async 平台 SDK。Hermes 的做法：

- GatewayRunner 注册 approval/clarify 回调。
- 当工具需要审批，runner 暂停 typing，调用 adapter 的 `send_exec_approval()`。
- 如果平台支持按钮/卡片，adapter 渲染原生 UI。
- 按钮回调再调用 gateway approval queue，把等待中的 agent thread 解锁。
- 如果平台不支持按钮，fallback 到文本提示，用户回复 `/approve`、`/deny` 或下一条文本。

平台例子：

- Slack: Block Kit buttons，点击后校验用户、更新原消息、解析 approval choice。
- Discord: `discord.ui.View`，按钮回调 resolve gateway approval；clarify choice 也用 view。
- Teams: Adaptive Card `Action.Execute`，`send_exec_approval()` 发 Allow Once / Allow Session / Always Allow / Deny。
- Telegram: inline keyboard，结合 thread/topic metadata 发送到正确 topic。
- LINE: 有 reply token/quick reply constraints，因此一些流程会使用 reply token 优先、push fallback。

工程重点：审批的状态不应该只存在平台消息里。平台消息只是 UI，真正解锁 agent 的是 gateway 内部的 approval/clarify id。

## 10. 平台注册：内置平台和插件平台

内置平台由 `gateway/config.py` 的 `Platform` enum 和 gateway 创建逻辑支持。插件平台通过 `gateway/platform_registry.py` 注册：

```python
PlatformEntry(
    name="irc",
    label="IRC",
    adapter_factory=lambda cfg: IRCAdapter(cfg),
    check_fn=check_requirements,
    validate_config=...,
    setup_fn=...,
    required_env=[...],
    standalone_sender_fn=...,
)
```

`PlatformEntry` 的重要字段：

- `name`: config.yaml 使用的平台名。
- `adapter_factory`: 从 `PlatformConfig` 创建 adapter。
- `check_fn`: 依赖是否可用。
- `validate_config` / `is_connected`: 判断配置是否足以启用。
- `required_env` / `install_hint` / `setup_fn`: setup UI 使用。
- `allowed_users_env` / `allow_all_env`: 用户授权环境变量。
- `pii_safe`: session prompt 中是否可脱敏。
- `platform_hint`: 注入给 LLM 的平台提示。
- `apply_yaml_config_fn`: 插件自己把 YAML config 翻译成 env/extra。
- `cron_deliver_env_var`: cron delivery home channel。
- `standalone_sender_fn`: 没有 live gateway adapter 时 out-of-process 发送兜底。

`Platform._missing_()` 会允许已知插件平台动态成为 pseudo enum member。这样配置里写 `platforms.irc` 不需要改 core enum。

这个设计解决了两个问题：

- core 不需要为每个第三方平台加 if/elif。
- config/setup/status/cron/send_message 都能通过同一份 metadata 理解插件平台。

## 11. 主动发送、cron 和 live adapter 复用

`tools/send_message_tool.py` 是主动发送入口，也被 cron 使用。它的发送顺序很重要：

1. 如果当前进程里有 GatewayRunner weakref，并且目标平台 adapter 正在运行，直接调用 live `adapter.send()`。
2. 如果没有 live adapter，但平台注册了 `standalone_sender_fn`，调用 standalone sender。
3. 否则返回描述性错误，提示需要运行 gateway 或给插件实现 standalone sender。

这样做的好处：

- Gateway 内触发 `send_message` 时可以复用已连接 SDK、thread metadata、媒体发送能力。
- Cron 独立进程仍可通过 standalone sender 发通知。
- 插件平台自己决定 out-of-process 发送是否可行。例如 LINE standalone send 只能 push 文本，媒体无法凭空生成公网 URL，因此会提示附件生成但不可投递。

目标格式支持：

- `platform`: 使用 home channel。
- `platform:chat_id`
- `platform:chat_id:thread_id`
- `platform:#channel-name`: 通过 channel directory 解析。

`HomeChannel` 可以保存 `thread_id`，所以 `/sethome` 不只是保存频道，也能保存 Telegram topic / Discord thread 这类细粒度目的地。

## 12. 错误、重试和密钥脱敏

Gateway 层有几类防护：

- `gateway/run.py` 会捕获常见 transient network errors，避免 Telegram/network timeout 直接杀死 daemon。
- `_GATEWAY_SECRET_PATTERNS` 和 `_sanitize_gateway_final_response()` 会清理 provider/API 错误中的 token、key、Authorization header 等。
- Telegram 的最终 provider 错误会被压成安全类别，避免把 HTTP/policy 细节原样发给用户。
- `SendResult.retryable` 标记可安全重试的发送错误。
- base retry pattern 排除了普通 read/write timeout，因为非幂等发送可能已经到达平台，贸然重试会重复发消息。

这是消息系统常见但容易忽略的点：失败时“少发一条”通常比“重复发危险命令结果/通知”更安全。

## 13. PII 和平台身份提示

`gateway/session.py` 有 PII redaction 逻辑：

- WhatsApp、Signal、Telegram、BlueBubbles 等被认为 PII-safe/需脱敏的平台会 hash sender/chat id。
- Discord 默认不脱敏，因为 mention/tool 可能需要 raw IDs。
- 插件平台可以通过 `PlatformEntry.pii_safe` 声明脱敏。

这影响的是注入给模型的 session description，不一定影响 adapter 自己的路由字段。设计上把“模型可见身份文本”和“平台投递所需 raw id”分开，避免为了可读 prompt 泄露过多用户标识。

## 14. 代表平台设计笔记

### Telegram

- 最复杂的是 forum topic / DM topic。
- 流式输出可走 draft 或 edit。
- message length 按 UTF-16 code units，不是 Python `len()`；`utf16_len()` 和 `_prefix_within_utf16_limit()` 专门处理 emoji/surrogate pair。
- album/photo burst 会合并。
- General topic `1` 对 send 和 typing 的语义不同。
- root DM 可以配置忽略，迫使用户使用 topic lanes。

### Slack

- Socket Mode 常驻，带 watchdog/reconnect。
- message blocks / attachments / link unfurl 会转成可读上下文。
- thread 首次接入时 fetch prior context。
- Assistant thread events 会 seed session。
- typing 用 `assistant.threads.setStatus`，失败时静默退化。
- Block Kit buttons 用于 approval 和 slash confirm。

### Discord

- 插件平台，但功能接近一等公民。
- auto-thread、forum thread、thread participation 持久化。
- 附件用 authenticated read，避免 CDN URL/SSRF 问题。
- voice channel 支持 STT/TTS、voice receiver、voice mixer、auto timeout。
- forum channel 发送文本或附件必须创建 thread post。

### LINE

- reply token 优先，push fallback。
- reply token 单次使用且 TTL 很短，长耗时 agent turn 需要状态机/延迟提示。
- 出站媒体必须公网 HTTPS，因此 adapter 自己做 tokenized media serving。
- standalone sender 只可靠支持文本 push，媒体会提示不可投递。

### Teams

- 使用 Microsoft Teams SDK。
- 入站图片附件缓存到本地。
- approval 用 Adaptive Card。
- proactive sends 依赖 conversation reference cache。
- group threaded send 可能 400，adapter 会 fallback 到 flat send。

### ntfy / SMS / Email / Webhook / API Server

- 这些平台能力较弱，通常没有强线程/按钮/编辑能力。
- 适合通知、简单 command 或 HTTP API。
- 通常更依赖文本 fallback 和 `strip_markdown()`。
- Webhook/API server 更像程序化入口，不一定需要 reset notification。

## 15. 值得学习的工程细节

### 1. 平台能力用“可选方法”建模

不是所有平台都支持 edit/delete/button/thread/media。`BasePlatformAdapter` 给默认 no-op/failure，runner 根据能力自然 fallback。这比在 runner 写平台白名单更可维护。

### 2. Thread metadata 只在边界翻译

内部统一叫 `thread_id`，但 adapter 负责翻译成 Telegram `message_thread_id`、Slack `thread_ts`、Discord channel id。这样系统大部分逻辑不用理解平台专有名词。

### 3. 入站媒体先本地化

把平台 CDN/private URL 下载到本地 cache，既提高后续工具可用性，也减少 token/credential/URL 安全问题。

### 4. UI 状态和真实状态分离

审批按钮、clarify 选项、streaming preview 都只是 UI。真正状态在 gateway queue/session/agent loop 中。这让平台 UI 丢失或编辑失败时，系统仍能 fallback。

### 5. 插件注册不仅注册 adapter

`PlatformEntry` 同时提供 setup、status、PII、cron、YAML bridge、standalone sender、LLM hint。一个平台插件如果只注册 adapter，生态体验会断裂；Hermes 把这些元数据纳入同一注册契约。

### 6. 对平台怪癖显式建模

Telegram General topic、LINE public media URL、Slack assistant thread、Discord forum channel 都不是“边角 bug”，而是平台语义。源码把这些差异写成 helper/metadata，而不是靠注释提醒调用者小心。

### 7. 失败策略保守

发送消息是非幂等操作。Hermes 对 timeout 是否重试很谨慎，宁可返回 retryable/error，也不盲目补发导致重复通知。

### 8. Prompt 注入尊重平台上下文

平台上下文由 `SessionContext` 注入 system prompt，让模型知道自己在群聊、线程、DM、topic 里。但 raw routing id 和 PII 通过 redaction/metadata 分层，避免把内部路由需求直接暴露给模型。

## 16. 阅读源码的建议路线

建议按这个顺序看：

1. `gateway/platforms/base.py`: 先理解 `MessageEvent`、`SendResult`、`BasePlatformAdapter`。
2. `gateway/session.py`: 看 `SessionSource` 和 prompt 注入。
3. `gateway/config.py`: 看 `PlatformConfig`、`GatewayConfig`、streaming、home channel。
4. `gateway/run.py`: 搜 `send_exec_approval`、`send_clarify`、`streaming`、`_AGENT_CACHE_MAX_SIZE`、`_sanitize_gateway_final_response`。
5. `gateway/platforms/telegram.py`: 看 topic/thread/media/streaming 的复杂实现。
6. `gateway/platforms/slack.py`: 看 thread context、assistant thread、Block Kit approval。
7. `plugins/platforms/discord/adapter.py`: 看 plugin platform 如何做到重功能平台。
8. `plugins/platforms/line/adapter.py`: 看 reply token 和 public media URL 的平台约束。
9. `tools/send_message_tool.py`: 看主动发送如何复用 live adapter 和 standalone sender。

这套代码最值得学的不是某个平台 API，而是“如何把一堆不一致的聊天平台压成可扩展的 adapter contract，同时保留每个平台必要的特殊语义”。
