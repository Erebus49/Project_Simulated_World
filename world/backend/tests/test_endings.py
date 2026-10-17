import uuid

from app.models import Action
from app.store import Store


def test_deadline_failure_uses_state_and_cannot_continue(tmp_path):
    store = Store(tmp_path / "deadline.db")
    game_id = store.create("demo", 12, {})
    for _ in range(12):
        pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
        store.resolve(pending["id"])
    assert store.get(game_id)["world"]["status"] == "lost"
    ending = store.events(game_id, "player")[-1]
    assert ending["kind"] == "ending" and "安全检查尚未完成" in ending["text"]


def test_short_intention_is_private_memory_not_public_fact(tmp_path):
    store = Store(tmp_path / "intent.db")
    game_id = store.create("demo", 18, {})
    pending = store.begin_turn(game_id, uuid.uuid4().hex, Action(action="wait"))
    store.save_proposal(pending["id"], "mayor", {"action": "wait", "intent_summary": "先核实店主的说法，再决定是否公开回应"}, {})
    store.resolve(pending["id"])
    assert any(e["kind"] == "intent" for e in store.events(game_id, "mayor"))
    for observer in ("player", "shopkeeper", "caretaker", "reporter"):
        assert not any(e["kind"] == "intent" for e in store.events(game_id, observer))
