# AstrBot Agent 沙箱调研

最近查了一下 AstrBot 里和 Agent 沙箱有关的官方资料，结论是：它已经不是简单的“代码执行器”了，而是一个专门给 Agent 用的隔离执行环境。

## 关键信息

- AstrBot 从 `v4.12.0` 起引入了 Agent 沙箱环境，用来替代之前的代码执行器功能。
- 这个功能目前还是技术预览，官方也提醒可能有 Bug。
- `sandbox` 模式是在隔离环境里执行动作，不直接跑在 AstrBot 主机上。
- 当前支持的驱动主要有：
  - `Shipyard Neo`，官方推荐
  - `Shipyard`，旧方案
  - `CUA`，适合桌面操作场景

## 我记下来的重点

- `Shipyard Neo` 的工作区根目录固定是 `/workspace`
- 文件系统工具通常要传相对路径，不是绝对路径
- `Shipyard Neo` 更适合稳定的 Python / Shell / 文件系统场景
- `Shipyard Neo` 的能力和 profile 有关，只有支持 `browser` capability 的 profile 才会挂浏览器工具
- `CUA` 更像是电脑使用型沙箱，可以提供 Shell、Python、文件读写、截图、鼠标、键盘等能力
- 即使在 sandbox 模式里，AstrBot 的权限控制仍然会影响 Shell、Python、浏览器、上传下载等工具
- 每个沙箱环境资源上限大约是 `1 CPU + 512 MB`，宿主机最好预留更高配置
- sandbox 模式下，AstrBot 会尝试把本地 Skills 同步进沙箱，方便 Agent 在里面执行

## 我自己的理解

AstrBot 这里的“沙箱”更像是在给 Agent 一套可控的执行边界：

- 让工具调用和文件操作隔离在受控环境里
- 让会话级资源复用变得可管理
- 让不同能力通过 driver / profile 组合起来

这和我之前总结的“边界、耦合、测试、变化成本”是对得上的。

## 参考资料

- [AstrBot Agent 沙盒环境](https://docs.astrbot.app/use/astrbot-agent-sandbox.html)
- [AstrBot Computer Use](https://docs.astrbot.app/en/use/computer.html)
- [AstrBot GitHub](https://github.com/astrbotdevs/astrbot)
