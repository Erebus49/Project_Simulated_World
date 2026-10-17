# 像素素材与地图

本版使用 Kenney 同一 Tiny 系列的 16×16 原始图块：

- Tiny Town 1.1：地形、道路、屋顶、木墙、树木、告示牌、井、围栏等。
- Tiny Dungeon 1.0：五个不同角色，以及柜子、灯具和门等小道具。

两套素材都附带 CC0 许可。官方源地址、下载包校验值和原许可文件位置记录在根目录 [THIRD_PARTY_ASSETS.md](../THIRD_PARTY_ASSETS.md)。游戏帮助页也有 Kenney 署名及链接。原始 PNG 未修改，夜间着色与灯光在画布上叠加。

## 地图数据

`frontend/src/maps/night-town.json` 是 Tiled 兼容的正交地图，格子尺寸 16×16。包含地表、四段道路、场景物件和语义对象层。

语义层保存公告栏、账册/回收柜、控制台、南门、NPC 位置，以及可行走矩形。`scripts/build-town-map.py` 从现有后端规则导出这些坐标；Agent 继续接收结构化地点、物品和可见事件，无需通过截图识别地图。

生成地图：

```powershell
.\.venv\Scripts\python.exe scripts/build-town-map.py
```

调整布景可修改脚本中的图块 ID、矩阵和物件，再重新生成。地图也可以在 Tiled 中查看与编辑；再次运行脚本会覆盖手动编辑，合并前需保留自己需要的修改。移动或扩大交互区域时，应同步后端规则后再导出，避免画面和碰撞不一致。

道路层的 `clipRect` 自定义属性让可见路面精确覆盖原有的连续移动矩形，避免把碰撞强制取整到图块格子后改变玩法。

可选预览：使用安装了 Pillow 的 Python 运行 `python scripts/build-town-map.py --preview`，输出到被忽略的 `backend/data/asset-inspection/`。

## 渲染与缩放

`townArt.ts` 加载项目内 PNG，并按图块 ID 从图集中裁剪。`ExplorationMap.tsx` 叠加夜色、局部灯光与谜题状态。断电后红灯熄灭，南门的栅栏随交接状态打开。

画布逻辑尺寸保持 480×285。可见世界使用 2 倍起的整数缩放，关闭图像平滑并启用 `image-rendering: pixelated`。小屏幕裁剪视野，镜头跟随角色，而非将整张地图压缩到手机宽度。交互提示与手机方向按钮保留在屏幕上。

人物使用 Tiny Dungeon 原始静态精灵，移动时保留现有的朝向翻转和步行动效。

## 验证

- TypeScript 检查与 Vite 生产构建通过。
- 浏览器确认实际加载官方 PNG，地图的 `data-art-source` 为 `kenney`，五个角色均使用素材精灵。
- 桌面 1440px、手机 390px 宽度下显示倍率都是整数 2，手机无横向溢出。
- 素材替换后再次用 WASD / E 完整通关：8 次决定、3 份证据、0 次异常；刷新后位置与线索恢复。
- Cloudflare 外网的两套图集请求均返回 HTTP 200；实际按键调查公告栏、手机方向按钮及跟随镜头通过，无页面异常。
- 谜题与模型调用逻辑没有因美术替换而改变。

预览：[桌面](preview-kenney-desktop.png)、[手机](preview-kenney-mobile.png)。
