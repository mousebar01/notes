# FastAPI 依赖注入

这篇笔记只讨论 FastAPI 依赖在请求处理中的核心用途：补足 Pydantic 无法完成的业务状态校验，并把查询、身份解析和授权组合成可复用的依赖图。

可以先记住一句话：

> 在执行路由函数之前，FastAPI 会解析它声明的依赖；依赖成功时把返回值注入路由，失败时直接结束本次请求。

依赖不只用来提供数据库连接，也可以代表“文章存在”“用户已登录”“用户拥有这篇文章”这类前置条件。

## 为什么 Pydantic 不够

Pydantic 擅长验证输入数据本身：

```python
from pydantic import BaseModel, Field


class PostUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str
```

它可以检查：

- 字段是否缺失；
- 类型和格式是否正确；
- 字符串长度、数字范围等约束是否满足；
- 路径参数能否解析为 UUID。

但下面的问题依赖请求之外的当前状态：

- 这个 `post_id` 在数据库中存在吗？
- 当前用户是否拥有这篇文章？
- 邮箱是否已经注册？
- 当前用户是否被封禁？
- 外部支付订单是否仍然有效？

这类判断通常需要查询数据库、缓存或外部服务，不应硬塞进 Pydantic 模型。

| 验证对象 | 示例 | 适合的位置 |
| --- | --- | --- |
| 输入的结构与格式 | UUID、必填字段、长度、范围 | Pydantic / FastAPI 参数声明 |
| 当前业务状态 | 资源存在、账号有效、拥有权限 | FastAPI 依赖调用 service |

业务依赖可以在 FastAPI 接入层组织，但数据库查询和领域规则仍应留在 service 或 repository 中。依赖负责组合调用和把失败映射为 HTTP 异常，不必承载全部业务实现。

## Depends 的基本语义

先写一个“文章必须存在”的依赖：

```python
from pydantic import UUID4


async def valid_post_id(post_id: UUID4):
    post = await post_service.get_by_id(post_id)
    if post is None:
        raise PostNotFound()
    return post
```

它做三件事：

1. 接收 FastAPI 从路径中解析出的 `post_id`；
2. 通过 service 查询文章；
3. 返回已确认存在的文章，或者抛出异常。

路由只声明自己需要这个结果：

```python
from typing import Annotated

from fastapi import Depends


@router.get("/posts/{post_id}")
async def get_post_by_id(
    post: Annotated[dict, Depends(valid_post_id)],
):
    return post
```

`Depends(valid_post_id)` 不是普通默认值。它告诉 FastAPI：

```text
读取并校验 post_id
  -> 调用 valid_post_id(post_id)
  -> 文章不存在：返回错误，路由不执行
  -> 文章存在：把返回值注入 post
  -> 执行路由
```

`Annotated` 写法把类型与依赖声明放在一起，编辑器和类型检查器更容易理解，因此新代码通常优先使用它。

### 返回已查询的对象

依赖已经查到了文章，就应直接返回文章，而不是只返回 `True`。这样路由无需再次查询，空值判断和异常映射也只有一份：

```python
@router.put("/posts/{post_id}")
async def update_post(
    update_data: PostUpdate,
    post: Annotated[dict, Depends(valid_post_id)],
):
    return await post_service.update(post["id"], update_data)
```

如果每个路由都自行查询，会重复以下内容：

```text
按 ID 查询
  -> 判断是否为空
  -> 选择异常
  -> 把结果交给后续逻辑
```

将稳定的前置条件提成依赖，可以统一错误行为，也便于单独测试和复用。

## 链式依赖

依赖函数本身也可以声明依赖。FastAPI 会先解析子依赖，再调用依赖它的函数。

下面先从请求头取得并解析 Token：

```python
from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def parse_jwt_data(
    token: Annotated[str, Depends(oauth2_scheme)],
):
    payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    return {"user_id": payload["id"]}
```

再组合“文章存在”和“身份已解析”，检查文章所有权：

```python
async def valid_owned_post(
    post: Annotated[dict, Depends(valid_post_id)],
    token_data: Annotated[dict, Depends(parse_jwt_data)],
):
    if post["creator_id"] != token_data["user_id"]:
        raise UserNotOwner()
    return post
```

另一个依赖可以检查当前用户状态：

```python
async def valid_active_creator(
    token_data: Annotated[dict, Depends(parse_jwt_data)],
):
    user = await user_service.get_by_id(token_data["user_id"])
    if user is None:
        raise UserNotFound()
    if not user["is_active"]:
        raise InactiveUser()
    if not user["is_creator"]:
        raise CreatorRequired()
    return user
```

依赖关系不是一条固定的调用链，而是一张图：

```text
post_id -> valid_post_id -----------+
                                      -> valid_owned_post --+
Authorization -> oauth2_scheme      /                       |
                  -> parse_jwt_data +                        -> 路由
                                      -> valid_active_creator |
```

路由只表达最终需要的条件：

```python
OwnedPost = Annotated[dict, Depends(valid_owned_post)]
ActiveCreator = Annotated[dict, Depends(valid_active_creator)]


@router.get("/posts/{post_id}")
async def get_user_post(
    post: OwnedPost,
    user: ActiveCreator,
):
    return post
```

此时路由不必知道如何读取 Token、查询文章或判断所有权。它只要求：

- `post` 是存在且属于当前用户的文章；
- `user` 是有效且活跃的创作者。

## 单次请求内的依赖缓存

在上面的依赖图中，`valid_owned_post` 和 `valid_active_creator` 都依赖 `parse_jwt_data`：

```text
                  parse_jwt_data
                  /            \
                 v              v
       valid_owned_post   valid_active_creator
                 \              /
                  +---- 路由 ----+
```

同一次请求中，FastAPI 默认会复用已经解析过的依赖结果。因此共享的 `parse_jwt_data` 通常只执行一次。

```text
请求 A：解析一次 Token，图中多个下游依赖复用结果
请求 B：重新解析一次 Token
```

这是请求级缓存：

- 不会跨请求共享；
- 不会在不同用户之间共享；
- 不是 Redis 或进程内业务缓存；
- 请求结束后结果就失效。

如果某个依赖确实需要在同一请求中重新执行，可以在相应声明处关闭复用：

```python
fresh_data: Annotated[
    dict,
    Depends(load_data, use_cache=False),
]
```

身份解析、数据库会话和只读查询通常适合保留默认缓存。带副作用的操作不应依赖“执行几次”来表达业务流程。

## async def 与 def

选择 `async def` 还是 `def`，关键不是项目是否“异步”，而是依赖内部调用的库会不会阻塞。

### 调用异步 I/O

异步数据库、HTTP 或 Redis 客户端需要配合 `async def` 和 `await`。前面的 `valid_post_id` 就属于这种情况：

```python
async def load_remote_policy():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://example.com/policy")
    return response.json()
```

这类等待会把执行权交还事件循环，不会在等待期间卡住其他请求。

### 调用同步阻塞 I/O

如果只能使用同步客户端，就把依赖声明为普通 `def`。FastAPI 会在线程池中执行它：

```python
def load_remote_policy():
    response = requests.get(
        "https://example.com/policy",
        timeout=10,
    )
    return response.json()
```

不要在 `async def` 中直接调用同步阻塞函数：

```python
async def bad_dependency():
    return requests.get("https://example.com/policy")
```

上面的请求会阻塞事件循环。给它加上 `async` 并不会让同步库自动变成异步。

### 轻量计算与重 CPU 任务

只有参数归一化、字符串判断等轻量非阻塞逻辑时，两种声明都能工作：

```python
async def normalize_page(page: int = 1):
    return max(page, 1)
```

在异步应用里，把这种极轻逻辑写成 `async def` 可以避免一次不必要的线程池切换，但一致性和可读性通常比这点微小差异更重要。

大量图片处理、模型推理等重 CPU 工作不适合直接放进事件循环，也不应假定普通线程池就能解决。它们通常应交给进程池、任务队列或独立 worker。

可以归纳为：

| 依赖内部工作 | 推荐声明 |
| --- | --- |
| 异步 I/O 库 | `async def`，并使用 `await` |
| 同步阻塞 I/O 库 | `def`，由 FastAPI 放入线程池 |
| 极轻、非阻塞计算 | 两者都可，异步项目可用 `async def` |
| 重 CPU 计算 | 移出请求事件循环，交给专门执行单元 |

## 完整执行顺序

以同时需要文章所有权、活跃创作者和后台任务的路由为例：

```python
from fastapi import BackgroundTasks


@router.get("/posts/{post_id}")
async def get_user_post(
    background_tasks: BackgroundTasks,
    post: OwnedPost,
    user: ActiveCreator,
):
    background_tasks.add_task(send_email, user["id"])
    return post
```

一次成功请求大致经过：

```text
1. FastAPI 匹配路由，读取并校验 post_id
2. 解析 valid_owned_post 的子依赖
   - valid_post_id 查询文章并确认存在
   - oauth2_scheme 读取 Authorization
   - parse_jwt_data 解析当前用户身份
3. valid_owned_post 检查文章所有权
4. 解析 valid_active_creator
   - 复用本次请求中的 parse_jwt_data 结果
   - 查询用户并检查 active / creator 状态
5. 所有前置条件成功后，调用 get_user_post
6. 路由登记后台任务并返回文章
7. FastAPI 序列化并发送响应
8. 响应发送后执行已登记的后台任务
```

真正需要依赖的顺序约束是：

```text
子依赖 -> 父依赖 -> 路由
```

两个互不依赖的兄弟节点先后顺序不应当作业务契约。如果业务要求 A 必须先于 B，就让 B 显式依赖 A，或者把它们放进同一个有明确顺序的 service 操作。

任一依赖抛出异常时，依赖它的节点和路由都不会执行。例如文章不存在时，不会进入 `valid_owned_post`，更不会调用路由。

## 最小设计原则

依赖拆分的目标是表达可复用的前置条件，不是把每一行代码都包装成函数。

优先遵守以下原则：

1. **一个依赖表达一个有名字的要求。** 例如“已登录”“文章存在”“拥有文章”，而不是模糊的 `validate_everything`。
2. **返回已经验证过的对象。** 查到文章后直接注入文章，避免路由重复查询。
3. **通过链式依赖组合要求。** 让“拥有文章”复用“文章存在”和“身份已解析”。
4. **验证依赖尽量无副作用。** 创建订单、发送消息等写操作应放在明确的业务命令中。
5. **只拆真正会复用或独立变化的逻辑。** 一次性的两行转换没有必要形成复杂依赖图。
6. **路由保留请求语义。** 路由应清楚展示它需要哪些前置条件，以及成功后执行什么业务动作。

最后可以用这组对照记忆：

```text
Pydantic：输入长得对不对？
Depends：请求所需的对象和业务前置条件是否成立？
Service：具体业务规则和操作如何执行？
```

如果路径中声明了 `{user_id}`，就必须验证它与登录用户或资源所有者的关系；如果权限只以 Token 中的当前用户为准，应删除没有被使用的 `user_id`，避免接口表达出不存在的约束。
