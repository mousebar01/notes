你这里说的 **MCP** 大概率指的是 **Model Context Protocol（模型上下文协议）**。它不是某个具体工具，而是一套让 **AI 模型连接外部能力** 的协议标准。

简单理解：

> MCP = AI 世界里的「USB-C 接口」
> 不管外部是什么工具，只要遵守 MCP，模型就能统一连接。

---

## 1. MCP 里面主要包含什么？

MCP 主要有三类能力：

```
MCP Server
    |
    |-- Tools（工具）
    |
    |-- Resources（资源）
    |
    |-- Prompts（提示模板）
```

---

## 一、Tools（工具）——让 AI 能“做事情”

这是最常见的部分。

比如：

### 文件工具

```
read_file
write_file
list_directory
```

AI 可以：

> "帮我读取项目里的 config.json"

然后调用：

```json
{
  "name": "read_file",
  "arguments": {
    "path": "/project/config.json"
  }
}
```

---

### 数据库工具

比如 PostgreSQL MCP：

```
query_database
list_tables
describe_table
```

AI 可以：

> "统计过去一年销售额"

调用：

```sql
SELECT sum(amount)
FROM orders
WHERE year=2025;
```

---

### 浏览器工具

例如：

```
open_page
click
screenshot
extract_text
```

AI 可以操作网页。

---

### Git 工具

例如：

```
git_status
git_commit
git_diff
create_branch
```

AI 可以管理代码仓库。

---

## 二、Resources（资源）——让 AI “读取信息”

Tools 是动作：

> 我帮你做事

Resources 是数据：

> 我给你看东西

例如：

服务器提供：

```
resource:
  file:///project/readme.md
```

AI 可以读取：

```
README.md
数据库 schema
API 文档
日志
知识库
```

类似：

```
浏览器访问 URL
       ↓
读取网页内容

MCP Resource
       ↓
读取外部数据
```

---

## 三、Prompts（提示模板）——预定义 AI 工作方式

例如：

服务器提供：

```
prompt:
  code_review
```

内容：

```
你是一名高级代码审查工程师。
检查：
1. 安全问题
2. 性能问题
3. 可维护性
```

用户调用：

```
/code_review
```

直接套用。

---

# 2. MCP 的协议结构

整体结构大概：

```
                 JSON-RPC
                    |
                    |
        +-----------+-----------+
        |                       |
    MCP Client              MCP Server
        |                       |
        |                       |
     Claude                  文件系统
     ChatGPT                 数据库
     IDE                     Git
                             API
```

通信基础：

## JSON-RPC 2.0

也就是说消息类似：

请求：

```json
{
 "jsonrpc":"2.0",
 "method":"tools/list",
 "id":1
}
```

服务器返回：

```json
{
 "tools":[
   {
    "name":"search",
    "description":"搜索网页"
   }
 ]
}
```

---

# 3. MCP 生命周期

连接时一般流程：

### 第一步：初始化

Client：

```
initialize
```

Server：

```
我支持：
- tools
- resources
- prompts
```

---

### 第二步：发现能力

Client：

```
tools/list
```

Server：

返回：

```json
[
 {
  "name":"query_db"
 },
 {
  "name":"send_email"
 }
]
```

这一步就是你截图里缺少的东西。

---

### 第三步：调用工具

AI：

```
tools/call
```

例如：

```json
{
"name":"query_db",
"arguments":{
 "sql":"select * from users"
}
}
```

---

### 第四步：返回结果

Server:

```json
{
"content":[
 {
 "type":"text",
 "text":"共有1000个用户"
 }
]
}
```

---

# 4. MCP Server 和普通 API 有什么区别？

普通 API：

```
程序 ---- HTTP ---- API
```

程序员提前写死：

```
GET /users
POST /orders
```

---

MCP：

```
AI ---- MCP ---- Server
```

AI 可以先问：

```
你有什么能力？
```

Server：

```
我有：
- 搜索
- 查询数据库
- 发邮件
- 读文件
```

然后 AI 自己决定调用哪个。

核心区别：

|      | REST API | MCP      |
| ---- | -------- | -------- |
| 调用者  | 程序       | AI Agent |
| 接口发现 | 通常没有     | 有        |
| 工具描述 | 人工看文档    | 机器可读     |
| 目标   | 应用集成     | AI能力扩展   |

---

# 5. 一个 MCP Server 实际可能长这样

例如「公司知识库 MCP」：

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

接入 ChatGPT / Claude 后：

你说：

> "帮我查一下退款政策，然后创建工单"

AI：

1. search_docs
2. summarize_doc
3. create_ticket

整个链路自动完成。

---

所以回到你截图：

你配置的：

```
od mcp --daemon-url http://127.0.0.1:7456
```

只是启动一个 MCP Server。

真正的「工具」应该来自：

```
tools/list
```

返回：

```
tools:
  - xxx
  - xxx
  - xxx
```

如果没有看到工具，说明这个 MCP Server 还没有完成能力注册，或者它本身没有暴露 tools。你现在看到的是“接入入口”，不是“能力清单”。
