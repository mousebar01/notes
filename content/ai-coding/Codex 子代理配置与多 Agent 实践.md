# Codex 子代理（Subagent）配置与多 Agent 实践

> 记录时间：2026-08-03
> 背景：从 pi 转向 Codex 作为主力 coding agent 过程中的调研、配置与机制理解。
> 场景：GPT 官方账号 OAuth + gpt-5.6 系列模型。

## 背景与决策

- 一开始对 pi 有「vscode 式期待」，实际体验差强人意：pi 是极简 harness（骨架），默认没有 plan/权限/todo/MCP，需要大量自组装；Codex 是成品化 agent，模型被训练成「实现 → 测试 → 修复 → 重跑」闭环，开箱即用体验明显更好。
- 社区共识（HN/Reddit/Linux.do）：**「想要开箱即用选 Codex，想要掌控感选 pi」**。pi 的强项是模型自由（本地模型省钱）和扩展透明，弱项是默认体验。
- 最终决策：Codex 官方 OAuth 作为主力；pi 保留但不再作为 coding agent（其相关配置已从项目清理）。

## 最终配置（2026-08-03 实测生效）

三层模型分工（源自 Linux.do celeus 帖「GPT Plus 用户节省 Token 的子 Agent 最佳用法」+「拯救 5.6 Sol」帖）：

| 层 | 模型 | 职责 |
|---|---|---|
| 主 agent | `gpt-5.6-luna` + max | 日常执行（便宜），自己判断何时升级 |
| 探子（default） | `gpt-5.6-luna` + **low** | 只读探索/检索/核验，锁死 read-only |
| 专家（architect） | `gpt-5.6-sol` + high | 复杂任务按需派发（架构/疑难调试/跨模块规划） |

### 文件清单

- `~/.codex/config.toml`：官方 OAuth + `[features.multi_agent_v2]`（enabled、hide_spawn_agent_metadata=false、tool_namespace="agents"、max_concurrent_threads_per_session=7、wait 超时 10s/30s/120s）
- `~/.codex/agents/default.toml`：泛型探子（luna low、read-only、探子行为规范）
- `~/.codex/agents/architect.toml`：sol high 专家
- `~/.codex/AGENTS.md`：派发纪律（何时自己读 / 何时派、fork_turns=none、立即 wait、10 分钟异常介入、复核哲学）

### 关键使用规则（来自「拯救 5.6 Sol」帖，实测有效）

- **何时自己读**：小文件、即将修改的代码、奠基性文档（架构/设计文档必须主代理亲自读）
- **何时派探子**：大文件、跨目录检索、独立并行核验、长任务重新确认、海量日志/搜索结果
- **委派纪律**：任务自包含 + 要求返回 `file:line` 证据 + `fork_turns="none"` + 并行派发后立即 `wait_agent` + 收到即 `close_agent` + 10 分钟未完成视为异常
- **复核哲学**：子代理结果是「压缩」，复核 = 顺证据抽查，不重读全文

## 社区调研结论

### 模型搭配（Reddit + OpenAI 论坛 + Linux.do 共识）

- 主 agent：`gpt-5.6`（平衡）或 sol（最强，贵）；luna 官方定位是「子代理模型」
- worker：terra（默认）或 luna（省钱批量）
- explorer：luna（read-only 检索）
- reviewer：sol 或 terra + high（社区公认值得花钱的角色）
- **核心方向**（celeus 实测）：强主+弱子 = 沟通成本爆炸（弱子干不好，强主反复 review）；**弱主+强子按需 = 省钱**（大部分时间便宜模型，复杂任务才调贵模型）
- 只要是 subagent 就一定比单模型更费 token；subagent 的价值是「1+1>1」（多模型互相提供思路）+ 隔离上下文污染，不是省钱

### 已知坑

1. **V2/V1 模型继承 bug**：Sol/Terra 走 Multi-Agent V2，Luna 是 V1 catalog——Sol/Terra 主模型 spawn 指定 Luna 子代理可能静默失效（子代理继承父模型）。GitHub issue #34301 可复现。规避：主 sol/terra 时子代理用同族模型，或配完实测会话记录的 model 字段。
2. **`fork_turns` 默认可能落到 "all"**（完整历史派生 = 强制继承父模型 + 贵），必须显式 "none"。
3. **Ultra 不是神秘模型** = max 思考 + 多代理编排提示词。配置不当（子代理继承 Sol + 套娃）会额度爆炸。

## 机制理解（源码级）

### 内置角色与同名覆盖

- 内置：`default`（通用）、`worker`（执行）、`explorer`（只读探索）——硬编码在 role.rs，默认不指定模型（继承父配置）
- 自定义：`~/.codex/agents/*.toml`（个人级）或 `.codex/agents/*.toml`（项目级）；加载顺序：用户文件 > config.toml `[agents.roles]` 声明 > 内置；**同名即覆盖**（如自定义 default.toml 覆盖官方 default）
- v0.144.5 的 `[agents]` 段：支持 max_threads/max_depth/interrupt_message + `[agents.角色名]` 声明（description/config_file/nickname_candidates）；**不支持**新版文档的 default_subagent_model 等字段

### 昵称机制

- 子代理 spawn 时从科学家名字池（agent_names.txt：Euclid/Turing/Feynman 等 ~100 个）**均匀随机**分配昵称，会话内不重复，耗尽后加 "the 2nd" 后缀
- 名字无任何语义，纯粹是界面里的人类可读标识；自定义角色可配 nickname_candidates 指定名字池

### @提及与消息路由（orchestrator 中转架构）

- **所有用户输入先进主代理**，不存在「@子代理直接绕开主代理」的通道
- 界面里的 @名字 是注入主代理上下文的提及，主代理理解后自行决定：自己处理 / 用 send_message 转发给指定线程 / 两者结合
- 子代理之间没有直接消息通道（星型拓扑，主代理为中心），汇总责任在主代理
- 实测：11:18 的「git 忽略检查」任务，主代理按 AGENTS.md 规则拆成 4 个独立检查，并行 spawn 4 个探子（4 个独立 session 文件，间隔 4 秒创建）——探子配置（luna low 锁定）在会话记录中可见

### 嵌套与并行（层级树）

- codex 支持子代理再派子代理（`source.subagent.thread_spawn` 记录 depth），同一层可并行 fan-out——**hierarchical + parallel 组合**
- 实测调用树（2026-08-03）：主会话 → architect（depth 1）→ 两个并行探子（depth 2，间隔 4 秒）
- **角色指令差异决定派生行为**：default.toml 写死了「不要派生子代理」；architect.toml 没禁止——架构师遇到需要调研的任务会自己派探子（调研隔离噪音 + 专注方案设计），这是探子模式的正确用法，不是 bug
- **V2 协议下 `max_depth` 被忽略**（源码注释："Maximum nesting depth for V1 agent threads. Ignored by V2"）——嵌套深度无硬限制，靠提示词约束；若套娃失控，在角色文件加禁止派生指令即可

## 验证与回滚备忘

- 配置合法性：`codex doctor`（应显示 config loaded / auth configured）
- 行为验证：跑一个只读任务后查 `~/.codex/sessions/` 最新 rollout 的 `"model"` 与 reasoning effort 字段，确认子代理真的用了指定模型
- 回滚：`~/.codex/config.toml.bak-oauth`；cc-switch db 备份在 `~/.cc-switch/*.bak-*`；切回中转方案 = cc-switch 切「神鸡」profile
- 项目侧：AGENTS.md 的验证规则（typecheck → vitest → Playwright E2E → 截图 → 汇报）对 codex 同样生效

## 遗留事项

- 探子目前用 luna low；若想更省或换模型家族，可加 `[model_providers.deepseek]` + `DEEPSEEK_API_KEY`（bashrc 已配），default.toml 改 model/model_provider 即可
- architect 若被过度调用，在 AGENTS.md 加「只有任务复杂度明确需要时才派 architect」
- 等 codex 升级后可启用新版 `[agents]` 全局字段（default_subagent_model 等）
