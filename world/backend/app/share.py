"""Temporary authenticated gateway; the local admin service stays private.

Cloudflare Quick Tunnels do not support SSE. This gateway exposes the existing
polling path instead, and gives each visiting browser its own game ownership.
"""
import asyncio
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "backend" / "data"
DATA.mkdir(parents=True, exist_ok=True)
ACCESS_PATH = DATA / "share-access.json"
if not ACCESS_PATH.exists():
    ACCESS_PATH.write_text(json.dumps({"token": secrets.token_urlsafe(32), "created_at": time.time()}), encoding="utf-8")
ACCESS_TOKEN = json.loads(ACCESS_PATH.read_text(encoding="utf-8"))["token"]
OWNER_DB = DATA / "share-sessions.db"
UPSTREAM = os.environ.get("WORLD_SHARE_UPSTREAM", "http://127.0.0.1:8000")
COOKIE = "pinecone_share"
GAME_ROUTE = re.compile(r"^/api/games/([a-f0-9]{32})(/actions|/restart|/turn|/events|/walk|/pulse)?$")


@contextmanager
def connection():
    conn = sqlite3.connect(OWNER_DB, timeout=5)
    conn.execute("CREATE TABLE IF NOT EXISTS browsers(id TEXT PRIMARY KEY, created_at REAL NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, browser_id TEXT NOT NULL)")
    conn.commit()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def signed_cookie(browser):
    signature = hmac.new(ACCESS_TOKEN.encode(), browser.encode(), hashlib.sha256).hexdigest()
    return browser + "." + signature


def owner(request):
    browser, separator, signature = request.cookies.get(COOKIE, "").partition(".")
    if not separator or not hmac.compare_digest(signed_cookie(browser), browser + "." + signature):
        return None
    with connection() as conn:
        return browser if conn.execute("SELECT 1 FROM browsers WHERE id=?", (browser,)).fetchone() else None


def owns(browser, game_id):
    with connection() as conn:
        return bool(conn.execute("SELECT 1 FROM games WHERE id=? AND browser_id=?", (game_id, browser)).fetchone())


app = FastAPI(title="松果镇临时试玩入口", docs_url=None, redoc_url=None, openapi_url=None)
turn_lock = asyncio.Lock()


@app.middleware("http")
async def headers(request, call_next):
    response = await call_next(request)
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/enter/{token}")
async def enter(token: str, request: Request):
    if not secrets.compare_digest(token, ACCESS_TOKEN):
        return JSONResponse({"detail": "试玩链接无效"}, status_code=403)
    browser = owner(request) or secrets.token_urlsafe(24)
    with connection() as conn:
        conn.execute("INSERT OR IGNORE INTO browsers VALUES(?,?)", (browser, time.time()))
    response = RedirectResponse("/", status_code=303)
    forwarded = request.headers.get("x-forwarded-proto", "")
    response.set_cookie(COOKIE, signed_cookie(browser), httponly=True, samesite="lax",
                        secure=request.url.scheme == "https" or forwarded == "https", max_age=86400)
    return response


def denied():
    return JSONResponse({"detail": "这个入口只提供本次试玩，不开放管理操作或其他人的存档"}, status_code=403)


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy(path: str, request: Request):
    browser = owner(request)
    if not browser:
        return JSONResponse({"detail": "请使用完整的私人试玩链接进入小镇"}, status_code=401)
    origin = request.headers.get("origin")
    if origin and urlparse(origin).netloc != request.headers.get("host"):
        return denied()
    route = "/" + path
    if route == "/api/health" and request.method == "GET":
        async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
            upstream = await client.get(UPSTREAM + route)
        result = upstream.json()
        return {**result, "debug_enabled": False, "share_mode": True, "sse_enabled": False}
    if route == "/api/settings" and request.method == "GET":
        async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
            upstream = await client.get(UPSTREAM + route)
        result = upstream.json()
        return {"base_url": "", "model": result["model"], "has_api_key": result["has_api_key"], "timeout_seconds": result["timeout_seconds"]}
    if route == "/api/games" and request.method == "GET":
        async with httpx.AsyncClient(timeout=5, trust_env=False) as client:
            upstream = await client.get(UPSTREAM + route)
        return [g for g in upstream.json() if owns(browser, g["id"])]
    new_game = route == "/api/games" and request.method == "POST"
    match = GAME_ROUTE.fullmatch(route)
    if route.startswith("/api/"):
        if route == "/api/scenario" and request.method == "GET":
            pass
        elif new_game:
            pass
        elif match and owns(browser, match[1]):
            suffix = match[2]
            if suffix == "/events":
                return JSONResponse({"detail": "临时隧道使用定时刷新"}, status_code=404)
            if request.method not in ({"POST"} if suffix in {"/actions", "/restart", "/walk", "/pulse"} else {"GET"}):
                return denied()
        else:
            return denied()
    elif request.method != "GET" or not (route == "/" or route.startswith("/assets/") or route == "/favicon.ico"):
        return denied()
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > 16000:
            return JSONResponse({"detail": "请求过大"}, status_code=413)
    # Keep public inference within the four concurrent decisions of one turn.
    is_action = match and match[2] == "/actions" and request.method == "POST"
    if is_action:
        async with turn_lock:
            return await forward(route, request.method, bytes(content), browser, new_game, match)
    if route == "/api/scenario" and request.query_params.get("scenario_id") == "festival":
        route += "?scenario_id=festival"
    return await forward(route, request.method, bytes(content), browser, new_game, match)


async def forward(route, method, content, browser, new_game, match):
    try:
        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            if method == "POST" and (new_game or (match and match[2] in {"/actions", "/restart"})):
                # Limit a temporary public browser to ten saves and 120 player turns.
                with connection() as conn:
                    owned = [r[0] for r in conn.execute("SELECT id FROM games WHERE browser_id=?", (browser,))]
                if new_game or (match and match[2] == "/restart"):
                    if len(owned) >= 10:
                        return JSONResponse({"detail": "临时试玩最多创建10个存档"}, status_code=429)
                if match and match[2] == "/actions":
                    games = (await client.get(UPSTREAM + "/api/games")).json()
                    if sum(g["turn"] for g in games if g["id"] in owned) >= 120:
                        return JSONResponse({"detail": "本次试玩已达到120回合上限"}, status_code=429)
                    # Check pending states directly via the local-only endpoint.
                    from .main import store
                    if store.pending():
                        return JSONResponse({"detail": "小镇正在处理上一轮，请稍后再行动"}, status_code=409)
            response = await client.request(method, UPSTREAM + route, content=content, headers={"Content-Type": "application/json"})
        if response.is_success and (new_game or (match and match[2] == "/restart")):
            with connection() as conn:
                conn.execute("INSERT OR IGNORE INTO games VALUES(?,?)", (response.json()["id"], browser))
        return Response(response.content, status_code=response.status_code, media_type=response.headers.get("content-type", "application/json"))
    except httpx.RequestError:
        return JSONResponse({"detail": "本机游戏服务暂未响应"}, status_code=503)
