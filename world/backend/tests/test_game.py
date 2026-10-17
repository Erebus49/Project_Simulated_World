import asyncio
import copy
import json
import uuid

import httpx
import pytest

from app.agents import context_for, decide, demonstration
from app.models import Action
from app.perception import player_view
from app.rules import NPCS, RuleError, apply_action, observation
from app.runner import TurnRunner
from app.scenario import initial_world
from app.store import Store, encode


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / "test.db")


def create(store, mode="demo", max_turns=18):
    return store.create(mode, max_turns, {})


def set_world(store, game_id, world):
    with store.connection(write=True) as conn:
        conn.execute("UPDATE game_sessions SET world=? WHERE id=?", (encode(world), game_id))


def turn(store, game_id, action=None, proposals=None):
    pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(**(action or {"action": "wait"})))
    for actor in NPCS:
        store.save_proposal(pending["id"], actor, (proposals or {}).get(actor, {"action": "wait"}), {"status": "ok"})
    store.resolve(pending["id"])
    return pending


def test_independent_actions_share_snapshot_without_global_version_rejection(store):
    game_id = create(store)
    turn(store, game_id, proposals={"mayor": {"action": "move", "target_id": "shop"}, "reporter": {"action": "move", "target_id": "stage"}})
    world = store.get(game_id)["world"]
    assert world["characters"]["mayor"]["location"] == "shop"
    assert world["characters"]["reporter"]["location"] == "stage"
    assert all(p["result"]["ok"] for p in store.debug(game_id)["proposals"])


def test_competing_item_has_one_owner_and_one_rejection(store):
    game_id = create(store)
    world = store.get(game_id)["world"]
    world["items"]["speaker"].update(holder=None, location="square")
    set_world(store, game_id, world)
    turn(store, game_id, proposals={a: {"action": "take", "item_id": "speaker"} for a in ("mayor", "reporter")})
    assert store.get(game_id)["world"]["items"]["speaker"]["holder"] == "mayor"
    results = {p["character_id"]: p["result"] for p in store.debug(game_id)["proposals"]}
    assert results["mayor"]["ok"] and not results["reporter"]["ok"]


def test_private_lie_not_delivered_or_promoted_to_fact(store):
    game_id = create(store)
    turn(store, game_id, {"action": "move", "target_id": "shop"})
    turn(store, game_id, {"action": "speak", "target_id": "shopkeeper", "private": True, "message": "暗号松果七号，镇长已经分好摊位了"})
    assert any("松果七号" in e["text"] for e in store.events(game_id, "shopkeeper"))
    for actor in ("mayor", "caretaker", "reporter"):
        assert not any("松果七号" in e["text"] for e in store.events(game_id, actor))
    assert store.get(game_id)["world"]["facilities"]["stall_allocated"] is False
    # Seeing the stage cannot reveal a distant plaza allocation.
    assert "stall_allocated" not in observation(store.get(game_id)["world"], "stage")["facilities"]


def test_context_contains_only_own_goal_and_delivered_events(store):
    game_id = create(store)
    world = store.get(game_id)["world"]
    world["characters"]["shopkeeper"]["goal"] = "只有我知道的目标松针九号"
    set_world(store, game_id, world)
    pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
    raw = next(t for t in store.pending() if t["id"] == pending["id"])
    context = context_for(store, game_id, "mayor", json.loads(raw["snapshot"]))
    assert "松针九号" not in encode(context)
    assert "briefing" not in context["actor"]
    assert not any(p["id"] == "shopkeeper" for p in context["visible_people"])


def test_illegal_player_action_rolls_back_turn_and_events(store):
    game_id = create(store)
    before = store.get(game_id)["world"]
    events = store.events(game_id, actor=None)
    with pytest.raises(RuleError):
        store.begin_turn(game_id, uuid.uuid4().hex, Action(action="give", item_id="speaker", target_id="mayor"))
    assert store.get(game_id)["world"] == before
    assert store.events(game_id, actor=None) == events
    assert not store.pending(game_id)


def test_idempotent_submission_and_resolution(store):
    game_id = create(store)
    first = store.begin_turn(game_id, "same-request-key", Action(action="wait"))
    second = store.begin_turn(game_id, "same-request-key", Action(action="wait"))
    assert first == second
    with pytest.raises(RuleError):
        store.begin_turn(game_id, "different-request", Action(action="wait"))
    store.resolve(first["id"])
    before = store.events(game_id, actor=None)
    store.resolve(first["id"])
    assert store.get(game_id)["world"]["turn"] == 1
    assert store.events(game_id, actor=None) == before
    assert store.begin_turn(game_id, "same-request-key", Action(action="wait"))["status"] == "done"


def test_last_turn_success_evaluated_after_actions(store):
    game_id = create(store, max_turns=12)
    world = store.get(game_id)["world"]
    world["turn"] = 11
    world["characters"]["player"]["location"] = "stage"
    world["facilities"].update(stage_open=True, inspection=2)
    world["items"]["speaker"].update(holder="player", location=None)
    set_world(store, game_id, world)
    turn(store, game_id, {"action": "interact", "interaction": "install_speaker"})
    assert store.get(game_id)["world"]["status"] == "won"
    assert store.get(game_id)["world"]["turn"] == 12
    assert player_view(store, game_id)["events"][-1]["kind"] == "ending"


def test_only_caretaker_can_inspect_and_two_actions_required():
    world = initial_world()
    apply_action(world, "caretaker", Action(action="interact", interaction="unlock_stage"))
    world["characters"]["player"]["location"] = "stage"
    with pytest.raises(RuleError):
        apply_action(world, "player", Action(action="interact", interaction="inspect_stage"))
    apply_action(world, "caretaker", Action(action="interact", interaction="inspect_stage"))
    assert world["facilities"]["inspection"] == 1
    apply_action(world, "caretaker", Action(action="interact", interaction="inspect_stage"))
    assert world["facilities"]["inspection"] == 2


def test_speech_cannot_transfer_items():
    world = initial_world()
    world["characters"]["player"]["location"] = "shop"
    before = copy.deepcopy(world)
    apply_action(world, "shopkeeper", Action(action="speak", target_id="player", message="我把音箱给你了，庆典已经成功"))
    assert world == before


def test_observation_is_free_and_remote_secrets_absent(store):
    game_id = create(store)
    pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="observe"))
    view = player_view(store, game_id)
    assert pending["status"] == "done" and view["turn"] == 0
    assert "goal" not in encode(view)
    assert not any(i["id"] == "speaker" for i in view["items"])


def test_demo_agents_can_finish_with_real_rules(store):
    game_id = create(store)
    for _ in range(18):
        pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
        record = store.pending(game_id)[0]
        snapshot = json.loads(record["snapshot"])
        for actor in NPCS:
            proposal = demonstration(context_for(store, game_id, actor, snapshot))
            store.save_proposal(pending["id"], actor, proposal, {"status": "ok"})
        store.resolve(pending["id"])
        if store.get(game_id)["world"]["status"] != "playing":
            break
    assert store.get(game_id)["world"]["status"] == "won"
    assert store.get(game_id)["world"]["items"]["speaker"] == {"name": "备用音箱", "holder": None, "location": "stage"}


def test_pending_turn_recovers_without_repeating_saved_proposal(store):
    async def run():
        game_id = create(store)
        pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
        store.save_proposal(pending["id"], "caretaker", {"action": "interact", "interaction": "unlock_stage"}, {"status": "ok"})
        runner = TurnRunner(store, lambda: {})
        await runner.run(pending["id"])
        await runner.run(pending["id"])
        assert not store.pending(game_id)
        assert store.get(game_id)["world"]["facilities"]["stage_open"]
        assert len([e for e in store.events(game_id, actor=None) if e["details"].get("interaction") == "unlock_stage"]) == 1
        assert len(store.debug(game_id)["calls"]) == 4
    asyncio.run(run())


@pytest.mark.parametrize("result", ["not-json", '{"action":"move","target_id":"shop","related_event_ids":[999999]}'])
def test_invalid_model_output_waits_without_mutation(store, monkeypatch, result):
    async def run():
        game_id = create(store, "ai")
        pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
        snapshot = json.loads(store.pending(game_id)[0]["snapshot"])
        real_client = httpx.AsyncClient

        def handler(request):
            payload = json.loads(request.content)
            assert "只有我知道" not in payload["messages"][1]["content"]
            return httpx.Response(200, json={"choices": [{"message": {"content": result}}], "usage": {"total_tokens": 10}})

        monkeypatch.setattr("app.agents.httpx.AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
        await decide(store, game_id, pending["id"], "mayor", snapshot, {"base_url": "https://model.example/v1", "api_key": "never-log-this", "model": "test"})
        assert store.proposals(pending["id"])["mayor"]["action"] == "wait"
        data = store.debug(game_id)
        assert data["calls"][0]["data"]["status"] == "error"
        assert "never-log-this" not in encode(data)
    asyncio.run(run())


def test_valid_model_action_and_usage_recorded(store, monkeypatch):
    async def run():
        game_id = create(store, "ai")
        pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
        snapshot = json.loads(store.pending(game_id)[0]["snapshot"])
        real_client = httpx.AsyncClient
        def handler(request):
            return httpx.Response(200, json={"choices": [{"message": {"content": '{"action":"move","target_id":"shop","intent_summary":"找店主核实"}'}}], "usage": {"total_tokens": 100}})
        monkeypatch.setattr("app.agents.httpx.AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
        await decide(store, game_id, pending["id"], "mayor", snapshot, {"base_url": "https://model.example/v1", "api_key": "secret", "model": "test"})
        store.resolve(pending["id"])
        assert store.get(game_id)["world"]["characters"]["mayor"]["location"] == "shop"
        assert store.debug(game_id)["calls"][0]["data"]["usage"]["total_tokens"] == 100
    asyncio.run(run())


def test_timeout_is_recorded_and_late_result_ignored(store, monkeypatch):
    async def run():
        game_id = create(store, "ai")
        pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
        snapshot = json.loads(store.pending(game_id)[0]["snapshot"])
        real_client = httpx.AsyncClient
        def handler(request):
            raise httpx.ReadTimeout("timeout", request=request)
        monkeypatch.setattr("app.agents.httpx.AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
        await decide(store, game_id, pending["id"], "mayor", snapshot, {"base_url": "https://model.example/v1", "api_key": "secret", "model": "test"})
        store.resolve(pending["id"])
        before = store.get(game_id)["world"]
        store.save_proposal(pending["id"], "mayor", {"action": "move", "target_id": "shop"}, {})
        assert store.get(game_id)["world"] == before
        assert "超时" in store.debug(game_id)["calls"][0]["data"]["error"]
    asyncio.run(run())
