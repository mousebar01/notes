# FastAPI 到 DeepSeek API 调用链路

从 **FastAPI 到 DeepSeek API**，可以理解为：

> 用户请求先到你的 FastAPI 后端，FastAPI 再作为“中间人”去请求 DeepSeek API，DeepSeek 返回结果后，FastAPI 再把结果返回给用户。

DeepSeek 官方文档里，Chat API 的常见地址是 `POST https://api.deepseek.com/chat/completions`，并使用 `Authorization: Bearer <API_KEY>` 这种方式鉴权。([DeepSeek API Docs][1])

## 1. 整体链路

```text
用户浏览器 / 前端页面
        ↓
你的域名 / Nginx / 网关
        ↓
FastAPI 后端接口
        ↓
Python HTTP 客户端 / OpenAI SDK
        ↓
DNS 解析 api.deepseek.com
        ↓
HTTPS / TLS 加密连接
        ↓
DeepSeek API 网关
        ↓
DeepSeek 鉴权、限流、路由
        ↓
DeepSeek 模型推理服务
        ↓
返回模型结果
        ↓
FastAPI 整理结果
        ↓
返回给前端 / 用户
```

---

## 2. 用户到 FastAPI

比如前端调用你的接口：

```http
POST /api/chat
```

请求内容可能是：

```json
{
  "message": "你好，帮我解释一下缓存"
}
```

这一步经过的链路大概是：

```text
浏览器
→ DNS 解析你的域名
→ CDN / Nginx / 负载均衡
→ FastAPI 应用
```

如果你是本地开发，可能就是：

```text
浏览器 / Postman
→ http://127.0.0.1:8000/api/chat
→ FastAPI
```

---

## 3. FastAPI 内部处理

FastAPI 收到请求后，一般会做这些事：

```text
解析请求 JSON
→ 校验参数
→ 读取用户输入
→ 拼接 prompt / messages
→ 读取 DeepSeek API Key
→ 调用 DeepSeek API
```

例如 FastAPI 里可能有这样的逻辑：

```python
from fastapi import FastAPI
from openai import OpenAI
import os

app = FastAPI()

client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)

@app.post("/api/chat")
def chat(data: dict):
    user_message = data["message"]

    response = client.chat.completions.create(
        model="deepseek-v4-pro",
        messages=[
            {"role": "system", "content": "你是一个有用的助手"},
            {"role": "user", "content": user_message},
        ],
        stream=False,
    )

    return {
        "answer": response.choices[0].message.content
    }
```

这里的 FastAPI 其实不是直接“变成 AI”，而是帮你把用户问题转发给 DeepSeek。

---

## 4. FastAPI 到 DeepSeek API

这一段是后端主动向外发请求：

```text
FastAPI
→ Python HTTP 客户端
→ 操作系统网络栈
→ DNS 解析 api.deepseek.com
→ 建立 TCP 连接
→ 建立 HTTPS / TLS 加密连接
→ 发送 HTTP POST 请求
→ DeepSeek API
```

发送给 DeepSeek 的请求大概是：

```http
POST /chat/completions
Host: api.deepseek.com
Content-Type: application/json
Authorization: Bearer sk-xxxx
```

请求体类似：

```json
{
  "model": "deepseek-v4-pro",
  "messages": [
    {
      "role": "system",
      "content": "你是一个有用的助手"
    },
    {
      "role": "user",
      "content": "你好"
    }
  ],
  "stream": false
}
```

---

## 5. DeepSeek 服务端内部链路

请求到 DeepSeek 后，大概会经历：

```text
API 网关
→ 身份鉴权
→ 检查 API Key 是否有效
→ 检查余额 / 权限 / 模型可用性
→ 限流
→ 参数校验
→ 路由到对应模型服务
→ 模型推理
→ 生成回答
→ 返回 JSON 结果
```

你看不到 DeepSeek 内部的具体机器和模型部署细节，但从 API 调用角度，可以这样理解：

```text
DeepSeek API 网关负责接请求
模型推理服务负责生成回答
```

---

## 6. DeepSeek 返回给 FastAPI

DeepSeek 返回的结果通常是一个 JSON，例如：

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "你好，我可以帮你解释缓存。"
      }
    }
  ]
}
```

FastAPI 拿到这个结果后，可能会做：

```text
提取 content
→ 记录日志
→ 保存对话到数据库
→ 返回给前端
```

最后返回给用户：

```json
{
  "answer": "你好，我可以帮你解释缓存。"
}
```

---

## 7. 如果是流式输出，链路会不一样一点

普通模式是：

```text
FastAPI 等 DeepSeek 全部生成完
→ 一次性返回给前端
```

流式模式是：

```text
DeepSeek 边生成边返回
→ FastAPI 边接收边转发
→ 前端边显示
```

也就是类似 ChatGPT 打字机效果。

链路变成：

```text
用户
→ FastAPI
→ DeepSeek API
→ DeepSeek 一段一段返回 token
→ FastAPI 一段一段转发
→ 前端一段一段显示
```

这时候 FastAPI 不能等全部结果结束才返回，而是要用 `StreamingResponse` 或 SSE。

---

## 8. 这条链路里可能涉及哪些组件

| 位置    | 组件                            | 作用                 |
| ----- | ----------------------------- | ------------------ |
| 前端    | 浏览器 / Vue / React             | 用户输入问题，展示回答        |
| 网关层   | Nginx / API Gateway           | 转发请求、限流、HTTPS      |
| 后端    | FastAPI                       | 接收用户请求，调用 DeepSeek |
| 后端依赖  | OpenAI SDK / httpx / requests | 发 HTTP 请求          |
| 网络层   | DNS / TCP / TLS / HTTP        | 负责网络通信             |
| 第三方服务 | DeepSeek API                  | 提供模型能力             |
| 存储层   | MySQL / PostgreSQL / Redis    | 可选，用来保存用户、会话、缓存    |
| 日志监控  | 日志系统 / APM                    | 排查错误、统计耗时          |

---

## 9. 简单版总结

```text
前端把用户问题发给 FastAPI
→ FastAPI 校验和整理请求
→ FastAPI 带着 API Key 请求 DeepSeek API
→ DeepSeek 校验身份并调用模型
→ 模型生成回答
→ DeepSeek 把结果返回给 FastAPI
→ FastAPI 再返回给前端
→ 用户看到答案
```

一句话总结：

> FastAPI 是你自己的后端中转站，DeepSeek API 是外部 AI 服务；用户不会直接请求 DeepSeek，而是先请求你的 FastAPI，再由 FastAPI 去调用 DeepSeek。

[1]: https://api-docs.deepseek.com/?utm_source=chatgpt.com "DeepSeek API Docs: Your First API Call"
