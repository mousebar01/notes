# context-mode 设计思想待读

## 背景

2026-08-01 讨论了 pi 生态扩展时发现这个项目（mksglu/context-mode，GitHub 19.5K 星，Hacker News 第一名 570+ 分），当时只了解了用法和机制，**感觉设计上有不少优秀的地方，但今天不想深入，先记下来下次细读**。

已安装：`pi install npm:context-mode`（已注册，重启 pi 后生效）。

## 已知的亮点（下次阅读的锚点）

1. **沙箱化工具输出**：MCP 工具原始数据不进上下文（进 SQLite 沙箱），上下文里只留摘要——315 KB → 5.4 KB（98%）
2. **SQLite + FTS5 + BM25 检索**：会话连续性——压缩后不 dump 回上下文，而是索引进全文搜索、按需精确找回
3. **"Think in Code" 范式**：别把 LLM 当数据处理机，让它写脚本算、只输出结果（一个脚本替代 10+ 次工具调用）——这个范式可迁移到日常使用
4. **hooks 路由强制**：SessionStart 注入路由规则、PreToolUse 拦截，引导模型用沙箱工具而非裸工具
5. **不干预文风**：故意不做简洁强制（引 Moonshot 研究：激进 brevity 降基准分）
6. **许可**：ELv2（源码可见但非自由开源）

## 下次想深入的方向

- 沙箱与检索的具体实现（mcp-bridge、SQLite schema、FTS5 索引策略）
- "think in code" 的 prompt 路由是怎么写才让模型稳定配合的
- 17 客户端适配架构（hooks 平台 vs 非 hooks 平台的降级策略）——pi 的 adapter 是怎么接的
- 它和传统上下文压缩（pi 的 /compact）的定位差异：事前预防 vs 事后腾空间

## 参考

- GitHub: `mksglu/context-mode`
- 安装目录: `~/.pi/agent/npm/node_modules/context-mode/`（pi adapter 在 `build/adapters/pi/`）
- 演示: YouTube "Watch context-mode demo"

## 处理状态

待精读后归入 `topics/`（可能是 `ai-coding` 或 `software-engineering`）。
