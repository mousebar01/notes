# MCP 协议入门

> 学习记录：学 MCP（Model Context Protocol）时的入门理解。原始教学对话存档于 `archive/topics/agent/mcp协议-教学转存原稿.md`。

## 背景

记这条笔记时刚开始接触 MCP，需要搞清楚：MCP 到底是什么、包含什么、怎么工作。这条是入门理解，后续的通信层（JSON-RPC）和资源寻址（URI）见同目录笔记。

## 一句话理解

> MCP = AI 世界里的「USB-C 接口」：不管外部是什么工具，只要遵守 MCP，模型就能统一连接。

它不是某个具体工具，而是一套**让 AI 模型连接外部能力**的协议标准。

## MCP 的三大能力

```
MCP Server
    |
    |-- Tools（工具）——让 AI 能"做事情"
    |
    |-- Resources（资源）——让 AI "读取信息"
    |
    |-- Prompts（提示模板）——预定义 AI 工作方式
```

### Tools（工具）

最常见的能力。例如：

- **文件工具**：`read_file` / `write_file` / `list_directory`，AI 可以"帮我读取项目里的 config.json"
- **数据库工具**：`query_database` / `list_tables` / `describe_table`
- **浏览器工具**：`open_page` / `click` / `screenshot` / `extract_text`
- **Git 工具**：`git_status` / `git_commit` / `git_diff`

### Resources（资源）

Tools 是动作（我帮你做事），Resources 是数据（我给你看东西）。例如 `file:///project/readme.md` 这类资源，AI 可以读取 README、数据库 schema、API 文档、日志、知识库。

类比：

```
浏览器访问 URL  →  读取网页内容
MCP Resource   →  读取外部数据
```

### Prompts（提示模板）

预定义 AI 工作方式。例如服务器提供 `code_review` 提示模板：

```
你是一名高级代码审查工程师。
检查：
1. 安全问题
2. 性能问题
3. 可维护性
```

用户调用 `/code_review` 直接套用。

## 协议结构

通信基础是 **JSON-RPC 2.0**：

```
                 JSON-RPC
                    |
        +-----------+-----------+
        |                       |
    MCP Client              MCP Server
        |                       |
     Claude / ChatGPT / IDE   文件系统 / 数据库 / Git / API
```

消息示例——请求：

```json
{
 "jsonrpc":"2.0",
 "method":"tools/list",
 "id":1
}
```

## 生命周期（一次完整调用）

1. **初始化**：Client 发 `initialize`，Server 返回支持的能力（tools/resources/prompts）
2. **发现能力**：`tools/list`，Server 返回工具清单
3. **调用工具**：`tools/call`，传入工具名和参数
4. **返回结果**：Server 返回结构化结果

## MCP Server 与普通 API 的区别

| | REST API | MCP |
|---|---|---|
| 调用者 | 程序 | AI Agent |
| 接口发现 | 通常没有 | 有（tools/list） |
| 工具描述 | 人工看文档 | 机器可读 |
| 目标 | 应用集成 | AI 能力扩展 |

核心差异：普通 API 的调用方式由程序员写死；MCP 的 AI 可以先问"你有什么能力"，再自己决定调用哪个。

## 一个 MCP Server 实际长什么样

以「公司知识库 MCP」为例：

```
knowledge-mcp-server

Tools:
 ├── search_docs()
 ├── summarize_doc()
 └── create_ticket()

Resources:
 ├── company://handbook
 ├── company://api-docs

Prompts:
 ├── write_report
 └── analyze_bug
```

接入 ChatGPT / Claude 后，你说"帮我查一下退款政策，然后创建工单"，AI 会依次调用 `search_docs` → `summarize_doc` → `create_ticket`，整条链路自动完成。

## 关键要点

- **MCP Server 只是"接入入口"**：启动一个 MCP Server（如 `od mcp --daemon-url ...`）不代表它有工具；真正的能力清单来自 `tools/list` 的返回。看不到工具，说明 Server 还没完成能力注册，或本身没暴露 tools。
- **Tools/Resources/Prompts 三层**分别对应"做事情 / 看数据 / 按模板工作"。

## 下一步

- 通信层：[JSON-RPC 协议](./json-rpc协议.md)
- 资源寻址：[URI（统一资源标识符）](./URI（统一资源标识符）.md)
