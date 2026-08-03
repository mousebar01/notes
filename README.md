# Notes

我的个人长期笔记库：学习笔记、外部资料与复盘。

基于 [Quartz 5](https://github.com/jackyzha0/quartz)（数字花园静态站生成器）构建，部署于 GitHub Pages：<https://mousebar01.github.io/notes/>

## 结构

```
notes/
├── content/       # 发布内容（Quartz 站点根）：主题树组织的 markdown 笔记
│   ├── agent/             # Agent 上下文、安全、工具边界
│   ├── ai-coding/         # AI 编程使用心得与上下文组织
│   ├── algorithms/        # 算法学习与工程实现
│   ├── content-creation/  # 自媒体与 AI 视频创作
│   ├── frontend-design/   # 前端设计语言与界面设计经验
│   ├── learning/          # 学习方法、知识管理、复盘
│   ├── llm/               # 模型 API、微调、推理
│   └── software-engineering/  # 软件工程、设计、排查经验
├── inbox/         # 捕获区（不发布）：碎片先进这，进一篇登记一篇
├── reference/     # 素材区（不发布）：外部原文、论文、快照
├── archive/       # 归档区（不发布）：完成的项目、原稿、旧内容
├── quartz.config.yaml   # Quartz 配置（站点名/域名/主题/插件）
└── quartz.ts            # 布局配置
```

## 使用

- **记录**：新内容先进 `inbox/`，登记到 `inbox/README.md`，整理后提炼进 `content/` 对应主题
- **价值闸门**：只收"未来某天有可能用一次"的；"永远不会再回看的废稿"不记录
- **本地预览**：`npm install && npx quartz build --serve`
- **发布**：push 到 master 即自动构建部署（GitHub Actions）

详细规则见 [AGENTS.md](./AGENTS.md)。
