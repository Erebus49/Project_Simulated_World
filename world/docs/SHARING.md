# Cloudflare 临时外网试玩

已经在本机使用官方 `cloudflared 2026.10.1` 验证临时隧道。可执行文件位于 `tools/cloudflared.exe`，下载后与 GitHub Release 提供的 SHA-256 一致；文件不提交版本控制。

## 当前地址

完整私人试玩链接保存在 `backend/data/share-url.txt`。它是临时地址，隧道重启后域名会变化。链接中的访问令牌仅保存在本机忽略目录，不写入本文档。

打开完整链接后会设置 HttpOnly 访问 cookie，并跳转到游戏首页。没有该链接的人访问 API 会得到 401。每个浏览器只看到自己创建的存档。外网入口不提供模型配置写入、内部 API 地址、世界档案和本机其他存档。

## 以后启动和关闭

先用 `start.bat` 启动 8000 端口的本机游戏，再执行：

```powershell
.\start-share.ps1
```

脚本在 8002 上启动分享网关，并用 Cloudflare Quick Tunnel 对外提供入口，打印完整试玩链接。保留该脚本运行；Ctrl+C 关闭隧道。也可以在另一个终端执行：

```powershell
.\stop-share.ps1
```

关闭分享不会停止 8000 上的本机游戏。

日志：`backend/data/share.error.log`、`backend/data/cloudflared.log`。当前运行的进程标识分别保存在 `share.pid` 与 `cloudflared.pid`。

## 运行方式

Cloudflare Quick Tunnel 不支持 SSE，因此分享页面使用定时查询：夜间对话等待期间约每 400ms、空闲时每 5 秒；旧庆典每 2.5 秒刷新。本机入口仍使用 SSE。

游戏浏览器 → Cloudflare HTTPS → 本机 `cloudflared` → 8002 分享网关 → 8000 游戏服务 → 已配置的模型 API。

模型 API 本身没有被隧道公开。电脑、游戏服务、分享网关和 cloudflared 都需要保持运行；本机还需要能连接模型地址。

这是临时试玩方式，无需绑定 Cloudflare 账号或域名，没有安装系统服务。每个访客浏览器最多创建 10 个存档，累计最多 120 个玩家回合，分享网关一次放行一轮模型决策（夜间对话一个角色；旧庆典最多四个角色）。持有试玩链接的访客开启 AI 局会消耗本机配置的模型额度。

如果需要长期固定域名，再配置有账号的 Named Tunnel 与自有域名；当前没有修改你的域名 DNS，也没有添加开机启动项。

参考：[Cloudflare Quick Tunnels 官方说明](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。
