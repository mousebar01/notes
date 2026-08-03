# FastAPI 快速上手

这篇笔记记录 FastAPI 入门阶段真正需要掌握的内容：先把服务跑起来，再理解参数和数据校验，最后把单文件练习拆成可以继续扩展的项目结构。

参考项目：[FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices)

## 学习路线

1. 安装环境并运行第一个接口
2. 用一个小项目练习 CRUD
3. 理解路径参数、查询参数、请求体和 Pydantic 校验
4. 用 `schemas`、`services`、`routers` 拆分代码

第一阶段先用 Python 列表模拟数据，不急着接数据库。

## 1. 运行第一个 FastAPI 应用

### 安装环境

建议先创建虚拟环境：

```bash
python -m venv .venv
```

激活虚拟环境：

```bash
# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

安装 FastAPI 和 Uvicorn：

```bash
pip install fastapi uvicorn
```

- `fastapi` 用来写接口
- `uvicorn` 用来启动服务

### 创建应用

新建 `main.py`：

```python
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {"message": "Hello FastAPI"}
```

启动服务：

```bash
uvicorn main:app --reload
```

这条命令里：

```text
main        对应 main.py
app         对应文件里的 app 变量
--reload    代码修改后自动重启
```

打开 `http://127.0.0.1:8000`，应该能看到：

```json
{
  "message": "Hello FastAPI"
}
```

FastAPI 会自动生成接口文档：

- Swagger UI：`http://127.0.0.1:8000/docs`
- ReDoc：`http://127.0.0.1:8000/redoc`

刚开始主要使用 `/docs` 即可，它既能查看参数，也能直接发送请求。

## 2. 用一个小项目练习 CRUD

下面把查询、创建、更新和删除放进同一个用户管理示例。先让它完整运行，再理解每个参数从哪里来。

将 `main.py` 改成：

```python
from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel, Field

app = FastAPI(title="用户管理 API")


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=20)
    age: int = Field(ge=0, le=150)
    nickname: str | None = None


users = [
    {
        "id": 1,
        "name": "张三",
        "age": 20,
        "nickname": None,
    }
]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/users")
def get_users(keyword: str | None = None, page: int = 1):
    result = users
    if keyword:
        result = [user for user in users if keyword in user["name"]]

    page_size = 10
    start = (page - 1) * page_size
    return result[start : start + page_size]


@app.get("/users/{user_id}")
def get_user(user_id: int):
    for user in users:
        if user["id"] == user_id:
            return user

    raise HTTPException(status_code=404, detail="用户不存在")


@app.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate):
    user = {
        "id": len(users) + 1,
        **data.model_dump(),
    }
    users.append(user)
    return user


@app.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: UserCreate,
    notify: bool = False,
):
    for user in users:
        if user["id"] == user_id:
            user.update(data.model_dump())
            return {"user": user, "notify": notify}

    raise HTTPException(status_code=404, detail="用户不存在")


@app.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_user(user_id: int):
    for index, user in enumerate(users):
        if user["id"] == user_id:
            users.pop(index)
            return Response(status_code=status.HTTP_204_NO_CONTENT)

    raise HTTPException(status_code=404, detail="用户不存在")
```

重新打开 `/docs`，依次测试：

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 检查服务是否正常 |
| `GET` | `/users` | 查询用户列表 |
| `GET` | `/users/{user_id}` | 查询一个用户 |
| `POST` | `/users` | 创建用户 |
| `PUT` | `/users/{user_id}` | 更新用户 |
| `DELETE` | `/users/{user_id}` | 删除用户 |

这个例子里用到的状态码不多，先记住这些：

| 状态码 | 含义 |
| --- | --- |
| `200` | 请求成功 |
| `201` | 创建成功 |
| `204` | 操作成功，没有响应正文 |
| `404` | 资源不存在 |
| `422` | 参数或请求体校验失败 |
| `500` | 服务内部异常 |

资源不存在时，用 `HTTPException` 主动返回 `404`；参数不符合类型或约束时，FastAPI 会自动返回校验错误。

## 3. 理解参数和数据校验

### 三种常见传参方式

可以先记住这张对照表：

| 传参方式 | 示例 | 适合场景 |
| --- | --- | --- |
| 路径参数 | `/users/1` | 指定一个具体资源 |
| 查询参数 | `/users?keyword=张&page=1` | 搜索、筛选和分页 |
| 请求体 | 请求中的 JSON | 创建或更新结构化数据 |

在更新接口中，这三种参数可以同时出现：

```python
@app.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: UserCreate,
    notify: bool = False,
):
    ...
```

请求可以是：

```text
PUT /users/1?notify=true
```

并携带 JSON：

```json
{
  "name": "李四",
  "age": 25,
  "nickname": "小李"
}
```

对应关系是：

```text
user_id = 1       来自路径
notify = true     来自查询字符串
data              来自 JSON 请求体
```

FastAPI 会根据路由、参数类型和 Pydantic 模型判断数据来源。

### Pydantic 负责什么

`BaseModel` 定义请求体的数据结构，FastAPI 负责接收 JSON，Pydantic 负责转换和校验。

```python
class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=20)
    age: int = Field(ge=0, le=150)
    nickname: str | None = None
```

这里的规则是：

- `name` 没有默认值，所以必填，长度为 2 到 20 个字符
- `age` 没有默认值，所以必填，数值为 0 到 150
- `nickname` 的默认值是 `None`，所以可以不传，也可以传 `null`

如果希望年龄不传时默认为 18，可以写：

```python
age: int = Field(default=18, ge=0, le=150)
```

我的理解是：**是否必填主要看有没有默认值，`Field` 再补充长度、范围等业务约束。** 这样很多校验不需要手写 `if`。

例如，下面的数据会因为名字太短、年龄超出范围而校验失败：

```json
{
  "name": "张",
  "age": 200
}
```

## 4. 按职责拆分项目

单文件适合学习，但接口变多后，路由、数据格式和业务处理最好分开。一个简单结构是：

```text
project/
├── main.py
├── routers/
│   ├── __init__.py
│   └── users.py
├── schemas/
│   ├── __init__.py
│   └── users.py
└── services/
    ├── __init__.py
    └── users.py
```

### `schemas/users.py`：定义数据格式

```python
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=20)
    age: int = Field(ge=0, le=150)
    nickname: str | None = None
```

`schema` 只回答“数据应该长什么样”。

### `services/users.py`：处理业务逻辑

```python
from schemas.users import UserCreate

users = [{"id": 1, "name": "张三", "age": 20, "nickname": None}]


def create_user(data: UserCreate) -> dict:
    user = {
        "id": len(users) + 1,
        **data.model_dump(),
    }
    users.append(user)
    return user
```

`service` 负责真正的查询、创建、更新和删除。以后接数据库，主要也是替换这一层。

### `routers/users.py`：接收请求

```python
from fastapi import APIRouter, status

from schemas.users import UserCreate
from services.users import create_user

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", status_code=status.HTTP_201_CREATED)
def add_user(data: UserCreate):
    return create_user(data)
```

`router` 负责 HTTP 层：接收请求、调用 service、返回结果。这里尽量不要堆大量业务处理。

### `main.py`：注册路由

```python
from fastapi import FastAPI

from routers.users import router as users_router

app = FastAPI(title="用户管理 API")
app.include_router(users_router)
```

`APIRouter` 把同一类接口组织在一起，`include_router()` 再把它注册到主应用。完整调用过程是：

```text
客户端提交 JSON
→ schema 校验数据
→ router 接收请求
→ service 处理业务
→ router 返回结果
```

我会把四层职责记成：

```text
schema    数据长什么样
router    请求从哪里进
service   具体怎么处理
main      把各模块装进应用
```

## 5. 第一阶段完成标准

做到下面这些，就可以继续学习数据库和依赖注入：

- 能启动 FastAPI，并使用 `/docs` 测试接口
- 能区分路径参数、查询参数和请求体
- 能使用 Pydantic 与 `Field` 定义校验规则
- 能实现基本 CRUD，并正确返回 `404` 等状态
- 能用 `APIRouter` 拆分接口
- 能说清 `schema`、`router`、`service` 和 `main` 的职责
