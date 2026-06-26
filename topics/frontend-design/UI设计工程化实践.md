# 前端设计：将 UI 视为工程系统的实践经验

此笔记沉淀了如何从程序员/工科生视角学习 UI 设计的经验，其核心理念是**将 UI 视为一个拥有明确约束的工程系统**，而非感性的艺术创作。

---

## 1. 核心目标：减少视觉自由度

## 先建立一个正确目标

刚开始不要追求“原创、惊艳、高级”。

先追求三件事：

1. 信息清楚
2. 操作顺手
3. 视觉一致

大多数难看的界面，不是因为颜色不好看，而是因为：

* 间距乱
* 字号乱
* 对齐乱
* 层级不清楚
* 每个组件长得都不一样
* 页面里什么都想强调

所以你的核心任务不是“设计”，而是**减少自由度**。

---

## 最适合你的 UI 学习路线

### 第一阶段：先临摹，不要原创

找一个与你产品类型相近的成熟产品，例如：

* 管理后台：Linear、Vercel、Stripe Dashboard
* 文档工具：Notion、Craft
* 数据产品：Metabase、Grafana
* SaaS 产品：Slack、GitHub、Raycast
* AI 产品：ChatGPT、Perplexity、Claude

然后只临摹一个页面。

不是凭感觉临摹，而是拆解：

```text
页面最大宽度是多少？
左右留白是多少？
标题多大？
正文多大？
区块之间隔多少？
按钮多高？
卡片圆角多少？
边框颜色多深？
哪些内容最显眼？
```

你会很快发现，优秀 UI 其实在反复使用少量规则。

---

## 先只学这 6 个设计概念

### 1. 信息层级

页面里的内容不能一样重要。

通常可以分为：

```text
一级：页面标题、关键数据、主操作
二级：区块标题、核心内容
三级：说明、时间、状态、辅助信息
```

一个常用字号体系：

```text
页面标题：24px / 600
区块标题：16px / 600
正文：14px / 400
辅助文字：12px / 400
```

刚开始不要使用十几种字号。

---

### 2. 间距系统

永远不要随手写 `13px`、`19px`、`27px`。

只用一套间距：

```text
4 / 8 / 12 / 16 / 24 / 32 / 48
```

常见使用方式：

```text
图标和文字：8px
表单项内部：12px
卡片内边距：16px 或 24px
区块之间：24px 或 32px
页面大区块之间：48px
```

只要间距统一，页面就会立刻好看很多。

---

### 3. 对齐

工科生最容易快速掌握的设计原则就是对齐。

页面中的元素尽量共享同一条边：

```text
标题左边
正文左边
表单左边
卡片左边
表格左边
```

避免：

* 标题左对齐，按钮随便飘
* 卡片宽度不一致
* 每块内容左右边距不同
* 图标和文字垂直没有对齐

Figma 里尽量使用 Auto Layout，不要靠手动拖位置。

---

### 4. 对比

对比不是多用颜色，而是让用户知道什么重要。

常用对比方式：

* 字号
* 字重
* 明暗
* 留白
* 位置
* 边框
* 背景

一个页面通常只需要一个强调色。

例如：

```text
主文字：#18181B
次要文字：#71717A
边框：#E4E4E7
背景：#F7F7F8
白色表面：#FFFFFF
强调色：#2563EB
```

不要同时用紫色、蓝色、绿色、橙色表达“重点”。

---

### 5. 一致性

同一种东西必须长得一样。

例如所有按钮：

```text
高度：36px
圆角：6px
左右内边距：12px
字体：14px / 500
```

所有输入框：

```text
高度：36px
圆角：6px
边框：1px
字体：14px
```

不要每做一个新页面，就重新设计一次按钮。

---

### 6. 密度

很多 AI 页面难看，是因为太松、太空、太像营销网站。

工具型产品通常应该更紧凑：

```text
按钮高度：32–40px
表格行高：40–48px
卡片内边距：16–24px
正文：14px
页面标题：20–28px
```

不是所有页面都需要：

* 64px 大标题
* 超大留白
* 巨型渐变
* 漂浮卡片
* 玻璃效果

---

## 最适合新手的设计流程

### 第一步：先画线框图

不要一开始选颜色。

先只用黑白灰，确定：

* 页面有哪些区域
* 用户最先看什么
* 用户最常点什么
* 哪些内容应该放在一起
* 哪些内容不重要

例如一个后台页面：

```text
左侧导航
顶部标题 + 主按钮
筛选栏
数据表格
分页
```

先确认结构正确，再做视觉。

---

### 第二步：找一个参考页面

不要参考十个产品。

只选择一个主参考：

```text
这个页面主要参考 Linear
表格参考 GitHub
表单参考 Stripe
```

最好每个页面只参考一到两个产品，否则风格会混乱。

---

### 第三步：建立最小设计系统

你可以直接在 Figma 建立这些组件：

```text
Button
Input
Select
Textarea
Checkbox
Radio
Tabs
Badge
Card
Dialog
Table
Toast
```

再建立这些变量：

```text
颜色
字号
间距
圆角
阴影
```

一开始不用做得复杂。

---

### 第四步：做三个状态

一个组件不能只有正常状态。

至少考虑：

```text
default
hover
disabled
```

表单还需要：

```text
focus
error
loading
```

页面还需要：

```text
empty
loading
error
success
```

很多新手只画“数据正常显示”的状态，真正开发时就会混乱。

---

### 第五步：让 AI 实现，而不是让 AI 设计

你可以自己在 Figma 中完成：

* 页面结构
* 信息层级
* 字体大小
* 间距
* 颜色
* 组件状态

再让 Codex 做：

* React 组件
* 响应式
* 数据绑定
* 交互状态
* 截图对比
* 细节修正

这样结果比让 AI 从零设计稳定得多。

---

## 可以直接使用的一套新手规范

```md
# UI Rules

## Layout

- Desktop content width: 1200px
- Page horizontal padding: 24px
- Section gap: 32px
- Card padding: 20px
- Use Auto Layout everywhere

## Typography

- Page title: 24px / 32px / 600
- Section title: 16px / 24px / 600
- Body: 14px / 20px / 400
- Secondary text: 12px / 16px / 400

## Spacing

Only use:
4, 8, 12, 16, 24, 32, 48

## Radius

- Controls: 6px
- Cards: 8px
- Dialogs: 10px

## Colors

- Background: #F7F7F8
- Surface: #FFFFFF
- Text: #18181B
- Secondary text: #71717A
- Border: #E4E4E7
- Primary: #2563EB
- Danger: #DC2626

## Rules

- Use only one accent color
- Do not use gradients
- Do not use glassmorphism
- Do not use shadows on every card
- Do not put every section inside a card
- Do not use oversized headings
- Reuse existing components
```

这套规则不一定惊艳，但很难做得特别丑。

---

## Figma 里你只需要先学这些

不需要把整个 Figma 学完。

优先学：

1. Frame
2. Auto Layout
3. Padding 和 Gap
4. Hug contents
5. Fill container
6. Components
7. Variants
8. Variables
9. Text styles
10. Constraints

其中最重要的是：

> Auto Layout、Components、Variables。

这三个掌握后，你就已经可以做大多数产品型 UI。

---

## 一个很现实的训练方法

连续做 10 个页面：

```text
登录页
用户列表
用户详情
设置页
数据表格
创建表单
编辑表单
空状态
错误状态
移动端页面
```

每个页面都遵守同一套颜色、字体、间距和组件。

不要每次换风格。

做完 10 个页面后，你的能力会比看很多“设计理论视频”提升更明显。

## 最重要的一句话

你不是要成为视觉艺术家。

你要成为一个能够：

> 找到可靠参考、拆解规则、建立系统、保持一致、验证结果的人。

这其实非常适合工科生。
