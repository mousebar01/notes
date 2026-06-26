pydantic一般只能确保数据的格式正确
业务依赖一般在FastAPI层进行构建
你可以把 FastAPI 的依赖注入理解成：

> **在真正执行接口函数之前，先自动完成一系列“准备、查询、验证和授权”工作，并把结果传给接口。**

这里的“依赖”不只是提供数据库连接，也可以承担业务验证。

---

## 1. 为什么 Pydantic 不够

Pydantic 擅长验证数据本身，例如：

```python
class PostUpdate(BaseModel):
    title: str
    content: str
```

它可以检查：

* `title` 是否是字符串
* 字段是否缺失
* 字符串长度是否合规
* UUID 格式是否正确

但它不适合解决这种问题：

* 这个 `post_id` 在数据库中存在吗？
* 当前用户有权修改这篇文章吗？
* 邮箱已经注册了吗？
* 当前用户是否被封禁？
* 外部支付订单是否有效？

因为这些验证需要查询数据库或调用外部服务。

所以可以把验证分为两类：

| 验证类型   | 示例                 | 适合的位置      |
| ------ | ------------------ | ---------- |
| 数据格式验证 | UUID 格式、字符串长度、数字范围 | Pydantic   |
| 业务状态验证 | 数据是否存在、用户是否有权限     | FastAPI 依赖 |

---

# 2. 用依赖检查文章是否存在

```python
async def valid_post_id(post_id: UUID4):
    post = await service.get_by_id(post_id)

    if not post:
        raise PostNotFound()

    return post
```

这个依赖做了三件事：

1. 从路径参数中取得 `post_id`
2. 查询数据库
3. 如果文章存在，返回文章；否则抛出异常

然后路由这样写：

```python
@router.get("/posts/{post_id}")
async def get_post_by_id(
    post = Depends(valid_post_id),
):
    return post
```

执行请求：

```text
GET /posts/123
```

FastAPI 实际执行顺序是：

```text
请求进入
   ↓
读取 post_id
   ↓
调用 valid_post_id(post_id)
   ↓
查询数据库
   ↓
文章不存在 → 抛出 PostNotFound，接口函数不会执行
文章存在   → 把文章赋值给 post
   ↓
执行 get_post_by_id(post=文章)
```

也就是说：

```python
post = Depends(valid_post_id)
```

不是“给 `post` 一个默认值”，而是告诉 FastAPI：

> 在调用接口之前，请先执行 `valid_post_id`，然后把它的返回值传给 `post`。

---

## 3. 为什么不直接在每个接口里查询

不用依赖时，代码可能是：

```python
@router.get("/posts/{post_id}")
async def get_post_by_id(post_id: UUID4):
    post = await service.get_by_id(post_id)

    if not post:
        raise PostNotFound()

    return post
```

更新接口又要写一次：

```python
@router.put("/posts/{post_id}")
async def update_post(post_id: UUID4, update_data: PostUpdate):
    post = await service.get_by_id(post_id)

    if not post:
        raise PostNotFound()

    return await service.update(post["id"], update_data)
```

评论接口还要再写一次。

这会导致：

* 查询代码重复
* “不存在”的异常处理重复
* 测试重复
* 将来修改验证逻辑时，要修改很多地方

使用依赖以后：

```python
post = Depends(valid_post_id)
```

所有接口可以共用同一套验证。

---

# 4. 链式依赖是什么意思

依赖函数本身也可以依赖其他依赖。

例如：

```python
async def parse_jwt_data(
    token: str = Depends(oauth2_scheme),
):
    payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    return {"user_id": payload["id"]}
```

它负责：

* 从请求头里读取 Token
* 解析 JWT
* 返回当前用户的 ID

然后检查文章是否属于当前用户：

```python
async def valid_owned_post(
    post = Depends(valid_post_id),
    token_data = Depends(parse_jwt_data),
):
    if post["creator_id"] != token_data["user_id"]:
        raise UserNotOwner()

    return post
```

这个函数依赖两个结果：

```text
valid_post_id
    ↓
取得文章

parse_jwt_data
    ↓
取得当前用户身份
```

然后比较：

```python
post["creator_id"] == token_data["user_id"]
```

整个依赖关系可以画成：

```text
                    valid_post_id
                   /             \
请求中的 post_id → 查询文章         \
                                     → valid_owned_post → 路由函数
Authorization → parse_jwt_data      /
                   ↓
               当前用户 ID
```

路由只需要：

```python
@router.get("/posts/{post_id}")
async def get_user_post(
    post = Depends(valid_owned_post),
):
    return post
```

它不再关心：

* 如何查询文章
* 如何解析 JWT
* 如何判断所有权

路由只表达最终要求：

> 我需要一篇“存在并且属于当前用户”的文章。

---

# 5. 依赖缓存是什么意思

假设一个接口中，多条依赖最终都需要解析 JWT：

```python
async def valid_owned_post(
    token_data = Depends(parse_jwt_data),
):
    ...
```

```python
async def valid_active_creator(
    token_data = Depends(parse_jwt_data),
):
    ...
```

接口同时使用它们：

```python
async def get_user_post(
    post = Depends(valid_owned_post),
    user = Depends(valid_active_creator),
):
    return post
```

依赖图如下：

```text
                        parse_jwt_data
                        /            \
                       ↓              ↓
             valid_owned_post   valid_active_creator
                       \              /
                        ↓            ↓
                         路由函数
```

虽然两个依赖都声明了：

```python
Depends(parse_jwt_data)
```

但在**同一个请求中**，FastAPI 默认只执行一次 `parse_jwt_data`。

第一次执行：

```python
token_data = await parse_jwt_data(...)
```

之后再需要时，直接使用缓存结果。

需要特别注意：

> 缓存范围是单次请求，不是永久缓存，也不是不同用户之间共享。

例如：

```text
请求 A：parse_jwt_data 执行一次
请求 B：parse_jwt_data 再执行一次
请求 C：parse_jwt_data 再执行一次
```

不是应用启动以后永远只执行一次。

如果确实不想使用缓存，可以写：

```python
Depends(parse_jwt_data, use_cache=False)
```

不过身份解析、数据库连接等依赖通常适合保留默认缓存。

---

# 6. 为什么要拆成小依赖

下面这种依赖什么都做：

```python
async def validate_everything(post_id, token):
    # 解析 token
    # 查询用户
    # 检查用户状态
    # 查询文章
    # 检查文章所有权
    # 检查用户是否是创作者
    ...
```

它的问题是：

* 很难复用
* 很难测试
* 某些接口只需要其中一部分，却被迫执行全部逻辑
* 修改任何验证都可能影响整个函数

更合适的方式是拆开：

```python
parse_jwt_data
```

只负责解析身份。

```python
valid_post_id
```

只负责检查文章存在。

```python
valid_active_creator
```

只负责检查用户是否活跃以及是否为创作者。

```python
valid_owned_post
```

只负责检查文章所有权。

这样不同接口可以自由组合：

```python
# 只需要登录
Depends(parse_jwt_data)
```

```python
# 只需要文章存在
Depends(valid_post_id)
```

```python
# 需要文章存在并且属于当前用户
Depends(valid_owned_post)
```

```python
# 需要用户是活跃创作者
Depends(valid_active_creator)
```

这就是“解耦并重用依赖”。

---

# 7. `async` 依赖和普通 `def` 依赖

FastAPI 同时支持：

```python
def dependency():
    ...
```

和：

```python
async def dependency():
    ...
```

区别主要看函数内部是否有异步 I/O。

## 需要等待 I/O 时使用 `async def`

例如：

```python
async def valid_post_id(post_id: UUID4):
    post = await service.get_by_id(post_id)
    return post
```

这里有数据库查询：

```python
await service.get_by_id(...)
```

因此应该用：

```python
async def
```

其他适合异步的操作包括：

* 异步数据库查询
* 异步 HTTP 请求
* 异步 Redis 操作
* 异步文件读取

---

## 完全是简单计算时也可以使用 `async def`

例如：

```python
async def normalize_page(page: int = 1):
    return max(page, 1)
```

虽然里面没有 `await`，但它非常轻量，使用 `async def` 没问题。

原文想表达的是：在异步 FastAPI 应用中，一个非常简单的同步依赖：

```python
def normalize_page(page: int):
    return max(page, 1)
```

FastAPI 通常会把它安排到线程池执行，避免同步函数阻塞事件循环。

流程近似于：

```text
异步事件循环
    ↓
切换到线程池
    ↓
执行同步依赖
    ↓
切换回来
```

对于数据库驱动这种本身就是同步、可能阻塞的代码，线程池是必要的：

```python
def get_post():
    return sync_database.query(...)
```

但对于只有一两行的轻量计算，线程切换可能比计算本身还贵。因此在异步项目中，这类简单依赖经常直接写成：

```python
async def normalize_page(...):
    ...
```

---

## 但不要机械地认为“所有依赖都必须 async”

正确原则是：

```text
调用异步库 → async def + await
调用同步阻塞库 → def，让 FastAPI 放在线程池
简单、快速、非阻塞逻辑 → async def 或 def 都可以，
                         异步项目里通常可优先 async def
```

最危险的是这样：

```python
async def bad_dependency():
    result = requests.get("https://example.com")
    return result
```

`requests.get()` 是同步阻塞调用，却放进了 `async def`，会直接阻塞事件循环。

应该选择其一：

```python
# 使用异步 HTTP 客户端
async def good_dependency():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://example.com")
    return response
```

或者：

```python
# 保持同步，让 FastAPI 在线程池中运行
def sync_dependency():
    return requests.get("https://example.com")
```

---

# 8. 这段代码的完整执行顺序

对于：

```python
@router.get("/users/{user_id}/posts/{post_id}")
async def get_user_post(
    worker: BackgroundTasks,
    post = Depends(valid_owned_post),
    user = Depends(valid_active_creator),
):
    worker.add_task(send_email, user["id"])
    return post
```

FastAPI 大致会这样处理：

```text
1. 读取请求中的 post_id
2. 调用 valid_post_id
3. 查询文章是否存在

4. 读取 Authorization Token
5. 调用 parse_jwt_data
6. 得到当前用户 ID

7. 调用 valid_owned_post
8. 检查文章是否属于当前用户

9. valid_active_creator 也需要 parse_jwt_data
10. FastAPI 发现刚才已经执行过，直接使用缓存结果

11. 查询当前用户
12. 检查用户是否活跃
13. 检查用户是否为创作者

14. 所有依赖都成功后，执行路由函数
15. 添加发送邮件的后台任务
16. 返回文章
```

任何一步抛出异常，后面的路由函数都不会执行。

---

# 9. 一句话记忆

可以把 FastAPI 依赖看成一个“请求处理流水线”：

```text
请求参数格式验证
    ↓
查询数据库对象
    ↓
解析登录身份
    ↓
检查用户状态
    ↓
检查资源所有权
    ↓
真正执行接口
```

Pydantic 负责：

> “输入长得对不对？”

依赖负责：

> “这个数据在当前业务状态下是否有效，以及当前用户能不能执行这个操作？”

另外，示例路由中的 `{user_id}` 没有被使用。若文章所有权以 Token 中的当前用户为准，可以将路径简化为：

```python
@router.get("/posts/{post_id}")
async def get_user_post(
    post = Depends(valid_owned_post),
):
    return post
```

否则就应该额外验证路径中的 `user_id` 与登录用户或文章所有者是否一致。
