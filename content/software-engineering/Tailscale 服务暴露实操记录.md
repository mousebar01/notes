# Tailscale 服务暴露实操记录

## 背景

目标：把两个本地 Web UI 暴露到 tailnet，让手机（Tailscale App）随时随地能访问：

- **pi-web**（`@agegr/pi-web`）：pi coding agent 的 Web UI，跑在 WSL 的 30141 端口
- **cloudcli**（`@cloudcli-ai/cloudcli`）：Claude Code CLI 的 Web UI，跑在 WSL 的 3001 端口

环境：WSL（Ubuntu，systemd 已启用）+ Windows 主机装 Tailscale；WSL 里没有 tailscale，通过 Windows 的 `tailscale.exe`（WSL 可直接调用）操作。

## 过程

### 阶段一：端口方案（可行但不够清晰）

1. `tailscale serve --bg --https=443 http://127.0.0.1:3001`（cloudcli 已有，我加 pi-web 时不动它）
2. pi-web 加 `--https=8443 http://127.0.0.1:30141`——443 被 cloudcli 占了，serve 的 443 只能挂一个根路径服务

结果：`https://mydesk4060.tailcaedae.ts.net/`（cloudcli）vs `https://mydesk4060.tailcaedae.ts.net:8443/`（pi-web）。能用，但两个 URL 太像，用户想要"一目了然"。

### 阶段二：路径方案（不可行）

需求：`/pi` 和 `/cloudcli` 子路径。

结论：**两个应用都是完整 Web 应用，做不了子路径**。原因：
- pi-web 是 Next.js：资源走 `/_next/...`、API 走 `/api/...`（前端代码里 `fetch("/api/home")` 是绝对路径写死的，不认 basePath）
- cloudcli 是 Vite SPA：资源走 `/assets/...`
- 两个应用在同一域名下挂根路径资源会互相冲突（`/_next/` 该转发给谁？）

子路径方案需要给两个应用改 basePath + 改前端绝对 URL + 重新构建，等于动源码。

### 阶段三：Tailscale Services 子域名方案（最终方案）

目标：`https://pi-web.tailcaedae.ts.net/` 这种独立子域名。

**关键概念链**：tag（机器身份）→ autoApprovers（自动审批）→ grants（访问授权）→ 服务定义（svc:xxx + VIP）→ serve 广告（宿主）。

1. **机器打 tag**：管理后台 → Machines → mydesk4060 → Edit ACL tags → 加 `tag:svc-host`。注意：
   - 先要在 Tags 页面创建 tag 并指定 owner（会同步到 `tagOwners`）
   - 打 tag 会改变机器所有权（从用户邮箱变成 tag），这是服务宿主的前提
2. **配 autoApprovers + grants**（ACL 策略）：
   ```json
   "autoApprovers": {
     "services": {
       "svc:pi-web": ["tag:svc-host"],
       "svc:cloudcli": ["tag:svc-host"]
     }
   },
   "grants": [
     { "src": ["autogroup:member"], "dst": ["svc:pi-web"], "ip": ["*"] },
     { "src": ["autogroup:member"], "dst": ["svc:cloudcli"], "ip": ["*"] }
   ]
   ```
3. **定义服务**（关键一步，靠 API）：`tailscale serve --service` 只注册了本机广告，**服务对象必须先在控制面定义**：
   ```bash
   PUT /api/v2/tailnet/{tailnet}/services/svc:pi-web
   {"name":"svc:pi-web","ports":["tcp:443"]}
   ```
   返回带专属 VIP（`100.112.43.159` 之类）。
4. **serve 广告**：
   ```bash
   tailscale serve --service svc:pi-web --https=443 http://127.0.0.1:30141
   tailscale serve --service svc:cloudcli --https=443 http://127.0.0.1:3001
   ```
5. **pi-web 白名单**：`PI_WEB_ALLOWED_HOSTS` 必须加上新域名（逗号分隔支持多个），否则 pi-web 会以 403 "Untrusted request" 拒绝。

最终全部打通：`pi-web.tailcaedae.ts.net`、`cloudcli.tailcaedae.ts.net` 都返回 200。

## 踩坑记录（按价值排序）

1. **`pkill -f pi-web` 杀掉自己的 shell**：命令行里含 "pi-web" 字样，pkill 把执行它的 bash 也杀了，后续命令根本没执行。**教训：杀进程用精确 PID（lsof/ss 查），或写脚本文件执行，避免模式匹配到自身。**
2. **curl 路径里的冒号被当 URL scheme 吞掉**：`PUT .../services/svc:pi-web` 时，路径里的 `svc:` 冒号被 curl 解析成 scheme，导致服务名解析为空（`"" is not a valid service name`）。**教训：路径含冒号用 `--path-as-is`。**
3. **服务定义 ≠ serve 广告**：卡了很久才搞清"approval required"的根因——服务对象（svc:xxx + VIP）没在控制面定义，`vipServices` 为空。UI 找不到入口，最后靠 API PUT 建的服务。
4. **端口被孤儿进程占用（EADDRINUSE）**：kill 主进程后 next-server worker 成了孤儿还占着端口，新进程起不来。**教训：确认端口释放（lsof -iTCP:PORT -sTCP:LISTEN）再启动。**
5. **pi-web 的 host 校验只拦 /api/ 路由**：根页面 200 但 API 403，需要分别测试。
6. **tailnet 名不是域名前缀**：API 用 tailnet 名（个人 tailnet 是邮箱），不是 `tailcaedae`。

## 结论 / 建议

- 暴露本地服务到 tailnet：`tailscale serve` 一条命令最省事；要独立子域名就走 Services（tag + autoApprovers + grants + 服务定义）。
- 服务子域名方案适合长期服务：独立 VIP/域名，换宿主机器不影响客户端。
- Tailscale 术语门槛不低，但核心就一条链：**身份（tag）→ 审批（autoApprovers）→ 授权（grants）→ 定义（svc/VIP）→ 广告（serve）**。

## 遗留事项

- systemd 自启 pi-web 的命令（`sudo cp ~/.pi-web.service /etc/systemd/system/...`）用户尚未执行
- 临时 API key 用完应删除
- 旧端口入口（mydesk4060:8443）保留作后备

## 相关笔记

- [Tailscale 架构与原理](./Tailscale%20架构与原理.md)：底层机制和概念
- [零信任与 Agent 时代安全](../agent/security/零信任与%20Agent%20时代安全.md)：审批/授权背后的安全哲学
