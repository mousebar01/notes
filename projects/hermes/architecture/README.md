# Hermes 架构提炼

这里放的是从 Hermes 架构阅读中提炼出来的二次整理笔记，不追求覆盖所有源码细节，而是保留更适合复习、迁移和面试表达的内容。

## 推荐阅读顺序

1. [Hermes Agent 工程模式提炼](./Hermes%20Agent%20工程模式提炼.md)
2. [Hermes 架构优秀设计提炼](./Hermes%20架构优秀设计提炼.md)
3. [Hermes 面试八股提炼](./Hermes%20面试八股提炼.md)

## 三篇笔记的区别

- [Hermes Agent 工程模式提炼](./Hermes%20Agent%20工程模式提炼.md)：抽象出可以迁移到其他 Agent 系统的工程模式，例如状态持久化、prompt 分层、工具暴露、安全分层和后台任务边界。
- [Hermes 架构优秀设计提炼](./Hermes%20架构优秀设计提炼.md)：从 Hermes 本身出发，挑出比较值得学习的设计亮点。
- [Hermes 面试八股提炼](./Hermes%20面试八股提炼.md)：把 MCP、ACP、JSON-RPC、SQLite WAL、OAuth、contextvars 等可能被问到的点整理成面试问答式笔记。

## 后续可继续补充

- Agent 可靠性设计专题：retry、fallback、timeout、heartbeat、circuit breaker、checkpoint。
- Agent 安全设计专题：prompt injection、approval、redaction、env sanitization、plugin opt-in。
- 上下文工程专题：system prompt snapshot、per-turn injection、memory recall、context compression。

