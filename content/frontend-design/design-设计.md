# Google Labs Code `design.md` 项目介绍

Google Labs Code 的 `design.md` 项目本质上是在解决 AI 编程时代的一个新问题：

> **如何让 AI Coding Agent（如 Gemini CLI、Claude Code、Cursor 等工具）长期、准确地理解一个产品的设计语言？**

传统设计系统（Design System）主要服务人类设计师和开发者，而现在 AI 会直接参与生成 UI、组件和代码，因此它也需要一种**机器可读、同时人类可维护的设计规范文件**。

`DESIGN.md` 就是这个桥梁：它把产品的视觉规范、设计原则和品牌语言整理成一个 AI 可以理解和执行的文件，让 AI 在生成界面时能够遵循统一的设计风格。

---

## 它解决什么问题？

传统流程：

```
设计师
  ↓
Figma 文件
  ↓
设计规范文档
  ↓
开发者理解
  ↓
代码实现
```

这种方式在 AI 参与开发后会出现问题：

* Figma 对 AI 不够友好
* 设计文档通常是自然语言，难以精确执行
* AI 生成 UI 时容易自由发挥
* 不同 AI Agent 可能生成完全不同的视觉风格

例如：

你告诉 AI：

> "帮我设计一个高级金融 App 首页"

AI 可能生成：

* 蓝色渐变
* 大圆角卡片
* 大按钮
* 插画背景

但你的品牌实际要求可能是：

* 黑白极简
* 小圆角
* 高信息密度
* 杂志式排版

AI 缺少一个能够约束它的「设计 DNA」。

`DESIGN.md` 的作用，就是把这个设计 DNA 固化下来，让 AI 在生成代码时有明确依据。

---

## 核心设计思想

整个项目可以理解为：

```
                 DESIGN.md

        ┌──────────────────┐
        │                  │
        │  YAML Tokens     │  ← 给机器读取
        │                  │
        ├──────────────────┤
        │                  │
        │ Markdown Rules   │  ← 给人和 Agent 理解
        │                  │
        └──────────────────┘

              ↓

        AI Coding Agent

              ↓

        React / Vue / HTML
        UI Components
```

它采用“双层结构”。

---

## 文件结构原理

一个 DESIGN.md 文件通常包含两部分：

```md
---
name: Heritage

colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"

typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem

spacing:
  md: 16px
---

## Overview

Architectural Minimalism.

## Colors

Use dark neutral colors...
```

---

### 1. YAML Front Matter（机器层）

负责描述精确的设计参数：

* 颜色
* 字体
* 间距
* 圆角
* 组件参数

例如：

```yaml
colors:
  primary: "#111111"
  accent: "#FF5500"

rounded:
  sm: 4px
  md: 8px
```

AI 可以直接读取：

```
按钮背景 = accent
卡片圆角 = md
```

从而减少随机设计。

---

### 2. Markdown Body（语义层）

用于表达 YAML 无法描述的设计意图。

例如：

```md
## Overview

The product should feel:
- premium
- quiet
- editorial
- trustworthy
```

它告诉 AI：

设计不仅是：

> 黑色 + 白色

而是：

> 一种高级、克制、值得信赖的品牌感觉。

---

## 项目定位

`DESIGN.md` 可以看作：

```
Design Token
+
Design Philosophy
+
AI Instructions
```

传统 Design Token：

```json
{
  "primary": "#000000",
  "spacing.large": "32px"
}
```

只能告诉机器：

> 使用什么参数

但无法告诉：

> 为什么这样设计。

而 DESIGN.md 可以补充：

```md
Primary color represents authority.

Avoid using it for decorative elements.
```

让 AI 理解设计背后的原因和使用边界。

---

## 为什么叫 DESIGN.md，而不是 design.json？

这是项目设计中非常重要的一点。

如果只是：

```json
{
  "primary": "#111111"
}
```

它适合机器，但不适合设计交流。

设计系统不仅需要数据，还需要解释：

* 为什么这样设计？
* 什么场景应该使用？
* 哪些情况应该避免？
* 品牌希望传递什么感觉？

Markdown 具有：

* Git 友好
* 易于代码评审
* 人类可读
* AI 易理解

因此：

```
JSON = 数据

Markdown = 知识
```

`DESIGN.md` 试图把两者结合起来。

---

## 项目的核心价值

这个项目真正重要的地方不是 YAML Token 本身，而是：

> **第一次尝试把“品牌审美”和“设计规则”转换成 AI Agent 可以长期理解和执行的规范文件。**

未来的软件项目可能不仅会有：

```
/src
/components
/package.json
```

还会有：

```
/DESIGN.md

/components
  Button.md
  Card.md
  Modal.md

/brand
  voice.md
  photography.md
```

AI 在生成代码之前，先理解：

* 产品是谁
* 应该表达什么感觉
* UI 应该遵循什么原则

---

## 总结

`google-labs-code/design.md` 是一个面向 AI Coding Agent 的设计系统规范方案。

它将：

* Design Token（颜色、字体、间距）
* 设计规则
* 品牌语言
* 使用约束

统一放入一个 Markdown 文件中，让 AI 在生成 UI 和代码时能够遵循一致的视觉语言。

它代表了一种新的方向：

> **未来设计系统不仅服务设计师和开发者，也必须服务 AI。**
