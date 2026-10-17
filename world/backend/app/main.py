import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .models import ActionRequest, ModelSettings, NewGame, PulseRequest, WalkRequest
from .perception import player_view
from .rules import NPCS, RuleError
from .runner import TurnRunner
from .store import Store

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
store = Store()
settings_path = store.path.parent / "model.json"


def settings():
    config = {"base_url": os.environ.get("MODEL_BASE_URL", "https://api.openai.com/v1"),
              "model": os.environ.get("MODEL_NAME", ""), "api_key": os.environ.get("MODEL_API_KEY", ""),
              "timeout_seconds": int(os.environ.get("MODEL_TIMEOUT_SECONDS", "10"))}
    if settings_path.exists():
        config.update(json.loads(settings_path.read_text(encoding="utf-8")))
    return config


runner = TurnRunner(store, settings)


@asynccontextmanager
async def lifespan(app):
    for turn in store.pending():
        runner.start(turn)
    yield
    await runner.close()


app = FastAPI(title="小镇不按剧本走", lifespan=lifespan)


@app.middleware("http")
async def local_boundary(request: Request, call_next):
    # Prevent arbitrary websites using a browser to access local settings/debug.
    if request.url.path.startswith("/api"):
        host = request.headers.get("host", "").split(":")[0]
        origin = request.headers.get("origin")
        if host not in {"127.0.0.1", "localhost", "testserver"}:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "仅允许本机访问"}, status_code=403)
        if origin and urlparse(origin).hostname not in {"127.0.0.1", "localhost", "testserver"}:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "不允许跨站请求"}, status_code=403)
    return await call_next(request)


@app.exception_handler(KeyError)
async def missing(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse({"detail": "存档不存在"}, status_code=404)


@app.exception_handler(RuleError)
async def invalid(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse({"detail": str(exc)}, status_code=409)


@app.get("/api/health")
def health():
    config = settings()
    return {"status": "ok", "model_configured": bool(config["api_key"] and config["model"]),
            "debug_enabled": os.environ.get("WORLD_DEBUG", "1") == "1"}


@app.get("/api/settings")
def read_settings():
    config = settings()
    return {"base_url": config["base_url"], "model": config["model"], "has_api_key": bool(config["api_key"]), "timeout_seconds": config["timeout_seconds"]}


@app.put("/api/settings")
def save_settings(data: ModelSettings):
    parsed = urlparse(data.base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(422, "请输入不含密钥或查询参数的 HTTP(S) API 基础地址")
    config = data.model_dump()
    if not config["api_key"]:
        config["api_key"] = settings()["api_key"]
    temp = settings_path.with_suffix(".tmp")
    temp.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(settings_path)
    return read_settings()


@app.get("/api/scenario")
def get_scenario(scenario_id: Literal["night", "festival"] = "night"):
    from .scenario import scenario
    config = scenario(scenario_id)
    return {"title": config["title"], "rooms": config["rooms"],
            "characters": {a: {k: c[k] for k in ("name", "role", "color", "goal")} for a, c in config["characters"].items() if a in NPCS}}


@app.get("/api/games")
def games():
    return store.list_games()


@app.post("/api/games", status_code=201)
def create_game(data: NewGame):
    if data.mode == "ai" and not (settings()["api_key"] and settings()["model"]):
        raise HTTPException(422, "请先在模型设置中配置 API 和模型名，或选择规则演示")
    try:
        game_id = store.create(data.mode, data.max_turns, data.goals, data.scenario_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return player_view(store, game_id)


@app.get("/api/games/{game_id}")
def read_game(game_id: str):
    return player_view(store, game_id)


@app.post("/api/games/{game_id}/restart", status_code=201)
def restart(game_id: str):
    old = store.get(game_id)
    world = old["world"]
    new_id = store.create(old["mode"], world["max_turns"], {a: world["characters"][a]["goal"] for a in NPCS}, world.get("scenario_id", "festival"))
    return player_view(store, new_id)


@app.post("/api/games/{game_id}/actions", status_code=202)
async def submit_action(game_id: str, data: ActionRequest):
    turn = store.begin_turn(game_id, data.request_id, data.action)
    runner.start(turn)
    runner.start_thoughts(game_id)
    return {"turn_id": turn["id"], "status": turn["status"], "game": player_view(store, game_id)}


@app.get("/api/games/{game_id}/turn")
def turn_status(game_id: str):
    store.get(game_id)
    pending = store.pending(game_id)
    turn = pending[0] if pending else None
    complete = store.proposals(turn["id"]) if turn else {}
    actors = json.loads(turn["snapshot"]).get("actors", list(NPCS)) if turn else []
    return {"busy": bool(turn), "turn_id": turn["id"] if turn else None,
            "agents": [{"id": a, "status": "done" if a in complete else "thinking"} for a in actors]}


@app.post("/api/games/{game_id}/walk")
def walk_player(game_id: str, data: WalkRequest):
    store.walk(game_id, data.x, data.y)
    return player_view(store, game_id)


@app.post("/api/games/{game_id}/pulse")
async def pulse_world(game_id: str, data: PulseRequest | None = None):
    store.pulse(game_id, talking_to=data.talking_to if data else None)
    runner.start_thoughts(game_id)
    return player_view(store, game_id)


@app.get("/api/games/{game_id}/events")
async def stream(game_id: str, request: Request, after: int = 0):
    store.get(game_id)
    try:
        after = max(after, int(request.headers.get("last-event-id", "0")))
    except ValueError:
        pass

    async def feed():
        cursor = after
        last_status = None
        ticks = 0
        while not await request.is_disconnected():
            for entry in store.events(game_id, "player", after=cursor):
                cursor = entry["id"]
                yield f"id: {cursor}\nevent: world\ndata: {json.dumps(entry, ensure_ascii=False)}\n\n"
            current = turn_status(game_id)
            signature = json.dumps(current)
            if signature != last_status:
                yield f"event: turn\ndata: {signature}\n\n"
                last_status = signature
            ticks += 1
            if ticks % 20 == 0:
                yield ": heartbeat\n\n"
            await asyncio.sleep(0.5)
    return StreamingResponse(feed(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/debug/games/{game_id}")
def debug(game_id: str):
    if os.environ.get("WORLD_DEBUG", "1") != "1":
        raise HTTPException(404, "调试页面未启用")
    return store.debug(game_id)


DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def index(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "接口不存在")
        return FileResponse(DIST / "index.html")
