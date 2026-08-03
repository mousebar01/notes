# Figma 与 AI 编码协作

这篇笔记只记录 Figma 设计源、MCP、编码 Agent 和截图回归之间的协作流程。字体、颜色、间距、圆角及 `DESIGN.md` 的统一规则见 [UI 设计工程化实践](./UI设计工程化实践.md)，这里不再维护第二套数值。

## 推荐的交付闭环

```text
Figma Auto Layout + Variables + Components
→ Figma MCP 提供结构化上下文
→ 编码 Agent 映射现有组件与 Token
→ 运行真实页面
→ 截图对比
→ 分维度修正并回归
```

这条路线比一次性“导出 React”更可靠。转换工具可以生成初稿，但通常不了解项目已有组件、交互状态、数据逻辑和响应式约束；MCP 输出也应被视为设计与行为参考，而不是可直接合并的最终代码。

如果还没有完整 Figma 稿，也可以使用线框图、关键截图和项目级 `DESIGN.md` 交付约束。`DESIGN.md` 的职责和模板统一放在 [设计原则主文](./UI设计工程化实践.md#最小-designmd-模板)。

## Figma 文件如何准备

设计源越结构化，Agent 猜测得越少：

- 主要布局使用 Auto Layout，不依赖手动坐标。
- 颜色、间距、圆角和字体使用 Variables 或 Styles。
- Button、Input、Tab 等重复元素使用 Components 和 Variants。
- 图层使用可解释的名称，例如 `Sidebar/NavItem/Active`。
- 标明固定宽度、Fill Container 和 Hug Contents。
- 最外层 Frame 使用真实目标尺寸，例如 1440 或 390。
- 桌面和移动端分别给稿，不让 Agent 自行猜测响应式。
- 对复杂交互补充 hover、loading、empty 和 error 等状态稿。
- 图片和图标保留明确来源与可导出的原始资源。

只给一张扁平截图时，模型需要反推布局和状态；提供 Figma 节点、变量和组件关系后，它才能区分“恰好长这样”和“系统规定如此”。

## MCP 在流程中的作用

Figma MCP 适合向 Agent 提供选中 Frame 的节点层级、尺寸、布局、变量、组件和资源上下文。配合 Code Connect 时，还可以提示 Agent 优先映射项目中已有组件。

它不能替代这些判断：

- 哪个现有组件应该复用
- 数据和交互如何接入
- 不同断点如何降级
- 生成代码是否符合仓库规范
- 最终页面是否真的接近设计稿

因此，Agent 在读取 Figma 前仍应先阅读项目的 `AGENTS.md`、`DESIGN.md` 和组件目录。

## 一次页面实现的协作步骤

1. 确定要实现的 Frame、页面状态和目标尺寸。
2. 导出同尺寸参考图，作为视觉基线。
3. 让 Agent 读取仓库约束和现有组件，再通过 MCP 获取设计上下文。
4. 先建立 Figma 组件与代码组件、变量与 Token 的映射。
5. 每次只实现一个页面或一个稳定区块，接入真实状态。
6. 启动页面，在相同视口和数据条件下截图。
7. 按布局、字体、间距、颜色和状态的顺序逐轮修正。
8. 清理重复样式和临时组件，再运行截图与交互回归。

可交给 Agent 的任务说明可以保持简短：

```text
先阅读 AGENTS.md、DESIGN.md 和现有组件目录。
通过 Figma MCP 读取指定 Frame，并实现对应页面。

要求：
1. 优先复用已有基础组件和 design tokens。
2. 不自行添加设计稿中不存在的装饰。
3. 覆盖给定的桌面、平板和移动端状态。
4. 实现后启动页面，在指定视口截图。
5. 与参考图对比，按布局、字体、间距、颜色依次修正。
6. 最后再整理组件结构和重复样式。
```

## 截图回归怎么做

截图不是收尾展示，而是设计到代码的验收证据。为了让比较有效，需要固定：

- 浏览器和视口尺寸
- 页面数据、登录状态和时间相关内容
- 字体与资源加载完成的时机
- 动画、光标和随机内容
- Figma 导出图与页面截图的裁切范围

可以用 1440、1024 和 390 三个视口覆盖原稿中的桌面、窄屏和移动端场景，但实际项目仍应以目标设备为准。每轮只修一个维度：先解决整体布局和溢出，再处理字体、间距、颜色和细节，避免多个变量同时变化。

如果项目要求像素级接近，可为关键位置设定明确误差范围，并保存基线截图。视觉通过后仍要单独验证键盘操作、表单状态和真实内容，因为静态截图无法证明交互正确。

## 工具与资料

- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)：官方 MCP 接入指南，优先阅读。
- [gbasin/figma-to-react](https://github.com/gbasin/figma-to-react)：包含截图比较与循环修正思路的 Claude Code 插件。
- [vibeflowing-inc/vibe_figma](https://github.com/vibeflowing-inc/vibe_figma)：可本地研究 Figma 到 React、Tailwind 的转换流程。
- [bernaferrari/FigmaToCode](https://github.com/bernaferrari/FigmaToCode)：支持多种前端输出，适合生成初始布局。
- [StudentOfJS/mcp-figma-to-react](https://github.com/StudentOfJS/mcp-figma-to-react)：较容易阅读的 Figma MCP 示例。
- [OpenAI Figma implementation skill](https://github.com/openai/skills/blob/main/skills/.curated/figma-implement-design/SKILL.md)：强调组件复用、项目规范和实现验证。
- [Figma2Code 研究](https://arxiv.org/abs/2604.13648)：设计转代码在响应式和可维护性上的局限。

真正稳定的协作输入不是“做得高级一点”，而是设计源、组件映射、项目约束、目标状态和可比较的截图证据。
