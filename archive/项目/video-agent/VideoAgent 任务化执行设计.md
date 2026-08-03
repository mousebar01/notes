# VideoAgent 任务化执行设计

本文描述如何把一次视频处理从单进程脚本变成可追踪、可验收的任务。完整推导和扩展方案保存在 `archive/projects/video-agent/VideoAgent 任务化执行设计-原稿.md`。

> 文档状态：目标设计，不是实现报告
>
> 整理日期：2026-07-13
>
> 实现状态：现有笔记没有提供可复现命令、测试或运行产物，以下能力均需对照代码确认

## 当前问题

旧执行方式由 `MultiAgent` 同时承担意图分析、Agent Graph 生成、输入收集和执行，过程主要存在内存中。原稿记录的问题包括：

- 计划和执行没有稳定边界。
- 没有持久化的 Job / Step 状态。
- 用户输入依赖执行期 `input()`。
- 中间产物、错误和事件没有统一登记。
- LLM 计划缺少强 schema。
- 失败后不能证明可从断点继续。

这些判断来自旧笔记，当前代码是否已经变化，待确认。

## v1 目标与边界

v1 只验证一个本地任务闭环：

```text
create -> plan -> submit inputs -> run -> validate -> inspect
```

目标是可执行、可追踪、可验收，并为以后恢复执行保留足够状态。v1 不包含数据库、分布式 Worker、Web API、动态重新规划或失败 Job 的断点续跑。

### 关于 resume 的明确结论

现有材料不能证明断点续跑已经实现。为消除原稿中“v1 支持 basic resume”与“v1 失败后只标记 failed”的矛盾，本设计作如下约束：

- v1 可以在**同一次运行内**按策略重试当前 Step。
- Job 一旦进入 `FAILED`，v1 将其视为终态，不提供 `job resume` 命令。
- v1 仍保存 Step、输入输出和 Artifact，以便诊断或创建新 Job 时复用。
- “跳过已成功 Step、从失败位置继续”属于后续能力；只有通过 Artifact 重验、幂等性和恢复测试后，才能标为已支持。
- 当前代码是否已有部分恢复逻辑：待确认。

## 概念模型

### VideoJob

用户提交的一次完整任务，保存需求、计划、输入、整体状态和最终结果。

```text
id
requirement
status
input_assets
plan
required_inputs
user_inputs
error
created_at / updated_at
```

### JobStep

计划中的一个可执行单元，通常对应一个 Agent 或确定性工具调用。

```text
id / job_id / step_index
agent_name
status
inputs / outputs
attempt_count / max_attempts
last_error
started_at / finished_at
```

### Artifact

Step 使用或产生、需要持久保存与校验的文件或结构化数据，例如 storyboard、检索结果、裁剪片段和最终视频。

```text
id / job_id / step_id
type
uri
metadata
checksum
created_at
```

### JobEvent

可查询的业务事件，例如 `job_created`、`step_started`、`artifact_created` 和 `job_failed`。Event 用于解释生命周期，调试日志仍单独保存。

```text
id / job_id / step_id
event_type
message
payload
created_at
```

## 不变量

1. 只有 `JobService` 可以修改 `VideoJob.status`。
2. `Planner` 只输出符合 schema 的计划，不执行 Agent 或写任务状态。
3. `Executor` 只执行已冻结的计划，不重新解释用户需求，也不调用 `input()`。
4. `execute` 返回不代表 Step 成功；`execute + validate` 均通过才是 `SUCCEEDED`。
5. 每个可复用文件必须登记为 Artifact，并能追溯到产生它的 Step。
6. 状态变更与 Artifact 创建必须产生 Event。
7. Step 输入只能来自 Job 输入、显式用户输入或已登记的上游输出。
8. v1 的 `FAILED` Job 不原地恢复；重跑使用新 Job，来源关系写入 metadata。

## 生命周期

### Job 状态

```text
CREATED
  -> PLANNING
  -> WAITING_USER_INPUT | READY
  -> RUNNING
  -> SUCCEEDED | FAILED | CANCELLED
```

允许流转：

```text
CREATED -> PLANNING
PLANNING -> WAITING_USER_INPUT
PLANNING -> READY
WAITING_USER_INPUT -> READY
READY -> RUNNING
RUNNING -> SUCCEEDED
RUNNING -> FAILED
RUNNING -> CANCELLED
```

v1 不允许 `FAILED -> READY` 或 `SUCCEEDED -> RUNNING`。执行过程中发现缺少输入说明规划不完整，v1 记录结构化错误并失败；未来可以增加运行期人工确认状态。

### Step 状态

```text
PENDING -> RUNNING -> VALIDATING -> SUCCEEDED
                 \-> RETRYING -> RUNNING
                 \-> FAILED
```

`SKIPPED` 仅用于计划明确标为可选且条件不满足的 Step，不能用来掩盖失败。

### Step 验收

通用验收：

- 输出符合声明的 schema。
- 路径经过规范化且位于允许目录。
- 必需文件存在、非空且 checksum 可计算。
- 输出能够被下游读取。

视频链路还应有领域验收：

| Step | 最小验收 |
| --- | --- |
| Storyboard | schema 可解析；每个场景有顺序、查询描述和目标时长 |
| Retrieval | 每个必需场景有候选片段、来源视频和时间范围 |
| Trim | 文件存在、可解码、实际时长与请求范围相符 |
| 拼接 | 最终视频可解码、音视频流符合预期、时长非零 |

具体容差必须由固定测试素材确定，当前待实测。

## 失败与恢复动作

错误分三类：

| 类型 | 示例 | v1 动作 |
| --- | --- | --- |
| Retryable | 网络超时、429、短暂文件锁 | 在 `max_attempts` 内 `RETRY_SAME`，使用退避 |
| NonRetryable | 输入不存在、配置错误、缺少依赖、schema 错误 | `FAIL_FAST` |
| NeedUserInput | 缺少素材路径、目标时长或必要选择 | 应在 planning 阶段进入 `WAITING_USER_INPUT` |

v1 只实现 `RETRY_SAME`、`WAITING_USER_INPUT`（规划阶段）和 `FAIL_FAST`。调整参数、切换工具、重新规划和失败后 resume 都放到后续阶段。

失败记录至少包含：稳定错误码、可读消息、Step、attempt、是否可重试和底层异常摘要。不能只保存一段不可机器判断的 traceback。

## 职责边界

### Planner

输入 `requirement + asset metadata`，输出经过 schema 校验的 `plan + required_inputs + steps`。它可以做意图分析和工具选择，但不执行媒体工具、不修改 Job，也不在运行期追问用户。

### Executor

按 `step_index` 解析输入、调用 Agent / Tool、验收输出、登记 Artifact，并把 Step 结果返回给 JobService。它不修改整体 Job 状态，不自行 replan。

### JobService

创建 Job、推进状态、保存计划和用户输入、创建 Step、调用 Planner / Executor、记录 Event，并决定最终成功或失败。

### Agent / Tool

实现单一处理能力，声明输入输出 schema，并可提供领域验收器。Agent 不读取全局 Job 文件，也不直接决定重试策略。

## v1 本地存储

```text
runtime/jobs/job_xxx/
├── job.json
├── plan.json
├── events.jsonl
├── steps/
│   ├── 001_storyboard.json
│   ├── 002_retrieval.json
│   ├── 003_trim.json
│   └── 004_concat.json
└── artifacts/
    ├── storyboard.json
    ├── retrieval.json
    ├── clips/
    └── final.mp4
```

v1 支持：

```text
file:///absolute/path/to/input.mp4
job://artifacts/final.mp4
```

写入要求：同一 Job 内串行更新；JSON 使用临时文件写完并校验后原子替换；Event 追加写入；Artifact 登记前完成基本验收。并发 Worker 与跨进程锁不在 v1 范围。

## v1 CLI

```bash
videoagent job create --requirement "按要求生成素材混剪"
videoagent job plan --job-id job_xxx
videoagent job input --job-id job_xxx --json inputs.json
videoagent job run --job-id job_xxx
videoagent job show --job-id job_xxx
videoagent job events --job-id job_xxx
```

- `create`：只创建 Job。
- `plan`：生成 plan、required inputs 和 Steps。
- `input`：提交完整用户输入；不在执行中调用终端 `input()`。
- `run`：执行一次 READY Job，失败后不自动恢复 Job。
- `show`：显示整体状态、Step 和 Artifact。
- `events`：按时间输出业务事件。

命令是否已经存在于当前代码：待确认。本文只定义 v1 接口。

## v1 完成标准

- 一条固定 storyboard / retrieval / trim / 拼接任务能通过 CLI 运行。
- Job、Step、Artifact 和 Event 在进程退出后仍可查询。
- 每个 Step 必须先验收再标记成功。
- 一个 Retryable 故障能在同次运行内重试；耗尽后 Job 明确失败。
- 一个 NonRetryable 故障不发生盲目重试。
- 规划缺少输入时停在 `WAITING_USER_INPUT`，Executor 中没有交互式输入。
- 失败 Job 没有被文档或 UI 错误描述为“可断点续跑”。

这些都是验收目标，不是当前已完成事实。

## 演进顺序

1. **本地闭环**：JSON 存储、固定链路、Step 验收和同次运行重试。
2. **可靠恢复**：Artifact 重验、幂等 Step、`resume` 语义和故障注入测试。
3. **服务化**：FastAPI、后台 Worker、取消和进度查询。
4. **持久化**：PostgreSQL、对象存储、队列、结构化日志和 Trace。
5. **产品化**：模板工作流、人工确认、多用户权限、审计和成本统计。

只有第二阶段的恢复测试通过后，README 和接口文档才能宣称支持断点续跑。
