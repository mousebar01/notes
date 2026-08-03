json-rpc一般包含分成请求和通知两个部分
请求时主动发送消息
通知时服务器资源或者状态发生变化时同时客户端
一般的http都是客户端主动获取服务器的
这里是服务器可以通知客户端，不再是单向的
json-rpc包含以下几个部分
协议号
"jsonrpc":2.0
methods:"tools/list"
parmarms:{
    "a":10,
    "b:20
}
"id":1,2
请求id是必要的，这样服务器返回结果的时候才知道到底是哪个请求的结果。

对，**下一步非常适合学 JSON-RPC**。

因为你现在已经理解了 MCP 的上层概念：

```
MCP
 ├── Tools
 ├── Resources
 ├── Prompts
 └── 生命周期
```

接下来要理解它“怎么通信”，这就是 JSON-RPC。

可以把层次关系理解成：

```
应用层：
    MCP 协议
        |
        ↓
通信格式：
    JSON-RPC 2.0
        |
        ↓
传输层：
    stdio / HTTP / WebSocket 等
```

MCP 其实没有发明一种全新的通信格式，它借用了 JSON-RPC。

---

# 1. JSON-RPC 是什么？

JSON-RPC 是一种：

> 用 JSON 格式描述“调用远程函数”的协议。

本地调用：

```python
result = add(1,2)
```

远程调用：

```
你的程序
    |
    | JSON
    ↓
另一台机器上的函数
```

变成：

请求：

```json
{
  "jsonrpc": "2.0",
  "method": "add",
  "params": {
    "a": 1,
    "b": 2
  },
  "id": 1
}
```

服务器：

```json
{
  "jsonrpc": "2.0",
  "result": 3,
  "id": 1
}
```

这就是 RPC：

Remote Procedure Call。

---

# 2. JSON-RPC 最核心的几个字段

一个请求：

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {},
  "id": 100
}
```

四个关键东西：

## jsonrpc

版本：

```json
"jsonrpc":"2.0"
```

固定写法。

---

## method

调用什么能力：

例如 MCP：

```json
"method":"tools/list"
```

意思：

> 列出所有工具

或者：

```json
"method":"resources/read"
```

意思：

> 读取资源

---

## params

参数：

例如：

```json
{
 "uri":"file:///readme.md"
}
```

---

## id

请求编号。

比如：

客户端同时发：

```
请求1:
id=1

请求2:
id=2
```

回来：

```
id=2
结果B

id=1
结果A
```

可以对应上。

---

# 3. Request 和 Response

普通调用：

```
Client                 Server

   请求
     |
     |---------------->
     |
     | tools/list
     |
     |
     |<----------------
          返回工具
```

例如 MCP：

请求：

```json
{
 "jsonrpc":"2.0",
 "method":"tools/list",
 "id":1
}
```

返回：

```json
{
 "jsonrpc":"2.0",
 "result":{
   "tools":[
     {
       "name":"search"
     }
   ]
 },
 "id":1
}
```

---

# 4. Notification（通知）

这个非常重要。

普通请求：

```
我问你
↓
你回答
```

Notification：

```
我告诉你
↓
不用回答
```

例如：

资源变化：

```json
{
 "jsonrpc":"2.0",
 "method":"notifications/resources/updated",
 "params":{
   "uri":"server://status"
 }
}
```

没有：

```json
"id":1
```

也没有返回。

因为它不是请求。

---

# 5. Error

错误也是标准格式：

例如调用不存在的方法：

请求：

```json
{
 "method":"hello"
}
```

返回：

```json
{
 "jsonrpc":"2.0",
 "error":{
   "code":-32601,
   "message":"Method not found"
 },
 "id":1
}
```

常见错误：

| code   | 含义       |
| ------ | -------- |
| -32700 | JSON解析错误 |
| -32600 | 非法请求     |
| -32601 | 方法不存在    |
| -32602 | 参数错误     |
| -32603 | 服务器错误    |

---

# 6. MCP 里面你刚才学的东西怎么映射？

比如 AI 调工具：

你说：

> 查天气

MCP Client：

```json
{
 "jsonrpc":"2.0",
 "method":"tools/call",
 "params":{
    "name":"weather",
    "arguments":{
       "city":"北京"
    }
 },
 "id":7
}
```

MCP Server：

执行：

```python
weather("北京")
```

返回：

```json
{
 "jsonrpc":"2.0",
 "result":{
    "temperature":"25℃"
 },
 "id":7
}
```

---

# 7. 为什么 MCP 选择 JSON-RPC？

因为它天然适合 AI Agent：

### ① 方法可发现

AI 可以问：

```
tools/list
```

得到：

```
你支持什么？
```

---

### ② 参数结构化

不是：

```
call("天气 北京")
```

而是：

```json
{
 "city":"北京"
}
```

机器容易理解。

---

### ③ 支持双向通信

传统 HTTP：

```
客户端 → 服务端
```

JSON-RPC：

```
客户端 → 服务端

客户端 ← 服务端通知
```

这正好满足：

* Resource 更新
* 任务状态
* 长任务进度

```

学 JSON-RPC 时建议重点掌握：

1. Request / Response
2. Method
3. Params
4. ID 匹配
5. Notification
6. Error
7. Batch 请求（稍后了解即可）

掌握这几个，你基本就能看懂 MCP 的通信层了。你现在已经到了“从使用 MCP 到自己造 MCP Server”的门槛附近。


3. MCP 常见 method 的 params

这部分就是你真正关心的。

tools/list

请求：

{
 "jsonrpc":"2.0",
 "method":"tools/list",
 "params":{},
 "id":1
}

通常没有参数。

可以省略：

{
 "method":"tools/list",
 "id":1
}
tools/call

调用工具：

{
 "jsonrpc":"2.0",
 "method":"tools/call",
 "params":{
    "name":"search",
    "arguments":{
       "query":"MCP协议"
    }
 },
 "id":2
}

这里：

params
{
 "name": "工具名称",
 "arguments": "工具参数"
}

例如工具定义：

{
 "name":"weather",
 "description":"查询天气",
 "inputSchema":{
   "type":"object",
   "properties":{
      "city":{
        "type":"string"
      }
   }
 }
}

调用：

{
 "method":"tools/call",
 "params":{
    "name":"weather",
    "arguments":{
       "city":"北京"
    }
 }
}
resources/list

列资源：

{
 "method":"resources/list",
 "params":{},
 "id":1
}
resources/read

读取资源：

{
 "method":"resources/read",
 "params":{
    "uri":"file:///README.md"
 },
 "id":2
}

params：

{
 "uri":"资源地址"
}
resources/subscribe

订阅：

{
 "method":"resources/subscribe",
 "params":{
    "uri":"server://status"
 },
 "id":3
}

params：

{
 "uri":"资源URI"
}

所以总结：

JSON-RPC 的 params 只有一个概念：方法参数。

它本身没有固定字段。

在 MCP 里：

method	params 常见字段
tools/list	空
tools/call	name、arguments
resources/list	空
resources/read	uri
resources/subscribe	uri
prompts/get	name、arguments

你现在如果继续往下学，下一块就是 JSON Schema，因为 MCP 的 Tool 参数定义（inputSchema）实际上靠它描述。这个是理解“AI 为什么知道怎么调用工具”的关键。

#json的传输协议
很好，这一步就是从“协议概念”进入“真实通信”。

MCP 的传输层（Transport Layer）解决的问题是：

> **JSON-RPC 消息怎么从 MCP Client 到 MCP Server，再回来。**

前面我们知道：

```text
MCP
 |
 | 定义：
 | - tools/list
 | - tools/call
 | - resources/read
 |
 ↓

JSON-RPC
 |
 | 定义：
 | - method
 | - params
 | - result
 |
 ↓

Transport
 |
 | 负责：
 | - 怎么发送
 | - 怎么接收
 | - 怎么保持连接
```

---

# 1. MCP 消息本质是什么？

假设 AI 要调用工具：

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {
      "query": "MCP"
    }
  },
  "id": 1
}
```

这只是**一段 JSON 文本**。

现在的问题：

> 这段 JSON 怎么到 Server？

这就是 Transport 干的事情。

---

# 2. MCP 常见的 Transport

目前主要有：

```text
Transport

├── stdio
│
└── HTTP-based
     |
     ├── Streamable HTTP
     |
     └── SSE（旧方案）
```

---

# 第一种：stdio（本地最常见）

这个是很多桌面 AI 应用默认方式。

结构：

```text
             本机

+-------------+          stdin/stdout          +-------------+
| MCP Client  |  <-------------------------->  | MCP Server  |
|             |                               |             |
| Claude      |                               | python.exe  |
| IDE         |                               | node        |
+-------------+                               +-------------+
```

比如：

客户端启动：

```bash
python server.py
```

然后：

Client：

写 stdin：

```json
{"method":"tools/list","id":1}
```

Server：

读 stdin：

```python
message = sys.stdin.readline()
```

解析：

```python
{
 "method":"tools/list"
}
```

返回 stdout：

```json
{
 "result":{
   "tools":[]
 },
 "id":1
}
```

---

## stdio 的关键点

它不是 HTTP。

没有：

```
GET
POST
Header
Status Code
```

就是：

```text
一行 JSON
↓
一行 JSON
```

类似：

```text
Client:
    {"method":"ping"}

Server:
    {"result":"pong"}
```

---

## 为什么 MCP 喜欢 stdio？

因为 AI 工具大量是：

* 本地文件
* 本地代码
* IDE插件
* 数据库客户端

例如：

VS Code：

```
VS Code
 |
启动
 |
python mcp_server.py
 |
stdin/stdout通信
```

不用开放端口。

---

# 第二种：HTTP Transport

适合远程服务。

结构：

```text
Client

   HTTP POST

        ↓

MCP Server
```

例如：

请求：

```http
POST /mcp HTTP/1.1
Content-Type: application/json
```

Body：

```json
{
 "jsonrpc":"2.0",
 "method":"tools/list",
 "id":1
}
```

服务器：

HTTP Response：

```http
200 OK
Content-Type: application/json
```

Body：

```json
{
 "result":{
   "tools":[]
 },
 "id":1
}
```

---

# 3. 为什么 HTTP 不够？

因为 MCP 有一个特殊需求：

> Server 可能主动通知 Client。

例如：

Resource 更新：

```text
服务器发现：

server://status 变化

↓

通知 AI
```

传统 HTTP：

```text
Client ----请求----> Server

Client <---响应----- Server
```

只能客户端主动问。

但是 MCP 需要：

```text
Client -------->
               
Server --------> Client
```

双向。

---

所以出现流式方案。

---

# 4. SSE（Server Sent Events）

老方案：

```text
Client

HTTP POST
   |
   ↓

Server

HTTP SSE Stream
   |
   ↓
持续推送事件
```

例如：

Server：

```
event: message

data:
{
 "method":"notifications/resources/updated"
}
```

Client 收到：

```json
{
 "method":"notifications/resources/updated"
}
```

---

# 5. Streamable HTTP（现在推荐方向）

它把请求和流结合。

结构：

```text
Client
 |
 | HTTP Request
 |
 ↓
Server
 |
 | Response Stream
 |
 ↓
Client
```

支持：

普通请求：

```
request
 ↓
response
```

也支持：

长任务：

```
request
 ↓
chunk1
chunk2
chunk3
...
```

例如：

调用：

```json
{
 "method":"tools/call",
 "params":{
   "name":"scan_repository"
 }
}
```

扫描需要一分钟。

Server：

先返回：

```
任务开始
```

然后：

```
扫描10%
扫描50%
扫描完成
```

---

# 6. Transport 和 JSON-RPC 的关系

重点：

JSON-RPC 不知道自己跑在哪里。

例如：

同一个消息：

```json
{
 "method":"tools/list",
 "id":1
}
```

可以：

stdio：

```
stdin/stdout
```

也可以：

HTTP：

```
POST body
```

也可以：

WebSocket：

```
message frame
```

JSON-RPC 只负责：

> “我发送什么消息”

Transport负责：

> “消息怎么过去”

---

# 7. 一个完整链路

以本地 AI 调工具为例：

用户：

```
查一下项目结构
```

↓

AI：

决定调用：

```
tools/call
```

↓

MCP Client：

生成 JSON-RPC：

```json
{
 "method":"tools/call",
 "params":{
   "name":"list_files"
 }
}
```

↓

Transport：

stdio：

```
stdout pipe
```

↓

MCP Server：

收到 JSON

↓

执行：

```python
list_files()
```

↓

返回：

```json
{
 "result":[
   "main.py",
   "README.md"
 ]
}
```

↓

Transport：

stdout

↓

Client

↓

AI

↓

回答用户。

---

# 8. 你现在应该重点理解哪个？

按重要性：

```
stdio
  ⭐⭐⭐⭐⭐

HTTP Streamable
  ⭐⭐⭐⭐

SSE
  ⭐⭐⭐

WebSocket
  ⭐⭐
```

因为实际 MCP 使用中：

* 本地 Agent → stdio 很多
* 云端 MCP 服务 → HTTP 很多

---

下一步建议继续看 **stdio 的具体实现**，因为它最能让你真正理解 MCP：

比如：

* 一个 JSON-RPC 消息如何切分？
* 为什么要求一行一个 JSON？
* stdout 为什么不能打印日志？
* MCP Server 启动后怎么完成 initialize 握手？

这些细节一搞明白，你基本就能自己手写一个 MCP Server 了。
