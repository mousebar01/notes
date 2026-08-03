这个问题非常关键，因为 **URI 是 MCP 里连接 Resource 的核心概念**。

先说一句最简单的：

> **URI（Uniform Resource Identifier，统一资源标识符）就是“资源的唯一地址/名字”。**

它告诉 MCP：

> “我要的是哪一个资源。”

---

## 1. URI 和 URL 的关系

很多人混淆：

### URL

比如：

```
https://example.com/user/123
```

它是一个可以访问的位置。

---

### URI

更宽泛：

```
xxx://something
```

只要求“能唯一标识”。

它不一定能直接打开。

例如：

```
file:///home/user/a.txt
```

这是 URI。

但是：

```
database://production/users/schema
```

也是 URI。

浏览器打不开，但它能标识一个资源。

关系：

```
URI
 ├── URL（可以定位访问）
 └── URN（只负责命名）
```

MCP 主要用的是 URI 这个概念。

---

# 2. MCP 为什么需要 URI？

因为 Resource 不是一定是文件。

例如：

你的 MCP Server 有：

```
用户手册
数据库结构
代码文件
服务器状态
知识库
```

如果不用统一标识，会很乱。

比如：

读取文件：

```json
{
 "path":"/app/readme.md"
}
```

读取数据库：

```json
{
 "table":"users"
}
```

读取知识库：

```json
{
 "doc":"xxx"
}
```

每种资源一种格式。

MCP 统一：

```text
resource
    |
    +-- uri
```

所有资源都有身份证。

---

# 3. URI 的结构

通常：

```
scheme://authority/path?query
```

例如：

```
file:///home/user/readme.md
```

拆开：

```
file       : scheme
//         :
/home/...  : path
```

---

另一个：

```
postgres://prod/users/schema
```

拆：

```
postgres  : 使用什么资源系统
prod      : 哪个目标
users     : 路径
schema    : 内容
```

---

# 4. MCP Resource 的例子

假设一个代码 MCP：

资源列表：

```json
{
 "resources":[
   {
     "uri":"file:///project/main.py",
     "name":"main.py"
   },
   {
     "uri":"git://repo/main/history",
     "name":"Git history"
   }
 ]
}
```

AI 想读取：

请求：

```json
{
 "method":"resources/read",
 "params":{
   "uri":"file:///project/main.py"
 }
}
```

Server：

看到：

```
file:///project/main.py
```

知道：

> 我要返回这个文件内容。

---

# 5. URI 不一定真实存在

这个很重要。

比如：

```
server://production/status
```

它可能不存在一个叫：

```
production/status
```

的文件。

它只是一个逻辑名字。

Server 内部：

```python
if uri == "server://production/status":
    return get_current_cpu()
```

所以：

URI 更像：

> 一个资源的身份证

而不是：

> 一个文件路径

---

# 6. Tool 和 Resource 里的 URI 区别

Tool：

```json
{
 "method":"tools/call",
 "params":{
   "name":"read_file",
   "arguments":{
      "path":"/a.txt"
   }
 }
}
```

这里：

```
path
```

是工具自己的参数。

---

Resource：

```json
{
 "method":"resources/read",
 "params":{
    "uri":"file:///a.txt"
 }
}
```

这里：

```
uri
```

是 MCP 标准字段。

---

# 7. 为什么不用 id？

你可能会想到：

为什么不用：

```json
{
"id":123
}
```

而用：

```json
{
"uri":"xxx://xxx"
}
```

原因：

URI 可以自描述。

例如：

```
postgres://prod/users/schema
```

人一眼知道：

* 来源：数据库
* 环境：prod
* 对象：users
* 内容：schema

而：

```
123456
```

没有任何信息。

---

# 8. 和文件系统的类比

你可以这样理解：

传统系统：

```
文件系统

/home/a.txt
/home/b.txt
```

MCP：

```
资源空间

file:///home/a.txt

db://prod/users

knowledge://company/rules
```

MCP 把所有外部信息抽象成一个“虚拟文件系统”。

---

所以在 MCP 里：

* **Resource = 东西**
* **URI = 东西的身份证**
* **resources/read(uri) = 拿这个身份证去取东西**

你前面理解 Resource 是“说明书/动态数据”，那 URI 就是这些说明书和数据的“目录地址”。

接下来如果继续往下，建议看 **JSON Schema**，因为它解释了 MCP 为什么能让模型自动知道：

“这个 tool 需要哪些参数、参数是什么类型、怎么调用”。这正是 MCP 的魔法来源之一。

这里要分清两个概念：

1. **URI 标准本身有哪些组成字段**
2. **MCP Resource 里的 URI 对象有哪些字段**

你问“URI有哪些字段”，严格来说是第 1 个。

---

## 1. URI 本身的结构字段

URI 按 RFC 语法大致是：

```
scheme://authority/path?query#fragment
```

也就是：

```text
┌────────┐ ┌─────────┐ ┌──────┐ ┌─────┐ ┌────────┐
│scheme  │ │authority│ │path  │ │query│ │fragment│
└────────┘ └─────────┘ └──────┘ └─────┘ └────────┘
```

例如：

```
https://example.com/users?id=123#profile
```

拆开：

| 部分        | 值           | 作用          |
| --------- | ----------- | ----------- |
| scheme    | https       | 使用什么协议/命名空间 |
| authority | example.com | 资源所属主体      |
| path      | /users      | 资源路径        |
| query     | id=123      | 查询参数        |
| fragment  | profile     | 资源内部片段      |

---

## 2. scheme（协议/命名空间）

这是 URI 最重要的部分。

例如：

```
file:///home/a.txt
```

这里：

```
scheme = file
```

表示：

> 用文件系统方式解释后面的内容。

常见：

| scheme     | 含义    |
| ---------- | ----- |
| file       | 文件    |
| http/https | 网络资源  |
| git        | Git资源 |
| postgres   | 数据库   |
| ssh        | 远程机器  |
| custom     | 自定义资源 |

MCP 里经常自己定义：

```
company://handbook/security
```

这里：

```
scheme = company
```

表示：

> 这是公司知识库资源。

---

## 3. authority（权限/主体）

格式：

```
scheme://authority/path
```

例如：

```
postgres://production/users
```

拆：

```
scheme:
postgres

authority:
production

path:
/users
```

authority 可以代表：

* 主机
* 服务实例
* 租户
* 环境

比如：

```
db://prod/customer/table
```

可以理解：

```
db
 |
 prod环境
 |
 customer表
```

---

## 4. path（路径）

这是最常用的部分。

例如：

```
file:///project/src/main.py
```

path：

```
/project/src/main.py
```

或者：

```
knowledge://company/security/password-policy
```

path：

```
/security/password-policy
```

---

## 5. query（查询参数）

类似 URL：

```
resource://logs/error?date=2026-07-30
```

query：

```
date=2026-07-30
```

用途：

过滤、控制读取方式。

例如：

```
logs://server/app?level=error
```

意思：

> 给我 error 日志。

---

## 6. fragment（片段）

例如：

```
doc://manual/install#linux
```

fragment：

```
linux
```

表示：

资源里面的某个部分。

类似：

网页：

```
https://xxx.com/page#chapter3
```

---

# 7. MCP Resource 里的 URI 字段

注意：

MCP 返回的 Resource 不是只返回一个字符串。

例如：

```json
{
  "uri": "file:///project/readme.md",
  "name": "README",
  "description": "项目说明文件",
  "mimeType": "text/plain"
}
```

这里：

真正的 URI：

```json
"uri": "file:///project/readme.md"
```

其他：

| 字段          | 属于谁            | 作用   |
| ----------- | -------------- | ---- |
| uri         | URI标识          | 资源地址 |
| name        | MCP Resource字段 | 显示名称 |
| description | MCP Resource字段 | 说明   |
| mimeType    | MCP Resource字段 | 内容类型 |

也就是说：

**name、description、mimeType 不是 URI 的字段。**

---

# 8. 自定义 MCP URI 示例

假设你做一个监控 MCP：

资源：

```
monitor://prod/api/status
```

拆：

```
scheme:
monitor

authority:
prod

path:
/api/status
```

含义：

> 生产环境 API 状态资源

读取：

```json
{
 "method":"resources/read",
 "params":{
   "uri":"monitor://prod/api/status"
 }
}
```

Server：

看到：

```
monitor://prod/api/status
```

内部映射：

```python
if uri == "monitor://prod/api/status":
    return check_api_status()
```

---

所以总结：

### URI 标准字段：

```
scheme
authority
path
query
fragment
```

### MCP Resource 对象字段：

```
uri
name
description
mimeType
```

其中最核心的是：

```
scheme://authority/path
```

MCP 最有意思的地方就在 **scheme 可以自定义**，所以你可以把任何系统（数据库、知识库、监控、业务对象）包装成一个 AI 能理解的“资源空间”。你后面如果写 MCP Server，设计 URI 命名规范会是一个很重要的环节。
