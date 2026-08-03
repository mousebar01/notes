# JSON-RPC 协议与 MCP 传输层

> 学习记录：MCP 通信层的理解。原始教学对话存档于 `archive/topics/agent/json-rpc协议-教学转存原稿.md`。

## 背景

MCP 用 JSON-RPC 2.0 作为通信格式。这条笔记记录：JSON-RPC 是什么、核心字段、MCP 的 method 映射，以及消息怎么通过 stdio / HTTP / SSE / Streamable HTTP 到达 Server。

## 一句话理解

JSON-RPC 是"用 JSON 描述调用远程函数"的协议。本地调用 `result = add(1, 2)` 变成发一条 JSON 消息到另一台机器上的函数。

层次关系：

```
应用层：  MCP 协议（Tools / Resources / Prompts / 生命周期）
  ↓
通信格式：JSON-RPC 2.0
  ↓
传输层：  stdio / HTTP / WebSocket
```

MCP 没有发明新通信格式，它借用了 JSON-RPC。

## 核心字段

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { "name": "weather", "arguments": { "city": "北京" } },
  "id": 100
}
```

| 字段 | 作用 |
|---|---|
| `jsonrpc` | 固定 `"2.0"` |
| `method` | 调用什么能力（如 `tools/list`、`resources/read`） |
| `params` | 参数，结构由各 method 决定 |
| `id` | 请求编号：请求必须有，Server 靠它把结果对应回哪个请求；Notification 没有 id |

## Request / Response / Notification / Error

- **Request**：Client 问、Server 答，必须有 `id`
- **Notification**：单向告知，不用回答，没有 `id`（如 `notifications/resources/updated`）
- **Error**：标准格式，如 `{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":1}`

常见错误码：

| code | 含义 |
|---|---|
| -32700 | JSON 解析错误 |
| -32600 | 非法请求 |
| -32601 | 方法不存在 |
| -32602 | 参数错误 |
| -32603 | 服务器错误 |

## MCP 常见 method 的 params

JSON-RPC 的 params 只有"方法参数"一个概念，没有固定字段；MCP 里各 method 有自己的约定：

| method | params 常见字段 |
|---|---|
| `tools/list` | 空 |
| `tools/call` | `name`、`arguments` |
| `resources/list` | 空 |
| `resources/read` | `uri` |
| `resources/subscribe` | `uri` |
| `prompts/get` | `name`、`arguments` |

## 传输层：消息怎么到 Server

JSON-RPC 不知道自己跑在哪；Transport 负责"消息怎么过去"。

| 传输 | 场景 | 特点 |
|---|---|---|
| **stdio** | 本地 Agent / IDE 插件 | 一行 JSON 进一行 JSON 出，无 HTTP 头；桌面 AI 应用默认方式 |
| **HTTP (Streamable)** | 云端 MCP 服务 | POST 请求 + 响应流，支持长任务分段返回；当前推荐方向 |
| **SSE** | 旧方案 | Server 持续推送事件（Server→Client 单向流） |
| **WebSocket** | 双向长连接 | 较少用 |

**为什么需要流式方案**：MCP 需要 Server 主动通知 Client（如资源更新、长任务进度），传统 HTTP 只能客户端主动问。

## 完整链路（本地 AI 调工具）

```
用户："查一下项目结构"
  → AI 决定调用 tools/call（生成 JSON-RPC 消息）
  → Transport（stdio）把 JSON 送到 MCP Server
  → Server 执行 list_files() 返回结果
  → Transport 送回 Client → AI 回答用户
```

## 关键要点

- **请求与通知的边界**：请求等回答、通知不等回答；`id` 是请求的必要标记
- **JSON-RPC 与 Transport 解耦**：同一消息可以跑在 stdio、HTTP、WebSocket 上
- 学习优先级：stdio ⭐⭐⭐⭐⭐ > HTTP Streamable ⭐⭐⭐⭐ > SSE ⭐⭐⭐ > WebSocket ⭐⭐

## 下一步

- 资源寻址：[URI（统一资源标识符）](./URI（统一资源标识符）.md)
- MCP 总览：[MCP 协议入门](./mcp协议.md)
