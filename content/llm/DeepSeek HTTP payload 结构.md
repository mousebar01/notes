# DeepSeek HTTP payload 结构

这条笔记记录一次 DeepSeek / OpenAI 风格模型调用里，`messages`、`tools` 和控制字段分别承担什么职责，以及当前结构里工具信息重复的问题。

## 当前结构

这轮对话现在的最终结构大概是：

```text
DeepSeek HTTP payload
├─ model
├─ messages
│  ├─ system: 固定系统提示词
│  ├─ system: 动态 runtime context
│  │  ├─ runtime instructions
│  │  ├─ retrieved_memory
│  │  └─ available_tools 的文本说明
│  └─ user: 当前用户输入
├─ temperature
├─ tools
│  ├─ memorize function schema
│  ├─ recall_memory function schema
│  ├─ calculator function schema
│  └─ web_search function schema
├─ tool_choice: auto
└─ enable_thinking
```

换成人话说，现在一次模型调用分成三块。

## 1. messages：给模型读的上下文

`messages` 是模型真正会阅读的上下文文本。

这里面通常包括：

```text
固定 system prompt
动态上下文说明
当前用户输入
历史对话
本轮 ReAct 工具结果
```

现在看到的大概是：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "固定中文助手设定..."
    },
    {
      "role": "system",
      "content": "runtime context + memory block + available tools 文本说明"
    },
    {
      "role": "user",
      "content": "用户当前输入"
    }
  ]
}
```

这部分的重点是：

> `messages` 负责提供模型需要理解的语境、约束、记忆、历史和用户请求。

## 2. tools：API 原生工具定义

`tools` 不是普通 prompt 文本，而是 DeepSeek / OpenAI function calling 协议要求的工具 schema。

示例：

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "calculator",
        "description": "...",
        "parameters": {}
      }
    }
  ]
}
```

它的作用是告诉模型：

```text
有哪些工具可以调用
每个工具叫什么名字
每个工具的用途是什么
参数长什么样
哪些参数必填
```

这部分属于 API 原生协议层，而不是 prompt 文本层。

## 3. 控制字段

控制字段负责设置模型、采样、工具调用策略和思考模式。

例如：

```json
{
  "model": "deepseek-v4-flash",
  "temperature": 0.2,
  "tool_choice": "auto",
  "enable_thinking": true
}
```

这些字段不属于 `messages`，但会影响这次调用的行为。

## 当前问题：工具信息重复

现在的问题点很清楚：

```text
available_tools 在 messages 里出现了一次
tools schema 在 payload.tools 里又出现了一次
```

也就是说，工具信息被放了两遍：

```text
1. prompt 文本里：
   <available_tools>...</available_tools>

2. API schema 里：
   payload.tools = [...]
```

这会带来几个问题：

```text
1. token 浪费
   同一批工具说明重复占用上下文。

2. 信息不一致风险
   如果文本说明和 schema 不同步，模型可能被两套描述干扰。

3. prompt 噪声变多
   messages 里本来应该放上下文和工具使用原则，不应该塞太多 schema 细节。
```

## 更规范的做法

更规范的结构是：

```text
messages 里只保留工具使用原则
payload.tools 里放完整工具 schema
```

也就是：

```text
移除 messages 里的 <available_tools> 大块文本说明
保留 payload.tools 里的 function schema
```

`messages` 里可以保留少量原则，例如：

```text
如果需要计算、检索记忆或搜索信息，可以调用可用工具。
调用工具前先判断是否必要。
工具返回结果需要结合用户问题再回答。
不要编造工具没有返回的信息。
```

但具体工具名称、参数结构、JSON schema 应该主要交给 `payload.tools`。

## 一句话结论

```text
messages 负责语境和原则。
tools 负责工具 schema。
控制字段负责调用行为。
```

当前可以优化的点是：

> 把 `<available_tools>` 从 prompt 文本里去掉，让工具定义只保留在 `payload.tools`，减少重复和干扰。
