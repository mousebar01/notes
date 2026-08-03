# MaiBot 项目功能概览

这篇记录 MaiBot / MaiSaka 的项目定位、主要模块和推荐阅读路径，作为后续源码学习的入口。

## 项目定位

我粗看了一圈，这个项目是 **MaiBot / MaiSaka：一个面向 QQ/群聊场景的拟人化 LLM 聊天智能体**。它不是单纯“问答机器人”，核心目标是：会看聊天气氛、会记人、会学习表达方式和黑话、会用表情/图片、可插件扩展，并带一个 WebUI 管理后台。

## 功能地图

主要功能可以分成这几块：

1. **聊天主链路**
   - 接收平台消息，维护聊天流/session。
   - 处理群聊/私聊消息。
   - 判断是否需要回复。
   - 组织上下文、历史消息、记忆、人物信息。
   - 调用 LLM 生成回复或工具调用。
   - 发送文本、表情、图片等回复。  
   入口主要在 [`bot.py`](https://github.com/Mai-with-u/MaiBot/blob/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/bot.py) 和 [`src/main.py`](https://github.com/Mai-with-u/MaiBot/blob/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/main.py)。

2. **拟人化对话系统 Maisaka**
   - 有 planner/replyer 规划器。
   - 支持工具调用，比如查记忆、查历史、发图、发表情、切换聊天流、等待等。
   - 会做回复必要性判断，不是每条消息都硬回。
   - 有 focus 模式、idle backoff、turn scheduler 这类“什么时候说话”的机制。  
   主要在 [`src/maisaka`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/maisaka)。

3. **记忆系统 A_memorix**
   - 存储和检索长期记忆。
   - 支持向量检索、BM25、图关系召回、PageRank、episode/片段化记忆。
   - 还支持人物画像、关系查询、记忆导入/迁移。  
   主要在 [`src/A_memorix`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/A_memorix)。这个目录有单独修改规则，真要改前要读 `MODIFICATION_POLICY.md`。

4. **学习系统**
   - 学习用户/群聊的表达方式。
   - 学习黑话、圈内词。
   - 学习行为模式和场景。
   - 表达选择器会让麦麦更像当前聊天环境。  
   主要在 [`src/learners`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/learners)。

5. **表情和图片系统**
   - 管理表情包。
   - 根据上下文选择表情。
   - 接收图片压缩/缓存。
   - 回复时可以发送图片或表情。  
   主要在 [`src/emoji_system`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/emoji_system) 和 [`src/chat/image_system`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/chat/image_system)。

6. **插件系统**
   - 有新版插件运行时。
   - 支持命令、Hook、事件、组件查询、工具提供。
   - 插件作为独立 runner/子进程运行，有 supervisor、RPC、权限和熔断机制。  
   主要在 [`src/plugin_runtime`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/plugin_runtime)，示例插件在 [`plugins/hello_world_plugin`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/plugins/hello_world_plugin)。

7. **WebUI / Dashboard**
   - React + TypeScript + Vite 管理后台。
   - 功能包括：配置管理、模型配置、插件管理、日志查看、本地聊天、人物管理、表情管理、表达管理、黑话管理、记忆/知识图谱、推理过程查看等。
   - 后端 API 在 [`src/webui`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/webui)，前端在 [`dashboard`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/dashboard)。  
   README 里说 WebUI 还支持 WebSocket 实时日志和本地对话。

8. **模型与工具调用**
   - 支持 OpenAI 兼容接口、Google GenAI 等。
   - 有模型任务分配，比如回复、工具调用、视觉模型、表达选择等。
   - 有 MCP 模块，可以接外部工具/服务。  
   相关目录是 [`src/llm_models`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/llm_models)、[`src/services/llm_service.py`](https://github.com/Mai-with-u/MaiBot/blob/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/services/llm_service.py)、[`src/mcp_module`](https://github.com/Mai-with-u/MaiBot/tree/a5207e5248680e6c445a020e2d34eaf31e7b1ca2/src/mcp_module)。

## 调用链路

一句话功能地图：

**平台消息进来 -> ChatManager 建立真实聊天流 -> Maisaka 判断是否该说话 -> 注入历史/记忆/人物/黑话/表达风格 -> LLM 规划回复或工具调用 -> 插件/工具可介入 -> 通过平台 IO 发回消息 -> WebUI 可观察和管理整个过程。**

## 推荐阅读路径

如果你想继续学这个项目，我建议下一步按这个顺序看：  
`bot.py` / `src/main.py` 启动链路 -> `src/chat/message_receive/bot.py` 消息入口 -> `src/maisaka/chat_loop_service.py` LLM 对话循环 -> `src/A_memorix` 记忆系统 -> `src/plugin_runtime` 插件系统。
