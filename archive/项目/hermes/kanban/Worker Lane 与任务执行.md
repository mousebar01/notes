# Worker Lane 与任务执行

> 来源状态：整理自 `kanban-worker-lanes.md` 和 v1 **设计稿**；未逐项做**源码验证**。外部 CLI lane 在原资料中更接近扩展方向，其可用性**待确认**；边界判断含**个人推断**。

Worker lane 回答一个问题：Task 上的 assignee 如何变成一次受 Kanban 生命周期约束的执行。

## Lane 契约

一条 lane 至少包含：

| 部分 | 责任 |
| --- | --- |
| assignee | 标识应由谁执行 |
| spawn mechanism | 把 assignee 映射为具体进程或执行环境 |
| lifecycle terminator | 明确回写 complete、block 或异常结束 |

层级关系是：

~~~text
Kanban       拥有 Task 生命周期和审计事实
Worker lane 执行某一次 Run
Reviewer    判断交付是否通过审查
PR / 文件   是可选交付物，不是 Task 状态本身
~~~

lane 不能绕过 Kanban 自行宣称任务已完成。

## Assignee

`task.assignee` 是 dispatcher 选择 lane 的键。默认设计中，它对应 Hermes profile，例如 `researcher`、`writer`、`reviewer` 或 `backend-dev`。

当 assignee 无法解析时，安全行为应是保持任务可诊断，而不是交给任意 fallback worker。原文提到记录 `skipped_nonspawnable`；该事件名是否仍与当前实现一致，**待确认**。

## Spawn

默认 Hermes profile lane 的文档示例是：

~~~text
hermes -p <assignee> chat -q <prompt>
~~~

启动上下文通过环境变量传给 worker：

| 变量 | 用途 |
| --- | --- |
| `HERMES_KANBAN_TASK` | 当前 Task |
| `HERMES_KANBAN_DB` / `HERMES_KANBAN_BOARD` | 状态存储与 Board |
| `HERMES_KANBAN_WORKSPACE` | 文件上下文 |
| `HERMES_KANBAN_RUN_ID` | 当前执行尝试 |
| `HERMES_KANBAN_CLAIM_LOCK` | 当前 claim 身份 |
| `HERMES_PROFILE` / `HERMES_TENANT` | profile 与业务标签 |

这些名称来自文档整理，当前版本是否全部保留需要源码或运行验证。

## Lifecycle

每次 Run 必须进入一个明确结局：

| 结局 | worker 行为 | Task 语义 |
| --- | --- | --- |
| 完成 | `kanban_complete(summary, metadata)` | 交付结果并结束本次 Run |
| 阻塞 | `kanban_block(reason)` | 等待输入、审查或人工处理 |
| 异常 | 进程退出、超时或协议未终止 | 交给 dispatcher 的恢复策略处理 |

“输出普通聊天回答后退出”不构成生命周期终止。worker 必须显式回写，否则系统无法区分完成、卡住与崩溃。

## Review

代码写完不一定等于 Task 完成。需要审查时，原文给出一种约定：

~~~text
kanban_comment(...)              写结构化交付信息
kanban_block("review-required")  等待 reviewer
~~~

reviewer 可以批准后解除阻塞，也可以通过 comment 要求修改。下一次 Run 读取同一 Task 的评论继续工作，从而把“实现结束”和“审查通过”分开。

## Lane 类型

| Lane | Assignee | Spawn | 成熟度边界 |
| --- | --- | --- | --- |
| Hermes profile | profile 名称 | `hermes -p <profile>` | 设计中的默认路径 |
| Orchestrator profile | 编排 profile | 同样的 profile 进程 | 只拆解和路由；详细边界见 [多 Agent 协作](./多%20Agent%20协作.md) |
| 外部 CLI | Codex、Claude Code、OpenCode 等适配名 | 插件或自定义 runner | 认证、sandbox、退出码映射和状态回写均**待确认** |

新增 lane 时，真正要适配的不是一条启动命令，而是完整的 assignee、spawn、lifecycle 与 review 契约。

## 可靠性边界

claim、run id 与 stale recovery 的 Hermes 摘要见 [Worker 心跳与任务租约](./Worker%20心跳与任务租约.md)。Heartbeat、TTL、幂等、重试和 Dead Letter 的通用原则见 [后台任务租约与恢复](../../../software-engineering/后台任务租约与恢复.md)，不在本文重复。
