很好，这个项目很适合作为学习 **Subagent 架构、Agent 编排（orchestration）、多 Agent 协作模式** 的入口。`pi-subagents` 本质上不是一个简单的“调用另一个 LLM”，而是一套比较完整的 **父 Agent → 子 Agent → 结果回传 → 工作流编排** 的机制。这个仓库由 Nico Bailon 开发，是 Pi coding agent 生态中的一个扩展。([GitHub][1])

我们可以从几个层次拆：

---

## 1. 先建立一个 mental model：Subagent 到底是什么？

最简单理解：

```
                User
                 |
                 v
          +--------------+
          | Parent Agent |
          |    Pi        |
          +--------------+
                 |
        delegate task
                 |
      +----------+-----------+
      |          |           |
      v          v           v

  Reviewer    Planner    Worker

  子会话       子会话       子会话
```

这里关键点：

> Subagent 不是工具调用，而是一个拥有自己上下文、角色、目标的“小型 Agent”。

在 `pi-subagents` 里面：

* Pi 是 parent session
* subagent 是 child Pi session
* parent 决定什么时候派任务
* child 完成专门任务
* child 返回结果给 parent

([GitHub][1])

这和普通：

```
LLM -> function call -> API
```

不同。

更像：

```
Agent
 |
 +-- spawn another Agent
        |
        +-- reason
        +-- use tools
        +-- produce artifact
        +-- report back
```

---

# 2. 为什么需要 Subagent？

假设一个任务：

> 重构用户认证系统

一个普通 Agent：

```
分析
 |
写代码
 |
测试
 |
检查
```

问题：

* 容易陷入自己的假设
* context 越来越长
* 没有独立视角

Subagent：

```
Parent:

"我要改 auth"


        |
        |
        +---- Scout
        |      |
        |      查代码结构
        |
        |
        +---- Planner
        |      |
        |      设计方案
        |
        |
        +---- Worker
        |      |
        |      修改代码
        |
        |
        +---- Reviewer
               |
               找 bug
```

这其实模拟了软件团队。

---

# 3. pi-subagents 里面几个核心 Agent 角色

仓库内置了一些典型角色：([GitHub][1])

## Scout

负责探索：

```
你先不要改。

帮我理解：
- 项目结构
- 数据流
- 哪些文件相关
```

类似：

> 软件考古学家

---

## Planner

负责设计：

```
根据 scout 信息：

生成：
- 修改方案
- 风险
- 步骤
```

类似：

> 架构师

---

## Worker

执行：

```
按照批准方案：

修改代码
运行测试
提交结果
```

类似：

> 工程师

---

## Reviewer

审查：

```
检查：

- bug
- edge case
- 风险
- style
```

类似：

> code reviewer

---

## Oracle

比较有意思。

它不是执行。

它负责：

```
挑战你的想法

"你的方案是不是错了？"

"有没有遗漏？"
```

类似：

> 技术顾问

---

# 4. 最核心的交互模式：Chain

这是第一个重要模式。

## Sequential Chain

例如：

```
Scout
 |
 v
Planner
 |
 v
Worker
 |
 v
Reviewer
```

数据流：

```
Scout output

      |
      v

Planner input

      |
      v

Worker input
```

也就是：

```
Agent A 的结果
       ↓
Agent B 的 context
```

类似 pipeline。

仓库支持：

```
/chain scout "scan codebase" ->
planner "create plan"
```

([GitHub][1])

---

# 5. Parallel Agent：多视角

第二个重要模式。

比如 review：

不要：

```
Reviewer
   |
   v
结论
```

而是：

```
              Diff

               |
       +-------+-------+
       |       |       |
       v       v       v

 correctness tests security

       |       |       |

       +-------+-------+

             summary
```

三个 reviewer 同时工作。

优势：

* 减少单点偏差
* 获得不同 reasoning path

`pi-subagents` 支持 parallel execution。([GitHub][1])

---

# 6. Context 是 Subagent 最难的问题

这里开始进入 Agent 架构核心。

一个 naive 设计：

```
Parent context

全部复制

       ↓

Child
```

问题：

token 爆炸。

比如：

Parent:

```
100k tokens conversation
```

spawn:

```
Child receives 100k
```

成本巨大。

所以好的 subagent 系统会做：

```
Parent context

       |
       |
  Context filtering

       |
       v

Child
```

只给：

```
任务相关信息
+
必要文件
+
角色 prompt
```

---

pi-subagents 有一个重要设计：

> child 默认不会获得 parent 的 orchestration instructions

也就是说：

父：

```
我是总指挥
你们都是我的助手
```

不会泄漏给 child。

child：

```
我是 reviewer
我的任务是 review
```

([GitHub][1])

这个非常重要。

否则容易出现：

child:

> 我要不要再创建 subagent？

形成 agent recursion。

---

# 7. Async Agent：后台运行

这是另一个很有意思的设计。

传统：

```
User
 |
Agent
 |
等待
 |
结果
```

Async：

```
User

 |
 |
启动 worker

 |
继续聊天


worker
 |
 |
完成

通知 parent
```

例如：

```
"后台让 reviewer 检查一下"
```

然后你继续工作。

这接近未来 IDE Agent：

```
AI teammate
```

而不是：

```
AI chatbot
```

([GitHub][1])

---

# 8. Agent 之间通信

这里有两个层级：

## Level 1

简单返回：

```
child
 |
result
 |
parent
```

## Level 2

Intercom

类似：

```
Worker

    |
    |
    v

Parent

"我发现一个设计冲突，需要你决定"
```

不是结束才汇报，而是实时沟通。

仓库配套有 `pi-intercom`。([GitHub][1])

---

# 9. Agent 文件其实就是 Prompt + Metadata

一个 agent：

```yaml
---
name: reviewer
model: claude-sonnet
tools:
  - read
  - grep
---

You are a code reviewer.

Check:
- bugs
- security
- maintainability
```

本质：

```
Agent =
    System Prompt
    +
    Tool Permission
    +
    Model Choice
    +
    Context Policy
```

这点非常值得学习。

未来 Agent 平台基本都会走这个方向。

---

# 10. 如果我们自己设计一个 Subagent Framework

我觉得可以抽象成：

```
Agent Definition

{
 name,
 role,
 model,
 tools,
 memory,
 permissions,
 context_policy
}


Runtime

spawn(agent, task)


Communication

message()
artifact()
handoff()


Orchestrator

plan()
parallel()
chain()
review()

```

---

# 我建议我们的学习路线

不要一上来读代码。

按 Agent 系统设计顺序：

### 第 1 阶段：理解模型

研究：

```
Parent Agent
Child Agent
Context isolation
Tool permissions
```

---

### 第 2 阶段：拆源码

重点看：

```
src/agents/
src/runs/
src/intercom/
```

仓库本身也把这些作为核心运行文件划分。([GitHub][1])

---

### 第 3 阶段：自己实现一个 mini-subagent

例如：

Python:

```
main_agent.py

spawn(
  role="reviewer",
  task="review this code"
)
```

实现：

* agent registry
* prompt isolation
* message passing
* parallel execution

---

我觉得这个仓库最值得研究的不是代码，而是它背后的一个思想：

> **未来 AI Agent 不应该是一个越来越大的模型，而是一群职责明确、可以协作的小模型。**

下一步我们可以直接从 `src/extension/index.ts` 开始拆，看看 **一个 subagent tool 是如何注册、spawn child session、收集结果的**。这部分最接近 Agent runtime 的核心。

[1]: https://github.com/nicobailon/pi-subagents?utm_source=chatgpt.com "GitHub - nicobailon/pi-subagents: Pi extension for async subagent delegation with truncation, artifacts, and session sharing · GitHub"


好，我们开始拆核心。我们先不急着看所有代码，先抓住 **`pi-subagents` 的 runtime 心脏：一个 subagent 是怎么从父 Agent 被创建出来，然后执行、通信、回传结果的**。

仓库本身把几个关键文件分得很清楚，其中最核心的是：

* `src/extension/index.ts` —— 扩展入口、tool 注册、事件 wiring
* `src/runs/foreground/subagent-executor.ts` —— 单次 subagent 调度核心
* `src/runs/background/subagent-runner.ts` —— 异步后台执行
* `src/agents/agents.ts` —— agent 定义加载
* `src/intercom/intercom-bridge.ts` —— agent 间通信

([GitHub][1])

我们先模拟一次调用：

> 用户：
> “用 reviewer 检查一下这个 diff”

发生了什么？

---

## 第一层：Parent Agent 收到请求

Pi 主 session：

```
User
 |
 v
Pi Parent Agent
```

此时 Pi 自己不会变成 reviewer。

它做的是：

```
判断：
这个任务适合交给谁？
```

然后调用 subagent tool。

概念上类似：

```typescript
subagent({
    agent: "reviewer",
    task: "Review this diff"
})
```

这里很重要：

**subagent 是一个工具，不是一个 prompt 模板。**

区别：

普通：

```
LLM
 |
prompt:
"You are reviewer..."
```

Subagent：

```
LLM
 |
spawn
 |
new Agent Runtime
 |
new Context
 |
new Tools
 |
new Session
```

---

# 第二层：Agent Definition 加载

`pi-subagents` 的 agent 本质是 markdown 文件。

比如：

```
agents/
 └── reviewer.md
```

里面类似：

```yaml
---
name: reviewer
model: claude-sonnet
tools:
  - read
  - grep
---

You are a code reviewer.

Look for:
- bugs
- security problems
- bad patterns
```

系统读取：

```
reviewer.md

        |
        v

AgentConfig
```

变成：

```typescript
{
 name:"reviewer",

 model:"claude-sonnet",

 tools:[
   "read",
   "grep"
 ],

 systemPrompt:"..."
}
```

这一步非常关键。

因为：

> Agent = Prompt + Tools + Constraints

不是只有 personality。

([GitHub][1])

---

# 第三层：创建 Child Session

这是最核心的地方。

Parent：

```
Session A
```

创建：

```
Session B
```

结构：

```
                 Parent

            Session A
                |
                |
             spawn
                |
                v

            Child

            Session B

```

两个 session：

不是：

```
共享聊天记录
```

而是：

```
两个独立 Agent
```

---

为什么？

因为如果共享：

Parent:

```
我现在考虑数据库迁移...
```

Child:

```
我要 review code
```

context 会污染。

所以：

```
Parent Context

        |
        |
   Context Filter

        |
        v

Child Context
```

只传递必要信息。

仓库特别强调：

child 不继承 parent 的 orchestration 指令，也不会默认拥有 subagent 能力。([GitHub][1])

例如：

Parent:

```
你是总指挥，可以创建更多agent
```

不会进入 child。

否则：

```
Parent
 |
 Child
    |
    Child
       |
       Child
```

递归爆炸。

---

# 第四层：执行循环

Child Agent 启动后：

```
Child Session

       |
       v

Think

       |
       v

Tool call

       |
       v

Observation

       |
       v

Next step
```

例如 reviewer：

```
读取 diff

↓

分析代码

↓

发现问题

↓

生成报告
```

它拥有自己的：

* tool call
* token 消耗
* reasoning loop

---

# 第五层：结果回传

完成：

Child:

```
{
 summary:
 "Found 3 issues",

 artifacts:
 [
   review.md
 ]
}
```

返回 Parent。

于是：

```
Child
 |
 |
 result
 |
 v

Parent
```

Parent 再继续：

```
根据 reviewer 建议修改
```

---

# 现在看一个真正重要的设计：

## 为什么不是一个 Agent 自己扮演多个角色？

例如：

```
GPT:

现在我是planner

现在我是worker

现在我是reviewer
```

看起来省事。

但是问题：

## 1. 角色切换会污染 context

例如：

```
planner:

方案 A 比较好


worker:

我要执行方案 A


reviewer:

我要找方案 A 的问题
```

三个阶段都看到自己的历史。

导致：

reviewer 很难真正独立。

---

Subagent：

```
Planner

自己的context


Worker

自己的context


Reviewer

自己的context
```

天然形成：

```
multi-agent debate
```

---

# 一个很有意思的地方：Fork vs Fresh Context

这是 Agent 设计里高级一点的概念。

Child 可以两种启动方式：

---

## Fresh

完全新的：

```
Child:

system prompt
+
task

```

像新员工。

适合：

* reviewer
* oracle
* security audit

---

## Fork

复制部分 parent 状态：

```
Parent snapshot

        |
        v

Child
```

适合：

* continuation
* implementation

比如：

```
你刚刚分析完代码

现在让 worker 按这个思路实现
```

worker 需要知道前面的讨论。

---

# 接下来我们应该继续看哪一块？

我建议顺序：

## 下一篇拆：

### `src/extension/index.ts`

重点看：

1. Pi extension 怎么注册 subagent tool

类似：

```typescript
pi.registerTool({
   name:"subagent"
})
```

2. 用户一句自然语言：

```
"ask reviewer..."
```

怎么变成：

```typescript
subagent(...)
```

3. event 怎么监听：

```
subagent:start

subagent:complete
```

---

然后再拆：

### `subagent-executor.ts`

这里是真正的：

```
Agent Orchestrator
```

会看到：

* single agent
* parallel agents
* chain
* async runner

这部分其实已经接近一个小型 AutoGen / CrewAI runtime 了。

([GitHub][1])

下一步我们就从 `index.ts` 开始，把它当成一个 Agent OS 来逆向分析。

[1]: https://github.com/nicobailon/pi-subagents?utm_source=chatgpt.com "GitHub - nicobailon/pi-subagents: Pi extension for async subagent delegation with truncation, artifacts, and session sharing · GitHub"

你问的这几个问题其实已经进入 **Agent Runtime 设计的核心层** 了。`spawn`、context isolation、lifecycle、state machine 这几个概念基本就是构建多 Agent 系统绕不开的四个支柱。

我们一个一个拆。

---

# 1. spawn 是什么意思？

`spawn` 在计算机领域不是 Agent 专属词，它原本来自操作系统。

简单翻译：

> 创建一个新的执行实体，并让它开始运行。

比如操作系统：

```
Parent Process

       |
       | spawn()
       |
       v

Child Process
```

父进程创建子进程。

---

在 Agent 世界：

```
Parent Agent

       |
       | spawn()
       |
       v

Child Agent
```

意思：

> 创建一个新的 Agent 实例，让它开始执行任务。

例如：

父 Agent：

```
我要完成代码重构

需要：
- 架构分析
- 安全检查
- 测试设计
```

调用：

```python
spawn(
    agent="security-reviewer",
    task="检查认证模块漏洞"
)
```

结果：

```
Parent Agent

       |
       |
       +---- spawn ----> Security Agent
```

---

# 2. 子代理是不是开了一个单独的 Pi 线程？

这个问题非常关键。

答案：

**通常不是“线程”，更准确说是一个独立 Agent Runtime / Session。**

很多人第一次理解 Agent，会误认为：

```
Parent Pi
 |
 +-- thread 1
 |
 +-- thread 2
```

实际上更接近：

```
             Pi Runtime


          Parent Session

              |
              |
        Agent Manager

              |
       +------+------+

       |             |

 Child Runtime   Child Runtime

 Session A       Session B

```

---

它可能运行在：

## 情况 A：同一个进程，不同 async task

例如：

Node.js：

```
Process

  event loop

      |
      +-- parent agent coroutine

      |
      +-- child agent coroutine

```

不是线程。

---

## 情况 B：独立进程

高级 Agent 平台可能：

```
Main Process

      |
      spawn

      v

child process
```

优势：

* 隔离崩溃
* 独立资源限制
* 更安全

---

## 情况 C：远程 Agent

比如企业系统：

```
Parent Agent

      |
      |
      API call

      v

Worker Agent Server

```

甚至：

```
Agent A

      HTTP

Agent B
```

---

所以更准确：

> spawn 是创建一个新的 Agent execution context，而不是一定创建一个线程。

---

# 3. 为什么需要独立 session？

假设没有隔离：

父：

```
用户：
帮我设计支付系统
```

历史：

```
讨论数据库
讨论架构
讨论业务
```

然后：

```
你现在作为安全专家检查一下
```

如果共享：

Security Agent 看到：

```
我要设计支付系统
我喜欢 PostgreSQL
我考虑微服务
...
```

它容易被影响。

真正安全审查需要：

```
Security Agent:

System:
你是安全专家

Task:
检查支付系统漏洞

Input:
代码 + 必要设计信息
```

这叫：

**context isolation**

---

# 4. 子代理从父代理拿什么 Context？

这是 Agent 架构最难的问题。

不是：

```
复制全部聊天记录
```

而是：

```
Parent Context

      |
      |
 Context Selection

      |
      v

Child Context
```

一般有几个来源。

---

## ① Task Context（必须）

例如：

父：

```
reviewer:
检查 auth 模块
```

子一定得到：

```
Task:
Review auth module
```

---

## ② Relevant Files

比如：

父知道：

```
src/auth/login.ts
src/auth/token.ts
```

传：

```
Files:
login.ts
token.ts
```

---

## ③ Parent Summary

父可以压缩：

原：

```
10000 tokens conversation
```

变：

```
Summary:

We use JWT.
Refresh token stored in Redis.
Main concern is rotation.
```

---

## ④ Artifacts

比如：

Planner 输出：

```
design.md
```

Worker 使用：

```
design.md
```

---

## ⑤ Explicit Message

父主动传：

```
告诉 reviewer：

重点关注 session fixation
```

---

# 5. Context Filtering 怎么实现？

这里非常有研究价值。

一般不是一个算法，而是多个策略组合。

---

## 方法 1：人工指定

最简单：

```json
{
task:
"review auth",

context:[
"auth/login.ts",
"auth/token.ts"
]
}
```

优点：

可靠。

缺点：

需要人工。

---

## 方法 2：Summary Compression

流程：

```
Parent Context

100k tokens

       |
       |
Summarizer

       |
       v

2000 tokens summary

```

类似：

```
Memory compression
```

---

## 方法 3：Retrieval

更高级：

把上下文放向量库：

```
Conversation chunks

        |
        v

Embedding

        |
        v

Vector DB
```

Child:

查询：

```
"authentication related discussion"
```

返回：

```
相关片段
```

---

## 方法 4：Role-based Filtering

不同角色看到不同东西。

例如：

Security:

```
代码
权限设计
认证流程
```

不用：

```
UI设计讨论
```

---

所以一个成熟 Agent Runtime：

```
Context Manager

      |
      +-- task selector

      +-- summarizer

      +-- retriever

      +-- permission filter

```

---

# 6. 为什么生命周期绕不开？

因为 Agent 不是一次函数调用。

传统函数：

```
call()

return()
```

生命周期：

```
几毫秒
```

没人在乎。

但是 Agent：

```
create

↓

plan

↓

think

↓

tool call

↓

wait

↓

retry

↓

error

↓

complete
```

可能：

* 几分钟
* 几小时
* 后台运行

所以必须管理状态。

---

# 7. Lifecycle 和 State Machine 什么关系？

非常核心。

生命周期描述：

> 一个东西经历什么阶段。

状态机描述：

> 这些阶段如何转换。

比如 Agent：

生命周期：

```
出生
执行
等待
结束
```

状态机：

```
             spawn

 CREATED ------------>

             RUNNING


RUNNING ----tool call----> WAITING


WAITING ----response-----> RUNNING


RUNNING ----success-----> COMPLETED


RUNNING ----error-------> FAILED

```

这就是：

```
Lifecycle = 状态集合 + 转换规则
```

---

# 8. 什么时候需要考虑生命周期？

一个判断标准：

## 如果一个对象：

### 1. 会持续存在

例如：

```
Agent
Session
Task
Workflow
Memory
```

需要生命周期。

---

### 2. 会被暂停恢复

例如：

```
后台 Agent

晚上继续运行
```

需要生命周期。

---

### 3. 会失败重试

例如：

```
API timeout

retry

resume
```

需要生命周期。

---

### 4. 会被多个组件观察

例如：

```
UI显示：

Reviewer:
Running...

Planner:
Finished

Worker:
Failed
```

需要生命周期。

---

# 9. Agent Runtime 最终形态大概是什么？

一个成熟系统：

```
                 User

                  |

                  v

            Parent Agent


                  |

            Agent Manager


       +----------+----------+

       |          |          |

    Planner    Worker    Reviewer


       |          |          |

       +----------+----------+

              State Machine


              CREATED

                 |

              RUNNING

                 |

              WAITING

                 |

              COMPLETED


              Context Manager

                  |

          Memory / Retrieval

```

---

其实你刚才的问题已经碰到了 Agent 系统里最难的三个设计：

1. **Execution Model**

   * spawn 到底创建什么？

2. **Context Model**

   * 子 Agent 看见什么？

3. **Lifecycle Model**

   * Agent 如何被管理？

下一步如果继续拆 `subagent-executor.ts`，我建议重点看 **“一个 child agent 的执行循环（agent loop）”**，因为那里会把这些概念串起来：

```
spawn
 ↓
create runtime
 ↓
inject context
 ↓
run loop
 ↓
tool calls
 ↓
state transitions
 ↓
return artifact
```

那基本就是一个最小 Agent OS 的骨架。

你问的 **artifact** 是 Agent 系统里一个很重要但容易被忽略的概念。

简单说：

> **Artifact = Agent 产生的、可以被保存、引用、传递的“工作产物”。**

它不是普通聊天消息。

---

举个最直观的例子。

你让一个子 Agent：

> “分析一下这个项目的架构”

如果没有 artifact：

```text
Parent Agent

调用 Architect Agent

Architect:
这个项目有三层架构……
（输出 5000 字）

↓

Parent 把这 5000 字塞回 context

```

问题：

* 占 token
* 后续 Agent 还要重复阅读
* 不容易管理
* 无法复用

---

有 artifact：

```text
Architect Agent

生成:

architecture-report.md


保存：

artifact://architecture-report.md


返回:

{
  summary:
  "发现三层架构",

  artifact:
  "architecture-report.md"
}

```

Parent：

```text
知道有这个产物

需要时再读取
```

---

## Artifact 和 Message 的区别

这是关键。

### Message（消息）

偏交流：

```text
Reviewer:

发现 login.ts 有 JWT 校验问题。

```

生命周期短。

---

### Artifact（产物）

偏成果：

```text
security-report.md

代码补丁.patch

设计文档.md

测试结果.json

架构图.png

```

生命周期长。

---

可以类比：

人类团队：

聊天：

> “我看了一下，这里有三个风险。”

↓

会议纪要 / 文档：

> security-review.docx

聊天是 message。

文档是 artifact。

---

# 在 Subagent 场景里为什么重要？

假设：

```text
Parent Agent

        |
        |
        +---- Planner Agent
        |
        |
        +---- Coder Agent
        |
        |
        +---- Reviewer Agent

```

Planner 输出：

```text
design.md
```

Coder 使用：

```text
读取 design.md
```

Reviewer 使用：

```text
读取 diff.patch
```

形成：

```text
          Planner

             |
             |
             v

       design.md

             |
       +-----+-----+

       v           v

    Coder      Reviewer


```

Artifact 就像 Agent 世界里的“文件”。

---

# Artifact 通常有哪些类型？

## 1. 文档类

例如：

```
architecture.md
plan.md
report.md
```

---

## 2. 代码类

例如：

```
fix.patch

new_component.ts

migration.sql
```

---

## 3. 数据类

例如：

```
analysis.json

test-results.json

metrics.csv
```

---

## 4. 多媒体

例如：

```
diagram.png

generated-video.mp4
```

---

# Artifact 和 Memory 有什么区别？

这个也经常混。

简单区分：

|     | Artifact  | Memory |
| --- | --------- | ------ |
| 是什么 | 产生的东西     | 记住的信息  |
| 方向  | 输出        | 输入     |
| 时间  | 任务过程产生    | 跨任务保存  |
| 例子  | report.md | 用户偏好   |

---

比如：

Agent 今天：

```text
分析项目

生成:

architecture.md
```

这是 artifact。

然后系统记住：

```text
这个项目使用 React + Go

```

这是 memory。

---

# Artifact 和 Context 的关系

刚才我们说 context filtering。

Artifact 是解决：

> 不要把所有东西塞进 context。

例如：

错误：

```
Parent context:

聊天 50k tokens
设计文档 20k tokens
代码分析 30k tokens

全部给 Child
```

正确：

```
Parent:

这里有几个 artifacts:

architecture.md
security.md

你需要哪个自己读取。

```

类似：

人类工作：

老板不会把整个公司历史会议录音发给工程师。

他说：

> “设计文档在这里，需要看就看。”

---

# 在 Agent Runtime 里，Artifact 通常会有一个管理器

类似：

```text
Artifact Store


create()

read()

update()

delete()

list()

```

结构：

```
Agent Runtime

       |
       |
 Artifact Manager

       |
       +---- architecture.md

       +---- report.json

       +---- patch.diff

```

---

# 为什么未来 Agent 系统一定需要 Artifact？

因为 Agent 的任务越来越长。

比如：

一个软件开发 Agent：

```
需求分析 Agent
       |
       v
requirements.md

架构 Agent
       |
       v
architecture.md

编码 Agent
       |
       v
code changes

测试 Agent
       |
       v
test-report.json

发布 Agent
       |
       v
deployment-plan.yaml

```

如果没有 artifact：

所有 Agent 只能靠聊天传递信息。

系统会快速失控。

---

所以回到 `pi-subagents`：

当我们说：

> Child Agent 返回 artifact 给 Parent

意思不是：

“返回一段文字”。

而是：

> 子 Agent 产生了一个可被系统管理、复用、传递的工作成果。

这个概念其实是从软件工程里的 **artifact（构建产物）** 借来的，比如编译后的 binary、设计文档、测试报告等。

在 Agent 时代，它变成了 Agent 协作的“共享文件系统”。你后面看 orchestrator 的时候，会发现 artifact 是实现多 Agent pipeline 的关键。
