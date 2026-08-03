# Hermes 架构提炼

这里放的是从 Hermes 架构阅读中提炼出来的二次整理笔记，不追求覆盖所有源码细节，而是保留更适合复习、迁移和面试表达的内容。

## 主文档

- [Hermes Agent 工程模式提炼](./Hermes%20Agent%20工程模式提炼.md)：唯一的架构主文档。既保留 Hermes 的具体设计证据，也提炼状态持久化、prompt 分层、工具暴露、安全和后台任务等可迁移模式。

通用概念问答已移到 [Agent 工程面试问题：Hermes 案例](../../../agent/Agent%20工程面试问题（Hermes%20案例）.md)，避免在项目目录重复解释主文内容。

原“架构优秀设计提炼”和“面试八股提炼”均已保存在 `archive/projects/hermes/architecture/`。

## 后续可继续补充

- Agent 可靠性设计专题：retry、fallback、timeout、heartbeat、circuit breaker、checkpoint。
- Agent 安全设计专题：prompt injection、approval、redaction、env sanitization、plugin opt-in。
- 上下文工程专题：system prompt snapshot、per-turn injection、memory recall、context compression。
