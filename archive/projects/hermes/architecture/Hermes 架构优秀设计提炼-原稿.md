# Hermes 架构优秀设计提炼

这篇笔记不是复述 Hermes 的所有模块，而是从架构文档里挑出我觉得最值得学习的设计。Hermes 的亮点不只是功能多，而是它在很多地方都把“边界”划得很清楚：什么是稳定规则，什么是临时上下文；什么是可注册能力，什么是真正暴露给模型的能力；什么是会话状态，什么是长期记忆；什么是同步子任务，什么是持久后台任务。

## 1. 用数据库承载可恢复状态

Hermes 很多机制都不是只靠进程内变量维持，而是把关键状态落到 SQLite 里。

比较典型的是：

- session history
- system prompt snapshot
- message records
- compression lineage
- Kanban task state
- task comment / event

这个设计的核心价值是：Agent 不是一次性脚本，而是可以恢复、检索、审计和继续执行的系统。

如果只靠内存，子 agent、后台 worker、gateway、多轮会话都很脆弱；一旦进程退出，很多中间状态就丢了。Hermes 用数据库把“当前进行到哪里”变成可持久化状态，这让中断恢复、多进程协作、历史检索和任务调度都变得更可靠。

我觉得这是 Hermes 最值得学习的底层思路：**不要让 Agent 的关键状态只活在上下文窗口里。**

## 2. System Prompt 冻结，而不是每轮重建

Hermes 把 system prompt 设计成 session 级 frozen snapshot：

- 第一轮构建 system prompt。
- 写入 SessionDB。
- 后续 turn 直接复用数据库里的 snapshot。
- 动态检索内容不写进 system prompt，而是在 API 调用时注入当前 user message。

这个设计看起来很细，但其实很关键。

如果每轮都重新读取身份文件、项目规则、memory 文件，system prompt 前缀就会不断变化，prompt cache 很难命中，也会让会话内的行为变得不稳定。Hermes 的做法是：会话开始时先固定一份“稳定规则”，后面需要变化的东西走另一条注入路径。

这背后的经验是：

```text
稳定身份和规则：放 system prompt，并在 session 内冻结。
当前 turn 相关信息：放 user message 附近，临时注入。
```

这比“什么都塞进 system prompt”更清楚。

## 3. Prompt 分层：stable / context / volatile

Hermes 的 prompt 不是一整坨字符串，而是分成三层：

```text
stable      身份、工具规则、模型操作指导
context     项目上下文，例如 AGENTS.md、CLAUDE.md、.cursorrules
volatile    memory 快照、日期、session id、model/provider 信息
```

这个分层很好，因为它同时解决了几个问题：

- 稳定内容靠前，有利于 prompt cache。
- 项目规则和身份规则分开，避免来源混乱。
- 易变信息放后面，减少对稳定前缀的破坏。
- 工具 guidance 只在工具真实可用时注入，避免模型看到不存在的能力。

尤其是“只有工具真实存在时才写对应说明”这一点很值得学。很多 Agent 系统会在 prompt 里写一大堆理想能力，但实际工具面并不支持，最后模型就会产生幻觉式操作。Hermes 更偏向让 prompt 反映真实能力。

## 4. 内部历史和模型请求副本分离

Hermes 区分两类消息：

```text
messages       内部真实历史，会持久化
api_messages   每次请求模型前临时组装的副本
```

很多动态内容只加到 `api_messages`：

- 外部 memory recall
- plugin per-turn context
- ephemeral system prompt
- provider 兼容字段
- cache_control 标记

这样做的好处是，模型本轮需要看的临时上下文不会污染真正的会话历史。

这个设计很优秀，因为 Agent 系统里经常会混淆两件事：

```text
模型这次需要知道什么
系统长期应该保存什么
```

Hermes 把它们拆开了。临时检索结果可以帮助模型回答，但不应该自动变成 session history；外部 memory 可以被召回，但不应该被当成用户刚刚说的话。

## 5. Tool Registry 不等于 Tool Exposure

Hermes 的工具系统有一个很好的边界：工具注册了，不代表模型一定看得到。

大致流程是：

```text
工具模块注册到 registry
toolset 决定工具属于哪些场景
session/config 决定启用哪些 toolset
availability check 决定当前环境是否真的可用
最后才生成模型可见 schema
```

这个分层非常重要。

如果“注册工具 = 暴露给模型”，系统会很难控制权限，也很难处理不同平台、不同 profile、不同后台任务的能力差异。Hermes 让工具先进入 registry，再根据当前 session 过滤，这样同一个工具系统可以服务 CLI、gateway、cron、Kanban worker、子 agent 和插件。

更值得注意的是：Hermes 会根据最终可用工具重建部分 schema，避免 schema 描述里出现当前不可用的能力。这是一个很细的工程质量点。

## 6. 上下文压缩不是删除历史，而是会话交接

Hermes 的 context compression 不是简单把旧消息删掉，而是一次带结构的会话交接：

```text
保护开头重要消息
保护最近上下文
中间区域生成摘要
修复 tool_call / tool_result 配对
旧 session 标记结束
新 session 指向 parent session
memory provider 在压缩前有机会提取信息
```

这个设计优秀的地方在于，它承认长会话压缩是有风险的：

- 删除半个 tool call 会导致 API 请求非法。
- 摘要失败不能悄悄丢上下文。
- 多进程同时压缩可能造成状态分叉。
- 压缩后还要能 resume 和搜索历史。

所以 Hermes 把压缩做成“session lineage 轮转”，而不是单纯裁剪数组。

我觉得这里最值得学习的是：**压缩是状态迁移，不是文本清理。**

## 7. Memory 和 Session Search 分工明确

Hermes 没有把所有历史都塞进 memory。

它区分：

```text
Memory          少量、长期、每次都值得进入上下文的事实
Session Search  精确查找过去对话细节，按需检索
```

这个分工很重要。Memory 如果太大，每个 session 都会变贵，而且容易把过期细节变成“长期事实”。Session search 则适合查找具体对话、任务记录、commit、PR、当时的讨论细节。

这对个人笔记系统也有启发：

- 常识性偏好、长期原则，适合放 memory。
- 具体过程、历史细节，适合放可搜索记录。
- 不要把日志型信息都提升成长期记忆。

## 8. 多 Agent 分成两种语义

Hermes 没有把所有“多 Agent”都混成一种机制，而是区分了两类：

```text
delegate_task   当前 turn 内同步 fan-out
Kanban worker   跨 turn、跨进程、可恢复的持久任务队列
```

`delegate_task` 适合把一个当前问题拆给临时子 agent。父 agent 等子任务结束后汇总结果。它的生命周期依附于当前 turn，适合并行分析、局部搜索、临时调查。

Kanban 则适合更持久的任务。任务状态、评论、依赖、分配、worker heartbeat 都落在 SQLite 里。即使 worker 崩溃，也可以根据数据库状态恢复或重试。

这个区分非常好：

```text
临时并行：用 delegate_task
持久协作：用 Kanban
```

很多系统的问题是只提供一种“子 agent”，然后既想让它并行，又想让它持久，还想让它可审计。Hermes 把这两种生命周期拆开，边界更清楚。

## 9. Kanban 用少量原语组合协作模式

Hermes Kanban 的思路不是为每种协作方式设计专门协议，而是提供少量稳定原语：

```text
tasks
task_links
task_comments
task_events
assignee
workspace
```

这些原语可以组合出：

- 并行分发
- 流水线
- 投票 / 汇总
- 长期日志
- 人工介入

我觉得这里好的地方是“低层简单，高层可组合”。任务卡、依赖、评论、状态这些东西并不花哨，但只要持久化和调度做扎实，就能支撑很多多 Agent 协作方式。

它也说明一个经验：多 Agent 不一定需要复杂协议，很多时候更需要一个可靠的任务状态机。

## 10. 安全不是一个开关，而是多层防线

Hermes 的安全系统不是简单的 `yolo on/off`。

它分了多层：

- hardline block：永远不能执行的命令。
- dangerous pattern：高风险但可审批的命令。
- sudo stdin guard：防止模型猜密码。
- approval mode：manual / smart / off。
- cron mode：无人值守场景的单独策略。
- secret redaction：输出和日志脱敏。
- tool loop guardrail：防止工具调用陷入无效循环。

这里最优秀的地方是：有些底线不受 YOLO/off 影响。用户可以选择信任 agent 做危险操作，但系统仍然不允许它做擦盘、关机、猜 sudo 密码这类不可恢复或明显越界的事情。

另一个细节是安全开关在 import time 冻结。这样模型不能通过运行 `export HERMES_YOLO_MODE=1` 来动态绕过审批。

## 11. 插件发现不等于插件执行

Hermes 的插件系统也体现了类似原则：插件可以被发现，但不一定会被加载。

它按插件类型区分不同策略：

- standalone 插件默认 opt-in。
- bundled backend/platform 可以自动加载。
- memory provider、model provider 有专门发现路径。
- disabled list 优先级最高。
- 用户/项目插件可以覆盖 bundled 插件，但要通过 key 控制。

这个设计的本质是：插件是任意代码，不能因为它在目录里就自动执行。

对于 Agent 系统，这一点特别重要，因为插件不仅是功能扩展，也是攻击面扩展。Hermes 把“发现、选择、导入、注册能力”分成多个阶段，整体更可控。

## 12. 外部集成统一成内部工具面

MCP、ACP、Gateway、Desktop、Dashboard 这些东西看起来很多，但 Hermes 的核心思路是把外部入口统一到内部抽象上：

```text
外部平台 / 协议 / UI
  -> adapter
  -> session / message / tool schema
  -> AIAgent loop
```

例如 MCP server 的工具会被归一化成 Hermes 工具；ACP 把 Hermes agent 包装成编辑器可调用的 stdio server；Gateway 把 Telegram、Slack、Discord、Webhook 等平台消息转成 agent session。

这个设计的好处是外部入口可以很多，但 agent loop 不需要为每个平台写一套核心逻辑。复杂性被压到 adapter 层。

## 总结：Hermes 最值得学习的设计气质

Hermes 给我的感觉不是“某个单点功能特别神”，而是它在做 Agent 工程时很重视这些原则：

1. 关键状态要持久化，不要只放上下文窗口。
2. 稳定规则和动态上下文要分开。
3. 注册能力和暴露能力要分开。
4. 临时信息和长期历史要分开。
5. 同步子任务和持久任务队列要分开。
6. 压缩是会话迁移，不是简单删消息。
7. 插件、工具、MCP、平台入口都要有清晰边界。
8. 安全要分层，不能只靠一个全局开关。

如果要把 Hermes 的架构经验浓缩成一句话，我会写成：

> Hermes 的优秀设计不在于把 Agent 做得更“聪明”，而在于把 Agent 运行中容易混乱的状态、权限、上下文和任务生命周期拆成了可持久化、可审计、可恢复的工程边界。

