## 研究背景
“看板驱动的agent”意思是：多个 agent 不是直接互相喊话、互相调用，而是围绕一个共享任务看板来工作。

这篇笔记对照的是 `reference/hermes-agent/kanban/hermes-kanban-v1-spec.pdf`。需要注意：这份 PDF 标注为 **Design Only**，也就是说它首先是设计方案，不等于当时已经完整实现的功能。

一般的子 Agent 生命周期比较脆弱：它通常依赖父 Agent 的当前上下文和当前进程，一旦父 Agent 结束、上下文被压缩、进程中断，子任务就容易丢失，后续也难以追踪和恢复。

Hermes 的多 Agent 协作机制试图解决这个问题。它不是简单地让父 Agent 临时调用一个子 Agent，而是通过 SQLite 持久化任务、状态、评论、依赖关系和执行记录，让任务可以跨进程、跨轮次继续存在。

一般来说，任务持久化可以分成两类思路：

1. **队列式持久化**：把待处理任务放入可恢复的队列或任务栈中，后台 worker 持续消费。
2. **状态机式持久化**：把任务写入数据库，并用状态字段记录任务生命周期。Hermes Kanban v1 中的状态是 `todo`、`ready`、`running`、`blocked`、`done`、`archived`。

真正可靠的后台任务系统还需要处理执行中断、重复执行和恢复问题，因此会涉及幂等写入、断点保存、任务 claim、heartbeat、失败重试和状态恢复。

从这个角度看，Hermes Kanban 的核心不是“启动更多子 Agent”，而是把多 Agent 协作抽象成一个可持久化、可恢复、可审计的任务系统。

## 研究问题

如何实现子 Agent 的持久化。由于子 Agent 依赖于父 Agent，实践中常常会出现所有 Agent 都在分别处理任务，却没有一个 Agent 负责收敛并输出最终的结果。

关键在于如何编排 Agent 的运行流程。

## Hermes 的核心设计

Hermes Kanban 的关键设计可以表述为：

通过 SQLite 构建一个统一的任务与消息中枢，让用户与 Agent、Agent 与 Agent 之间不依赖脆弱的直接调用链通信，而是通过数据库中的任务、状态、评论、依赖关系和事件记录进行间接协作。

这样做的好处是：

- 避免 Agent 之间直接耦合。
- 所有交互都可以被记录、恢复和审计。
- 调度器可以统一管理任务领取、执行、重试和恢复。
- 每个任务状态变更可以通过数据库事务保证原子性。
- 即使某个 Agent 中断，也可以根据数据库中的任务状态继续恢复。

换句话说，Hermes Kanban 不是把多个 Agent 临时串起来，而是把多 Agent 协作变成一个持久化的任务状态机。

## 直觉版流程

简单来说，Hermes Kanban 的协作流程可以理解成几步：

1. **建任务卡**：用户或 orchestrator 把事情拆成几张卡，比如“研究”“分析”“写报告”。
2. **写清楚谁来做**：每张卡分配给一个 profile，比如 `researcher`、`writer`、`reviewer`。
3. **调度器扫看板**：dispatcher 看到某张卡已经可以做了，就启动对应 Agent 进程去执行。
4. **Agent 写回看板**：Agent 做完后，把结果、状态或遇到的问题写回任务卡。下一个 Agent 再根据看板继续推进。

所以这里的重点不是 Agent 之间互相调用，而是所有人都围绕同一个持久化看板读写状态。

## 三平面架构

PDF 里把 Hermes Kanban 拆成三个平面：

1. **Control plane**：用户通过 CLI、Telegram、Discord、Slack 等入口创建、查看、评论任务。
2. **State plane**：`kanban.db` 是唯一事实来源，保存任务、依赖、评论和事件。dispatcher 只负责读取状态、领取任务和启动 worker。
3. **Execution plane**：真正执行任务的是独立 Hermes profile 进程，例如 planner、researcher、backend-eng。每个 worker 都有自己的 `HERMES_HOME`、memory、skills 和 workspace。

关键不变量是：**不使用进程内 subagent swarm**。

每个 worker 都是用户机器上的独立 OS 进程，而不是某个父 Agent 调用链内部的临时子 Agent。worker 之间不直接通信，只通过 Kanban board 读写任务状态。这样即使某个 worker 崩溃，任务仍然留在 SQLite 中，dispatcher 可以通过 stale claim 恢复。

## 数据模型

Hermes Kanban v1 的 schema 刻意很小，核心是四张表：

```text
tasks          任务本体，包含 title/body/assignee/status/workspace/claim 等字段
task_links     父子任务依赖关系
task_comments  评论、问题、过程记录和结果反馈
task_events    状态变更、claim、release、error 等事件记录
```

这里容易混淆的一点是：`assignee` 和 `workspace` 不是独立表，而是 `tasks` 上的字段。它们仍然是理解协作模式时的重要原语，因为它们决定“谁来做”和“在哪里做”。

任务状态的语义大致是：

```text
todo      任务已创建，但父任务还没全部完成
ready     依赖已满足，可以被领取
running   已被某个 profile claim，正在执行
blocked   worker 需要人类或其他 profile 输入
done      已完成，会触发子任务重新判断 ready
archived  从默认视图移除，进入归档
```

## Agent 的协作方式

Hermes Kanban 的重点不是预置很多复杂的“多 Agent 协作协议”，而是提供一组很小、很稳定的底层原语。按 PDF 的说法，这些模式主要从下面几个元素组合出来：

```text
tasks        表示要做的工作单元
links        表示任务之间的依赖、顺序或引用关系
comments     表示讨论、过程记录、产出与反馈
assignee     表示任务分配给哪个 profile / agent
workspace    表示任务所在的上下文边界
```

严格来说，PDF 的数据库 schema 是 `tasks`、`task_links`、`task_comments`、`task_events` 四张表；`assignee` 和 `workspace` 是 `tasks` 的字段。但从协作模式角度看，把它们当作关键原语来理解是合理的。

这些原语本身很简单，但可以组合出很多常见的多 Agent 协作模式，例如并行分发、流水线、投票汇总、长期日志和人工介入。

文档提前命名这些模式，是为了降低使用成本：用户可以直接套用已有协作范式，而不必每次都从底层原语开始自行摸索。

核心思想是：**少量通用原语 + 可组合协作模式**，而不是为每一种协作方式设计一套专门机制。

### P1 Fan-out：并行分发

一个任务拆成多个互不依赖的子任务。

比如：

```text
研究这个技术的五个角度
```

创建 5 个任务，都分配给 researcher，没有依赖。dispatcher 会并行派发多个 worker。

重点：并行性来自 **多个 OS 进程**，不是一个父 agent 进程里临时 spawn subagent。

### P2 Pipeline：流水线

不同角色按顺序接力。

比如：

```text
scout -> editor -> writer
```

先 scout 收集资料，再 editor 筛选，再 writer 写稿。用 `links` 表达依赖关系。前一个任务完成后，后一个 worker 会在 prompt 里看到父任务结果。

重点：这是“角色专业化链条”。

### P3 Voting / Quorum：投票 / 汇总

多个 worker 同时处理同一个问题，然后一个 aggregator 汇总判断。

比如：

```text
让 3 个不同 researcher 分析同一篇论文
最后让 reviewer 汇总谁的判断更可靠
```

做法是：

```text
N 个 sibling tasks
+
1 个 aggregator task
aggregator 依赖所有 N 个任务
```

等 N 个任务完成后，aggregator 能读到所有父任务结果，再做判断。

重点：不需要新增“投票系统”，依赖图天然支持 fan-in。

### P4 Long-running journal：长期日志

同一个 profile 反复在同一个共享目录里工作。

比如：

```text
每天生成 briefing，追加到我的知识库/vault
```

它靠两件事形成长期性：

```text
profile 自己的持久记忆
+
固定 workspace 目录
```

Kanban board 则记录每次运行的任务和审计时间线。

重点：适合日报、周报、持续监控、长期积累型任务。

### P5 Human-in-the-loop triage：人工介入

worker 遇到问题时，不是瞎猜，而是 block 任务并提问。

流程：

```text
worker block task
worker 写 comment 提问
用户或其他 profile 回复 comment
用户 unblock
dispatcher 重新派发 worker
worker 读取完整 comment thread 继续
```

重点：不需要改 prompt，也不怕上下文丢，因为问题和回答都在任务评论里持久保存。

### P6 @mention delegation：@提及式委派

用户或 agent 在评论/消息里写：

```text
@backend-eng 帮我实现这个接口
```

系统把它解析成：

```text
hermes kanban create --assignee backend-eng
```

周围文本作为任务正文。

重点：这是一个 UX 增强。底层还是创建 Kanban 任务，但用户感觉像在聊天里 @ 同事。

### P7 Thread-scoped workspace：线程绑定工作区

在 Telegram/Discord/Slack 这种 threaded chat 里，某个 thread 可以绑定一个 workspace。

比如：

```text
在这个 Discord thread 里讨论某个 bug
/kanban here
```

创建的任务自动使用这个 thread 对应的目录。多个 profile 在同一个 thread 里工作时，共享同一目录，保持上下文一致。

重点：把“对话线程”和“文件工作区”绑定起来。

### P8 Fleet farming：舰队式批量管理

一个 specialist profile 管很多相似对象，每个对象一个 workspace。

例子：

```text
一个 insta-manager profile 管 50 个 Instagram 账号
每个账号一个目录：
~/insta/acct-1/
~/insta/acct-2/
...
```

cron 定期给每个账号创建任务。失败了可以通过 stale claim 恢复。

重点：适合 RPA 风格任务，但不需要传统 RPA 工具。

### 最后那段 Pattern coverage test 是什么意思？

它说：第 9 节里的所有用户故事，都能用这些模式组合表达，不需要新增底层原语。PDF 这里有一个小不一致：标题前文写的是 seven reusable patterns，但实际列出了 P1 到 P8 共 8 个模式。

这是一种架构自检：

```text
如果未来某个需求无法用这些模式表达：
1. 可能需要新增一个模式
2. 也可能说明这个需求根本不是“协作”问题，不该塞进 Kanban
```

最重要的要点是：

**Hermes Kanban 的强大不是因为它有很多功能按钮，而是因为它用少量稳定原语组合出了常见的多 agent 协作范式。**

可以理解成：

```text
tasks + links + comments + assignee + workspace
=
并行、流水线、投票、长期日志、人工介入、@委派、线程工作区、批量舰队管理
```

这就是这段的核心。

## Kanban 和 delegate_task 的边界

PDF 里对 `delegate_task` 和 Kanban 的区分很重要：

- `delegate_task` 更像一次 RPC 调用：父 Agent fork 一个短生命周期子任务，等待结果返回，再继续自己的上下文。
- Kanban 更像一个持久化工作队列加状态机：任务创建后可以独立存在，任何 profile 或用户都可以通过 board 查看、评论、阻塞、解除阻塞、重新分配或继续处理。

判断标准可以记成一句话：

> 这个 handoff 是否需要活过一次 API loop，并且对其他 profile 或人类可见？如果是，用 Kanban；如果不是，用 delegate_task。

所以两者不是互相替代，而是共存。Kanban worker 在自己的任务内部，也可以继续调用 `delegate_task` 做短小的推理或检查。

## Dispatcher 的设计边界

Dispatcher 在设计上是刻意“笨”的，它只做四件事：

1. 重新计算 `ready`：如果一个 `todo` 任务的所有父任务都已经 `done`，就把它变成 `ready`。
2. 原子领取任务：对 `ready` 且未被 claim 的任务做 CAS 更新，设置 `running`、`claim_lock` 和 `claim_expires`。
3. 启动 worker：根据 `assignee` 和 `workspace` 启动对应 profile 进程。
4. 恢复 stale claim：如果 `running` 任务超过 claim 过期时间，就重置回 `ready`。

它不负责智能路由、预算、组织层级、审批策略或复杂治理。这些都应该放到 profile、skill 或 plugin 里，而不是塞进 Kanban kernel。

## Orchestrator 的边界

多 Agent 编排器容易越权执行，所以应该限制它的执行能力。PDF 里也提到一个常见问题：orchestrator 本来应该负责分解和路由任务，但实际可能会开始自己干活。

更好的做法是把 orchestrator 当作一种 profile 约定，而不是内核角色：

- 它主要负责拆解任务、创建 Kanban task、设置 assignee 和依赖关系。
- 它不应该默认拥有所有执行工具。
- 它的能力边界应该通过 profile、toolset 和 skill 来限制。

这样 orchestrator 是“控制室”，不是“万能工人”。


简单来说分为三步
建任务卡
用户或 orchestrator 把事情拆成几张卡，比如“研究”“分析”“写报告”。
写清楚谁来做
每张卡分配给一个 profile，比如 researcher、writer、reviewer。
调度器扫看板
dispatcher 看到某张卡可以做了，就启动对应 agent 进程去做。
agent 做完写回看板
做完就把结果、状态、问题写回任务卡。下一个 agent 再根据看板继续
