# 看懂 AI 写的代码：理解债务与建图法

> 背景：2026-08 从英文社区调研整理（Addy Osmani、PAELLADOC、David Crawshaw 等）。
> 核心观点：**不是让 AI 审 AI，是自己能看懂。** 目标是"保持理解"，不是"读完每一行"。
> 相关笔记：[AI 代码审查：从逐行审查转向输入与证据](./AI%20代码审查：从逐行审查转向输入与证据.md)（讲审查方法，本篇讲建立自身理解）；[读懂一个项目意味着什么](../../inbox/读懂一个项目意味着什么.md)（inbox 初稿）。

## 一、核心概念：Comprehension Debt（理解债务）

**定义**（Addy Osmani）："系统里存在多少代码"和"有任何人类真正理解多少"之间的差距。

与技术债的区别：技术债会宣布自己（TODO、坏味道、构建变慢）；**理解债滋生虚假信心**——代码干净、测试全绿，清算发生在最糟的时刻。

关键数据：

- **Anthropic 对照实验**（arXiv:2601.20245）：52 名工程师学新库，用 AI 与不用 AI 完成时间差不多，但理解测验低 17%（50% vs 67%），调试能力降幅最大。**被动委托（"just make it work"）比主动提问式使用对技能损害大得多。**
- 相关研究：用 AI 做"代码生成委托"的人理解测试 <40%；用 AI 做"概念探究"（问问题、探讨权衡）的人 >65%。**工具不毁理解，用法才毁。**
- 现状反转："AI 让 junior 生成代码的速度超过了 senior 批判性审查的速度——原本让 review 有意义的限速器被拿掉了。"

## 二、两个失败的直觉

1. **逐行读全文**：AI 代码"局部合理、全局蔓延"。从头读到尾，收获几千个细节、零个结构。理解软件不是读过那些行，是知道形状（真实部件、连接方式、重要行为住在哪）。
2. **重写一遍**："把能用的你不懂的代码，换成坏掉的你懂的代码"——几乎从不是答案，还会重建同样的坑。

## 三、正确路径：建地图，不读全文

**目标：不看代码就能回答四个问题**

1. 这个 app 的 4-5 个真实部件是什么，各干什么？
2. 用户做最主要操作时，按顺序经过哪些部件？
3. 数据住在哪，什么形状？
4. 如果我改这个，还有谁会感觉到？

**建图五步**（手做一遍约半天）：

1. **从外面开始，不从代码开始**：以用户视角列功能、流程、角色——这是脊柱。
2. **只追踪一条完整流程**：选用户做的最重要的一件事，从屏幕跟到数据落点，给沿途每个部分起名。"画路线，不巡视地形"。
3. **命名真实部件**：两条流程走完，反复出现的组件就是真实部件，每个写一句话。大多数 app 真实部件出奇地少。
4. **用 AI 解释，但每个解释都当 claim 验证**："AI 对一段做别的事的代码给出合理摘要，比没有摘要更糟"——听起来对 ≠ 是对的。
5. **写下来**：只活在你脑里的地图会丢。写下来的地图就是文档的开始。

**检验标准**：被问"为什么选这个设计"时能用自己的话解释。"能不能解释"正在取代"代码对不对"成为评价标准。

## 四、生成时保持理解的纪律（从源头防）

1. **让 agent 生成时留下决策日志**：要求它写"想做什么、排除了什么、为什么这样实现"。这是把 review 时长降回来的最大杠杆。
2. **小步生成**：一次只做能跟上的量（一个函数、一个模块），拒绝大爆炸输出。iximiuz 的教训：一次修 2000 LOC 里的一打问题 → 一塌糊涂；逐个修 → 表现出色。
3. **关键部分自己写**（Crawshaw 实践，AI 代码占比 25%→90%）：agent 写 GitHub auth 时造了"任何授权用户能访问任何仓库"的漏洞 + N² 次 API 调用的性能灾难，他一次 review 就抓住——因为他懂这个系统。"所有代码都需要被仔细阅读，并定期调整。"
4. **警惕"批准的是 diff 的形状，不是它的意图"**：两周后打开自己仓库的文件不认识，因为当时批准的是形状。

## 五、最小实践清单（个人版）

- [ ] 每次让 agent 干活前：要求先输出"计划 + 决策点"，自己过一遍
- [ ] 干完活后：不逐行读，让它带自己走一遍主流程（入口 → 数据落点经过哪些部件），对照行为验证
- [ ] 每完成一个功能：用一段话写"这个功能怎么工作的"——写不出来的部分就是要回去看的部分
- [ ] 定期做一次"从外面追踪流程"练习，更新地图到项目文档
- [ ] 高价值逻辑（金额、权限、数据迁移）：自己写或自己重写
- [ ] 使用姿势：多用 AI 问问题（概念探究），少用它直接代写

## 来源

- Addy Osmani — Comprehension Debt: https://addyosmani.com/blog/comprehension-debt/
- PAELLADOC — You shipped code you can't read. Now what?: https://paelladoc.com/blog/understand-your-ai-generated-code/
- David Crawshaw — How I program with Agents: https://crawshaw.io/blog/programming-with-agents
- Anthropic — How AI Impacts Skill Formation: https://arxiv.org/abs/2601.20245
- zenn — 能提交但解释不了: https://zenn.dev/kaji_kaji/articles/ai-code-review-explainability
- Codex KB — Staying Engaged with Your Codebase: https://codex.danielvaughan.com/2026/03/27/staying-engaged-codebase-agentic-world/
- Thoughtworks Radar — Codebase cognitive debt: https://www.thoughtworks.com/en-us/radar/techniques/codebase-cognitive-debt
