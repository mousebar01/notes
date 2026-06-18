**Swarm** 可以理解成一种“群体协作式 agent 范式”。

简单说：

```text
多个 agent 像一个小队/蜂群一样，被同时拉起来，
它们围绕同一个目标互相协作、分工、通信，最后产出结果。
```

它的典型形态是：

```text
Team Lead / Manager Agent
        ↓
  子 agent A
  子 agent B
  子 agent C
        ↓
 汇总结果
```

比如用户说：

> 帮我做一个市场调研。

swarm 范式会是：

```text
Manager agent 负责拆任务
Research agent 查资料
Analysis agent 做分析
Writer agent 写报告
Reviewer agent 检查
```

这些 agent 可能在同一个运行时里互相发消息、共享上下文，或者由一个主 agent 临时创建和管理。

它的核心特征是：

| 特征   | Swarm 范式                |
| ---- | ----------------------- |
| 协作方式 | agent 之间直接或半直接协作        |
| 生命周期 | 通常围绕一次任务临时创建            |
| 控制者  | manager / lead agent    |
| 状态位置 | 多在对话上下文或运行时内部           |
| 优点   | 灵活、像团队讨论、容易做动态分工        |
| 缺点   | 容易失控、状态不持久、失败恢复差、生命周期脆弱 |

和 Hermes Kanban 对比：

```text
Swarm：agent 像在一个会议室里互相说话。
Kanban：agent 不直接说话，都去任务板上领活和交活。
```

更直白地说：

**Swarm 是“多 agent 临时组队一起干”。
Kanban 是“多 agent 围绕持久任务系统异步协作”。**

论文里反对的主要不是“多个 agent 协作”本身，而是反对那种 **in-process swarm**：很多子 agent 被塞在同一个 SDK/runtime 生命周期里，一旦主 agent 结束、容器重启、上下文断掉，子 agent 可能也跟着消失。

Swarm 协作通常是由一个父 agent / leader agent 临时拉起多个子 agent 分工执行，子 agent 把结果交回父 agent；问题是整个协作生命周期依赖父 agent 所在的运行时和上下文，一旦父 agent 结束、容器重启或上下文断裂，子 agent 群体就容易被中断或丢失状态。
