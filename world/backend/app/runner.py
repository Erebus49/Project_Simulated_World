import asyncio
import json
import logging

from .agents import decide
from .rules import NPCS

log = logging.getLogger(__name__)


class TurnRunner:
    def __init__(self, store, settings):
        self.store = store
        self.settings = settings
        self.tasks = {}
        self.active = {}
        self.thought_tasks = {}

    def start_thoughts(self, game_id):
        from .routine_thought import think_about_event
        for request in self.store.thought_requests(game_id):
            key = (game_id, request["actor"], request["event_id"])
            if key in self.thought_tasks:
                continue
            task = asyncio.create_task(think_about_event(self.store, request, self.settings()))
            self.thought_tasks[key] = task
            task.add_done_callback(lambda done, identity=key: self.thought_tasks.pop(identity, None))

    def start(self, turn):
        if turn["status"] != "pending" or turn["id"] in self.tasks:
            return
        task = asyncio.create_task(self.run(turn["id"]))
        self.tasks[turn["id"]] = task
        task.add_done_callback(lambda done: self.tasks.pop(turn["id"], None))

    async def run(self, turn_id):
        pending = next((t for t in self.store.pending() if t["id"] == turn_id), None)
        if not pending:
            return
        game_id = pending["game_id"]
        snapshot = json.loads(pending["snapshot"])
        existing = self.store.proposals(turn_id)
        actors = [a for a in snapshot.get("actors", NPCS) if a not in existing]
        self.active[game_id] = actors
        settings = self.settings()
        try:
            tasks = [asyncio.create_task(decide(self.store, game_id, turn_id, actor, snapshot, settings)) for actor in actors]
            if tasks:
                await asyncio.wait_for(asyncio.gather(*tasks), timeout=settings.get("timeout_seconds", 10) + 3)
            self.store.resolve(turn_id)
        except asyncio.CancelledError:
            # Proposals already persisted can be reused after restart.
            raise
        except Exception:
            log.exception("Turn %s failed; settling available proposals", turn_id)
            self.store.resolve(turn_id)
        finally:
            self.active.pop(game_id, None)

    async def close(self):
        for task in list(self.tasks.values()) + list(self.thought_tasks.values()):
            task.cancel()
        await asyncio.gather(*list(self.tasks.values()), *list(self.thought_tasks.values()), return_exceptions=True)
