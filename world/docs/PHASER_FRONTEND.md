# Phaser 前端更新

日期：2026-10-16。此更新作用于 `frontend/` 的规则怪谈游戏与 8000 端口服务；根目录的 8010 运行时实验保持独立。

## 已实现

- Phaser **4.2.1** 场景：`Boot` 加载本地 Kenney CC0 图集，`Night` 绘制地图、角色、道具与状态变化。
- Tiled 兼容 JSON 提供地图层、物件、交互点和可行走区域；不需要 Agent 分析截图。
- 移动按 **60Hz 固定步长**推进，单次最多补五步。页面失焦后清除按键与积压时间。DOM 位置提示以约 20Hz 更新，避免每渲染帧重绘整个界面。
- 主画面绘制至 `world` RenderTexture，采用 NEAREST 采样并以整数倍率显示；光源绘制至较低分辨率 `glow` RenderTexture，采用 LINEAR 采样。
- 自定义 GLSL 将两层合成，加入夜间色调、灯笼与玩家附近光照、柔和暗角、萤火与异常红边。断电后舞台光源与南门状态实际更新。
- 窄屏镜头跟随玩家；手机方向键与 E 交互保留。按光效按钮可减少动态效果，系统减少动态效果偏好默认开启时使用简化模式。
- 全屏按钮将整个游戏与 DOM 面板一起全屏，调查、密码输入和对话仍可操作。
- 可选 Web Audio 合成脚步、线索与异常提示音。默认静音，仅在点击声音按钮后启动；不使用外部音频资源。
- 紫黑面板、青色按钮、金色 SVG 标题、硬边阴影及夜间 HUD 参考 Soulforge 的分层思路重新设计。没有复制其游戏源码、标题图形或角色素材。

React 继续管理已有的网页控件、API 与存档；地图与角色由 Phaser 绘制。这里采用“Phaser 游戏画布 + HTML/CSS 界面”的方式，未为移除 React 而重写正常运行的接口层。

## 代码入口

```text
frontend/src/game/NightScene.ts     Boot / Night 场景、图块、相机、渲染纹理
frontend/src/game/nightShader.ts    world + glow 合成着色器
frontend/src/game/NightTitle.tsx    本项目 SVG 标题
frontend/src/game/audio.ts          按需启动的 Web Audio 合成音效
frontend/src/ExplorationMap.tsx     Phaser 生命周期与 HTML 交互提示
frontend/src/useExploration.ts      固定步长驱动、按键、碰撞与服务端位置同步
frontend/src/soul.css               本次 HUD 外观
frontend/src/maps/night-town.json   Tiled 兼容地图
frontend/tests/game.spec.ts         浏览器集成验证
```

原有谜题、服务端校验、单角色快速 AI 对话及存档继续使用。旧庆典页面仍在 `/?legacy=1`。

## 启动与验证

双击项目根目录 `start.bat`，打开 http://127.0.0.1:8000 。此前已经启动的本机服务可直接加载新生产前端，浏览器需要刷新。

```powershell
cd frontend
npm ci
npm run build
npm run test:game
```

浏览器测试需本机 8000 服务正在运行，并安装 Google Chrome。测试以独立临时配置启动无头 Chrome，不占用用户或其他任务正在使用的浏览器。

生产构建将 Phaser 引擎分包缓存，游戏场景按需加载。本次 Phaser 包约 1.68MB，gzip 约 381KB；整个前端不用 CDN 加载引擎、图集或音效。

## 验证记录

- Python 后端 31 项测试通过，保留规则、隔离、恢复和隧道权限检查。
- TypeScript 检查与 Vite 生产构建通过。
- WebGL 浏览器检查确认实际像素画面非空；按 WASD / E 从开局完整解谜，输入框不会误触移动，刷新恢复位置与线索，最终生还。
- 390px 手机视口验证触摸移动、弹窗阻止移动、光效及音效开关、无横向溢出。
- 四项 Playwright 集成测试通过：完整 WebGL 通关、手机操作、全屏与连续缩放、禁用 WebGL 的兼容路径。
- 现有 Cloudflare HTTPS 分享入口实际加载新版引擎和素材，并完成示例角色对话；完整调试按钮不向访客显示。

截图：

- [标题菜单](preview-phaser-menu.png)
- [Phaser 夜间世界](preview-phaser-world.png)
- [调查线索](preview-phaser-clues.png)
- [手机镜头与按键](preview-phaser-mobile.png)

素材署名及完整许可见根目录 `THIRD_PARTY_ASSETS.md`；Phaser MIT 许可随前端提供于 `/licenses/Phaser-MIT.txt`。

## 画面与地图后续更新

已进一步扩大到 768×480 并将对话、密码、手记和状态移入游戏画面。最新操作和验证见 [IMMERSIVE_MAP.md](IMMERSIVE_MAP.md)。
