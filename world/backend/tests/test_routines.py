import asyncio
import copy
import json
import uuid

import httpx
import pytest

from app.models import Action
from app.perception import player_view
from app.routine_thought import think_about_event
from app.routines import ROUTES, WORK_SECONDS, apply_decision, initialize, line_clear, path_to
from app.runner import TurnRunner
from app.store import Store, encode


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / "jobs.db")


def anomaly(store):
    game_id = store.create("ai", 18, {}, "night")
    world = store.get(game_id)["world"]
    world["player_position"] = {"x": 375, "y": 153}
    world["characters"]["player"]["location"] = "stage"
    with store.connection(write=True) as conn:
        conn.execute("UPDATE game_sessions SET world=? WHERE id=?", (encode(world), game_id))
    store.begin_turn(game_id, uuid.uuid4().hex, Action(action="interact", interaction="play_music"))
    return game_id


def test_jobs_reach_destinations_and_work_before_leaving(store):
    game_id = store.create("demo", 18, {}, "night")
    store.pulse(game_id, at=100)
    for tick in range(1, 4):
        store.pulse(game_id, at=100 + tick)
    world = store.get(game_id)["world"]
    caretaker = world["routines"]["actors"]["caretaker"]
    assert caretaker["phase"] == "working"
    assert caretaker["position"] == {"x": 375, "y": 153}
    assert caretaker["route"] == 0 and caretaker["work_left"] >= 10
    for tick in range(4, 12):
        store.pulse(game_id, at=100 + tick)
    working = store.get(game_id)["world"]["routines"]["actors"]["caretaker"]
    assert working["position"] == caretaker["position"] and working["phase"] == "working"
    for tick in range(12, 18):
        store.pulse(game_id, at=100 + tick)
    assert store.get(game_id)["world"]["routines"]["actors"]["caretaker"]["route"] == 1
    assert store.get(game_id)["world"]["turn"] == 0
    assert not store.debug(game_id)["calls"]


def test_full_job_cycle_has_collision_free_paths(store):
    from app.mystery import NPC_POSITIONS
    for actor, jobs in ROUTES.items():
        start = NPC_POSITIONS[actor]
        for x, y, _, _ in jobs + [jobs[0]]:
            path = path_to(start, {"x": x, "y": y})
            assert path, actor
            point = start
            for following in path:
                assert line_clear(point, following)
                point = following
            start = {"x": x, "y": y}


def test_motion_packet_contains_full_remaining_path_and_monotonic_sample(store):
    game_id = store.create("demo", 18, {}, "night")
    store.pulse(game_id, at=100)
    original = next(p for p in player_view(store, game_id)["people"] if p["id"] == "shopkeeper")
    store.pulse(game_id, at=100.8)
    following = next(p for p in player_view(store, game_id)["people"] if p["id"] == "shopkeeper")
    assert original["motion"]["path"][-1] == {"x": 116, "y": 151}
    assert following["motion"]["sampled_at"] > original["motion"]["sampled_at"]
    assert following["motion"]["revision"] == original["motion"]["revision"]
    assert following["motion"]["speed"] == 24
    assert following["motion"]["phase"] == "walking"


def test_model_is_not_scheduled_for_repeated_daily_work(store):
    game_id = store.create("ai", 18, {}, "night")
    for i in range(35):
        store.pulse(game_id, at=100 + i)
        assert store.thought_requests(game_id) == []
    assert not store.debug(game_id)["calls"]


def test_only_actual_witness_gets_anomaly_thought(store):
    game_id = anomaly(store)
    requests = store.thought_requests(game_id)
    assert [request["actor"] for request in requests] == ["caretaker"]
    assert not store.thought_requests(store.create("demo", 18, {}, "night"))


@pytest.mark.parametrize("raw,accepted", [('{"task_index":1,"intent_summary":"先检查灯光"}', True),
                                         ('{"task_index":99}', False), ('{"task_index":true}', False), ('not-json', False)])
def test_event_thought_validates_jobs_and_commits_on_free_pulse(store, monkeypatch, raw, accepted):
    async def run():
        game_id = anomaly(store)
        request = store.thought_requests(game_id)[0]
        before = copy.deepcopy(store.get(game_id)["world"])
        real_client = httpx.AsyncClient
        def respond(http_request):
            payload = json.loads(http_request.content)
            content = json.loads(payload["messages"][1]["content"])
            assert content["trigger_event"]["id"] == request["event_id"]
            assert [job["task_index"] for job in content["available_jobs"]] == [0, 1, 2]
            assert "317" not in payload["messages"][1]["content"]
            assert payload["max_tokens"] == 160
            return httpx.Response(200, json={"choices": [{"message": {"content": raw}}]})
        def configured_client(**kwargs):
            assert kwargs["timeout"] == 20
            return real_client(transport=httpx.MockTransport(respond), **kwargs)
        monkeypatch.setattr("app.routine_thought.httpx.AsyncClient", configured_client)
        await think_about_event(store, request, {"base_url": "https://model.example/v1", "model": "test", "api_key": "secret-test-value", "timeout_seconds": 20})
        assert store.get(game_id)["world"] == before
        assert store.thought_requests(game_id) == []
        store.pulse(game_id, at=100)
        world = store.get(game_id)["world"]
        routine = world["routines"]["actors"]["caretaker"]
        assert routine["thinking"] is None
        assert routine["route"] == (1 if accepted else 0)
        assert world["turn"] == 1 and world["items"] == before["items"]
        assert "secret-test-value" not in encode(store.debug(game_id))
        assert store.debug(game_id)["calls"][0]["data"]["status"] == ("ok" if accepted else "error")
    asyncio.run(run())


def test_repeated_pulses_do_not_duplicate_thinking(store, monkeypatch):
    async def run():
        game_id = anomaly(store)
        entered = asyncio.Event()
        calls = []
        async def fake(store_arg, request, settings):
            calls.append(request)
            await entered.wait()
            store_arg.record_thought(request, {"decision": {"task_index": 1}})
        monkeypatch.setattr("app.routine_thought.think_about_event", fake)
        runner = TurnRunner(store, lambda: {})
        runner.start_thoughts(game_id)
        runner.start_thoughts(game_id)
        await asyncio.sleep(0)
        assert len(calls) == 1
        entered.set()
        await asyncio.gather(*runner.thought_tasks.values())
        runner.start_thoughts(game_id)
        await asyncio.sleep(0)
        assert len(calls) == 1
        await runner.close()
    asyncio.run(run())


def test_stale_thought_cannot_replace_newer_event(store):
    game_id = anomaly(store)
    world = store.get(game_id)["world"]
    original = world["routines"]["actors"]["caretaker"]["thinking"]["event_id"]
    assert apply_decision(world, "caretaker", original + 10, {"task_index": 2}) == []
    assert world["routines"]["actors"]["caretaker"]["thinking"]["event_id"] == original


def test_only_explicit_nearby_conversation_pauses_one_resident(store):
    game_id = store.create("demo", 18, {}, "night")
    store.pulse(game_id, at=100)
    world = store.get(game_id)["world"]
    initial = copy.deepcopy(world["routines"]["actors"])
    # Both square residents are near the player at spawn. Being nearby alone
    # must neither freeze a walking job nor prevent a work timer progressing.
    store.pulse(game_id, at=101)
    actors = store.get(game_id)["world"]["routines"]["actors"]
    assert actors["mayor"]["position"] != initial["mayor"]["position"]
    assert actors["reporter"]["position"] != initial["reporter"]["position"]
    world = store.get(game_id)["world"]
    world["player_position"] = dict(actors["mayor"]["position"])
    with store.connection(write=True) as conn:
        conn.execute("UPDATE game_sessions SET world=? WHERE id=?", (encode(world), game_id))
    store.pulse(game_id, at=102, talking_to="mayor")
    stopped = store.get(game_id)["world"]["routines"]["actors"]
    assert stopped["mayor"]["phase"] == "paused"
    assert stopped["mayor"]["position"] == actors["mayor"]["position"]
    assert stopped["reporter"]["position"] != actors["reporter"]["position"]
    store.pulse(game_id, at=103)
    resumed = store.get(game_id)["world"]["routines"]["actors"]
    assert resumed["mayor"]["phase"] != "paused"
    # A client cannot freeze a resident at the opposite end of the map.
    store.pulse(game_id, at=104, talking_to="caretaker")
    assert store.get(game_id)["world"]["routines"]["actors"]["caretaker"]["phase"] != "paused"


def test_work_chatter_is_local_changes_with_job_and_uses_no_model(store):
    from app.routines import start_job
    game_id = store.create("ai", 18, {}, "night")
    store.pulse(game_id, at=100)
    people = {person["id"]: person for person in player_view(store, game_id)["people"]}
    assert people["mayor"]["ambient_speech"]
    assert not people["shopkeeper"]["ambient_speech"]
    world = store.get(game_id)["world"]
    routine = world["routines"]["actors"]["reporter"]
    first = people["reporter"]["ambient_speech"]
    start_job(routine, "reporter", 1)
    routine["phase"] = "working"
    with store.connection(write=True) as conn:
        conn.execute("UPDATE game_sessions SET world=? WHERE id=?", (encode(world), game_id))
    reporter = next(person for person in player_view(store, game_id)["people"] if person["id"] == "reporter")
    assert reporter["ambient_speech"] and reporter["ambient_speech"] != first
    assert store.get(game_id)["world"]["turn"] == 0
    assert not store.debug(game_id)["calls"]
