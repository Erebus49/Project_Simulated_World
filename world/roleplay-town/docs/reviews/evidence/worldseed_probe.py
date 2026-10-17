"""Offline architecture probes. Run from the reviewed WorldSeed repository CWD."""
from pathlib import Path
import asyncio
import json
import sys
sys.path.insert(0, str(Path.cwd() / "src"))

from worldseed.engine.action_queue import ActionQueue
from worldseed.engine.event_log import EventLog
from worldseed.engine.inbox import InboxManager
from worldseed.engine.perceiver import Perceiver
from worldseed.engine.rules_engine import RulesEngine
from worldseed.engine.state_store import StateStore
from worldseed.engine.tick import TickEngine
from worldseed.models.action import ActionSubmission
from worldseed.models.config_schema import SceneConfig, SceneMetaConfig, ActionConfig, PreconditionConfig, EffectConfig, PerceptionConfig, DMConfig
from worldseed.models.entity import Entity
from worldseed.models.event import Event
from worldseed.protocol.dm import DMResponse
from worldseed.world import WorldEngine


def store_with_agents():
    store = StateStore()
    for name in ["A", "B", "C"]:
        store.add(Entity(id=name, type="agent", _data={"location": "cafe", "money": 10, "cups": 0, "private_goal": f"secret-{name}"}))
    store.add(Entity(id="coffee", type="resource", _data={"stock": 1}))
    return store


def compete(order):
    store, queue, log = store_with_agents(), ActionQueue(), EventLog()
    config = SceneConfig(scene=SceneMetaConfig(id="probe", description="probe"), entities=[], actions={
        "buy": ActionConfig(description="buy", preconditions=[PreconditionConfig(operator="check", left="coffee.stock", op=">=", right=1)],
            effects=[EffectConfig(operator="decrement", target="coffee.stock", by=1), EffectConfig(operator="increment", target="$agent.cups", by=1)])})
    for actor in order:
        assert queue.submit(ActionSubmission(agent_id=actor, action_type="buy")) is None
    results = TickEngine(config, store, log, queue).step()
    assert sum(r.success for r in results) == 1
    assert store.get("coffee")["stock"] == 0
    return next(actor for actor in order if store.get(actor)["cups"] == 1)


winner_ab, winner_ba = compete(["A", "B"]), compete(["B", "A"])
assert (winner_ab, winner_ba) == ("A", "B")

# Public WorldEngine.submit does not even use the per-tick queue for mechanical actions.
world = WorldEngine(config=SceneConfig(scene=SceneMetaConfig(id="immediate", description="probe"), entities=[], actions={
    "earn": ActionConfig(description="mechanical", effects=[EffectConfig(operator="increment", target="$agent.money", by=1)])}))
world.state.add(Entity(id="A", type="agent", _data={"money": 0}))
first = world.submit("A", "earn")
second = world.submit("A", "earn")
assert first.success and second.success and world.tick == 0 and world.state.get("A")["money"] == 2

store, log = store_with_agents(), EventLog()
config = SceneConfig(scene=SceneMetaConfig(id="partial", description="probe"), entities=[], actions={
    "broken_trade": ActionConfig(description="malformed scene effect", effects=[
        EffectConfig(operator="decrement", target="$agent.money", by=3),
        EffectConfig(operator="increment", target="nonexistent_vendor.money", by=3),
    ])})
result = RulesEngine(config, store, log).process_action(ActionSubmission(agent_id="A", action_type="broken_trade"), 1)
assert result.success and store.get("A")["money"] == 7

inboxes = InboxManager()
perceiver = Perceiver(store, log, inboxes, PerceptionConfig(hidden_properties=["private_goal"]))
log.append(Event(tick=1, type="whisper", source="A", target="B", detail="PRIVATE-MESSAGE", ttl=5, scope="target_only"))
log.append(Event(tick=1, type="note", source="A", detail="UNDECLARED-SCOPE", ttl=5, scope="mistyped-private"))
perceiver.deliver(1)
read_a = inboxes.get_or_create("A").read()
read_b = inboxes.get_or_create("B").read()
read_c = inboxes.get_or_create("C").read()
def details(data):
    return [e.detail for e in data["events"]] + [e.detail for e in data["whispers"]]
assert "PRIVATE-MESSAGE" in details(read_b) and "PRIVATE-MESSAGE" not in details(read_c)
assert "UNDECLARED-SCOPE" in details(read_c)
assert "private_goal" not in read_a["current_state"].visible_agents["B"]
assert read_a["current_state"].self_state["private_goal"] == "secret-A"


async def dm_order(delays):
    store, queue, log = store_with_agents(), ActionQueue(), EventLog()
    store.add(Entity(id="shared", type="state", _data={"winner": "none"}))
    class DM:
        async def judge(self, context):
            actor = context.action.agent_id
            await asyncio.sleep(delays[actor])
            return DMResponse(narrative="", effects=[EffectConfig(operator="set", target="shared.winner", value=actor)])
    config = SceneConfig(scene=SceneMetaConfig(id="dm-order", description="probe"), entities=[], actions={
        "judge": ActionConfig(description="indirect shared effect", dm=DMConfig(scope="global"))})
    for actor in ["A", "B"]:
        queue.submit(ActionSubmission(agent_id=actor, action_type="judge"))
    await TickEngine(config, store, log, queue, dm_provider=DM()).step_async()
    return store.get("shared")["winner"]


dm_fast_a = asyncio.run(dm_order({"A": .005, "B": .04}))
dm_fast_b = asyncio.run(dm_order({"A": .04, "B": .005}))
assert (dm_fast_a, dm_fast_b) == ("B", "A")
print(json.dumps({
    "fifoChangesWinner": {"AB": winner_ab, "BA": winner_ba},
    "publicSubmitAppliesImmediately": {"tick": world.tick, "sameActorAcceptedTwice": first.success and second.success, "money": world.state.get("A")["money"]},
    "malformedMechanicalTrade": {"reportedSuccess": result.success, "buyerMoney": store.get("A")["money"], "vendorExists": False},
    "perception": {"hiddenTopLevelGoalFiltered": True, "targetOnlyReachesOnlyRecipient": True, "undeclaredScopeBecomesPublic": True},
    "parallelDMIndirectSharedEffect": {"Afast_finalWinner": dm_fast_a, "Bfast_finalWinner": dm_fast_b},
    "eventSchemaHasStableId": "event_id" in Event.__dataclass_fields__,
    "eventSchemaHasSourceEventIds": "source_event_ids" in Event.__dataclass_fields__,
    "probesConfirmed": 6,
}, indent=2))
