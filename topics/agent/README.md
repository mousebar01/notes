# Agent

这里放 Agent 系统的通用知识，例如上下文管理、安全边界、工具调用和沙箱。

不放 Hermes 这类具体项目拆解；Hermes 放到 [projects/hermes](../../projects/hermes/README.md)。不放模型微调和 API 细节；这类内容放到 [topics/llm](../llm/README.md)。

## 当前笔记

- [Agent Session 字段](./Agent%20Session%20字段.md)：session 元信息、append-only 事件日志和压缩 state 的基本理解。
- [上下文管理](./上下文管理.md)：Agent 单轮对话如何组织 messages、tools、runtime context、memory 和压缩策略。
- [Agent 安全与沙箱](./security/README.md)：提示词攻击测试、工具权限、沙箱边界和不可信内容处理。
