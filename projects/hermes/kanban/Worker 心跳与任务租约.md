# Heartbeat / TTL / Worker 健康检查

## 1. Heartbeat 是什么

**Heartbeat，心跳机制，就是 worker 定期向系统报平安：我还活着，而且我还在处理这个任务。**

在任务系统里，一个 worker 被调度器启动后，会把任务从 `ready` 改成 `running`：

```text
task T123 -> running
worker process started
```

但系统不能只知道“这个 worker 被启动了”，还要知道它后面是不是仍然正常工作。

所以 worker 会定期更新：

```text
tasks.last_heartbeat_at = 当前时间
task_runs.last_heartbeat_at = 当前时间
task_events 记录 heartbeat event
```

意思是：

```text
我还活着
我还能访问任务系统
我还没有彻底失联
```

---

## 2. PID liveness 和 heartbeat 的区别

系统通常可以看两种信号：

```text
1. PID liveness：进程还在不在
2. heartbeat：worker 有没有持续报活
```

PID 是进程 ID。PID 还存在，只能说明：

```text
这个进程没有退出
```

但不能说明：

```text
它真的还在推进任务
它没有卡死
它没有死循环
它没有阻塞在 IO / 网络请求上
它还能访问数据库或任务系统
```

所以：

```text
PID liveness = 进程层面的“还活着”
Heartbeat = 应用层面的“还能正常报活”
```

两者互补：

| 情况                      | 说明                              |
| ----------------------- | ------------------------------- |
| PID 存在，heartbeat 正常     | 大概率还在正常执行                       |
| PID 存在，heartbeat 很久没更新  | 进程可能假死、卡住、死循环或无法访问任务系统          |
| PID 不存在，heartbeat 停止    | worker 大概率已经退出或崩溃               |
| PID 不可检查，但 heartbeat 正常 | 可能是远程 worker / 容器 / 跨机器场景，心跳更可信 |

一句话：

**PID 只能证明进程没死，heartbeat 才能证明 worker 还能和任务系统通信。**

---

## 3. TTL 是什么

**TTL 是 Time To Live，意思是“有效期”。**

比如：

```text
TTL = 5 分钟
```

表示某个状态、缓存、token、锁、任务占用，最多只被认为有效 5 分钟。

在 worker 任务系统里，TTL 常用于任务认领：

```text
task.status = running
claim_lock = worker-123
claim_expires = 10:30
```

意思是：

```text
worker-123 对这个任务的占用权，只到 10:30 有效。
```

如果到了 10:30，worker 还没有完成任务，也没有续约或心跳，调度器就可以认为：

```text
这个 worker 可能失联了
这个任务不能永久被它占着
应该释放出来重新调度
```

所以 TTL 的作用是：

**防止资源、锁、任务被某个失联 worker 永久占用。**

---

## 4. Heartbeat 和 TTL 的关系

Heartbeat 和 TTL 经常一起使用：

```text
heartbeat = worker 定期报活
TTL = 多久没报活就认为失联
```

比如：

```text
heartbeat_interval = 30 秒
heartbeat_timeout = 2 分钟
```

意思是：

```text
worker 每 30 秒更新一次心跳
如果超过 2 分钟没有心跳，就认为 worker 可能失联
```

调度器检查：

```text
now - last_heartbeat_at > heartbeat_timeout
```

如果成立，就可以把任务标记为 stale，然后回收：

```text
running -> ready
清空 claim_lock
重新分发给其他 worker
```

---

## 5. Lease / 租约思想

任务认领本质上不是永久拥有，而是一个 **lease，租约**。

worker 领取任务时：

```text
我暂时拥有这个任务的执行权
```

但这个执行权有过期时间：

```text
claim_expires = now + TTL
```

worker 正常工作时，可以通过 heartbeat 或续约不断延长这个时间。

如果 worker 失联，不再续约，租约到期后任务会被释放。

所以更准确地说：

```text
worker 不是永久锁住任务
worker 只是持有一个会过期的任务租约
```

这个设计可以避免：

```text
worker 崩溃后任务永远 running
任务被一个死进程永久占住
系统需要人工清理卡死任务
```

---

## 6. 为什么要记录 heartbeat event

更新 `last_heartbeat_at` 只能看到当前状态。

记录 `heartbeat event` 可以看到历史轨迹：

```text
任务什么时候开始跑
中间有没有持续心跳
从什么时候开始没心跳
worker 是突然死了，还是慢慢卡住了
有没有频繁失联又恢复
```

所以：

```text
last_heartbeat_at = 当前健康状态
heartbeat event = 历史审计与排查线索
```

不过实际系统里，heartbeat event 可能不会每次都永久记录，否则日志会很多。可以选择：

```text
只更新 last_heartbeat_at
定期抽样记录 heartbeat event
只在状态变化时记录 event
```

---

## 7. 需要注意误判

Heartbeat 不是绝对可靠的。

可能出现：

```text
worker 还在正常工作，但数据库短暂不可用，导致心跳失败
worker 正在执行一个很长的阻塞操作，没来得及打心跳
网络抖动导致心跳延迟
GC / CPU 卡顿导致心跳晚到
```

所以 heartbeat timeout 不能设置得太短。

通常会设计成：

```text
heartbeat_interval 比较短
heartbeat_timeout 是 interval 的几倍
```

比如：

```text
每 30 秒心跳一次
超过 2～5 分钟没心跳才判定失联
```

这样可以减少误杀正常 worker。

---

## 8. 回收任务时要考虑幂等

如果 worker 被误判失联，任务被重新派发，但原 worker 后来又恢复了，就可能出现：

```text
两个 worker 同时执行同一个任务
```

所以任务系统通常还要考虑：

```text
幂等性
重复执行保护
结果提交时检查 claim_lock
只允许当前 claim owner complete
使用 run_id 区分每次执行
```

例如 worker 完成任务时，不能只写：

```text
complete task T123
```

最好检查：

```text
只有 claim_lock 仍然属于自己
或者 run_id 仍然匹配
才能把任务改成 done
```

否则旧 worker 可能覆盖新 worker 的结果。

---

## 9. 重试上限和 Dead Letter

如果一个任务总是失败或总是超时，不能无限重试。

通常会加：

```text
retry_count
max_retries
last_error
dead_letter / failed 状态
```

例如：

```text
任务超时 -> 重新 ready
再次超时 -> retry_count + 1
超过 max_retries -> failed / dead_letter
```

这样可以避免坏任务无限消耗 worker。

Dead Letter 的意思是：

```text
这个任务已经多次失败，不再自动重试，交给人工排查。
```

---

## 10. 和生产者-消费者模型的关系

这个机制常见于生产者-消费者架构：

```text
生产者：创建任务
队列：保存任务
消费者：领取任务并执行
心跳：消费者定期报活
TTL：消费者多久没报活就算失联
回收：失联后释放任务，重新派发
```

对应到 agent 系统：

```text
生产者 = 用户 / orchestrator / scheduler
队列 = tasks 表 / kanban board
消费者 = worker / agent process
健康检查 = PID liveness + heartbeat
恢复机制 = TTL 到期后 reclaim
```

---

## 11. 常见场景

Heartbeat / TTL 是非常常见的工程模式，常见于：

| 场景            | 用途                   |
| ------------- | -------------------- |
| 任务队列 worker   | 判断任务消费者是否卡死          |
| 分布式锁          | 锁过期自动释放              |
| Kubernetes    | 检查容器是否健康             |
| WebSocket     | 判断连接是否还活着            |
| 数据库连接池        | 检查连接是否可用             |
| 消息队列 consumer | 判断消费者是否在线            |
| 长任务执行器        | 防止任务永久 running       |
| Agent 调度系统    | 判断 agent worker 是否失联 |

---

## 12. 一句话总结

**Heartbeat 是 worker 定期报活；TTL 是这个报活或任务占用的有效期；PID liveness 只能说明进程没死，heartbeat 才说明 worker 还能和系统通信；TTL 到期后，系统可以把任务从失联 worker 手里回收并重新调度。**

更工程化地说：

```text
Heartbeat + TTL + claim_lock + retry_count
= 后台任务系统的健康检查与失败恢复机制
```
