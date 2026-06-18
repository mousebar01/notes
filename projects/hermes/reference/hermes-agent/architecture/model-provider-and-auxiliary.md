# 模型 Provider、Transport 与 Auxiliary Client

本文整理 Hermes Agent 的模型调用架构。Hermes 把“主对话模型调用”和“辅助任务模型调用”分成两套相关但不同的路径：

- 主对话：`AIAgent` 使用 provider profile + transport 调 `run_conversation()`。
- 辅助任务：`agent/auxiliary_client.py` 为压缩、标题、视觉、session search、web extract、skills hub 等 side tasks 选择模型。

核心源码：

- `providers/base.py`：`ProviderProfile` 声明式 provider 元数据。
- `providers/__init__.py`：model provider 插件发现与注册。
- `plugins/model-providers/<name>/__init__.py`：各 provider profile。
- `agent/transports/chat_completions.py`：Chat Completions transport kwargs 构造和 response normalize。
- `agent/auxiliary_client.py`：辅助任务 LLM router、fallback、client cache、错误恢复。
- `agent/agent_init.py`：AIAgent 初始化时解析 provider/model/base_url/api_mode。

---

## 1. 为什么需要 ProviderProfile

`providers/base.py` 的注释说得很清楚：`ProviderProfile` 把 provider 的行为声明在一个地方，而不是让 transport 接收二十多个 boolean flags。

ProviderProfile 是 declarative：

- 声明 provider 身份。
- 声明认证和 endpoint。
- 声明请求时的特殊参数。
- 声明消息预处理。
- 声明 extra_body。
- 声明默认 auxiliary model。

它不负责：

- client construction
- credential rotation
- streaming

这些仍然属于 `AIAgent` / client layer。

---

## 2. ProviderProfile 字段

核心字段：

- `name`
- `api_mode`
- `aliases`
- `display_name`
- `description`
- `signup_url`
- `env_vars`
- `base_url`
- `models_url`
- `auth_type`
- `supports_health_check`
- `supports_vision`
- `fallback_models`
- `hostname`
- `default_headers`
- `fixed_temperature`
- `default_max_tokens`
- `default_aux_model`

其中 `auth_type` 支持：

- `api_key`
- `oauth_device_code`
- `oauth_external`
- `copilot`
- `aws_sdk`

`OMIT_TEMPERATURE` 是一个 sentinel，表示请求中完全不要发送 temperature。这用于某些 provider/model 由服务端管理 temperature，发了反而报错。

---

## 3. ProviderProfile hooks

ProviderProfile 可以 override 几个 hook：

### 3.1 `prepare_messages(messages)`

provider-specific message preprocessing。

调用顺序：codex field sanitization 之后，developer role swap 之前。

### 3.2 `build_extra_body(...)`

返回 provider-specific `extra_body`，例如：

- provider routing
- tags
- plugin fields
- high resolution flags

### 3.3 `build_api_kwargs_extras(...)`

返回：

```python
(extra_body_additions, top_level_kwargs)
```

原因是不同 provider 放 reasoning config 的位置不同：

- OpenRouter：`extra_body.reasoning`
- Kimi：top-level `reasoning_effort`

这个 hook 把“extra_body 字段”和“顶层 API kwargs”分开。

### 3.4 `get_max_tokens(model)`

默认返回 `default_max_tokens`，但 provider 可以按 model 给不同 output cap。

适合一个 provider profile 背后代理多个上游模型的情况。

### 3.5 `fetch_models(...)`

默认请求：

1. `models_url`
2. `base_url + "/models"`

带 Bearer auth 和 `default_headers`。

它设置 User-Agent 为 `hermes-cli/<version>`，避免一些 provider/WAF 拦截 Python 默认 UA。

---

## 4. Provider discovery

`providers/__init__.py` 管 model provider registry。

来源：

1. bundled：`plugins/model-providers/<name>/`
2. user：`$HERMES_HOME/plugins/model-providers/<name>/`
3. legacy：`providers/<name>.py`

发现是 lazy 的。第一次调用：

```python
get_provider_profile(name)
list_providers()
```

才执行 `_discover_providers()`。

每个 provider plugin 在 import 时调用：

```python
register_provider(profile)
```

---

## 5. last-writer-wins 覆盖

注册逻辑：

```python
_REGISTRY[profile.name] = profile
for alias in profile.aliases:
    _ALIASES[alias] = profile.name
```

后注册的同名 profile 会替换前面的。

发现顺序是 bundled -> user -> legacy，所以用户 provider 可以覆盖 bundled provider。

这也是为什么普通 plugin manager 不 import `kind="model-provider"` 的插件：如果 import 两次，会破坏这个覆盖语义。

---

## 6. provider import namespace

bundled provider 用稳定 module path：

```text
plugins.model_providers.<safe_name>
```

user provider 用：

```text
_hermes_user_provider_<safe_name>
```

这样用户 profile 不会和 bundled provider 在 `sys.modules` 中撞名。

---

## 7. 主对话 transport：ChatCompletionsTransport

`agent/transports/chat_completions.py` 构造 `client.chat.completions.create(...)` 的 kwargs。

入口：

```python
build_kwargs(model, messages, tools=None, **params)
```

第一步会做消息转换：

```python
sanitized = self.convert_messages(messages, model=model)
```

这会清理 Codex/Responses 相关字段，例如 `reasoning_items`、`call_id`、`response_item_id`，同时保留 Gemini thought_signature 等 provider 必需字段。

---

## 8. profile path 与 legacy fallback

`build_kwargs(...)` 有两条路径：

1. 如果传入 `provider_profile`：走 `_build_kwargs_from_profile(...)`。
2. 否则走 legacy flags fallback。

源码注释说：known providers 都应该走 profile path；legacy fallback 只用于 unregistered/custom provider。

这说明 Hermes 正在从“transport 中判断一堆 provider flags”迁移到“ProviderProfile 声明 provider 差异”的架构。

---

## 9. Developer role swap

无论 profile path 还是 legacy path，都会对某些模型做 system -> developer role swap：

```python
if first message role == "system" and model matches DEVELOPER_ROLE_MODELS:
    role = "developer"
```

这用于 GPT-5/Codex 等模型族。

这个逻辑放在 transport 层，而不是 prompt builder 层，说明 prompt builder 仍构造语义上的 system prompt，具体 API 角色适配由 transport 负责。

---

## 10. tools schema 处理

如果有 tools：

- OpenAI format 原样使用。
- Moonshot/Kimi 模型会调用 `sanitize_moonshot_tools(tools)`，因为它们 JSON Schema 更严格。

这避免 provider-specific schema 兼容性污染工具注册层。工具系统仍给出统一 schema，transport 在最后一步做 provider 适配。

---

## 11. max_tokens 优先级

profile path 中 max_tokens 解析优先级：

1. ephemeral override
2. user configured max_tokens
3. profile.get_max_tokens(model)
4. anthropic max output fallback

代码形态：

```python
if ephemeral is not None:
    ...
elif user_max is not None:
    ...
elif profile_max:
    ...
elif anthropic_max is not None:
    ...
```

这样一次性 override 不会永久改变用户配置，provider 默认也只在用户没设置时生效。

---

## 12. temperature 处理

profile path：

- `fixed_temperature is OMIT_TEMPERATURE`：完全不发 temperature。
- `fixed_temperature is not None`：发固定 temperature。
- 否则使用 caller 的 temperature。

这比在每个 provider 分支里手写 if 更清晰。

辅助 client 也有 unsupported temperature retry：如果 provider 报不支持 temperature，会去掉 temperature 重试一次。

---

## 13. extra_body 合并顺序

profile path 中 `extra_body` 由多层合并：

1. `profile.build_extra_body(...)`
2. `profile.build_api_kwargs_extras(...)` 返回的 extra_body 部分
3. caller `extra_body_additions`
4. request overrides 中的 `extra_body`

普通 request overrides 中非 `extra_body` key 则写到顶层 `api_kwargs`。

这保证用户 override 最后生效。

---

## 14. Native Gemini extra_body 过滤

一个细节：如果目标是 native Gemini base_url，transport 会过滤 `extra_body`，只保留：

- `thinking_config`
- `thinkingConfig`

原因：Google native REST schema 不接受 OpenAI-style extra_body 里的 tags、provider、plugins 等字段。否则会直接 400。

这说明 provider fallback/auxiliary 路由可能让某个 profile 的 extra_body 落到另一个 endpoint 上，所以 transport 需要最后一道 endpoint 级防御。

---

## 15. response normalize

`normalize_response(...)` 把 OpenAI ChatCompletion 转成 Hermes 内部 `NormalizedResponse`。

它会保留：

- `tool_calls`
- tool call id/name/arguments
- provider-specific `extra_content`
- reasoning details
- reasoning content
- usage

Gemini 3 thinking models 的 `thought_signature` 会在 tool call 的 `extra_content` 中保留。如果下一轮 replay 时丢了，Gemini API 可能拒绝请求。

这是一个非常关键的多轮工具调用兼容点。

---

## 16. Auxiliary Client 的职责

`agent/auxiliary_client.py` 是 side-task LLM router。

典型任务：

- `compression`
- `vision`
- `web_extract`
- `session_search`
- `skills_hub`
- `mcp`
- `title_generation`
- curator/background tasks

它提供统一入口：

```python
call_llm(task=..., messages=..., ...)
get_text_auxiliary_client(task=...)
get_async_text_auxiliary_client(task=...)
```

目标：所有辅助任务不要各自硬编码 API key、base_url、fallback。

---

## 17. per-task auxiliary 配置

配置在：

```yaml
auxiliary:
  compression:
    provider: auto
    model: ""
    base_url: ""
    api_key: ""
    api_mode: ""
    timeout: 60
    extra_body: {}
    fallback_chain: []
```

不同 task 可以有自己的 provider/model/base_url/max_tokens/reasoning/timeout 等。

插件也可以通过：

```python
ctx.register_auxiliary_task(...)
```

注册 auxiliary task defaults。`_get_auxiliary_task_config(task)` 会做：

```text
plugin defaults <- config.yaml auxiliary.<task>
```

用户配置覆盖插件默认。

---

## 18. _resolve_task_provider_model()

解析一次 auxiliary call 的 provider/model 优先级：

1. 显式参数 `provider/model/base_url/api_key`
2. `config.yaml` 的 `auxiliary.<task>.*`
3. `auto`

返回：

```python
(provider, model, base_url, api_key, api_mode)
```

如果设置了 `base_url`，通常会强制 provider 为 `custom`。

但有一个细节：

- 如果 `cfg_base_url` + known `cfg_provider`，但没有 api_key，则保留 provider，让 provider 从 env 找 credential。
- 如果 `cfg_base_url` + `cfg_api_key` 都有，则走 custom endpoint。

它还支持 direct API aliases：

- `provider: openai` 可以展开成 `custom + api.openai.com/v1`
- 类似直接 API-key endpoint 不一定是 first-class provider。

---

## 19. auto 模式语义

`_resolve_auto(main_runtime=None)` 的优先级：

1. 用户主 provider + 主 model。
2. OpenRouter -> Nous -> custom -> Codex -> API-key providers fallback chain。

源码注释强调：现在 `auto` 的语义是“辅助任务也使用我的主聊天模型”，而不是偷偷切到便宜 fallback 模型。

这样压缩、vision、web extract、session search 等 side tasks 行为更可预测。

如果主 provider 近期被标记为 unhealthy，比如 402，auto 会跳过它，避免每次 auxiliary call 都先付出一次必失败 RTT。

---

## 20. stale OPENAI_BASE_URL 警告

`_resolve_auto()` 会检查：

- `.env` 中有 `OPENAI_BASE_URL`
- 但 `model.provider` 不是 `custom`

这通常是用户以前配置 custom endpoint 后切换了 provider，但 `.env` 里旧 base_url 还在。

Hermes 会 warning：auxiliary clients 可能路由到错误 endpoint，建议重新 `hermes model` 或移除 `.env` 中的 `OPENAI_BASE_URL`。

这是一个很实用的排错设计，因为 env poisoning 很难从表面看出来。

---

## 21. resolve_provider_client()

`resolve_provider_client(provider, model, ...)` 是 auxiliary provider client 的中心路由。

它返回：

```python
(client, resolved_model)
```

并保证 client 暴露：

```python
client.chat.completions.create(...)
```

即使底层是 Codex Responses API 或 Anthropic Messages API，也会通过 adapter 包成 Chat Completions 风格。

支持参数：

- `provider`
- `model`
- `async_mode`
- `raw_codex`
- `explicit_base_url`
- `explicit_api_key`
- `api_mode`
- `main_runtime`
- `is_vision`

---

## 22. model fallback resolution

如果调用 `resolve_provider_client()` 时没传 model，会按顺序找：

1. 显式 `model` 参数。
2. provider 的 auxiliary 默认模型：`ProviderProfile.default_aux_model` 或 legacy fallback dict。
3. 用户主模型 `_read_main_model()`。

这对 OAuth provider 很重要。比如 xAI OAuth 用户配置了主模型，辅助任务也应该用这个主模型，而不是掉到某个固定老默认。

---

## 23. Codex / Anthropic wrapper

`resolve_provider_client()` 中 `_wrap_if_needed(...)` 会处理：

- Codex Responses API：包装成 `CodexAuxiliaryClient`
- Anthropic Messages API：包装成 `AnthropicAuxiliaryClient`

触发 Codex wrap 的条件：

- `api_mode == "codex_responses"`
- 或 api.openai.com + model 名称包含 codex

如果 `raw_codex=True`，则不 wrap，用于主 agent loop 需要直接访问 `responses.stream()` 的场景。

---

## 24. async client 转换

`_to_async_client(sync_client, model, is_vision=False)` 把 sync client 转成 async。

它保留特殊 adapter：

- `CodexAuxiliaryClient` -> `AsyncCodexAuxiliaryClient`
- `AnthropicAuxiliaryClient` -> `AsyncAnthropicAuxiliaryClient`
- Gemini native -> Async Gemini native
- Copilot ACP -> 原 client

普通 OpenAI-compatible client 则构造 `AsyncOpenAI`，并根据 base_url 补 headers：

- OpenRouter attribution headers
- GitHub Copilot headers
- Kimi User-Agent
- NVIDIA NIM headers
- ProviderProfile.default_headers

vision=True 且 Copilot 时会加 vision routing header，避免 vision payload 超时。

---

## 25. call_llm()

`call_llm(...)` 是同步 auxiliary LLM 调用统一入口。

流程：

1. `_resolve_task_provider_model(...)`
2. 读取 `auxiliary.<task>.extra_body`
3. vision task 走 `resolve_vision_provider_client(...)`
4. text task 走 `_get_cached_client(...)`
5. 若 explicit provider 无 credentials，fail fast
6. auto/custom 无 credentials 时尝试 auto chain
7. 读取 task timeout
8. `_build_call_kwargs(...)`
9. Anthropic-compatible endpoint 转换 image blocks
10. 调 `client.chat.completions.create(...)`
11. `_validate_llm_response(...)`
12. 根据错误做 retry/fallback/recovery

---

## 26. explicit provider 的 fail fast

如果用户显式配置了非 `auto/openrouter/custom` provider，但没有 credentials，`call_llm()` 会直接报：

```text
Provider '<x>' is set in config.yaml but no API key was found.
```

不会静默切到 OpenRouter。原因：用户明确选择 provider，静默换 provider 会造成 confusing 404 或意外账单。

auto 模式才允许自动链路降级。

---

## 27. auxiliary timeout

`_get_task_timeout(task)` 读取：

```yaml
auxiliary:
  <task>:
    timeout: ...
```

默认 `_DEFAULT_AUX_TIMEOUT = 30.0`。

调用 `call_llm(... timeout=...)` 时，显式 timeout 优先。

上下文压缩中使用 `call_llm(task="compression", ...)`，因此压缩摘要模型 timeout 可以独立配置。

---

## 28. 请求参数 retry

`call_llm()` 有几类请求参数自修复：

### 28.1 unsupported temperature

如果 provider 拒绝 temperature：

- 移除 temperature
- 重试一次

### 28.2 max_tokens 不支持

如果错误提到 `max_tokens` 或 `unsupported_parameter`，会移除：

- `max_tokens`
- `max_completion_tokens`

然后重试。

### 28.3 ZAI multimodal 参数错误

ZAI vision model 可能返回 code 1210，但错误文本不含 `max_tokens`。代码专门检测 `1210` + bigmodel endpoint，移除 max_tokens 重试。

这些逻辑避免 side task 因 provider 参数差异直接失败。

---

## 29. Nous stale model self-heal

Nous Portal 可能推荐的 model 后来从 Nous -> OpenRouter catalog 中消失，导致 auxiliary call 404。

如果检测到 model not found 且 client 是 Nous，会：

1. 刷新 Nous 推荐模型。
2. 如果新模型不同，替换 kwargs["model"]。
3. 重试一次。

这解决长进程中 provider catalog 漂移的问题。

---

## 30. auth refresh 与 credential pool recovery

`call_llm()` 会处理：

- Nous auth refresh。
- 其他 provider auth refresh。
- same-provider credential pool rotation。

credential pool recovery 会记录当前 client 实际使用的 API key：

```python
_client_api_key = str(getattr(client, "api_key", "") or "")
```

这样当另一个进程已经旋转 pool 时，仍然能标记“这次失败的具体 key”，避免误标 next key。

如果 rotated key 也失败，会立即标记并继续 fallback。

---

## 31. payment / connection / rate-limit fallback

auxiliary client 会对这些错误尝试 fallback：

- payment / credit exhaustion
- connection / DNS / timeout
- rate limit

fallback 策略：

- auto 用户：走 full auto chain。
- explicit aux provider：先 `auxiliary.<task>.fallback_chain`，再 main agent model 作为最后 safety net。

capacity errors（payment/connection）即使用户显式 provider，也允许 fallback，因为 provider 当前无法服务请求。

rate limit fallback 只在 auto 或特定容量判断下触发，避免违背显式 provider 选择。

---

## 32. unhealthy provider cache

当 provider 返回 402/credit exhaustion，会被标记 unhealthy 一段 TTL。

后续 auxiliary calls 会跳过它，直到 TTL 过期。

这避免每次 side task 都先打到已知欠费/耗尽的 provider，既慢又浪费日志噪音。

---

## 33. fallback_chain

每个 auxiliary task 可以配置：

```yaml
auxiliary:
  compression:
    fallback_chain:
      - provider: openrouter
        model: ...
      - provider: nous
        model: ...
```

`_try_configured_fallback_chain(...)` 会按顺序尝试，跳过当前失败 provider。

每个 entry 可带：

- `provider`
- `model`
- `base_url`
- `api_key`

成功后返回 `(client, model, label)`。

---

## 34. Vision auxiliary 特殊路径

vision task 不直接走 text auxiliary client，而是 `resolve_vision_provider_client(...)`。

auto vision fallback 顺序与 text 不完全相同，注释中提到：

1. main model if vision-capable
2. OpenRouter vision-capable fallback
3. Nous Portal vision-capable fallback

如果用户显式 vision provider 不可用，且没设 direct base_url，会 warning 后 fallback 到 auto vision backends。

这是因为 vision 能力不是所有 text model 都支持，不能简单复用 text provider chain。

---

## 35. 与上下文压缩的关系

`ContextCompressor._generate_summary(...)` 调：

```python
call_llm(
    task="compression",
    main_runtime={...},
    messages=[{"role": "user", "content": prompt}],
    max_tokens=int(summary_budget * 1.3),
)
```

这意味着压缩摘要模型由 auxiliary client 解析：

- 可用 `auxiliary.compression.provider/model/base_url/api_key/api_mode/timeout` 覆盖。
- 默认 auto 用主模型。
- 主 provider 失败可走 fallback。
- 参数不兼容会 retry。
- payment/rate-limit/connection 可降级。

压缩器自己还在 `_generate_summary()` 里做了一层 summary model fallback 到 main model，属于压缩层的额外保护。

---

## 36. 与 session_search/title 等任务的关系

标题生成、session search、web extract、skills hub 等都应走 auxiliary client，而不是各自创建 OpenAI client。

好处：

- 统一 auth。
- 统一 provider defaults。
- 统一 timeout。
- 统一 fallback。
- 统一 request arg 兼容。
- 统一日志。

这也是 `agent/auxiliary_client.py` 文件头强调的目标。

---

## 37. 工程上值得学习的细节

1. **ProviderProfile 是声明式 provider 差异层**：transport 不再靠大量 provider flags。
2. **provider discovery lazy + last-writer-wins**：支持用户覆盖内置 provider，避免启动时 import 全部。
3. **transport 负责 API schema 适配**：prompt builder 不关心 system/developer role 或 tool schema quirks。
4. **response normalize 保留 provider_data**：多轮工具调用必须保存 Gemini thought_signature 等隐藏状态。
5. **auxiliary auto 默认用主模型**：减少 side task 意外换 provider 的不可预测性。
6. **explicit provider fail fast**：避免用户明确选择 provider 时被静默改路由。
7. **fallback 区分 request error 与 capacity error**：不是所有错误都应该 fallback。
8. **unhealthy cache 避免重复打欠费 provider**：降低延迟和噪音。
9. **credential pool recovery 标记实际失败 key**：处理并发旋转下的精确归因。
10. **保存 `${VAR}` + ProviderProfile.default_aux_model**：配置和 provider 元数据共同避免 secret 泄漏与默认模型漂移。

---

## 38. 一句话总结

Hermes 的模型架构把 provider 差异、主对话 transport、辅助任务路由分开：`ProviderProfile` 声明每个 provider 的协议和参数差异，transport 把 Hermes 内部消息转成 provider API 请求，`auxiliary_client` 则为压缩、视觉、搜索、标题等 side tasks 统一解析 provider/model、复用主模型、处理参数兼容、认证刷新、额度/限流/网络 fallback。
