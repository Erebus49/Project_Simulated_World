# 松果镇 · 像素角色扮演

这是独立的新版项目。源码、模型配置、静态素材、依赖清单、启动脚本和技术文档全部位于本目录，构建与运行不读取父目录的旧 Python 后端或旧前端。

首个故事是《雨季前的最后一晚》：你收到旧友邀请回到小镇，和六位拥有各自人设、目标与局部记忆的 LLM 居民交流。Phaser 4.2.1 绘制像素地图，HTML/CSS 显示界面和清晰文字。人物保持正面造型，手脚表现行走，空闲时做日常活动。

## 启动

需要 Node.js 22.12 或更新版本。双击本目录的 `start.bat`，或执行：

```powershell
cd E:\cslearn\world\roleplay-town
npm ci
npm run build
npm start
```

打开 **http://127.0.0.1:8011**，调试台为 **http://127.0.0.1:8011/?debug=1**。

`npm start` 自动读取本目录的 `.env.runtime`。原本的本地配置已迁入；更改接口时参考 `runtime.env.example`，填写 MODEL_BASE_URL、MODEL_NAME、MODEL_API_KEY 后重启。密钥与 `data/`、依赖和构建产物均被本目录的 `.gitignore` 排除。未配置真实 API 时可以显式选择 Mock 演示。

若要改端口，先设置 PORT 环境变量，例如 `$env:PORT = '8013'`。前端开发命令 `npm run dev` 会将 API 和 WebSocket 转发到相同端口，默认8011。

## 怎么玩

- WASD / 方向键移动，也可以点击地面；靠近居民按 E 交谈。
- J 查看日记，Esc 关闭面板。
- 底部行动栏可买咖啡、帮忙工作、停留片刻。
- 走近居民能看到头顶气泡；日常短句属于场景台词，真实收到的 AI 回复优先显示，不公开他人的私聊。
- 每位居民会轮换多种日常活动和手上动作。向东可过桥走河岸步道，向南可逛花园，地图为960×720。
- 本地日常动画不调用模型；对话和实际世界行动使用服务端规则与模型。

## 目录

```text
roleplay-town/
  src/
    ui/             游戏界面、Phaser 场景、像素人物和地图
    server/         HTTP / WebSocket、本地单局服务
    engine/         世界状态、行动校验与结算、事件日志
    agents/         LLM / Mock、角色观察
    scenarios/      世界背景与角色人设
    shared/         类型与输入校验
    tests/          已有内核测试
  public/           本项目自带素材与许可证
  docs/             技术计划、渲染说明、历史验证和截图
  data/             本地日志与历史记录备份，Git 忽略
  .env.runtime      本地模型配置，Git 忽略
  runtime.env.example
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
  start.bat
```

`dist-runtime/`、`dist-web/` 和 `node_modules/` 均在本目录生成，不依赖父目录安装。

详细玩法见 [角色扮演说明](docs/WORLD_RUNTIME_ROLEPLAY.md)，渲染实现见 [渲染说明](docs/WORLD_RUNTIME_RENDERING.md)，架构见 [技术计划](docs/WORLD_RUNTIME_SPEC.md)，素材许可见 [素材说明](THIRD_PARTY_ASSETS.md)。较早文档保留历史演示记录，当前启动路径和端口以本页为准。

本版本是本地单局原型，重启会清空内存世界，可导出见闻与调试记录。
