# ADR：多 Gateway 场景下的 Dispatcher Owner

> 来源状态：决策整理自 `docs/kanban/multi-gateway.md`，属于**项目文档验证**，尚未逐项做**源码验证**。配置键与 notifier 行为在当前版本是否一致为**待确认**。

- **ADR 状态**：采用上游文档建议
- **范围**：同一 Hermes 安装中运行多个 gateway
- **决定**：由单一 gateway 进程拥有 Kanban dispatcher

## 背景

不同 profile 可以运行各自的 gateway，分别接入 Telegram、Discord 等消息入口。如果每个 gateway 都同时轮询同一组 Board，它们会各自打开 SQLite、运行 dispatcher 和 notifier watcher。

## 决定

消息 gateway 可以有多个，但 Kanban dispatcher、DB 轮询与 notifier watcher 只交给一个明确 owner。通常由 `default` profile 的 gateway 承担：

~~~yaml
# default profile
kanban:
  dispatch_in_gateway: true
~~~

其他 gateway 关闭调度：

~~~yaml
# writer / admin / coder / researcher ...
kanban:
  dispatch_in_gateway: false
~~~

也可按上游文档使用：

~~~text
HERMES_KANBAN_DISPATCH_IN_GATEWAY=false
~~~

## 原因

- 减少每个 `kanban.db` 的连接、文件描述符和 SQLite WAL / SHM 竞争。
- 避免多个进程同时进入同一调度路径。
- 让 worker 启动、通知和故障排查有唯一责任人。
- 保持“多消息入口、单调度 owner”的部署模型。

## 后果

| 正面 | 代价 |
| --- | --- |
| 并发路径更简单，故障定位更明确 | owner 停止时，Kanban 调度会暂停 |
| 非 owner gateway 不需要打开 Board DB | 需要在部署配置中保证恰好一个 owner |
| 其他 gateway 仍可处理平台消息 | 如需高可用，不能简单同时开启多个 dispatcher |

## 运维约束

1. 配置审查时确认“恰好一个” `dispatch_in_gateway: true`。
2. 对 owner 增加进程健康检查与重启策略。
3. 切换 owner 时先停止旧 owner，再启动新 owner。
4. 需要多主机高可用时另做 leader election、共享存储与 fencing 设计；本 ADR 不推断 Hermes 已提供这些能力。
