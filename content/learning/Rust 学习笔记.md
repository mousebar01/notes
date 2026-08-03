# Rust 学习笔记

这篇收拢 Rust 入门过程中遇到的语法概念，目前包括变量可变性和函数声明。

## 变量可变性

这是 Rust 里的 **变量声明**。

```rust
let apples = 5; // immutable
let mut bananas = 5; // mutable
```

意思是：

```rust
let apples = 5;
```

声明一个变量 `apples`，值是 `5`。
它是 **immutable**，也就是**不可变**。之后不能改它：

```rust
let apples = 5;
apples = 6; // 报错
```

而：

```rust
let mut bananas = 5;
```

声明一个变量 `bananas`，值是 `5`。
因为加了 `mut`，所以它是 **mutable**，也就是**可变**。之后可以改：

```rust
let mut bananas = 5;
bananas = 6; // 可以
```

这里的关键词：

```text
let = 声明变量
mut = mutable，可变
immutable = 不可变
mutable = 可变
```

和 TypeScript 类比：

```ts
const apples = 5; // 不可变绑定
let bananas = 5; // 可以重新赋值
bananas = 6;
```

Rust 默认让变量不可变，是为了减少意外修改，让代码更安全。你需要修改时，再明确写 `mut`。

## 函数声明

- `fn` 表示声明一个函数。
- `->` 后面表示返回值类型。

> 待补充：函数参数、表达式返回值和 `Result` 的基本写法。
