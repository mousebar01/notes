# 软件设计原则与 IoC / DI

这篇用来合并 SOLID、控制反转和依赖注入相关笔记。重点不是背概念，而是理解它们如何共同服务于一个目标：降低耦合，让系统更容易维护、扩展和测试。

## SOLID 设计原则

SOLID 是面向对象设计的五项基本原则，通常用于指导模块划分、对象关系设计和系统架构。

它服务于几个软件工程目标：

- 可维护性
- 可扩展性
- 可复用性
- 可测试性
- 低耦合
- 高内聚

SOLID 不是语法规则，而是一套设计判断方式。

## 五项原则

| 原则 | 名称 | 关注点 | 解决的问题 |
| --- | --- | --- | --- |
| S | Single Responsibility Principle，单一职责原则 | 类、模块 | 职责划分 |
| O | Open-Closed Principle，开闭原则 | 功能扩展 | 如何新增功能 |
| L | Liskov Substitution Principle，里氏替换原则 | 继承体系 | 如何保证多态正确 |
| I | Interface Segregation Principle，接口隔离原则 | 接口设计 | 如何降低接口耦合 |
| D | Dependency Inversion Principle，依赖倒置原则 | 模块关系 | 如何降低模块耦合 |

### 单一职责原则

一个模块、类或函数应该只有一个引起它变化的原因。

核心思想是让对象只承担一种职责，职责边界保持清晰。违反后常见表现是类不断膨胀，修改一个需求影响多个无关功能。

### 开闭原则

软件实体应该对扩展开放，对修改关闭。

当需求变化时，优先通过新增代码实现功能，而不是反复修改已有稳定代码。常见实现方式包括接口、多态、策略模式、插件机制和工厂模式。

### 里氏替换原则

任何父类能够出现的地方，都应该能够透明替换为子类，而不会影响程序正确性。

继承表达的是 `is-a` 关系，而不是简单的代码复用。子类不应削弱父类行为、不应破坏父类约定、不应改变父类语义。

### 接口隔离原则

客户端不应该依赖它不需要的接口。

多个小而专一的接口，通常优于一个臃肿的万能接口。

### 依赖倒置原则

高层模块不应依赖低层模块，两者都应依赖抽象。

抽象不应依赖细节，细节应依赖抽象。它的目标是降低模块之间的耦合，提高扩展性和可测试性。

## IoC 与 DI 要解决什么问题

软件开发中，一个对象通常需要依赖其他对象才能工作：

- `UserService` 需要数据库
- `OrderService` 需要日志器
- `CacheService` 需要 Redis

这些都叫依赖。真正的问题是：

> 依赖由谁创建？

如果对象自己创建依赖，就会产生强耦合。

```java
class UserService {
    private MySQLDatabase db = new MySQLDatabase();

    User getUser(int id) {
        return db.queryUser(id);
    }
}
```

这里 `UserService` 不只使用数据库，还知道数据库的具体实现是 `MySQLDatabase`。如果以后换成 SQLite、Postgres 或测试用的 `FakeDatabase`，业务代码就要跟着改。

## 依赖注入

依赖注入的做法是：对象不自己创建依赖，而是由外部把依赖传进来。

```java
class UserService {
    private Database db;

    UserService(Database db) {
        this.db = db;
    }
}
```

程序启动时：

```java
Database db = new MySQLDatabase();
UserService service = new UserService(db);
```

`UserService` 不再关心数据库是谁创建的，也不关心具体实现是什么。它只知道自己需要一个 `Database` 能力。

## 依赖接口，而不是依赖具体实现

成熟项目通常不会这样写：

```java
UserService(MySQLDatabase db)
```

而会这样写：

```java
interface Database {
    User queryUser(int id);
}
```

```java
class MySQLDatabase implements Database {}
class SQLiteDatabase implements Database {}
```

```java
class UserService {
    private Database db;

    UserService(Database db) {
        this.db = db;
    }
}
```

`UserService` 依赖的是能力，也就是接口，而不是某个具体实现。

这就是经典设计原则：

> 依赖抽象，不依赖具体实现。

## IoC：控制反转

很多人会把 IoC 和 DI 当成一回事，但它们不是同一层概念。

IoC 是一种设计思想，DI 是实现这种思想的常见方法。

没有 IoC 时：

```text
UserService
  ↓
自己 new MySQLDatabase
```

有 IoC 时：

```text
Program / Container
  ↓
创建 MySQLDatabase
  ↓
交给 UserService
```

对象不再控制依赖的创建，控制权转移到外部，这就是控制反转。

## DI 与 Service Locator

IoC 可以有不同实现方式：

```text
IoC（控制反转）
  ├─ Dependency Injection（依赖注入）
  └─ Service Locator（服务定位器）
```

DI 是别人把依赖送过来：

```java
new UserService(db);
```

Service Locator 是对象自己去拿：

```java
Database db = ServiceLocator.get(Database.class);
```

DI 通常耦合更低，也更利于测试，所以现代框架更常推荐依赖注入。

## Spring 的位置

Spring 很核心的能力是 IoC Container。

它负责：

```text
扫描 Bean
  ↓
创建对象
  ↓
创建依赖
  ↓
自动注入
```

所以很多 Spring 项目里，业务代码很少直接写 `new`。业务对象只负责业务，容器负责准备依赖。

## 为什么叫依赖注入，而不是普通参数传递

`new UserService(db)` 看起来像参数传递，但这里传入的不是普通数据，而是对象运行所需的能力。

普通数据例如：

```text
用户名
年龄
价格
```

依赖通常是：

```text
Database
Logger
Redis
Cache
Config
HttpClient
MessageQueue
```

依赖注入强调的是：把运行所需的能力交给对象。

## 三者关系

```text
降低耦合
  ↓
采用 SOLID 原则
  ↓
依赖倒置原则（D）
  ↓
控制反转（IoC）
  ↓
依赖注入（DI）
```

对应关系：

| 概念 | 回答的问题 |
| --- | --- |
| 耦合 | 我依赖谁？ |
| IoC | 谁负责创建依赖？ |
| DI | 外部如何把依赖交给我？ |

一句话总结：

> IoC 是思想，DI 是实现 IoC 最常见的技术。最终目标是降低耦合，提高可维护性和可扩展性。

