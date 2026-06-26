比较好的FastAPI文档
https://github.com/zhanymkanov/fastapi-best-practices.git
## 1. 安装环境

建议新建虚拟环境：

```bash
python -m venv .venv
```

激活：

Windows：

```bash
.venv\Scripts\activate
```

macOS / Linux：

```bash
source .venv/bin/activate
```

安装 FastAPI 和 Uvicorn：

```bash
pip install fastapi uvicorn
```

其中：

* `fastapi`：写接口
* `uvicorn`：启动服务器

---

## 2. 创建第一个应用

新建 `main.py`：

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Hello FastAPI"}
```

启动：

```bash
uvicorn main:app --reload
```

这里：

```text
main        表示 main.py
app         表示文件里的 app 变量
--reload    修改代码后自动重启
```

打开：

```text
http://127.0.0.1:8000
```

会看到：

```json
{
  "message": "Hello FastAPI"
}
```
---

## 3. Swagger 接口文档

FastAPI 会自动生成接口文档。

打开：

```text
http://127.0.0.1:8000/docs
```

这里可以直接测试接口。

另一个文档页面是：

```text
http://127.0.0.1:8000/redoc
```

刚开始主要使用 `/docs` 就够了。

---

## 4. 学习 GET 接口

GET 一般用于查询数据。

```python
@app.get("/users")
def get_users():
    return [
        {"id": 1, "name": "张三"},
        {"id": 2, "name": "李四"},
    ]
```

访问：

```text
GET http://127.0.0.1:8000/users
```

返回：

```json
[
  {
    "id": 1,
    "name": "张三"
  },
  {
    "id": 2,
    "name": "李四"
  }
]
```

---

## 5. 路径参数

路径参数是地址的一部分。

```python
@app.get("/users/{user_id}")
def get_user(user_id: int):
    return {
        "id": user_id,
        "name": f"用户{user_id}"
    }
```

访问：

```text
GET /users/10
```

返回：

```json
{
  "id": 10,
  "name": "用户10"
}
```

这里的：

```python
user_id: int
```

表示 `user_id` 必须是整数。

访问：

```text
/users/abc
```

FastAPI 会自动返回参数错误。

---

## 6. 查询参数

查询参数通常写在 `?` 后面。

```python
@app.get("/search")
def search(keyword: str, page: int = 1):
    return {
        "keyword": keyword,
        "page": page
    }
```

访问：

```text
/search?keyword=python&page=2
```

返回：

```json
{
  "keyword": "python",
  "page": 2
}
```

其中：

```python
keyword: str
```

没有默认值，所以是必填参数。

```python
page: int = 1
```

有默认值，所以可以不传。

例如：

```text
/search?keyword=python
```

此时 `page` 自动是 `1`。

---

## 7. POST 和请求体

POST 一般用于创建数据或提交数据。

先定义请求数据格式：

```python
from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    age: int
```

然后写接口：

```python
@app.post("/users")
def create_user(user: UserCreate):
    return {
        "message": "创建成功",
        "user": user
    }
```

发送 JSON：

```json
{
  "name": "张三",
  "age": 20
}
```

返回：

```json
{
  "message": "创建成功",
  "user": {
    "name": "张三",
    "age": 20
  }
}
```

这里的 `UserCreate` 就是请求体模型。

FastAPI 会自动检查：

* `name` 是否存在
* `name` 是否是字符串
* `age` 是否是整数

---

## 8. PUT 接口

PUT 一般用于更新已有数据。

```python
class UserUpdate(BaseModel):
    name: str
    age: int


@app.put("/users/{user_id}")
def update_user(user_id: int, user: UserUpdate):
    return {
        "message": "更新成功",
        "id": user_id,
        "user": user
    }
```

请求：

```text
PUT /users/1
```

请求体：

```json
{
  "name": "新的名字",
  "age": 21
}
```

---

## 9. DELETE 接口

DELETE 一般用于删除数据。

```python
@app.delete("/users/{user_id}")
def delete_user(user_id: int):
    return {
        "message": "删除成功",
        "id": user_id
    }
```

请求：

```text
DELETE /users/1
```

---

## 10. HTTP 状态码

接口不只有返回数据，还应该返回合适的状态码。

常见状态码：

| 状态码   | 含义        |
| ----- | --------- |
| `200` | 请求成功      |
| `201` | 创建成功      |
| `204` | 成功但没有返回内容 |
| `400` | 请求错误      |
| `404` | 数据不存在     |
| `422` | 参数验证失败    |
| `500` | 服务器错误     |

创建接口可以写：

```python
from fastapi import status


@app.post(
    "/users",
    status_code=status.HTTP_201_CREATED
)
def create_user(user: UserCreate):
    return {
        "message": "创建成功",
        "user": user
    }
```

删除接口可以返回 `204`：

```python
from fastapi import Response


@app.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_user(user_id: int):
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

---

## 11. 返回 404 错误

使用 `HTTPException`：

```python
from fastapi import HTTPException


@app.get("/users/{user_id}")
def get_user(user_id: int):
    if user_id != 1:
        raise HTTPException(
            status_code=404,
            detail="用户不存在"
        )

    return {
        "id": 1,
        "name": "张三"
    }
```

访问：

```text
/users/2
```

返回：

```json
{
  "detail": "用户不存在"
}
```

---

## 12. 使用 APIRouter 拆分路由

当接口多了，不要全部写在 `main.py`。

目录：

```text
project/
├── main.py
└── routers/
    ├── __init__.py
    └── users.py
```

`routers/users.py`：

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(
    prefix="/users",
    tags=["users"]
)


class UserCreate(BaseModel):
    name: str
    age: int


@router.get("/")
def get_users():
    return [
        {"id": 1, "name": "张三"}
    ]


@router.get("/{user_id}")
def get_user(user_id: int):
    if user_id != 1:
        raise HTTPException(
            status_code=404,
            detail="用户不存在"
        )

    return {
        "id": 1,
        "name": "张三"
    }


@router.post("/")
def create_user(user: UserCreate):
    return {
        "message": "创建成功",
        "user": user
    }
```

`main.py`：

```python
from fastapi import FastAPI

from routers.users import router as users_router

app = FastAPI()

app.include_router(users_router)


@app.get("/")
def root():
    return {"message": "FastAPI 服务运行中"}
```

这样用户接口就集中放在 `users.py`。

---

## 13. 一个完整练习版本

你可以先写这个小项目：

```python
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

app = FastAPI(title="用户管理 API")


class UserCreate(BaseModel):
    name: str
    age: int


users = [
    {
        "id": 1,
        "name": "张三",
        "age": 20
    }
]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/users")
def get_users():
    return users


@app.get("/users/{user_id}")
def get_user(user_id: int):
    for user in users:
        if user["id"] == user_id:
            return user

    raise HTTPException(
        status_code=404,
        detail="用户不存在"
    )


@app.post(
    "/users",
    status_code=status.HTTP_201_CREATED
)
def create_user(data: UserCreate):
    user = {
        "id": len(users) + 1,
        "name": data.name,
        "age": data.age
    }

    users.append(user)

    return user


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


@app.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_user(user_id: int):
    for index, user in enumerate(users):
        if user["id"] == user_id:
            users.pop(index)
            return

    raise HTTPException(
        status_code=404,
        detail="用户不存在"
    )
```

启动：

```bash
uvicorn main:app --reload
```

然后在 `/docs` 里依次测试：

```text
GET    /health
GET    /users
GET    /users/{user_id}
POST   /users
PUT    /users/{user_id}
DELETE /users/{user_id}
```

## 第一阶段学完的标准

做到下面这些就可以进入下一阶段：

* 会启动 FastAPI
* 会写 GET、POST、PUT、DELETE
* 会使用路径参数和查询参数
* 会接收 JSON 请求体
* 会返回 JSON
* 会返回 404 等错误
* 会设置状态码
* 会使用 Swagger 测试接口
* 会用 `APIRouter` 拆分文件

这一阶段暂时不需要数据库，先用 Python 列表模拟数据即可。
