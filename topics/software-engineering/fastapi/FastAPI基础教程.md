## FastAPI 第一阶段简要笔记

FastAPI 用来写 Python 接口，Uvicorn 用来启动服务。

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

users = [{"id": 1, "name": "张三", "age": 20}]


class UserCreate(BaseModel):
    name: str
    age: int


@app.get("/")
def root():
    return {"message": "hello fastapi"}


@app.get("/users/{user_id}")
def get_user(user_id: int):
    for user in users:
        if user["id"] == user_id:
            return user

    raise HTTPException(status_code=404, detail="用户不存在")


@app.post("/users", status_code=201)
def create_user(data: UserCreate):
    user = {"id": len(users) + 1, **data.model_dump()}
    users.append(user)
    return user
```

启动：

```bash
uvicorn main:app --reload
```

接口文档：

```text
http://127.0.0.1:8000/docs
```

核心理解：

```text
GET：查询
POST：创建
PUT：更新
DELETE：删除
```

常见状态码：

```text
200 成功
201 创建成功
404 资源不存在
422 参数错误
500 服务器异常
```

`/users/{user_id}` 中的 `{user_id}` 是路径变量。FastAPI 会把 Python 字典自动转换成 JSON。

你记得的 `?` 是**查询参数**。

例如：

```text
/users?name=张三&age=20
```

其中：

* `?` 表示查询参数开始
* `name=张三` 是一个参数
* `&` 用来连接多个参数
* `age=20` 是另一个参数

FastAPI 写法：

```python
@app.get("/users")
def get_users(name: str | None = None, age: int | None = None):
    return {"name": name, "age": age}
```

访问：

```text
/users?name=张三&age=20
```

结果：

```json
{
  "name": "张三",
  "age": 20
}
```

区别是：

```text
/users/1          路径参数，指定某个用户
/users?name=张三   查询参数，用来筛选或搜索
```


除了基本地指令之外，还需要了解请求体和pydantic
请求体是作用于http层地
pyditic是用于接收和验证请求体参数的。
除此之外，还需要增加Field做限制。
接下来重点看 **请求体（Request Body）和 Pydantic**。

你可以把三种传参方式这样区分：

```text
路径参数：/users/1
查询参数：/users?name=张三
请求体：POST /users，并附带一段 JSON
```

## 1. 什么是请求体

请求体就是客户端发送给服务器的一整块数据。

例如创建用户时，前端提交：

```json
{
  "name": "张三",
  "age": 20
}
```

这段 JSON 不写在网址里，而是放在 HTTP 请求内部。

通常：

```text
GET     主要获取数据
POST    常用请求体创建数据
PUT     常用请求体更新数据
PATCH   常用请求体局部更新
```

## 2. FastAPI 怎么接收请求体

先定义一个数据模型：

```python
from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    age: int
```

再把它写到接口参数里：

```python
@app.post("/users")
def create_user(data: UserCreate):
    return data
```

当客户端提交：

```json
{
  "name": "张三",
  "age": 20
}
```

FastAPI 会自动把 JSON 转成 `data` 对象。

于是可以这样访问字段：

```python
data.name
data.age
```

例如：

```python
@app.post("/users")
def create_user(data: UserCreate):
    return {
        "username": data.name,
        "user_age": data.age
    }
```

## 3. Pydantic 是做什么的

Pydantic 负责定义和验证数据格式。

```python
class UserCreate(BaseModel):
    name: str
    age: int
```

含义是：

```text
name 必须存在，而且应该是字符串
age 必须存在，而且应该是整数
```

如果前端传：

```json
{
  "name": "张三",
  "age": 20
}
```

可以正常通过。

如果少传 `age`：

```json
{
  "name": "张三"
}
```

FastAPI 会返回 `422`，表示请求数据验证失败。

如果传错类型：

```json
{
  "name": "张三",
  "age": "不是数字"
}
```

也会返回验证错误。

## 4. 必填字段和可选字段

没有默认值就是必填：

```python
class UserCreate(BaseModel):
    name: str
    age: int
```

有默认值就可以不传：

```python
class UserCreate(BaseModel):
    name: str
    age: int = 18
```

前端只传：

```json
{
  "name": "张三"
}
```

那么：

```python
data.age
```

就是 `18`。

可选字段可以写成：

```python
class UserCreate(BaseModel):
    name: str
    age: int | None = None
```

这表示 `age` 可以不传，也可以传 `null`。

## 5. 限制字段内容

可以使用 `Field` 增加规则：

```python
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=20)
    age: int = Field(ge=0, le=150)
```

这里：

```text
name 最少 2 个字符，最多 20 个字符
age 必须在 0 到 150 之间
```

如果提交：

```json
{
  "name": "张",
  "age": 200
}
```

FastAPI 会自动返回错误，不需要你自己写很多 `if` 判断。

## 6. 请求体、路径参数可以一起用

更新用户时，经常同时使用：

```python
@app.put("/users/{user_id}")
def update_user(user_id: int, data: UserCreate):
    return {
        "id": user_id,
        "name": data.name,
        "age": data.age
    }
```

请求示例：

```text
PUT /users/1
```

请求体：

```json
{
  "name": "李四",
  "age": 25
}
```

这里：

```text
user_id 来自路径
data 来自 JSON 请求体
```

## 7. 查询参数、路径参数、请求体也能同时出现

例如：

```python
@app.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: UserCreate,
    notify: bool = False
):
    return {
        "user_id": user_id,
        "data": data,
        "notify": notify
    }
```

访问：

```text
PUT /users/1?notify=true
```

请求体：

```json
{
  "name": "张三",
  "age": 20
}
```

对应关系：

```text
user_id = 1              路径参数
notify = true            查询参数
data                     请求体
```

FastAPI 会根据参数的位置和类型自动判断来源。

## 8. 前端怎么发送请求体

JavaScript 可以这样写：

```javascript
fetch("http://127.0.0.1:8000/users", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    name: "张三",
    age: 20
  })
})
```

重点是：

```javascript
method: "POST"
```

表示发送 POST 请求。

```javascript
Content-Type: application/json
```

表示请求体是 JSON。

```javascript
JSON.stringify(...)
```

把 JavaScript 对象转换成 JSON 字符串。

## 9. 一个完整最小例子

```python
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=20)
    age: int = Field(ge=0, le=150)


@app.post("/users", status_code=201)
def create_user(data: UserCreate):
    return {
        "id": 1,
        "name": data.name,
        "age": data.age
    }
```

在 `/docs` 中测试，提交：

```json
{
  "name": "张三",
  "age": 20
}
```

返回：

```json
{
  "id": 1,
  "name": "张三",
  "age": 20
}
```

## 10. 最核心的理解

记住这张对照：

| 传参方式 | 示例               | 适合场景      |
| ---- | ---------------- | --------- |
| 路径参数 | `/users/1`       | 指定某个资源    |
| 查询参数 | `/users?name=张三` | 搜索、筛选、分页  |
| 请求体  | JSON             | 创建、更新复杂数据 |

一句话总结：

> Pydantic 先规定“前端必须传什么数据”，FastAPI 再自动接收、转换和验证这段 JSON。
接下来学习 **PUT 更新** 和 **DELETE 删除**。

## 1. PUT：更新数据

`PUT` 通常用于更新已有资源。

```python
@app.put("/users/{user_id}")
def update_user(user_id: int, data: UserCreate):
    for user in users:
        if user["id"] == user_id:
            user["name"] = data.name
            user["age"] = data.age
            return user

    raise HTTPException(
        status_code=404,
        detail="用户不存在"
    )
```

请求：

```text
PUT /users/1
```

请求体：

```json
{
  "name": "李四",
  "age": 25
}
```

这里：

```text
user_id 来自路径
data 来自 JSON 请求体
```

执行流程：

```text
查找用户
→ 找到就修改
→ 返回修改后的数据
→ 找不到就返回 404
```

## 2. DELETE：删除数据

```python
@app.delete("/users/{user_id}")
def delete_user(user_id: int):
    for index, user in enumerate(users):
        if user["id"] == user_id:
            users.pop(index)
            return {"message": "删除成功"}

    raise HTTPException(
        status_code=404,
        detail="用户不存在"
    )
```

请求：

```text
DELETE /users/1
```

这里使用：

```python
enumerate(users)
```

可以同时拿到：

```text
index：列表位置
user：当前用户
```

然后：

```python
users.pop(index)
```

删除对应位置的数据。

## 3. 为什么 DELETE 常用 204

如果删除成功后不需要返回内容，可以写：

```python
from fastapi import Response, status

@app.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_user(user_id: int):
    for index, user in enumerate(users):
        if user["id"] == user_id:
            users.pop(index)
            return Response(status_code=204)

    raise HTTPException(
        status_code=404,
        detail="用户不存在"
    )
```

`204` 表示：

> 操作成功，但没有返回正文。

刚学习时，返回：

```json
{"message": "删除成功"}
```

也完全可以。

## 4. PUT 和 POST 的区别

```text
POST：创建新数据
PUT：更新已有数据
```

例如：

```text
POST /users
创建一个新用户

PUT /users/1
更新 id 为 1 的用户
```

## 5. 现在已经掌握的内容

```text
GET：查询
POST：创建
PUT：更新
DELETE：删除
```

这四个操作通常叫做：

```text
CRUD
```

对应：

```text
Create 创建
Read 查询
Update 更新
Delete 删除
```

随着接口越来越多，这个时候就需要拆分
将接口按照功能拆分成多个不同的路由
接下来学习 **APIRouter：把接口拆分到不同文件**。

## 为什么要拆分

接口少时可以都写在 `main.py`。

接口多了以后，继续全写在一起会很乱。通常按功能拆分：

```text
项目/
├── main.py
└── routers/
    ├── __init__.py
    └── users.py
```

## `routers/users.py`

```python
from fastapi import APIRouter

router = APIRouter(
    prefix="/users",
    tags=["users"],
)


@router.get("/")
def get_users():
    return [{"id": 1, "name": "张三"}]
```

这里：

```python
prefix="/users"
```

表示这个文件里的接口都自动加上 `/users` 前缀。

所以：

```python
@router.get("/")
```

实际地址是：

```text
/users/
```

## `main.py`

```python
from fastapi import FastAPI
from routers.users import router as users_router

app = FastAPI()

app.include_router(users_router)
```

`include_router()` 表示把用户接口注册到主应用中。

## 核心理解

```text
main.py
负责创建 FastAPI 应用

routers/users.py
负责用户相关接口

include_router()
把拆分的接口加载进主应用
```

以后还可以继续拆：

```text
routers/
├── users.py
├── products.py
└── tasks.py
```

对应：

```text
/users
/products
/tasks
```

这样项目更清晰，也方便维护。
接口，业务和数据不要放在同一个文件夹里，要分开管理。

接着看 **schemas 和 services 分层**。

## 1. schemas：定义数据格式

`schemas/users.py`

```python
from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    age: int
```

作用：

> 规定前端传来的 JSON 必须有哪些字段、字段是什么类型。

例如前端要传：

```json
{
  "name": "张三",
  "age": 20
}
```

---

## 2. services：处理业务逻辑

`services/users.py`

```python
users = [
    {"id": 1, "name": "张三", "age": 20}
]


def create_user(data):
    user = {
        "id": len(users) + 1,
        "name": data.name,
        "age": data.age,
    }

    users.append(user)
    return user
```

作用：

> 真正处理创建、查询、更新、删除。

以后接数据库，也主要改这里。

---

## 3. routers：接收请求

`routers/users.py`

```python
from fastapi import APIRouter

from schemas.users import UserCreate
from services.users import create_user

router = APIRouter(prefix="/users")


@router.post("/")
def add_user(data: UserCreate):
    return create_user(data)
```

作用：

> 接收 HTTP 请求，调用业务逻辑，再返回结果。

Router 尽量不要写大量处理代码。

---

## 4. main.py：注册路由

```python
from fastapi import FastAPI
from routers.users import router

app = FastAPI()
app.include_router(router)
```

---

## 5. 整体流程

```text
前端提交 JSON
→ schema 验证数据
→ router 接收请求
→ service 处理业务
→ router 返回结果
```

可以记成：

```text
schema：数据长什么样
router：请求从哪里进
service：具体怎么处理
main：把模块装进应用
```

SQLAlchemy 和 SQLite 的关系可以理解成：

> **SQLite 是数据库，SQLAlchemy 是 Python 操作数据库的工具。**

类比一下：

```text
SQLite      = 仓库
SQLAlchemy  = 搬运和管理货物的工具
```

你也可以不用 SQLAlchemy，直接用 Python 自带的 `sqlite3`：

```python
import sqlite3

conn = sqlite3.connect("app.db")
cursor = conn.cursor()

cursor.execute(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)"
)
```

这叫直接写 SQL。

而 SQLAlchemy 会把数据库表包装成 Python 类：

```python
class User(Base):
    __tablename__ = "users"

    id = mapped_column(primary_key=True)
    name = mapped_column()
```

然后这样操作：

```python
user = User(name="张三")
db.add(user)
db.commit()
```

所以：

| 名称         | 作用                           |
| ---------- | ---------------------------- |
| SQLite     | 真正保存数据                       |
| `app.db`   | SQLite 数据库文件                 |
| SQL        | 操作数据库的语言                     |
| `sqlite3`  | Python 直接操作 SQLite           |
| SQLAlchemy | 用统一的 Python 方式操作 SQLite 等数据库 |

SQLAlchemy 不只支持 SQLite，还支持：

```text
SQLite
MySQL
PostgreSQL
Oracle
```

因此它的价值是：以后换数据库时，很多 Python 代码可以继续使用。

你当前入门可以先这样理解：

```text
FastAPI
→ SQLAlchemy
→ SQLite
→ app.db 文件
```

不过为了真正看懂数据库，我更建议你先学一点原生 SQLite：

```python
import sqlite3

conn = sqlite3.connect("app.db")
conn.execute(
    "INSERT INTO users (name) VALUES (?)",
    ("张三",),
)
conn.commit()
```

先明白“建表、插入、查询、更新、删除”，再看 SQLAlchemy 会容易很多。

