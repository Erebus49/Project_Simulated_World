import asyncio
import importlib
import time

from fastapi.testclient import TestClient

from app.runner import TurnRunner
from app.store import Store


def test_http_lifecycle_settings_and_local_boundary(tmp_path, monkeypatch):
    main = importlib.import_module("app.main")
    test_store = Store(tmp_path / "api.db")
    monkeypatch.setattr(main, "store", test_store)
    monkeypatch.setattr(main, "settings_path", tmp_path / "model.json")
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("MODEL_NAME", raising=False)
    monkeypatch.setattr(main, "runner", TurnRunner(test_store, main.settings))

    with TestClient(main.app) as client:
        assert client.get("/api/health").json()["status"] == "ok"
        assert client.post("/api/games", json={"mode": "ai"}).status_code == 422
        assert client.put("/api/settings", json={"base_url": "file:///tmp/x"}).status_code == 422
        settings = client.put("/api/settings", json={"base_url": "https://model.example/v1", "model": "mock", "api_key": "test-only-key"})
        assert settings.status_code == 200 and settings.json()["has_api_key"]
        assert "test-only-key" not in settings.text
        assert "test-only-key" not in client.get("/api/settings").text
        assert client.put("/api/settings", json={"base_url": "https://model.example/v1", "model": "mock", "api_key": ""}).status_code == 200
        assert main.settings()["api_key"] == "test-only-key"
        assert client.get("/api/settings", headers={"Origin": "https://unrelated.example"}).status_code == 403
        assert client.get("/api/health", headers={"Host": "unrelated.example"}).status_code == 403

        created = client.post("/api/games", json={"mode": "demo", "max_turns": 18})
        assert created.status_code == 201
        game_id = created.json()["id"]
        payload = {"request_id": "http-request-001", "action": {"action": "wait"}}
        submitted = client.post(f"/api/games/{game_id}/actions", json=payload)
        assert submitted.status_code == 202
        for _ in range(100):
            view = client.get(f"/api/games/{game_id}").json()
            if not view["busy"]:
                break
            time.sleep(.02)
        assert view["turn"] == 1 and not view["busy"]
        assert client.post(f"/api/games/{game_id}/actions", json=payload).json()["status"] == "done"
        assert client.get(f"/api/games/{game_id}").json()["turn"] == 1
        assert "goal" not in view and "world" not in view
        assert client.get(f"/api/debug/games/{game_id}").json()["world"]["characters"]["shopkeeper"]["goal"]
        monkeypatch.setenv("WORLD_DEBUG", "0")
        assert client.get(f"/api/debug/games/{game_id}").status_code == 404
        assert client.get(f"/api/games/{game_id}").status_code == 200
        restarted = client.post(f"/api/games/{game_id}/restart").json()
        assert restarted["id"] != game_id and restarted["turn"] == 0
        assert len(client.get("/api/games").json()) == 2
        assert client.get("/api/games/not-a-save").status_code == 404


def test_sse_only_delivers_player_events_and_accepts_reconnect_cursor(tmp_path, monkeypatch):
    main = importlib.import_module("app.main")
    test_store = Store(tmp_path / "stream.db")
    monkeypatch.setattr(main, "store", test_store)
    game_id = test_store.create("demo", 18, {})
    private_events = test_store.events(game_id, "shopkeeper")
    secret = next(e for e in private_events if e["kind"] == "briefing")

    class Request:
        headers = {"last-event-id": "0"}
        calls = 0
        async def is_disconnected(self):
            self.calls += 1
            return self.calls > 1

    async def read():
        request = Request()
        response = await main.stream(game_id, request, after=0)
        text = "".join([part async for part in response.body_iterator])
        assert secret["text"] not in text and '"kind": "briefing"' not in text
        assert "event: world" in text and "event: turn" in text
        last_player_id = test_store.events(game_id, "player")[-1]["id"]
        request = Request()
        request.headers = {"last-event-id": str(last_player_id)}
        response = await main.stream(game_id, request, after=0)
        resumed = "".join([part async for part in response.body_iterator])
        assert "event: world" not in resumed
    asyncio.run(read())
