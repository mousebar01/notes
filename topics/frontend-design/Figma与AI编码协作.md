# 前端设计：Figma 与 AI 编码工具的高效协作

此笔记总结了如何打破 AI 默认的“AI味”审美（如千篇一律的彩虹色渐变、浮夸的大投影与大标题卡片），通过 Figma 的结构化设计数据与 `DESIGN.md` 设计约束，引导 AI 编码 Agent 还原高质量前端界面的工作流。

---

## 1. 核心设计协作思路

当直接对 AI 输入“设计一个现代化、高级的后台页面”时，模型往往会倾向于生成大量装饰性元素，而非高密度的实用工作区。更有效的协作路线为：
- **提供设计约束**：以结构化的形式（如设计系统 Token、Layout 规则）限制 AI 的发散性。
- **读取设计源数据**：让 Agent 读取 Figma 的节点布局、间距变量等精准信息。

## 最推荐的两条路线

### 路线一：Figma 设计好，再通过 MCP 让 AI 实现

目前相对靠谱的工作流是：

**Figma Auto Layout + Variables + Components → Figma MCP → Cursor / Claude Code / VS Code Agent → 截图对比修正**

Figma 官方的 MCP Server 可以把选中的 Frame、组件、变量、尺寸和布局信息直接交给编码 Agent，而不是只让模型看截图猜测。官方指南也提供了 Cursor、VS Code 等客户端的连接方法。([GitHub][1])

值得看的项目：

1. **Figma 官方 MCP Server Guide**
   最应该先看的教程。它讲了如何连接 Cursor、VS Code，如何复制 Figma Frame 链接，让 Agent 获取设计上下文并生成代码。还能结合 Code Connect，让 AI 优先使用项目里已有的组件。([GitHub][1])

2. **gbasin/figma-to-react**
   Claude Code 插件，目标是把 Figma 转成 TypeScript、React 和 Tailwind。它比较重要的点不是“生成代码”，而是包含**自动截图对比和循环修正**，这才是接近像素级还原的关键。它还会提取设计 Token、处理图片资源。([GitHub][2])

3. **vibeflowing-inc/vibe_figma**
   开源的 Figma → React + Tailwind 转换器，可以本地运行，项目采用 AGPL-3.0 许可证。适合研究完整的设计解析和代码生成流程。([GitHub][3])

4. **bernaferrari/FigmaToCode**
   比较成熟的 Figma 插件，可以输出 HTML、React、Svelte、Tailwind、Flutter 和 SwiftUI。适合快速拿到初始布局，但生成结果仍然需要人工整理组件和响应式逻辑。([GitHub][4])

5. **StudentOfJS/mcp-figma-to-react**
   一个比较容易理解的 MCP 示例项目，可以读取 Figma 文件，生成 TypeScript、React 和 Tailwind 组件，也包含组件库批量转换流程。适合拿来学习 MCP 是怎么接 Figma API 的。([GitHub][5])

我会优先选择：

> **Figma 官方 MCP + Claude Code/Cursor + 截图回归**

而不是单纯按一下“Export React”。因为一次性转换通常只能把静态外观变成代码，无法很好处理项目组件复用、响应式、状态和代码质量。OpenAI 的 Figma 实现指南也明确建议：把 MCP 输出当成设计和行为参考，不要直接当最终代码；需要替换成项目已有组件、Token 和工程规范。([GitHub][6])

---

### 路线二：不用先画完整 Figma，但给 AI 一个 `DESIGN.md`

这是解决“AI 做出来很丑”性价比最高的方法。

可以在项目根目录建立：

```text
README.md
AGENTS.md
DESIGN.md
```

其中：

* `README.md`：产品做什么
* `AGENTS.md`：代码怎么写
* `DESIGN.md`：界面应该长什么样

`awesome-design-md` 收集了许多品牌和产品的 `DESIGN.md` 示例，核心思路是把颜色、字体、间距、圆角、布局原则和禁用项写成 AI 能直接执行的 Markdown。([GitHub][7])

还可以看：

* **VoltAgent/awesome-design-md**：不同视觉体系的 `DESIGN.md` 示例。([GitHub][7])
* **sunil-dsb/design.md**：可以从公开网站提取颜色、字体、间距和设计 Token，生成供 Cursor、Claude Code、v0 等工具读取的 `DESIGN.md`。([GitHub][8])
* **rohitg00/awesome-claude-design**：专门研究如何打破 AI 默认审美，里面有 `break-default-aesthetic` 等提示词模板。([GitHub][9])
* **Trystan-SA/claude-design-system-prompt**：MIT 许可的 UI 设计系统提示词，强调无障碍和避免千篇一律的 AI 风格。([GitHub][10])

一个实用的 `DESIGN.md` 可以这样写：

```md
# Product UI Design System

## Visual direction

A restrained productivity application.
Dense but calm.
Do not use marketing-page aesthetics inside the application.

## Typography

- Font: Inter
- Page title: 24px / 32px / 600
- Section title: 16px / 24px / 600
- Body: 14px / 20px / 400
- Metadata: 12px / 16px / 400

Do not use oversized 48px headings.
Do not use gradient text.

## Colors

- Background: #F7F7F8
- Surface: #FFFFFF
- Primary text: #18181B
- Secondary text: #71717A
- Border: #E4E4E7
- Accent: #2563EB
- Destructive: #DC2626

Use accent color only for actions and active states.
Do not add decorative gradients.

## Spacing

Use only:
4, 8, 12, 16, 24, 32, 48px

Main content max width: 1280px.
Card padding: 16px or 24px.
Form control height: 36px.

## Shape

- Default radius: 6px
- Dialog radius: 10px
- Pills only for tags and statuses
- Avoid excessive rounded cards

## Shadows

Do not use shadows for normal cards.
Use borders to separate surfaces.
Dialogs may use one subtle shadow.

## Components

Use existing components from `src/components/ui`.
Never recreate Button, Input, Select, Dialog or Table.

## Layout

- Desktop-first dashboard
- Sidebar width: 240px
- Content must work at 1024px and 1440px
- Tables should remain information-dense
- Avoid placing every section inside a card

## Forbidden patterns

- No purple-blue gradients
- No glassmorphism
- No floating blobs
- No huge hero text
- No unnecessary icons
- No three identical feature cards
- No excessive empty space
- No fake charts or fake statistics
```

然后给 AI 的提示不要只写“帮我做页面”，而是：

```text
先阅读 DESIGN.md、AGENTS.md 和现有组件目录。

实现 Figma 链接中的页面。

要求：
1. 不创建新的 Button、Input、Dialog、Table 基础组件。
2. 优先复用项目现有组件和 design tokens。
3. 严格匹配 Figma 的字体、间距、边框、圆角和布局。
4. 不自行添加渐变、阴影、插图或装饰元素。
5. 实现 1440px、1024px 和 390px 三个断点。
6. 完成后启动页面并截图，与 Figma 参考图对比。
7. 根据截图差异继续修正，直到主要布局误差小于 4px。
8. 最后再清理重复样式和组件结构。
```

## 想要“一比一复刻”，Figma 文件本身要这样画

AI 还原效果好不好，很大程度取决于 Figma 是否规范。

尽量做到：

* 所有主要布局使用 **Auto Layout**，不要靠手动拖坐标。
* 颜色、间距、圆角、字体使用 **Variables / Styles**。
* Button、Input、Tab、Card 使用 **Components 和 Variants**。
* 图层命名清楚，例如 `Sidebar/NavItem/Active`，不要全是 `Frame 283`。
* 图片、图标不要直接粘贴成不明来源的位图。
* 给页面同时设计桌面和手机版本，不要让 AI 自己猜响应式。
* 明确哪些元素是固定宽度、Fill Container、Hug Contents。
* 复杂交互补充状态稿：default、hover、loading、empty、error。
* 给最外层 Frame 设置真实的目标宽度，例如 1440 或 390。

即使使用先进模型，研究结果也显示：设计到代码目前仍然容易在响应式布局和代码可维护性上出现问题；仅凭截图通常又比读取 Figma 元数据更容易丢失细节。因此，“Figma 结构化数据 + 项目上下文 + 截图验证”比一句提示词可靠得多。([arXiv][11])

## 一个适合直接照着学的顺序

1. 在 Figma Community 找一套质量较高的 Dashboard 或 SaaS UI Kit。
2. 学会 Auto Layout、Components、Variables。
3. 按官方文档配置 Figma MCP。([GitHub][1])
4. 用 Cursor 或 Claude Code 实现一个 Frame。
5. 加入 `DESIGN.md` 和禁止事项。
6. 使用 Playwright 截图，与 Figma 导出图进行对比。
7. 让 Agent 每次只修一个维度：先布局，再字体，再间距，最后颜色和细节。
8. 把稳定后的 Button、Input、Table 固化为组件，下一页只允许复用。

所以，真正有效的不是：

> “做得高级一点、现代一点。”

而是：

> “这是设计源、这是 Token、这是组件库、这是禁止项、这是三个断点；实现后截图比较并继续修正。”

这套流程通常能明显降低“AI 味”，也比反复抽卡式生成稳定得多。

[1]: https://github.com/figma/mcp-server-guide?utm_source=chatgpt.com "A guide on how to use the Figma MCP server"
[2]: https://github.com/gbasin/figma-to-react?utm_source=chatgpt.com "gbasin/figma-to-react: Claude Code plugin ..."
[3]: https://github.com/vibeflowing-inc/vibe_figma?utm_source=chatgpt.com "vibeflowing-inc/vibe_figma: Figma to React Converter"
[4]: https://github.com/bernaferrari/FigmaToCode?utm_source=chatgpt.com "Figma to Code"
[5]: https://github.com/StudentOfJS/mcp-figma-to-react?utm_source=chatgpt.com "StudentOfJS/mcp-figma-to-react: MCP server for converting ..."
[6]: https://github.com/openai/skills/blob/main/skills/.curated/figma-implement-design/SKILL.md?utm_source=chatgpt.com "skills - skills - .curated - figma-implement-design"
[7]: https://github.com/VoltAgent/awesome-design-md/?utm_source=chatgpt.com "VoltAgent/awesome-design-md: A collection of ..."
[8]: https://github.com/sunil-dsb/design.md?utm_source=chatgpt.com "Generate DESIGN.md, Tailwind themes, tokens, and ..."
[9]: https://github.com/VoltAgent/awesome-claude-design?utm_source=chatgpt.com "VoltAgent/awesome-claude-design"
[10]: https://github.com/Trystan-SA/claude-design-system-prompt?utm_source=chatgpt.com "Trystan-SA/claude-design-system-prompt"
[11]: https://arxiv.org/abs/2604.13648?utm_source=chatgpt.com "Figma2Code: Automating Multimodal Design to Code in the Wild"
