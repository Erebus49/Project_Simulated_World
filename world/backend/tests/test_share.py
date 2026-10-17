import importlib

import httpx
from fastapi.testclient import TestClient


def test_private_share_gateway_ownership_and_admin_boundary(tmp_path, monkeypatch):
    share = importlib.import_module("app.share")
    monkeypatch.setattr(share, "OWNER_DB", tmp_path / "owners.db")
    monkeypatch.setattr(share, "ACCESS_TOKEN", "testing-private-link")
    game_id = "a" * 32
    local_game = "b" * 32
    state = {"created": False}
    real_client = httpx.AsyncClient

    def upstream(request):
        route = request.url.path
        if route == "/api/health":
            return httpx.Response(200, json={"status": "ok", "model_configured": True, "debug_enabled": True})
        if route == "/api/settings":
            return httpx.Response(200, json={"base_url": "http://private-only/v1", "model": "test", "has_api_key": True, "timeout_seconds": 20})
        if route == "/api/games" and request.method == "POST":
            state["created"] = True
            return httpx.Response(201, json={"id": game_id, "turn": 0})
        if route == "/api/games":
            return httpx.Response(200, json=[{"id": local_game, "turn": 1}] + ([{"id": game_id, "turn": 0}] if state["created"] else []))
        return httpx.Response(200, json={"id": game_id})

    monkeypatch.setattr(share.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(upstream), **kwargs))
    with TestClient(share.app) as first:
        assert first.get("/api/health").status_code == 401
        assert first.get("/enter/invalid").status_code == 403
        entry = first.get("/enter/testing-private-link", follow_redirects=False)
        assert entry.status_code == 303 and entry.headers["location"] == "/"
        assert "HttpOnly" in entry.headers["set-cookie"]
        health = first.get("/api/health").json()
        assert health["share_mode"] and not health["debug_enabled"] and not health["sse_enabled"]
        assert first.get("/api/settings").json()["base_url"] == ""
        assert first.put("/api/settings", json={}).status_code == 403
        assert first.get("/api/debug/games/" + local_game).status_code == 403
        assert first.get("/api/games/" + local_game).status_code == 403
        assert first.get("/api/games").json() == []
        created = first.post("/api/games", json={"mode": "ai"})
        assert created.status_code == 201
        assert first.get("/api/games/" + game_id).status_code == 200
        assert first.post("/api/games/" + game_id + "/walk", json={"x": 239, "y": 195}).status_code == 200
        assert first.post("/api/games/" + game_id + "/pulse").status_code == 200
        assert first.get("/api/games").json() == [{"id": game_id, "turn": 0}]
        assert first.get("/api/games/" + game_id + "/events").status_code == 404
        assert first.post("/api/games", json={}, headers={"Origin": "https://unrelated.example"}).status_code == 403
        assert first.post("/api/games", content="a" * 16001).status_code == 413
        with TestClient(share.app) as second:
            second.get("/enter/testing-private-link", follow_redirects=False)
            assert second.get("/api/games/" + game_id).status_code == 403
            assert second.post("/api/games/" + game_id + "/walk", json={"x": 239, "y": 195}).status_code == 403
            assert second.post("/api/games/" + game_id + "/pulse").status_code == 403
            assert second.get("/api/games").json() == []
        cookie = first.cookies.get(share.COOKIE)
        first.cookies.set(share.COOKIE, cookie + "tampered")
        assert first.get("/api/health").status_code == 401
