# 多 Gateway 与 Dispatcher 部署

这篇笔记整理自 `multi-gateway.md`，用于理解多个 gateway 同时运行时，Kanban dispatcher 应该如何部署。

## 背景

Hermes 可以同时运行多个 gateway 进程。

例如不同 profile 各自有一个 gateway：

```text
default
writer
admin
coder
researcher
```

每个 gateway 都可以连接自己的平台 API，并为对应 profile 的订阅者转发消息。

## 核心原则：只能有一个 gateway 负责 dispatcher

虽然可以有多个 gateway，但 Kanban dispatcher 应该只由一个 gateway 负责。

通常是 `default` profile 的 gateway：

```yaml
kanban:
  dispatch_in_gateway: true
```

其他 gateway 应该关闭：

```yaml
kanban:
  dispatch_in_gateway: false
```

也可以用环境变量：

```text
HERMES_KANBAN_DISPATCH_IN_GATEWAY=false
```

## 为什么只能一个 dispatcher

如果多个 gateway 都开启 `dispatch_in_gateway: true`，它们都会：

- 打开每个 board 的 SQLite 连接
- 运行 dispatcher
- 运行 notifier watcher
- 轮询 `kanban.db`

这样会带来几个问题：

- 每个 `kanban.db` 的文件描述符变多
- SQLite WAL / `-shm` reader 竞争增加
- 多个进程同时碰同一个任务调度路径
- 更容易出现不必要的资源争用

所以文档建议：

> 多 gateway 可以并存，但 Kanban DB / dispatcher / notifier watcher 只交给一个进程负责。

## 各 gateway 的分工

| Gateway | dispatch_in_gateway | 是否打开 Kanban DB | 是否运行 dispatcher / notifier |
| --- | --- | --- | --- |
| default | true | 是 | 是 |
| writer / admin / coder 等 | false | 否 | 否 |

关闭 dispatcher 的 gateway 仍然可以正常处理自己的平台消息，例如 Telegram、Discord 等。

它们只是“不轮询 Kanban board”。

## 我的理解

多 gateway 部署的关键不是“不能多开 gateway”，而是要避免多个 gateway 同时承担 Kanban 调度职责。

更准确地说：

```text
消息入口可以多个
Kanban dispatcher 最好一个
```

这符合 Kanban 的设计思路：SQLite 是共享状态层，但调度和通知最好由一个明确的 owner 负责，减少并发争用和排查复杂度。
