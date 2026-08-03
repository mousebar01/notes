# URI 与 MCP 资源寻址

> 学习记录：MCP Resource 寻址方式的理解。原始教学对话存档于 `archive/topics/agent/URI（统一资源标识符）-教学转存原稿.md`。

## 背景

URI（Uniform Resource Identifier）是 MCP 里连接 Resource 的核心概念——资源的"唯一地址/名字"。这条笔记记录：URI 和 URL 的关系、URI 结构、MCP 里怎么用它。

## 一句话理解

> URI = 资源的身份证：唯一标识一个资源；MCP 用它告诉 Server"我要哪一个资源"。

## URI / URL / URN 的关系

```
URI
 ├── URL（可以定位访问，如 https://example.com/user/123）
 └── URN（只负责命名）
```

URL 是能直接打开的位置；URI 更宽泛，只要求"能唯一标识"，不一定能打开。例如 `database://production/users/schema` 浏览器打不开，但能标识一个资源。MCP 主要用 URI 概念。

## URI 的结构

```
scheme://authority/path?query#fragment
```

| 部分 | 作用 | 示例 |
|---|---|---|
| scheme | 协议/命名空间 | `file` / `http` / `postgres` / 自定义如 `company` |
| authority | 资源所属主体 | 主机、服务实例、环境（如 `prod`） |
| path | 资源路径 | `/users` |
| query | 查询参数 | `?level=error` |
| fragment | 资源内部片段 | `#chapter3` |

**scheme 可以自定义**——这是 MCP 最灵活的地方：你可以把任何系统（数据库、知识库、监控、业务对象）包装成 AI 能理解的"资源空间"。

## MCP 为什么需要 URI

MCP 的 Resource 不一定是文件（用户手册、数据库结构、代码文件、服务器状态、知识库都能是资源）。统一用 URI 标识后：

```json
{
  "resources": [
    { "uri": "file:///project/main.py", "name": "main.py" },
    { "uri": "git://repo/main/history", "name": "Git history" }
  ]
}
```

AI 读取：`resources/read` 传 `"uri": "file:///project/main.py"`。

## URI 不一定真实存在

URI 是逻辑名字，不是文件路径。例如 `server://production/status` 可能没有对应文件，Server 内部映射：

```python
if uri == "server://production/status":
    return get_current_cpu()
```

## Tool 参数 vs Resource URI

| | 写法 | 说明 |
|---|---|---|
| Tool 调用 | `"params": { "name": "read_file", "arguments": { "path": "/a.txt" } }` | `path` 是工具自己的参数 |
| Resource 读取 | `"params": { "uri": "file:///a.txt" }` | `uri` 是 MCP 标准字段 |

## MCP Resource 对象字段

```json
{
  "uri": "file:///project/readme.md",
  "name": "README",
  "description": "项目说明文件",
  "mimeType": "text/plain"
}
```

`uri` 属于 URI 标识；`name` / `description` / `mimeType` 是 MCP Resource 的字段，不属于 URI 本身。

## 关键要点

- **Resource = 东西，URI = 东西的身份证，`resources/read(uri)` = 拿身份证取东西**
- URI 结构核心是 `scheme://authority/path`；scheme 可自定义，所以任何系统都能包装成资源空间
- 设计 MCP Server 时，URI 命名规范是一个重要环节

## 下一步

- 通信层：[JSON-RPC 协议](./json-rpc协议.md)
- MCP 总览：[MCP 协议入门](./mcp协议.md)
