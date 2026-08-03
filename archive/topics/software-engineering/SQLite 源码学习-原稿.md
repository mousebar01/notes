# SQLite 源码学习

这篇记录 SQLite 源码学习中的几个核心概念，重点是理解 SQL 如何从字符串变成可执行的 VDBE 指令，以及这种分层设计对软件架构思维的启发。

## 架构概览

SQLite 主要可以先粗略理解成三部分：

- 语法解析
- 虚拟机
- BTree 存储

SQLite 的输入是字符串，字符串没办法直接执行，所以要先变成带有类型和结构的 token，再经过语法解析和代码生成，最后交给虚拟机执行，由虚拟机操作 BTree。

## VDBE 是什么

Virtual Database Engine（虚拟数据库引擎）

VDBE 是 SQLite 最核心的东西之一。

它的全称是：

> **Virtual Database Engine（虚拟数据库引擎）**

或者你可以简单理解成：

> **SQLite 自己写的一个 CPU。**

---

## 为什么需要 VDBE？

因为 SQL 不是计算机能直接执行的语言。

例如：

```sql
SELECT name
FROM user
WHERE id = 1;
```

CPU 根本不知道：

* 什么是 `SELECT`
* 什么是 `FROM`
* 什么是 `WHERE`

所以 SQLite 会先把 SQL **编译**成自己定义的一套"机器指令"。

流程就是：

```text
SQL

↓

编译

↓

VDBE 指令

↓

VDBE 执行
```

---

## 和 JVM 很像

如果学过 Java，就很好理解。

Java：

```text
Java源码

↓

javac

↓

Bytecode

↓

JVM
```

SQLite：

```text
SQL

↓

Code Generator

↓

VDBE Bytecode

↓

VDBE
```

只是：

Java 的虚拟机执行 Java 字节码。

SQLite 的虚拟机执行数据库字节码。

---

## VDBE 指令长什么样？

例如：

```sql
SELECT * FROM user;
```

最终可能会生成类似这样的指令（简化）：

```text
OpenRead     user
Rewind
Column       0
Column       1
ResultRow
Next
Halt
```

可以理解成：

```
打开 user 表

↓

移动到第一行

↓

读取第1列

↓

读取第2列

↓

输出这一行

↓

下一行

↓

结束
```

是不是已经有点像汇编了？

---

## 为什么不直接操作 BTree？

这是最关键的一点。

假设没有 VDBE。

那么：

```sql
SELECT

INSERT

UPDATE

DELETE

CREATE

DROP
```

每一种 SQL 都要自己写一套：

```text
Parser

↓

BTree

↓

Pager
```

代码会变成：

```
SELECT 自己访问 BTree

INSERT 自己访问 BTree

UPDATE 自己访问 BTree

DELETE 自己访问 BTree
```

大量重复。

所以 SQLite 统一规定：

**所有 SQL 最终都翻译成同一种 VDBE 指令。**

然后：

```text
SQL

↓

VDBE

↓

BTree
```

这样：

* Parser 不需要知道 BTree 怎么实现
* BTree 不需要知道 SQL 长什么样

它们之间只通过 VDBE 指令交流。

---

## VDBE 更像什么？

其实更像一个 CPU。

CPU 能执行：

```text
MOV

ADD

SUB

JMP
```

VDBE 能执行：

```text
OpenRead

OpenWrite

Column

Insert

Delete

Next

Goto

Halt
```

所以：

CPU 有：

```
机器指令
```

SQLite 有：

```
数据库指令
```

---

## 举个更完整的例子

SQL：

```sql
SELECT name
FROM user
WHERE id = 3;
```

SQLite 内部流程：

```text
SQL

↓

Tokenizer

↓

Parser

↓

Code Generator

↓

VDBE Program
```

生成：

```text
OpenRead user

Seek id=3

Read Column(name)

ResultRow

Halt
```

VDBE 一条一条执行：

```text
打开表

↓

找到 id=3

↓

读取 name

↓

返回给用户

↓

结束
```

整个查询就完成了。

---

## 读源码的时候你会看到什么？

VDBE 的核心文件一般包括：

* `vdbe.c` —— 虚拟机执行器（真正执行每条指令）
* `vdbeaux.c` —— 辅助函数
* `vdbeapi.c` —— 对外 API
* `vdbeInt.h` —— 内部数据结构

其中最经典的一段代码就是类似：

```c
switch(opcode) {
    case OP_OpenRead:
        ...
        break;

    case OP_Column:
        ...
        break;

    case OP_Next:
        ...
        break;
}
```

每个 `case` 就对应一条 VDBE 指令，非常像 CPU 在解释执行机器码。

---

### 一句话记住

你可以把 SQLite 想成一个"小型编译器"：

```text
SQL（高级语言）
        │
        ▼
Code Generator（编译器）
        │
        ▼
VDBE Bytecode（字节码）
        │
        ▼
VDBE（虚拟CPU）
        │
        ▼
BTree（数据）
```

所以 **VDBE 的作用就是：把编译后的 SQL 指令一条一条执行，并最终操作数据库。**

它是 SQLite 架构中承上启下的核心，也是理解 SQLite 内核最重要的模块之一。

## 系统设计反思：这些知识有什么用

你的这个感觉特别正常，而且很多人学系统设计都会经历这个阶段。

**原因在于：你现在接触的是"架构思想"，而不是"业务技巧"。**

举个例子。

你刷 LeetCode 的时候：

```cpp
unordered_map<int, int> mp;
```

你知道为什么用哈希表。

因为马上就能用：

* 两数之和
* 最长连续序列
* LRU

**算法知识 → 当天就能实践。**

---

但是像：

* VDBE
* 沙盒
* Pager
* JVM
* 编译器

这些知识，你可能写了几年 CRUD 都不会自己实现。

所以容易产生一种感觉：

> **"知道很有道理，但是我什么时候会用？"**

---

## 实际上，这些知识更多是在影响你的"设计思维"

举个例子。

假设你要写一个小游戏。

很多人会这么写：

```cpp
class Player {
public:
    void Attack();
    void Move();
    void OpenFile();
    void DeleteFile();
};
```

所有能力都暴露出去。

但是学过沙盒思想的人可能会想：

> **玩家真的应该能直接删文件吗？**

于是会设计成：

```cpp
Player
     │
     ▼
Game API
     │
     ▼
Engine
```

玩家只能：

```cpp
Move();

Attack();

Jump();
```

不能：

```cpp
remove("save.dat");
```

这就是**权限隔离**。

---

## 再比如数据库

如果没学 SQLite。

可能会写：

```cpp
SQLParser

↓

直接

↓

File
```

以后：

每增加一种 SQL：

都要改文件系统。

但是 SQLite：

```text
SQL

↓

VDBE

↓

Pager

↓

Disk
```

以后：

新增 SQL：

只改：

```text
Parser

↓

Code Generator
```

Pager 一行都不用动。

这就是：

> **解耦。**

---

## 再举一个你以后很可能会写到的例子

假设你写聊天服务器。

新手：

```cpp
Message

↓

Database
```

后来发现：

以后：

* Redis
* MySQL
* SQLite

都可能换。

于是：

```text
Message

↓

Storage Interface

↓

Redis

↓

MySQL

↓

SQLite
```

是不是和：

```text
SQL

↓

VDBE

↓

BTree
```

有一点像？

中间加了一层抽象。

---

## 为什么很多大佬喜欢研究这些？

因为：

**不是为了以后重写 SQLite。**

而是为了学：

> **为什么他们这么分层？**

例如：

SQLite：

```text
Tokenizer

Parser

Generator

VM

Storage
```

Linux：

```text
System Call

VFS

Filesystem

Disk Driver
```

浏览器：

```text
JavaScript

DOM

Renderer

GPU
```

你会发现：

优秀的软件几乎都喜欢：

**一层只干一件事。**

---

## 什么时候真正会用？

其实比你想象得早。

假设以后你做一个课程设计：

一个图书管理系统。

很多同学：

```cpp
UI

↓

直接

↓

SQLite
```

所有 SQL 写在按钮里面。

你可能会想到：

```text
UI

↓

BookService

↓

Repository

↓

SQLite
```

虽然只是多了一层。

但是以后：

换 MySQL：

几乎不用改 UI。

这个就是：

SQLite、

Redis、

Linux、

JVM

这些项目天天在干的事情：

**增加抽象层。**

补充一句：字符串保证可读性和传输方便，但它不是精确的数据结构，所以需要分词器把它转换成更适合程序处理的结构。
