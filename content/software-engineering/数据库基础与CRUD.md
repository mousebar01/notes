# 数据库基础与 CRUD 实践指南

此笔记总结了关系型数据库的基础操作（基于 Python `sqlite3` 与 FastAPI 的 CRUD 实践）以及面试常见的数据库核心概念（“八股”）。

---

## 1. 基于 SQLite3 与 FastAPI 的极简 CRUD 实践

在学习阶段，我们先直接使用内置的 `sqlite3` 模块进行操作，不引入 ORM 框架（如 SQLAlchemy），这样能看清 SQL 语句的执行本质。

### 1.1 数据表创建
```python
import sqlite3

# 连接数据库（若文件不存在会自动创建）
conn = sqlite3.connect("app.db")

# 创建 users 表
conn.execute("""
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER NOT NULL
)
""")

conn.commit()
conn.close()
```

### 1.2 Create：新增数据
使用参数占位符 `?` 可以有效防止 SQL 注入攻击。
```python
@app.post("/users", status_code=201)
def create_user(data: UserCreate):
    conn = sqlite3.connect("app.db")
    cursor = conn.execute(
        "INSERT INTO users (name, age) VALUES (?, ?)",
        (data.name, data.age),
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    return {
        "id": user_id,
        "name": data.name,
        "age": data.age,
    }
```

### 1.3 Read：查询数据
#### 查询单条记录
> [!IMPORTANT]
> 当 SQL 占位符元组中只有一个元素时，必须在结尾加上逗号，如 `(user_id,)`，否则 Python 不会将其识别为元组。
```python
@app.get("/users/{user_id}")
def get_user(user_id: int):
    conn = sqlite3.connect("app.db")
    # 使返回结果可以通过 dict 转换成键值对字典形式
    conn.row_factory = sqlite3.Row

    user = conn.execute(
        "SELECT * FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    conn.close()

    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    return dict(user)
```

#### 查询全部记录
```python
@app.get("/users")
def get_users():
    conn = sqlite3.connect("app.db")
    conn.row_factory = sqlite3.Row
    users = conn.execute("SELECT * FROM users").fetchall()
    conn.close()

    return [dict(user) for user in users]
```

### 1.4 Update：更新数据
通过 `cursor.rowcount` 判断受影响的行数，若为 0 说明更新的目标记录不存在。
```python
@app.put("/users/{user_id}")
def update_user(user_id: int, data: UserCreate):
    conn = sqlite3.connect("app.db")
    cursor = conn.execute(
        "UPDATE users SET name = ?, age = ? WHERE id = ?",
        (data.name, data.age, user_id),
    )
    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="用户不存在")

    return {
        "id": user_id,
        "name": data.name,
        "age": data.age,
    }
```

### 1.5 Delete：删除数据
```python
@app.delete("/users/{user_id}")
def delete_user(user_id: int):
    conn = sqlite3.connect("app.db")
    cursor = conn.execute(
        "DELETE FROM users WHERE id = ?",
        (user_id,),
    )
    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="用户不存在")

    return {"message": "删除成功"}
```

---

## 2. 关系型数据库核心概念（“面试八股”）

在实际面试与系统设计中，除了 CRUD 操作层，以下底层概念是考察的重点：

### 2.1 事务与 ACID 特性
事务是一组原子性的操作，要么全部成功，要么全部失败（例如：银行转账中 A 扣钱与 B 加钱必须是统一整体）。
- **A (Atomicity) 原子性**：所有操作要么全部成功，要么全部失败并回滚。
- **C (Consistency) 一致性**：事务执行前后，数据库的完整性约束与规则没有被破坏。
- **I (Isolation) 隔离性**：并发执行的事务之间互不干扰。
- **D (Durability) 持久性**：事务一旦提交，数据就会永久保存到磁盘，即使系统崩溃也不丢失。

### 2.2 索引（Index）
- **基本作用**：像书本的目录一样，用于快速检索数据，避免全表扫描。
- **代价**：索引不是越多越好，它会占用物理存储空间，且会降低 `INSERT`、`UPDATE`、`DELETE` 等写入操作的速度（因为需要同步维护索引树）。
- **常见考察点**：最左前缀原则、联合索引、索引失效的场景（如在索引列上做计算或 `OR` 查询）。

### 2.3 键的概念
- **主键 (Primary Key)**：唯一标识表中每一行数据的字段，不能为 NULL。
- **外键 (Foreign Key)**：用于建立两个表之间的关联，指向另一张表的主键，保证引用的完整性。
- **唯一键 (Unique Key)**：约束字段值在表中必须唯一，但允许有 NULL 值。

### 2.4 SQL JOIN
- **INNER JOIN**：仅返回左右两表中完全匹配的行。
- **LEFT JOIN**：返回左表的所有行及右表中匹配的行，右表无匹配的显示为 NULL。
- **RIGHT JOIN**：返回右表的所有行及左表中匹配的行。

### 2.5 WHERE 与 HAVING 区别
- `WHERE`：在数据分组（`GROUP BY`）之前进行过滤。
- `HAVING`：在数据分组（`GROUP BY`）之后对分组结果进行过滤，常配合聚合函数（如 `COUNT`、`SUM`）使用。

### 2.6 数据删除方式对比
- **DELETE**：属于 DML 操作，可带 `WHERE` 逐行删除，执行速度较慢，会写入日志以支持事务回滚。
- **TRUNCATE**：属于 DDL 操作，清空整张表数据，不带条件，速度快且不记录逐行回滚日志。
- **DROP**：属于 DDL 操作，直接删除整张表结构和数据，释放物理空间。

### 2.7 数据库并发问题与隔离级别
#### 并发问题
- **脏读**：事务 A 读到了事务 B 尚未提交的数据。
- **不可重复读**：同一事务中，前后读取同一条记录的值不同（中途被别人修改并提交了）。
- **幻读**：同一事务中，前后执行相同查询发现记录总行数不同（中途被别人插入或删除了记录）。

#### 四大隔离级别
1. **读未提交 (Read Uncommitted)**：允许脏读。
2. **读已提交 (Read Committed)**：解决脏读。
3. **可重复读 (Repeatable Read)**：解决脏读、不可重复读（MySQL 默认级别，通过 MVCC 很大程度上也避免了幻读）。
4. **串行化 (Serializable)**：强制事务排队执行，完全解决所有并发问题，但并发吞吐量极低。

### 2.8 悲观锁与乐观锁
- **悲观锁**：假定冲突概率很高，读取数据时就直接对记录加排他锁，其他事务只能等待（如 `SELECT ... FOR UPDATE`）。
- **乐观锁**：假定冲突概率很低，不加锁，仅在提交更新时通过版本号（Version）或时间戳校验中途是否有他人修改。若有修改则更新失败，由应用层决定重试或报错。

### 2.9 慢查询分析与优化
数据库变慢的常见原因：
- 缺失索引或索引失效。
- SQL 中使用了 `SELECT *` 导致多余的数据传输与磁盘 I/O。
- 表连接（JOIN）过多或对超大表进行深分页查询（如 `LIMIT 100000, 20`，建议使用主键过滤 `WHERE id > 100000 LIMIT 20`）。
