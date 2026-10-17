import asyncio
import json
import uuid

import httpx
import pytest

from app.agents import context_for, decide
from app.models import Action
from app.mystery import ANCHORS
from app.perception import player_view
from app.rules import RuleError
from app.runner import TurnRunner
from app.store import Store, encode


@pytest.fixture
def night(tmp_path):
    store = Store(tmp_path / "night.db")
    return store, store.create("demo", 18, {}, "night")


def walk_to(store, game_id, x, y):
    world = store.get(game_id)["world"]
    start = world["player_position"]
    distance = ((x - start["x"]) ** 2 + (y - start["y"]) ** 2) ** .5
    count = max(1, int(distance / 18) + 1)
    for i in range(1, count + 1):
        store.walk(game_id, start["x"] + (x - start["x"]) * i / count, start["y"] + (y - start["y"]) * i / count)


def travel(store, game_id, destination):
    pos = store.get(game_id)["world"]["player_position"]
    # The shared horizontal road connects the vertical approaches.
    walk_to(store, game_id, pos["x"], 183)
    target = ANCHORS[destination]
    walk_to(store, game_id, target["x"], 183)
    walk_to(store, game_id, target["x"], target["y"])


def action(store, game_id, operation, **kwargs):
    return store.begin_turn(game_id, uuid.uuid4().hex, Action(action="interact", interaction=operation, **kwargs))


def test_full_puzzle_can_be_solved_without_any_model(night):
    store, game_id = night
    travel(store, game_id, "notice")
    action(store, game_id, "read_notice")
    travel(store, game_id, "ledger")
    action(store, game_id, "read_ledger")
    action(store, game_id, "open_locker", code="317")
    travel(store, game_id, "console")
    action(store, game_id, "mute_broadcast")
    action(store, game_id, "seal_slip")
    action(store, game_id, "cut_power")
    travel(store, game_id, "gate")
    action(store, game_id, "leave_town")
    view = player_view(store, game_id)
    assert view["status"] == "won" and view["turn"] == 7
    assert len(view["mystery"]["clues"]) == 3 and view["mystery"]["anomalies"] == 0
    assert view["events"][-1]["kind"] == "ending"
    assert not store.debug(game_id)["calls"] and not store.pending(game_id)


def test_wrong_password_consumes_turn_but_keeps_locker_closed(night):
    store, game_id = night
    travel(store, game_id, "ledger")
    action(store, game_id, "open_locker", code="731")
    view = player_view(store, game_id)
    assert view["mystery"]["anomalies"] == 1
    assert not view["mystery"]["locker_open"]
    assert not any(i["holder"] == "player" for i in view["items"])
    assert "时间顺序" in view["events"][-1]["text"]
    action(store, game_id, "open_locker", code="317")
    assert store.get(game_id)["world"]["items"]["return_slip"]["holder"] == "player"


def test_bad_rules_and_third_anomaly_end_game(night):
    store, game_id = night
    travel(store, game_id, "console")
    action(store, game_id, "play_music")
    action(store, game_id, "answer_voice")
    action(store, game_id, "cut_power")
    view = player_view(store, game_id)
    assert view["status"] == "lost" and view["mystery"]["anomalies"] == 3
    assert not view["mystery"]["power_off"]
    with pytest.raises(RuleError):
        store.walk(game_id, 375, 165)


def test_distance_is_authoritative_for_investigation_and_chat(night):
    store, game_id = night
    before = store.get(game_id)["world"]
    with pytest.raises(RuleError):
        action(store, game_id, "read_ledger")
    with pytest.raises(RuleError):
        store.begin_turn(game_id, uuid.uuid4().hex, Action(action="speak", target_id="reporter", message="你好"))
    assert store.get(game_id)["world"] == before


def test_walk_is_free_persisted_and_cannot_cross_obstacles(night):
    store, game_id = night
    with pytest.raises(RuleError):
        store.walk(game_id, 375, 153)
    store.walk(game_id, 265, 211)
    assert store.get(game_id)["world"]["player_position"] == {"x": 265, "y": 211}
    travel(store, game_id, "ledger")
    restored = Store(store.path).get(game_id)["world"]
    assert restored["turn"] == 0 and restored["characters"]["player"]["location"] == "shop"
    assert restored["player_position"] == {"x": 116, "y": 151}
    assert not store.debug(game_id)["calls"] and not store.pending(game_id)


def test_clues_and_solution_not_visible_until_collected(night):
    store, game_id = night
    view = player_view(store, game_id)
    assert view["mystery"]["clues"] == [] and '"code"' not in encode(view) and "17:55" not in encode(view)
    travel(store, game_id, "ledger")
    action(store, game_id, "read_ledger")
    assert "17:55" in encode(player_view(store, game_id))
    # Ledger inspection is private evidence, not a global NPC memory.
    assert not any(e["kind"] == "clue" for e in store.events(game_id, "reporter"))


def test_dialogue_only_wakes_target_and_preserves_private_response(night):
    async def run():
        store, game_id = night
        walk_to(store, game_id, 239, 187)
        pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="speak", target_id="mayor", message="广播是谁的声音？", private=True))
        assert json.loads(store.pending(game_id)[0]["snapshot"])["actors"] == ["mayor"]
        runner = TurnRunner(store, lambda: {})
        await runner.run(pending["id"])
        assert not store.pending(game_id)
        assert len(store.debug(game_id)["calls"]) == 1
        response = next(e for e in store.events(game_id, "player") if e["kind"] == "speak" and e["actor_id"] == "mayor")
        assert response["details"]["private"]
        assert not any(e["id"] == response["id"] for e in store.events(game_id, "reporter"))
    asyncio.run(run())


def test_model_payload_is_short_and_deepseek_reasoning_disabled(tmp_path, monkeypatch):
    async def run():
        store = Store(tmp_path / "llm.db")
        game_id = store.create("ai", 18, {}, "night")
        walk_to(store, game_id, 239, 187)
        pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="speak", target_id="mayor", message="第四条是谁贴的？"))
        snapshot = json.loads(store.pending(game_id)[0]["snapshot"])
        client = httpx.AsyncClient
        def handler(request):
            body = json.loads(request.content)
            assert body["max_tokens"] == 320 and body["thinking"] == {"type": "disabled"}
            assert "17:55" not in body["messages"][1]["content"] and '"code"' not in body["messages"][1]["content"]
            return httpx.Response(200, json={"choices": [{"message": {"content": '{"action":"speak","target_id":"player","message":"我记不清了。"}'}}]})
        monkeypatch.setattr("app.agents.httpx.AsyncClient", lambda **kwargs: client(transport=httpx.MockTransport(handler), **kwargs))
        await decide(store, game_id, pending["id"], "mayor", snapshot, {"base_url": "https://model.example/v1", "api_key": "not-a-real-key", "model": "deepseek-test"})
        store.resolve(pending["id"])
        assert store.debug(game_id)["calls"][0]["data"]["status"] == "ok"
    asyncio.run(run())


def test_timeout_deadline_and_early_exit_remain_deterministic(night):
    store, game_id = night
    travel(store, game_id, "gate")
    action(store, game_id, "leave_town")
    assert store.get(game_id)["world"]["status"] == "playing"
    for _ in range(17):
        store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
    assert store.get(game_id)["world"]["status"] == "lost"


def test_last_turn_escape_wins_before_deadline_failure(night):
    store, game_id = night
    travel(store, game_id, "gate")
    world = store.get(game_id)["world"]
    world["turn"] = 17
    world["mystery"].update(muted=True, sealed=True, power_off=True)
    with store.connection(write=True) as conn:
        conn.execute("UPDATE game_sessions SET world=? WHERE id=?", (encode(world), game_id))
    action(store, game_id, "leave_town")
    assert store.get(game_id)["world"]["status"] == "won"


def test_expanded_grove_garden_loop_is_walkable_free_and_has_optional_clues(night):
    store, game_id = night
    walk_to(store, game_id, 239, 183)
    walk_to(store, game_id, 668, 183)
    action(store, game_id, "read_trail")
    walk_to(store, game_id, 668, 335)
    walk_to(store, game_id, 511, 335)
    action(store, game_id, "inspect_garden")
    walk_to(store, game_id, 239, 335)
    walk_to(store, game_id, 239, 211)
    view = player_view(store, game_id)
    assert view["mystery"]["world_size"] == {"width": 768, "height": 480}
    assert view["turn"] == 2
    assert {c["id"] for c in view["mystery"]["clues"]} == {"trail", "garden"}
    assert view["actor"]["location"] == "square"
    assert not store.pending(game_id) and not store.debug(game_id)["calls"]


def test_grass_in_expanded_garden_is_walkable(night):
    store, game_id = night
    walk_to(store, game_id, 239, 183)
    walk_to(store, game_id, 550, 183)
    store.walk(game_id, 550, 220)
    assert store.get(game_id)["world"]["player_position"] == {"x": 550, "y": 220}


def test_obstacles_block_buildings_and_prop_collision_matches_payload(night):
    from app.mystery import walkable
    store, game_id = night
    assert walkable(265, 211)
    assert not walkable(80, 90)
    assert not walkable(370, 100)
    assert not walkable(0, 0)
    bounds = player_view(store, game_id)["mystery"]["obstacles"]
    assert len(bounds) > 100
    for left, top, right, bottom in bounds:
        assert not walkable((left + right) / 2, (top + bottom) / 2)


def test_npc_routines_are_authoritative_saved_and_do_not_use_turns_or_llm(night):
    store, game_id = night
    store.pulse(game_id, at=100)
    before = store.get(game_id)["world"]
    store.pulse(game_id, at=101)
    world = store.get(game_id)["world"]
    assert world["routines"]["actors"]["shopkeeper"]["position"] != before["routines"]["actors"]["shopkeeper"]["position"]
    assert world["routines"]["actors"]["mayor"]["position"] != before["routines"]["actors"]["mayor"]["position"]
    assert world["turn"] == 0 and not store.debug(game_id)["calls"]
    view = player_view(store, game_id)
    shopkeeper = next(person for person in view["people"] if person["id"] == "shopkeeper")
    assert shopkeeper["moving"] and shopkeeper["activity"]
    assert shopkeeper["position"] == world["routines"]["actors"]["shopkeeper"]["position"]
    assert Store(store.path).get(game_id)["world"]["routines"] == world["routines"]


def test_npc_pulse_does_not_change_pending_snapshot(night):
    store, game_id = night
    walk_to(store, game_id, 239, 187)
    pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="speak", target_id="mayor", message="你好"))
    before = store.get(game_id)["world"]
    store.pulse(game_id, at=100)
    assert store.get(game_id)["world"] == before
    store.resolve(pending["id"])


def test_caretaker_reacts_to_observed_broadcast_change_once(night):
    store, game_id = night
    travel(store, game_id, "console")
    action(store, game_id, "mute_broadcast")
    store.pulse(game_id, at=100)
    store.pulse(game_id, at=101)
    reactions = [event for event in store.events(game_id, "player") if event["kind"] == "routine" and "总算" in event["text"]]
    assert len(reactions) == 1
    assert not any(event["id"] == reactions[0]["id"] for event in store.events(game_id, "shopkeeper"))
