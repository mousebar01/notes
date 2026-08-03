# Grill With Docs 需求澄清方法

`grill-with-docs` 的设计其实很“典型”：**它自己不是大 skill，而是一个用户入口 orchestration skill**。

它的完整内容只有：

```md
---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Run a `/grilling` session, using the `/domain-modeling` skill.
```

所以它的设计重点不是“写很多规则”，而是这几个点。

## 1. 它是手动入口，不允许模型自动调用

关键字段是：

```yaml
disable-model-invocation: true
```

这说明 `/grill-with-docs` 是 **user-invoked skill**。

也就是说，只有用户明确输入 `/grill-with-docs` 或表达要运行它时才用。模型不应该自己判断“现在我来 grill-with-docs 一下”。

原因很合理：这个 skill 会开启一个比较重的流程：

```txt
反复追问计划
检查术语
可能更新 CONTEXT.md
可能创建 ADR
```

这种流程不应该被模型随便自动触发。

---

## 2. 它本身是组合器，不承载具体能力

这句是核心：

```md
Run a `/grilling` session, using the `/domain-modeling` skill.
```

它把两个 model-invoked skill 编排在一起：

```txt
/grill-with-docs
  ├─ /grilling
  └─ /domain-modeling
```

其中：

```txt
/grilling         = 追问、压力测试、一次一个问题
/domain-modeling  = 术语建模、CONTEXT.md、ADR
```

所以它的含义是：

> 用 `/grilling` 的方式访谈用户，同时启用 `/domain-modeling` 的文档化纪律。

它不是“继承”这两个 skill，而是 **组合** 这两个 skill。

---

## 3. `/grilling` 负责“怎么问”

`/grilling` 的规则很短，但非常强：

```md
Interview me relentlessly about every aspect of this plan until we reach a shared understanding.

Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.
```

这给 `/grill-with-docs` 提供了访谈纪律：

```txt
不要直接给方案
不要一次问一堆问题
沿着设计决策树逐步推进
每次问一个问题
每个问题给推荐答案
能查代码就查代码，不要问用户
```

这个设计很重要。它把“审视计划”变成一个明确流程，而不是泛泛地说“帮我看看这个方案”。

---

## 4. `/domain-modeling` 负责“问完沉淀什么”

`/domain-modeling` 则提供文档化规则：

```txt
1. 挑战 glossary 里的术语冲突
2. 把模糊词变成精确定义
3. 用具体场景压测领域关系
4. 对照代码检查用户说法是否真实
5. 术语明确后立刻更新 CONTEXT.md
6. 只有真的值得记录时才创建 ADR
```

这里最关键的是两个产物：

```txt
CONTEXT.md     = 领域术语表，不放实现细节
docs/adr/*.md  = 架构决策记录，只记录难逆转、有取舍、未来会疑惑的决策
```

所以 `/grill-with-docs` 不是单纯问问题，而是：

```txt
问问题 → 澄清术语 → 发现决策 → 写入文档
```

---

## 5. 它遵守项目里的调用边界

项目的 `docs/invocation.md` 里有一条核心规则：

```txt
user-invoked skill 可以调用 model-invoked skill
但不能调用另一个 user-invoked skill
```

`grill-with-docs` 正好符合：

```txt
/grill-with-docs      user-invoked
/grilling             model-invoked
/domain-modeling      model-invoked
```

所以这个组合是合法的。

它没有写成：

```md
Read ../productivity/grilling/SKILL.md
Read ../engineering/domain-modeling/ADR-FORMAT.md
```

而是写成：

```md
Run a `/grilling` session, using the `/domain-modeling` skill.
```

这说明它通过 `/skill` 名称调用公共能力，不依赖别的 skill 的内部文件结构。

这就是它的封装边界。

---

## 6. 它的设计模式可以总结成：薄入口 + 厚能力

`grill-with-docs` 是薄入口：

```txt
用户输入 /grill-with-docs
```

真正厚的能力在：

```txt
/grilling
/domain-modeling
```

这种模式的好处是：

```txt
/grilling 可以被 /grill-me 复用
/domain-modeling 可以被其他工程 skill 复用
/grill-with-docs 只负责把它们串起来
```

也就是说，作者没有写一个几百行的 `grill-with-docs/SKILL.md`，而是让它成为：

```txt
一个用户可见的产品入口
```

而把可复用逻辑拆到：

```txt
model-invoked capability skills
```

---

## 7. 它其实缺少显式验收标准，但通过子 skill 补了一部分

从“标准 skill 设计”的角度看，`grill-with-docs` 很优雅，但也很薄。

它没有写：

```txt
什么时候结束
最终产物是什么
CONTEXT.md 必须怎么变化
ADR 何时必须生成
如果没有文档更新怎么办
```

这些主要靠 `/grilling` 和 `/domain-modeling` 间接约束。

如果你要做更稳定的版本，可以稍微补强成这样：

```md
---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
argument-hint: "What plan or design should we grill?"
---

Run a `/grilling` session, using the `/domain-modeling` skill.

During the session:

- Use `/grilling` for the interview discipline:
  - ask one question at a time
  - wait for the user's answer before continuing
  - provide a recommended answer with each question
  - inspect the codebase instead of asking when the answer is discoverable

- Use `/domain-modeling` for the documentation discipline:
  - challenge vague or conflicting terms
  - update `CONTEXT.md` when terms crystallize
  - propose ADRs only for durable, surprising, trade-off-heavy decisions

The session is complete only when:

- the plan's major assumptions have been surfaced
- unresolved questions are explicitly listed
- resolved domain terms have been captured in `CONTEXT.md`
- durable architectural decisions have either been recorded as ADRs or explicitly skipped
```

这个版本会比原版更稳定，但也会更啰嗦。原项目选择极简，是因为它相信 `/grilling` 和 `/domain-modeling` 已经封装了足够多的行为。

---

一句话总结：

> `grill-with-docs` 的设计是一个手动触发的组合入口：它不自己实现审问和文档化，而是把 `/grilling` 的访谈流程和 `/domain-modeling` 的领域文档纪律组合起来，用 `/skill` 作为公共接口，避免跨文件依赖和重复 prompt。

## 可迁移的 Skill 设计原则

从这个案例和其他 skill 项目中，可以保留几条通用判断：

- 区分模型自动调用和用户手动调用，并把触发条件写清楚。
- 流程型 skill 说明执行顺序，组合其他 skill 时只依赖公共名称和接口。
- 指令应落到可执行动作，避免只有角色描述或抽象目标。
- 明确完成条件、产物格式和验收标准。
- 长格式、示例和参考资料拆到独立文件，主 `SKILL.md` 只保留运行所需内容。

参考项目：[mattpocock/skills](https://github.com/mattpocock/skills)。
