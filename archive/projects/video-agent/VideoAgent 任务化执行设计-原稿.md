# VideoAgent 任务化执行设计

## 1. 背景

当前 VideoAgent 已经能够稳定运行，但整体仍偏向研究型 / Demo 型执行方式：用户通过命令行输入需求，系统在单进程中完成意图分析、Agent Graph 生成、用户输入收集和 Agent Chain 执行。

为了让 VideoAgent 具备工业化能力，需要引入任务化执行模型，使一次视频智能任务具备以下能力：

* 可执行：任务不只是自然语言需求，而是可以被系统规划成明确的执行计划。
* 可追溯：任务执行过程、每一步输入输出、中间产物和失败原因都可以被查询。
* 可断点继续：任务失败后，系统能够识别哪些步骤已成功，哪些步骤失败，并尽可能从失败位置继续。
* 可验收：每一步执行结束后，不仅看程序是否返回成功，还要验证产物是否满足要求。
* 可恢复：失败后根据错误类型选择重试、调整参数、等待用户输入、重新规划或直接失败。

本设计目标是将当前 VideoAgent 从“单次脚本执行”演进为“可管理的视频任务系统”。

---

## 2. 当前架构理解

当前系统大致结构如下：

```text
main.py
  ↓
MultiAgent
  ↓
Intent Analysis
  ↓
Tool Selection
  ↓
Agent Graph Generation
  ↓
Agent Graph Judgment / Reflection
  ↓
User Input Collection
  ↓
Agent Chain Execution
  ↓
Concrete Agent / Tool
```

当前核心模块包括：

```text
main.py
  入口层，负责展示 banner 并启动 MultiAgent

environment/agents/multi.py
  当前核心编排器，负责意图分析、工具选择、Agent Graph 生成、校验、反思、执行

environment/agents/base.py
  定义 BaseTool 和 FunctionRegistry，用于扫描并注册 Agent 工具元数据

environment/config/intents.yml
  定义用户意图到 Agent 工具集合的映射

environment/config/registry.json
  定义 Agent 名称到 Python 模块路径的映射，用于运行时动态加载

environment/config/llm.py
  封装 deepseek / claude / gemini / gpt 等 LLM 调用

environment/roles/
  存放具体 Agent / Tool 实现，例如 AudioExtractor、Transcriber、VideoEditor 等
```

当前架构本质上是：

```text
LLM 负责规划
YAML 负责意图到工具映射
BaseTool 负责 Agent 输入输出 schema
registry.json 负责执行时动态加载
MultiAgent 负责把它们串起来
```

现阶段的主要问题：

```text
计划和执行没有分离
任务状态没有实体
用户输入依赖 input()
执行过程只存在内存中
Step 没有持久化记录
Artifact 没有统一登记
错误和日志没有结构化
失败后无法可靠断点继续
LLM 输出缺少强 schema 约束
Agent Registry 存在两套来源
```

---

## 3. 核心设计目标

Job 化的目标不是简单增加一个任务表，而是建立 VideoAgent 的运行模型。

一次任务需要满足：

```text
可执行
可追溯
可验收
可断点继续
可恢复
```

因此需要引入以下核心概念：

```text
VideoJob
JobStep
Artifact
JobEvent
RetryPolicy / RecoveryAction
```

---

## 4. 核心概念定义

### 4.1 VideoJob

VideoJob 表示用户提交的一次完整视频智能任务。

例如：

```text
帮我把这个视频总结成 3 分钟中文解说版
```

这就是一个 VideoJob。

VideoJob 负责回答：

```text
用户要做什么？
任务当前整体处于什么状态？
任务的计划是什么？
任务需要哪些用户输入？
任务最终是否成功？
任务产生了哪些结果？
```

VideoJob 包含：

```text
requirement
status
input_assets
plan
required_inputs
user_inputs
steps
artifacts
events
error_message
created_at
updated_at
```

### 4.2 JobStep

JobStep 表示 VideoJob 中一个具体可执行步骤。

一个 Job 会被拆成多个 Step，每个 Step 通常对应一个 Agent 的一次执行。

例如：

```text
Step 1: AudioExtractor
Step 2: Transcriber
Step 3: VideoSummarizationGenerator
Step 4: VoiceGenerator
Step 5: Merge
```

JobStep 负责回答：

```text
系统具体做到了哪一步？
这一步由哪个 Agent 执行？
这一步使用了什么输入？
这一步产生了什么输出？
这一步成功、失败还是正在运行？
失败原因是什么？
尝试了几次？
```

JobStep 包含：

```text
id
job_id
step_index
agent_name
status
inputs
outputs
attempt_count
max_attempts
last_error
started_at
finished_at
```

### 4.3 Artifact

Artifact 表示任务过程中产生或使用的可保存产物。

Artifact 通常是文件，也可以是结构化数据。

例如：

```text
input.mp4
audio.wav
transcript.json
subtitles.srt
summary.txt
narration.wav
final.mp4
```

Artifact 负责回答：

```text
这个文件是什么？
它属于哪个 Job？
它由哪个 Step 产生？
它存在哪里？
它是否可供后续 Step 复用？
它是否可供用户查看或下载？
```

Artifact 包含：

```text
id
job_id
step_id
type
uri
metadata
created_at
```

Artifact 的意义：

```text
产物可追踪
产物可复用
产物可下载
产物可恢复
```

判断一个对象是否应该成为 Artifact，可以看：

```text
它是否是 Step 的重要输入或输出？
它是否需要保存下来？
它是否可能被后续 Step 使用？
它是否可能被用户查看或下载？
它是否能帮助失败后恢复？
```

### 4.4 JobEvent

JobEvent 表示任务执行过程中的关键业务事件。

例如：

```text
job_created
planning_started
planning_succeeded
waiting_user_input
step_started
step_validating
step_succeeded
step_failed
artifact_created
job_succeeded
job_failed
```

JobEvent 与普通日志不同：

```text
Event 是业务事件，用于追踪任务生命周期
Log 是调试信息，用于排查程序细节
```

例如：

```text
step_started 是 Event
ffmpeg 输出的一行日志不是 Event
```

JobEvent 包含：

```text
id
job_id
step_id
event_type
message
payload
created_at
```

---

## 5. Job 与 Step 的关系

VideoJob 是用户层面的任务，JobStep 是系统层面的执行单元。

示例：

```text
VideoJob:
  requirement: 生成 3 分钟中文解说视频
  status: running

  Step 1 AudioExtractor: succeeded
  Step 2 Transcriber: succeeded
  Step 3 VideoSummarizationGenerator: running
  Step 4 VoiceGenerator: pending
  Step 5 Merge: pending
```

整体任务状态由 VideoJob.status 表达。
单步执行状态由 JobStep.status 表达。

两者不能混在一起。

---

## 6. Job 状态机

第一版 VideoJob 状态可以设计为：

```text
CREATED
PLANNING
WAITING_USER_INPUT
READY
RUNNING
SUCCEEDED
FAILED
CANCELLED
```

推荐状态流转：

```text
CREATED
  ↓
PLANNING
  ↓
WAITING_USER_INPUT
  ↓
READY
  ↓
RUNNING
  ↓
SUCCEEDED / FAILED / CANCELLED
```

允许的流转：

```text
CREATED -> PLANNING
PLANNING -> WAITING_USER_INPUT
PLANNING -> READY
WAITING_USER_INPUT -> READY
READY -> RUNNING
RUNNING -> SUCCEEDED
RUNNING -> FAILED
RUNNING -> CANCELLED
FAILED -> READY
```

第一版暂时不允许：

```text
SUCCEEDED -> RUNNING
```

如果成功后需要重新执行，建议新建 Job，或者未来引入 WorkflowRun。

---

## 7. Step 状态机

JobStep 状态建议设计为：

```text
PENDING
RUNNING
VALIDATING
SUCCEEDED
RETRYING
FAILED
SKIPPED
```

正常流程：

```text
PENDING
  ↓
RUNNING
  ↓
VALIDATING
  ↓
SUCCEEDED
```

失败重试流程：

```text
RUNNING / VALIDATING
  ↓
RETRYING
  ↓
RUNNING
```

重试耗尽：

```text
RETRYING
  ↓
FAILED
```

Step 成功的标准不是“程序运行完了”，而是：

```text
Agent 执行成功
输出符合 OutputSchema
关键产物存在
关键产物可读取
自定义验收规则通过
```

因此：

```text
execute 成功 ≠ Step 成功
execute 成功 + validate 成功 = Step 成功
```

---

## 8. Step 验收机制

工业化系统中，Step 必须可验收。

例如 AudioExtractor Step：

```text
执行动作:
  调用 ffmpeg 从 input.mp4 提取 audio.wav

验收条件:
  ffmpeg 返回码为 0
  audio.wav 文件存在
  audio.wav 文件大小 > 0
  audio.wav 可被读取
  音频时长 > 0
```

例如 Transcriber Step：

```text
执行动作:
  调用 fap / whisper / funasr 进行音频转写

验收条件:
  转写命令返回成功
  transcript 文件存在
  transcript 内容非空
  transcript 格式能被 JSON / SRT 解析
```

第一版可采用混合验收设计：

```text
Executor 做通用验收
Agent 可选提供自定义验收
```

通用验收包括：

```text
OutputSchema 校验
path / paths / dir 类型字段存在性检查
文件大小检查
目录存在性检查
```

自定义验收包括：

```text
音频时长检查
视频可解码检查
字幕格式检查
转写文本非空检查
```

设计原则：

```text
每个 JobStep 都必须经过 execute 和 validate 两个阶段。只有 Agent 执行成功且验收规则通过，Step 才能进入 succeeded。执行失败或验收失败时，系统根据错误类型和 max_attempts 决定自动重试、等待用户输入、重新规划或终止 Job。
```

---

## 9. 断点继续机制

断点继续不是仅靠 Job.status 实现的，而是靠 Step 和 Artifact 实现的。

如果任务失败，系统需要知道：

```text
哪些 Step 已经 succeeded
这些 Step 的 outputs 是什么
这些 outputs 对应的 Artifact 是否仍然存在
失败 Step 是哪一个
失败 Step 的 inputs 是否还能重建
```

断点继续的第一版规则：

```text
按 step_index 排序
跳过已经 succeeded 且 outputs/artifacts 可用的 Step
从第一个 pending 或 failed 的 Step 开始继续执行
```

前提条件：

```text
只有当上游 Step 已成功，且其 outputs/artifacts 仍可用时，才能跳过该 Step。
```

如果上游 Artifact 丢失，则不能盲目跳过，需要重新执行上游 Step。

---

## 10. Retry Policy 与 Recovery Action

失败后不应该盲目原样重试。

重试需要回答两个问题：

```text
这个错误值不值得重试？
如果重试，应该用同一种方式，还是换一种策略？
```

因此需要引入 RetryPolicy / RecoveryAction。

### 10.1 错误分类

错误可以分为：

```text
Retryable
NonRetryable
NeedUserInput
```

#### Retryable：可重试错误

例如：

```text
网络超时
API 429
模型服务临时不可用
临时文件锁
下载中断
子进程偶发失败
GPU 临时 OOM 后资源可恢复
```

处理方式：

```text
等待一段时间
原参数重试
或调整参数后重试
```

#### NonRetryable：不可重试错误

例如：

```text
输入文件不存在
文件权限不足
ffmpeg 未安装
配置文件错误
API key 缺失
模型文件不存在
输入格式完全不支持
代码 bug
schema 定义错误
```

处理方式：

```text
不重试
直接失败
给出明确错误信息
```

#### NeedUserInput：需要用户输入

例如：

```text
缺少源视频路径
缺少目标语言
需要选择配音音色
需要确认剪辑风格
多个候选素材需要用户选择
```

处理方式：

```text
Job.status = WAITING_USER_INPUT
required_inputs += 新增输入项
```

---

### 10.2 RecoveryAction

Step 失败后，不应该只判断 retry true/false，而应该选择恢复动作。

第一版可以支持：

```text
RETRY_SAME
WAIT_USER_INPUT
FAIL_FAST
```

未来可以扩展：

```text
RETRY_WITH_ADJUSTED_PARAMS
RETRY_WITH_FALLBACK_TOOL
REPLAN
```

各动作含义：

```text
RETRY_SAME
  原参数重试，适合偶发错误

RETRY_WITH_ADJUSTED_PARAMS
  调整参数后重试，例如降低分辨率、缩短切片、降低 batch size

RETRY_WITH_FALLBACK_TOOL
  切换备用工具，例如 Whisper 失败后尝试 FunASR

REPLAN
  当前 Agent Chain 不可行时，将失败原因反馈给 Planner 重新规划

WAIT_USER_INPUT
  当前任务缺少用户信息，暂停等待用户补充

FAIL_FAST
  确定性错误，直接失败
```

设计原则：

```text
系统不对所有失败进行盲目重试。每个 Step 失败后，Executor 会根据错误类型、Step 类型、历史尝试次数和可用替代方案，选择恢复动作：原样重试、调整参数重试、切换工具、重新规划、等待用户输入或直接失败。
```

---

## 11. Planner / Executor / JobService 职责边界

当前 MultiAgent 负责太多事情。Job 化后应拆为三个核心角色。

### 11.1 Planner

Planner 只负责规划。

输入：

```text
requirement
assets metadata
```

输出：

```text
AgentPlan
required_inputs
agent_chain
agent_graph
```

Planner 负责：

```text
意图分析
工具选择
Agent Graph 生成
Agent Graph 校验
必要时反思重试
```

Planner 不负责：

```text
执行 Agent
写文件
保存 Job 状态
管理 Step 状态
调用 ffmpeg
```

### 11.2 Executor

Executor 只负责执行已生成的 Plan。

输入：

```text
plan
user_inputs
assets
```

输出：

```text
execution_result
step outputs
artifacts
```

Executor 负责：

```text
按 agent_chain 执行 Step
准备 Step inputs
调用 Agent.execute
执行 Step 验收
登记 Step outputs
识别 Artifact
处理 RetryPolicy
```

Executor 不负责：

```text
重新理解用户需求
重新规划
向用户 input()
决定 Job 生命周期状态
```

### 11.3 JobService

JobService 负责管理任务生命周期。

JobService 负责：

```text
创建 Job
推进 Job 状态
保存 Plan
保存用户输入
创建 Step
调用 Planner
调用 Executor
记录 Event
保存 Artifact
处理最终成功或失败
```

JobService 不负责：

```text
具体视频处理逻辑
具体 LLM prompt
具体 Agent 内部实现
```

重要规则：

```text
只有 JobService 可以修改 VideoJob.status。
```

Planner、Executor、Agent 可以返回结果或错误，但不直接修改 Job.status。

---

## 12. 第一版存储设计

第一版不建议直接上数据库、队列或对象存储。可以先使用本地文件实现最小闭环。

推荐目录：

```text
runtime/
└── jobs/
    └── job_xxx/
        ├── job.json
        ├── plan.json
        ├── events.jsonl
        ├── steps/
        │   ├── 001_AudioExtractor.json
        │   ├── 002_Transcriber.json
        │   └── 003_VideoEditor.json
        └── artifacts/
            ├── input.mp4
            ├── audio.wav
            ├── transcript.json
            └── final.mp4
```

第一版可以支持两种 URI：

```text
file:///absolute/path/to/input.mp4
job://artifacts/final.mp4
```

设计原则：

```text
第一版用 JSON 文件和本地目录验证 Job 生命周期。
等模型跑通后，再迁移到 PostgreSQL + MinIO / S3 + Redis。
```

---

## 13. 第一版执行流程

推荐使用显式 CLI 命令验证 Job 化模型，而不是一开始做 API。

命令流：

```bash
videoagent job create --requirement "帮我总结这个视频"
videoagent job plan --job-id job_xxx
videoagent job input --job-id job_xxx --json inputs.json
videoagent job run --job-id job_xxx
videoagent job show --job-id job_xxx
videoagent job events --job-id job_xxx
```

第一版行为：

```text
create 只创建 Job，不自动规划
plan 生成 plan、required_inputs 和 steps
input 提交用户输入
run 执行 steps
show 查看 Job 当前状态
events 查看任务事件
```

后续可以增加：

```bash
videoagent job submit --requirement "..." --auto-run
```

但第一版不建议自动串太多流程，以便调试。

---

## 14. 第一版设计选择

当前推荐的第一版选择：

```text
1. 不区分 VideoJob 和 WorkflowRun
   一个 Job 只有一次执行

2. create 后不自动 plan
   使用显式 plan 命令

3. plan 后如果不缺输入，可以 READY
   但 run 仍由用户显式触发

4. 用户输入在 planning 后统一收集
   禁止执行过程中调用 input()

5. 存储使用 JSON 文件 + 本地目录
   暂不上数据库

6. Step 在 plan 结束后一次性创建
   便于展示进度和追踪

7. 失败后第一版标记 Job failed
   数据结构预留未来从 failed Step 继续

8. Artifact 第一版由 Executor 根据 outputs 自动识别
   未来再让 Agent 显式声明 Artifact

9. Retry 第一版支持 retry_same / wait_user_input / fail_fast
   未来扩展 adjusted params / fallback tool / replan
```

---

## 15. 最小概念模型

```text
VideoJob
  ├── requirement
  ├── status
  ├── input_assets
  ├── plan
  ├── required_inputs
  ├── user_inputs
  ├── steps
  ├── artifacts
  ├── events
  └── error_message

JobStep
  ├── agent_name
  ├── status
  ├── inputs
  ├── outputs
  ├── attempt_count
  ├── max_attempts
  └── last_error

Artifact
  ├── type
  ├── uri
  ├── job_id
  ├── step_id
  └── metadata

JobEvent
  ├── event_type
  ├── message
  ├── payload
  └── created_at
```

---

## 16. 关键原则

### 原则 1：Job 是用户任务，Worker 是执行进程

```text
Job = 要做的事
Worker = 干活的人/进程
Step = Job 里的一个执行步骤
Artifact = Step 使用或产生的产物
Event = 执行过程中的关键事件
```

因此：

```text
先定义 Job，再让 Worker 执行 Job。
```

### 原则 2：Planner 和 Executor 必须分离

```text
Planner 只生成计划
Executor 只执行计划
```

Executor 不应该重新理解用户需求，也不应该调用 input()。

### 原则 3：只有 JobService 修改 Job.status

Planner、Executor、Agent 都不直接修改 Job.status。

### 原则 4：Step 成功必须经过验收

```text
execute 成功 + validate 成功 = Step 成功
```

### 原则 5：断点继续依赖 Step 和 Artifact

Job.status 只能说明整体失败，真正能不能继续取决于：

```text
成功 Step 的 outputs 是否存在
Artifact 是否可用
失败 Step 的 inputs 是否可重建
```

### 原则 6：失败恢复不是盲目重试

系统应该根据错误类型选择：

```text
原样重试
调整参数重试
切换工具
重新规划
等待用户输入
直接失败
```

---

## 17. 后续演进方向

第一阶段目标：

```text
本地 VideoJob 生命周期跑通
Job / Step / Artifact / Event 持久化到 runtime/jobs
当前 MultiAgent 被 Planner / Executor 包装
执行过程中禁止 input()
Step 具备基础验收和重试机制
```

第二阶段目标：

```text
引入 FastAPI
创建 Job / 查询 Job / 提交输入 / 运行 Job / 查询 Artifact
```

第三阶段目标：

```text
引入 Worker
使用 Redis / Celery / RQ 执行长任务
支持后台执行、取消、重试
```

第四阶段目标：

```text
迁移存储到 PostgreSQL + MinIO / S3
引入结构化日志、Metrics、Trace
支持更完整的断点续跑
```

第五阶段目标：

```text
模板 Workflow
Web UI
任务进度条
人工确认节点
多用户 / 权限 / 审计
成本统计
```

---

## 18. 当前阶段结论

VideoAgent 工业化改造不应该一开始推翻现有代码，而应该先围绕当前 MultiAgent 增加任务运行模型。

当前 MultiAgent 可以被视为核心发动机；Job 化是在发动机外部增加任务管理、状态追踪、产物管理、验收机制和恢复机制。

第一版目标不是完美架构，而是建立最小闭环：

```text
create job
plan job
submit inputs
run job
record steps
record artifacts
record events
support retry
support basic resume
show job state
```

当这个闭环跑通后，再逐步 API 化、Worker 化和平台化。
