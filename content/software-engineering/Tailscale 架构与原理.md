# Tailscale 架构与原理

## 背景

这是一篇关于 Tailscale 的技术理解笔记，来源是与 Agent 的一次深度讨论：从"把本地 Web 服务暴露到 tailnet"的实操出发，延伸到它的架构设计、身份模型、零信任理念和开源模式。

Tailscale 的常见印象是"装个客户端就能组网"，但它的设计其实是一套完整的"身份 + 策略 + 网络"抽象。这篇把核心概念串起来讲。

## 核心设计：三件事

Tailscale 本质是 **身份 + 策略 + 网络** 的叠加：

```
身份（你是谁/它是什么） → 策略（谁能访问谁） → 网络（流量怎么走）
```

所有"高级功能"都是往这三层里塞东西。想通这条线，功能再多也不乱。

## 网络层：全互联 mesh

传统企业 VPN 是**中心化**的（Hub-and-Spoke，所有流量经过公司网关）：

```
传统 VPN:  手机 → 公司网关 → 内部服务器（网关是单点瓶颈）
Tailscale: 手机 ⇄ 服务器（点对点 WireGuard 加密隧道，没有中间人）
```

数据面是 **WireGuard**（内核级加密隧道），控制面是协调服务器（只负责密钥交换、下发网络地图，不碰数据）。这就是**控制面集中、数据面分散**的设计——控制面好管理，数据面快且无瓶颈。

### 流量怎么走

```
设备A → NAT 打洞成功 → 直连（大多数情况）
      → 打洞失败 → DERP 中继（兜底，仍加密）
```

- **直连**：通过 NAT 穿越（UDP 打洞）找到对方
- **DERP 中继**：打洞失败时的兜底，由 Tailscale 全球中继节点转发密文

### netmap（网络地图）

每个节点定期从控制面拿到整个网络的拓扑 + 策略（`tailscale debug netmap` 可查看），**本地判断**能连谁、能不能访问。这也是为什么改策略后有时要等一会儿或重新触发广告（控制面重新下发地图）。

## 身份层：user vs tag

| | User 身份（默认） | Tag 身份 |
|---|---|---|
| 归属 | 一个用户账号 | 一个标签（如 `tag:svc-host`） |
| 用途 | 个人设备（手机、笔记本） | 服务器/自动化设备 |
| 特性 | 随人走，人是 owner | 脱离个人账号，由 `tagOwners` 声明谁能打这个标 |

打 tag 会改变机器"所有权"（从用户邮箱变成 tag）——所以服务宿主必须是 tag 设备，防止个人设备滥用服务宿主能力。

## 策略层：ACL 体系

```
"acls":          谁能访问谁（流量规则）
"tagOwners":     谁可以给设备打 tag
"autoApprovers": 哪些设备自动获得"服务宿主"等能力（审批自动化）
"grants":        谁可以访问某个服务
"ssh":           Tailscale SSH 规则
```

**审批（approval）**是核心安全设计：子网路由、服务宿主这类能改变网络拓扑的能力，默认需要管理员审批，`autoApprovers` 是它的自动化版本。

## 服务层：把"端口"变成"服务"

```
传统 serve:  机器名:端口  →  https://mydesk4060.ts.net:8443
Tailscale Services: 服务有独立 VIP + 独立域名 → https://pi-web.tailcaedae.ts.net
```

| 概念 | 含义 |
|------|------|
| `svc:pi-web` | 服务对象（有专属虚拟 IP，像一台"虚拟机器"） |
| TailVIP | 服务的虚拟 IP（100.x.x.x 网段） |
| 服务宿主 | 实际提供服务的 tag 机器，可以多台（未来做负载均衡） |
| 域名 | `svc:pi-web` → `pi-web.tailcaedae.ts.net`（自动） |

服务与具体硬件解耦：以后想换宿主机器，改广告即可，域名和 IP 不变。

## 功能全景（同源的"高级功能"）

| 功能 | 本质 |
|------|------|
| `tailscale serve` | 把本机端口反向代理到 tailnet（TLS 终止、Let's Encrypt 证书） |
| `tailscale funnel` | serve 的公网版（对外发布） |
| Subnet router | 把整个局域网段"广告"进 tailnet |
| Exit node | 某台设备当全网出口 |
| Taildrop | 设备间传文件 |
| Tailscale SSH | 免密钥 SSH，登录由 ACL 管 |

## API 设计

管理动作（加设备、改策略、审批、踢人）全部可编程化——"网络即代码"：

- `tskey-auth-`：Auth key，给设备加入 tailnet 用
- `tskey-api-`：API key，给程序执行管理操作，带 scope（最小权限）、有效期、可撤销、可审计

值得注意：**API 优先**——beta 功能往往 UI 还没做好、API 先上（本文实操里"定义服务"就是靠 API 一条命令完成的，界面反而找不到入口）。

## 开源模式：open-core

- **开源**（BSD-3-Clause，GitHub `tailscale/tailscale`，34.6k stars）：客户端 tailscaled/CLI、Apple 客户端、DERP 服务器（`cmd/derper`，可自建）、K8s operator、控制协议客户端代码
- **闭源**：控制面服务器（SaaS）、部分新功能（如 Tailscale Services 的 VIP 服务）、企业版功能
- **替代方案**：`headscale`（社区开源控制面实现，42k stars）可完全接管 tailnet；自建 DERP 官方支持
- **商业逻辑**：开源客户端建立信任和生态，闭源控制面 + 订阅收费

结论：开源客户端 + 公开协议 + 可替代控制面 = 不被锁定。

## 设计哲学：零信任

Tailscale 整个就是按零信任理念设计的（见《零信任与 Agent 时代安全》）：

- 身份是边界（不信任位置，信任身份）
- 最小权限（ACL/grants/审批）
- 持续验证（每次请求都验，netmap 本地验证，不依赖中心网关）

那些"复杂"的功能（tag 身份、审批、grants）全是零信任的强制要求，不是功能堆砌。

## 结论 / 经验

- Tailscale = WireGuard 打底的**全互联加密网** + **身份（user/tag）→ 策略（ACL/审批）→ 服务（VIP/域名）**的抽象层
- 每个"高级功能"都是在这三层里加一小块，学起来是一条线
- "去中心化"要分清：Tailscale 是**传输去中心化 + 信任中心化**（控制面仍是中心）；加密货币是**信任去中心化**
- 术语门槛是真实存在的：VIP、advertise（借自 BGP）、tag 身份、grants 等，部分通用、部分专属

## 相关笔记

- [Tailscale 服务暴露实操记录](./Tailscale%20服务暴露实操记录.md)：把 pi-web / cloudcli 暴露到 tailnet 的完整过程和踩坑
- [零信任与 Agent 时代安全](../agent/security/零信任与%20Agent%20时代安全.md)：零信任概念与 agent 时代的应用
- [SSH端口转发与代理](./SSH端口转发与代理.md)：传统 SSH 转发方案
