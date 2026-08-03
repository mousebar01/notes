# Tauri IPC 设计

这篇记录 Flowframe 中 React 前端与 Rust 后端之间的 IPC 调用方式，重点是区分命令适配层和真正的业务逻辑。

## IPC 是什么

IPC 就是 **前端 UI 和桌面后端之间的通信**。

## 调用链路

在 Flowframe 里大概是这样：

```txt
React 前端
  点击“保存”
      ↓
Tauri IPC command
      ↓
Rust 后端
  写入 .flowframe/graph.json
      ↓
返回结果给 React
```

## 调用示例

比如前端调用：

```ts
await invoke('save_graph', {
  projectPath,
  graph,
})
```

Rust 端对应一个命令：

```rust
#[tauri::command]
fn save_graph(project_path: String, graph: serde_json::Value) -> Result<(), String> {
    flowframe::graph::save_graph(&project_path, graph)
}
```

这里的：

```txt
invoke('save_graph')
```

就是 IPC 调用。

## 职责边界

它不是业务逻辑本身，只是一层桥。

所以我刚才说：

```txt
commands = IPC 参数转换
flowframe/* = 真业务逻辑
```

意思是：

```txt
src-tauri/src/commands/graph.rs
  负责接收前端参数、转成 Rust 调用、把错误转成前端能读的格式

src-tauri/src/flowframe/graph.rs
  负责真正的 graph 读写、校验、执行计划
```

这样做的好处是，业务逻辑可以直接写 Rust 单元测试，不需要每次都启动 Tauri 前端。

## 结论

一句话：  
**IPC 是前端和 Rust 后端说话的通道，不应该承载太多业务逻辑。**
