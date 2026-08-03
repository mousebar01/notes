# Worker 心跳与任务租约

> 来源状态：整理自 v1 **设计稿**、worker lane 文档和原学习笔记；本文未做逐字段**源码验证**。字段名、超时条件和恢复顺序与当前实现是否一致，均为**待确认**。

本文只保留 Hermes 项目里的 claim、run id 和 stale recovery。Heartbeat、TTL、Lease、幂等、重试与 Dead Letter 的通用解释见 [后台任务租约与恢复](../../../software-engineering/后台任务租约与恢复.md)。

## Claim 与 Run

| 标识 | 作用 | 要防止的问题 |
| --- | --- | --- |
| `claim_lock` | 表示当前谁持有 Task 的临时执行权 | 两个 worker 同时提交 |
| `claim_expires` | 给 claim 设置到期时间 | worker 失联后 Task 永久停在 `running` |
| `run_id` | 标识一次执行尝试 | 旧 worker 恢复后覆盖新 Run |
| heartbeat 时间 | 表示当前 worker 最近仍可与状态层通信 | 只看 PID 时无法识别假死或远程 worker |

这几个字段共同表达一个原则：worker 持有的是会过期的执行租约，不是 Task 的永久所有权。

## Stale Recovery

设计意图可以压缩成以下流程：

~~~text
ready
  -> dispatcher 原子 claim，创建或关联 run id
running
  -> worker heartbeat / 续约
  -> complete 或 block
  -> 超过有效期且无法确认仍在执行时，标记 stale
stale
  -> 结束旧 Run，清理旧 claim
  -> Task 回到 ready，等待新的 Run
~~~

是否同时检查本机 PID、如何计算 heartbeat timeout、何时增加失败次数，属于具体实现策略，本文不作确定陈述。

## 提交边界

为了避免过期 worker 写坏新结果，完成或阻塞操作至少应验证：

1. claim 仍属于当前 worker。
2. run id 仍是 Task 的当前执行尝试。
3. 状态变化通过原子条件更新完成。
4. 外部副作用按可能重复执行来设计。

前 3 项是 Kanban 状态层的防护；第 4 项仍是业务任务自己的责任。即使旧 Run 不能写回 `done`，它已经发出的邮件、支付或外部 API 请求也不会自动撤销。

## 恢复上限

stale recovery 不能无限循环。连续 spawn failure、crash 或 timeout 达到阈值后，应停止自动重试并进入需要人工处理的状态。Hermes 具体使用 `blocked`、`gave_up` 还是其他事件 / 状态，需以当前源码与运行结果确认。
