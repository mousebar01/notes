# UI 设计工程化实践

这篇笔记是本专题的设计原则主文。它从程序员视角整理产品型 UI 的信息层级、布局约束、设计系统和交付规则，目标不是追求“惊艳”，而是稳定地产出清楚、顺手、一致的界面。

Figma 到代码的具体协作方式见 [Figma 与 AI 编码协作](./Figma与AI编码协作.md)。具体产品案例仍可有自己的视觉选择，但通用规则以本文为准。

## 核心目标：减少视觉自由度

先追求三件事：

1. 信息清楚
2. 操作顺手
3. 视觉一致

大多数失控的界面并不是“颜色不够好看”，而是间距、字号、对齐和组件各自为政，页面里的每个元素都在争夺注意力。工程化设计的重点，是先建立少量可重复的规则，再在规则内做选择。

## 六个基础判断

| 判断 | 要解决的问题 | 最小约束 |
| --- | --- | --- |
| 信息层级 | 用户先看什么、再看什么 | 页面标题、区块标题、正文和辅助信息各司其职 |
| 间距 | 元素之间是否有稳定节奏 | 只使用一组离散间距，不临时发明数值 |
| 对齐 | 页面是否有秩序 | 标题、正文、表单和表格尽量共享边线 |
| 对比 | 重点是否明确 | 通过字号、字重、明暗、留白和位置建立主次 |
| 一致性 | 相同操作是否可预测 | 同类按钮、输入框和状态使用相同组件 |
| 密度 | 页面是否符合使用场景 | 工具和控制台保持紧凑，营销页才需要更强的展示感 |

一个页面通常只需要一个主要强调色，也不需要同时使用巨型标题、重阴影、渐变和大量漂浮卡片。视觉效果应服务信息和操作，而不是代替它们。

## 从页面到系统的工作流

### 1. 先确定任务和结构

开始选颜色前，先回答：

- 用户来这里完成什么任务？
- 最常用的操作是什么？
- 哪些信息必须同时比较？
- 空状态、加载、错误和成功时分别显示什么？

先用黑白灰线框图确定区域和顺序。以后台页面为例，结构可能只是导航、标题与主操作、筛选、数据表格和分页。

### 2. 选择一个主参考

找与产品类型接近的成熟页面，拆解它的内容宽度、留白、字号、区块间距、控件高度、圆角和视觉重点。一个页面以一到两个参考为限，避免把多个产品的风格拼在一起。

参考的价值不是照搬外观，而是帮助回答一组具体问题：

```text
内容区域有多宽？
标题和正文如何区分？
哪些内容放在同一区块？
按钮、表格和表单有多紧凑？
视觉重点出现在哪里？
```

### 3. 建立最小设计系统

先固定颜色、字号、间距、圆角和基础组件，不必一开始搭建庞大的设计系统。常见基础组件包括：

```text
Button  Input  Select  Textarea
Checkbox  Radio  Tabs  Badge
Dialog  Table  Toast
```

组件至少要有 `default`、`hover` 和 `disabled` 状态；表单补充 `focus`、`error`、`loading`，页面补充 `empty`、`loading`、`error` 和 `success`。

### 4. 让 AI 实现已经明确的设计

设计者先决定页面结构、信息层级、关键状态和视觉规则，再让编码 Agent 负责组件实现、响应式、数据绑定、交互和截图修正。AI 可以参与探索，但不能在没有约束时同时决定产品结构和视觉语言。

### 5. 用真实页面验证

完成后在目标尺寸下运行页面，检查内容溢出、状态切换、响应式和组件复用，再与参考图或 Figma 稿进行截图对比。不要只在静态设计稿中判断结果。

## 最小 `DESIGN.md` 模板

下面是一套适合工具型产品的起点，不是所有项目都必须使用相同数值。建立新项目时，应根据产品场景调整后再作为唯一设计约束；不要在提示词和多个文档里复制出不同版本。

```md
# Product UI Design System

## Direction

- A restrained, calm and information-dense productivity UI
- Prefer workspace patterns over marketing-page composition
- Visual effects must support hierarchy or interaction

## Layout

- Desktop content max width: 1200px
- Page horizontal padding: 24px
- Section gap: 32px
- Card padding: 16px or 24px
- Define desktop, tablet and mobile behavior explicitly

## Typography

- Page title: 24px / 32px / 600
- Section title: 16px / 24px / 600
- Body: 14px / 20px / 400
- Secondary text: 12px / 16px / 400

## Spacing

- Use only: 4, 8, 12, 16, 24, 32, 48px

## Shape

- Controls: 6px radius
- Cards: 8px radius
- Dialogs: 10px radius
- Pills are reserved for tags and statuses

## Colors

- Background: #F7F7F8
- Surface: #FFFFFF
- Text: #18181B
- Secondary text: #71717A
- Border: #E4E4E7
- Primary: #2563EB
- Danger: #DC2626

## Components and states

- Reuse existing primitives before creating new ones
- Cover hover, focus, disabled, loading, empty and error states
- Keep tables and repeated workflows information-dense

## Forbidden patterns

- No decorative gradients or glassmorphism
- No shadow on every card
- Do not put every section inside a card
- No oversized headings in compact work surfaces
- No decorative elements without a product purpose
```

在项目中可以让三个文件各自承担一种职责：

- `index.md`：产品做什么、如何运行
- `AGENTS.md`：代码和协作如何执行
- `DESIGN.md`：界面应遵守哪些视觉与交互约束

## Figma 只需先掌握什么

优先学习 `Frame`、`Auto Layout`、`Padding`、`Gap`、`Hug contents`、`Fill container`、`Components`、`Variants`、`Variables`、文字样式和约束。其中最重要的是 Auto Layout、Components 和 Variables。

具体如何把这些结构交给编码 Agent，并通过截图回归收敛实现，见 [Figma 与 AI 编码协作](./Figma与AI编码协作.md)。

## 一个可执行的训练方法

连续完成登录页、用户列表、用户详情、设置页、数据表格、创建表单、编辑表单、空状态、错误状态和移动端页面。十个页面沿用同一套颜色、字体、间距和组件，每次只复盘层级、对齐、密度、状态和一致性。

最终要训练的不是某一种流行风格，而是这组能力：找到可靠参考、拆解规则、建立系统、保持一致并验证结果。
