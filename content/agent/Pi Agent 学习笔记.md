# Pi Agent 学习笔记

这篇笔记关注 Pi Agent 中最值得复用的几组机制：消息与工具调用、并发执行后的稳定回写、上下文压缩、合法切点、结构化摘要，以及跨分支交接。重点不是复述全部实现，而是理解这些机制共同维护了哪些运行不变量。

## 来源与边界

主要学习资料：

- [How Pi Agent Works：Pi Architecture](https://how-pi-agent-works.vercel.app/concepts/pi-architecture)
- [Pi Documentation](https://pi.dev/docs/latest)

本文是基于上述资料形成的个人理解，不是 Pi 的官方实现说明。资料没有逐字给出所有默认 Prompt，具体字段和行为也可能随版本变化；涉及 `firstKeptEntryId`、`turnPrefixMessages` 等名称时，应以对应版本源码为准。

## 消息与工具模型

Pi 把一次运行组织成三类基础消息：

```ts
type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

- `user`：给出目标、补充信息或新的约束。
- `assistant`：包含自然语言回复，也可以包含一个或多个 tool call。
- `tool`：记录某次调用的结果，并通过 `toolCallId` 回指对应调用。

典型因果链是：

```text
User
→ Assistant(toolCall A, toolCall B)
→ ToolResult(A)
→ ToolResult(B)
→ Assistant
```

工具本身至少需要：

- 稳定的 `name` 和清楚的 `description`；
- 用于约束和校验输入的参数 schema；
- 真正产生行为的执行函数；
- 可选的 before / after hook，用于权限、日志、改写或扩展；
- 能被写回消息历史的结构化结果。

模型负责决定“调用什么”，运行时负责验证、执行和记录。把不稳定的外部环境隔离在工具边界外，可以让 Agent 核心只依赖稳定的消息协议；流式事件则负责把中间状态反馈给界面或调用方。

## 并行执行与顺序回写

同一条助手消息可以提出多个工具调用，但“可以并发”与“历史可以乱序”是两件事。

| 模式 | 适合场景 | 主要约束 |
| --- | --- | --- |
| 并行 | 多个互不依赖的读取、搜索或查询 | 结果完成顺序不稳定 |
| 顺序 | 写文件、执行命令、依赖前一步结果的操作 | 必须保留副作用顺序 |

对于可并发工具，运行时可以同时执行；写入 `toolResult` 消息时，仍按助手原始 tool call 顺序排列。这样既缩短等待时间，也让同一输入产生稳定、可理解的消息历史。

```text
声明顺序：A, B, C
完成顺序：B, A, C
回写顺序：A, B, C
```

这里要维护两个不变量：

1. 有依赖或副作用的调用不能被错误并发。
2. 每个结果都必须与原调用配对，回写顺序不能受调度时序污染。

## Session 与当前 Prompt

长任务会不断积累用户消息、模型回复、工具调用和工具结果。完整历史适合保存在 Session 中，但不能每轮全部发给模型。

```text
Session = 完整事件历史、分支和历次压缩记录
Prompt  = 本轮真正发送给模型的有限上下文
```

压缩后的 Prompt 通常是：

```text
System Prompt
+ 最新累计 Summary
+ 最近保留的原始消息
```

Session 中可能存在多条历史 summary，但构建当前 Prompt 时只需要当前有效的最新一份。这个区分让完整历史可以持续增长，而模型输入始终受上下文窗口约束。

## Compaction 算法

Compaction 的目标不是缩短聊天记录，而是把过旧历史转换成仍能继续工作的任务状态，同时原样保留最近、最可能马上用到的消息。

### 增量累计

当全部原始历史已经大于模型窗口时，不能再从头重算摘要。Pi 采用增量更新：

```text
summary1 = summarize(chunk1)
summary2 = summarize(summary1 + chunk2)
summary3 = summarize(summary2 + chunk3)
```

一次压缩的输入可以概括为：

```text
旧 summary
+ 新进入压缩区的完整消息
+ 当前超长回合被切掉的前缀（如有）
+ 累计文件记录
↓
新的完整 summary
```

新摘要必须替代旧摘要，而不只是描述本次新增内容。否则每压缩一次，早期目标、约束和决策都会丢失。

### 保留边界

`firstKeptEntryId` 表示摘要区与近期原始消息区的边界：

```text
消息 1–100   → 已吸收到 Summary
消息 101–120 → 继续原样保留
firstKeptEntryId = 101
```

Prompt Builder 据此构造 `Summary + 101–120`；下一次压缩也能知道哪些消息还没有进入累计摘要。

系统通常从后向前估算 `keepRecentTokens`，优先保留近期内容。原因是最新工具结果、正在进行的判断和下一步动作具有明显的时间局部性。这里不是机械地按比例切割，而是要在预算附近寻找合法切点。

## 合法切点与 Tool 配对

最自然的压缩单位是完整 Turn：从一条用户消息开始，到下一条用户消息之前结束。

```text
User
Assistant
ToolCall
ToolResult
Assistant
ToolCall
ToolResult
```

尽量在 Turn 边界切割，可以保留一段任务过程的完整因果关系。尤其不能让以下两部分无缘无故分离：

```text
Assistant ToolCall(id=x)
→ ToolResult(toolCallId=x)
```

只保留结果，模型看不到工具、参数和调用 ID；只保留调用，模型又可能误以为工具尚未完成。合法切点必须保证配对消息一起留在近期区，或者一起进入摘要区。

### Split Turn

单个 Turn 也可能大于近期保留预算，此时只能在回合内部切割：

```text
较早的回合前缀 → 摘要
较新的回合后缀 → 原样保留
```

Pi 将两类待摘要内容分开表达：

- `messagesToSummarize`：此前已经结束的完整回合；
- `turnPrefixMessages`：当前超大回合被切掉的前缀。

二者语义不同。前者是历史背景，后者是当前工作的直接前因；摘要需要明确保留后者与当前状态的衔接。如果前面没有完整回合，可能只有 `turnPrefixMessages`。

因此切点选择同时受三类约束：

1. 近期 token 预算；
2. Turn 的完整性；
3. tool call 与 tool result 的因果完整性。

## Summary Schema

Agent 需要的不是“聊了什么”，而是“怎样继续工作”。一份可恢复的摘要应至少包含：

| 字段 | 要回答的问题 |
| --- | --- |
| Goal | 用户最终要完成什么？ |
| Constraints & Preferences | 有哪些限制、偏好和不可破坏的边界？ |
| Progress / Done | 已完成什么，结果是什么？ |
| In Progress | 当前正在处理什么？ |
| Blocked | 被什么阻碍，还缺什么信息？ |
| Key Decisions | 做了哪些关键决定，理由是什么？ |
| Next Steps | 下一步应按什么顺序执行？ |
| Critical Context | 哪些事实、数据和失败尝试不能丢？ |
| read-files | 哪些文件已经检查过？ |
| modified-files | 哪些文件已经修改，后续要复查哪里？ |

普通摘要可能只写“讨论了登录模块并修改了一些代码”，这无法恢复任务。结构化摘要更像一个任务检查点：换一个 Agent，只看这份状态和近期消息，也应能继续执行。

实现上可以把职责分开：

- LLM 提炼目标、进度、理由和未完成事项；
- 程序选择输入范围、截断过大的工具输出并验证格式；
- 文件读写记录由运行时累计，避免多次压缩后丢失；
- 新 summary 保存为当前 `CompactionEntry.summary`。

这种设计承认摘要会有语义损耗，因此把可确定的边界、配对和文件状态尽量交给程序维护。

## Compaction 与 Branch Summary

两者都生成工作摘要，但解决的是不同方向的问题。

| 机制 | 触发场景 | 摘要范围 | 作用 |
| --- | --- | --- | --- |
| Compaction | 当前分支历史过长 | 时间轴上较旧的内容 | 控制当前 Prompt 大小 |
| Branch Summary | 从一条分支切换到另一条分支 | 离开分支相对共同祖先的独有路径 | 把旧路线成果交接给新路线 |

例如：

```text
A：设计登录系统
├─ B：JWT
│  └─ C：刷新 token  ← 当前分支
└─ D：Session         ← 准备切换
```

从 C 切到 D 时，共同祖先是 A。Branch Summary 总结 `B → C` 中已完成的工作、失败方案、关键决定和修改文件，并注入切换后的上下文；不需要把整条旧分支原文带过去。

可以简记为：

```text
Compaction     = 沿时间轴压缩
Branch Summary = 跨分支交接
```

## 设计取舍

这套机制不是无损记忆，而是在几组矛盾之间取平衡：

- **完整日志与有限 Prompt**：Session 保存事实，Prompt 只携带当前工作集。
- **压缩率与可恢复性**：旧内容可以概括，但目标、约束、理由和待办不能只剩模糊结论。
- **近期原文与长期状态**：最新操作保留细节，较旧过程转成检查点。
- **并发效率与确定性**：工具可以并发执行，消息回写仍保持声明顺序。
- **模型判断与程序约束**：语义提炼交给模型，切点、配对、预算和文件记录由程序守住。

累计摘要的主要风险是信息漂移：早期细节经过多轮改写后可能被弱化或误述。因此重要事实最好仍能从 Session、文件和工具结果中追溯，摘要只承担“恢复当前工作状态”的职责。

我对 Pi 的核心理解是：它没有试图给模型无限上下文，而是通过稳定消息协议、可验证的切割边界和结构化检查点，让有限上下文可以持续承载长任务。
