import json
import os
import sqlite3
import uuid
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .models import Action
from .rules import NPCS, RuleError, apply_action, event, observation, settle
from .scenario import initial_world


def encode(value):
    return json.dumps(value, ensure_ascii=False)


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path=None):
        self.path = Path(path or os.environ.get("WORLD_DB_PATH", str(Path(__file__).resolve().parents[1] / "data" / "world.db")))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as conn:
            conn.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS game_sessions (
                    id TEXT PRIMARY KEY, mode TEXT NOT NULL, world TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS turn_runs (
                    id TEXT PRIMARY KEY, game_id TEXT NOT NULL, request_id TEXT NOT NULL,
                    turn INTEGER NOT NULL, status TEXT NOT NULL, snapshot TEXT NOT NULL,
                    created_at TEXT NOT NULL, UNIQUE(game_id, request_id));
                CREATE TABLE IF NOT EXISTS world_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL,
                    turn INTEGER NOT NULL, actor_id TEXT NOT NULL, kind TEXT NOT NULL,
                    text TEXT NOT NULL, details TEXT NOT NULL, causes TEXT NOT NULL,
                    created_at TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS events_game ON world_events(game_id, id);
                CREATE TABLE IF NOT EXISTS event_recipients (
                    event_id INTEGER NOT NULL, character_id TEXT NOT NULL,
                    PRIMARY KEY(event_id, character_id));
                CREATE TABLE IF NOT EXISTS character_memories (
                    event_id INTEGER NOT NULL, game_id TEXT NOT NULL, character_id TEXT NOT NULL,
                    source_type TEXT NOT NULL, PRIMARY KEY(event_id, character_id));
                CREATE TABLE IF NOT EXISTS action_proposals (
                    turn_id TEXT NOT NULL, character_id TEXT NOT NULL,
                    proposal TEXT NOT NULL, result TEXT, PRIMARY KEY(turn_id, character_id));
                CREATE TABLE IF NOT EXISTS llm_calls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL,
                    turn_id TEXT NOT NULL, character_id TEXT NOT NULL,
                    data TEXT NOT NULL, created_at TEXT NOT NULL);
                PRAGMA user_version=1;
            """)

    @contextmanager
    def connection(self, write=False):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            if write:
                conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _append(self, conn, game_id, events):
        ids = []
        for entry in events:
            cursor = conn.execute("INSERT INTO world_events(game_id,turn,actor_id,kind,text,details,causes,created_at) VALUES(?,?,?,?,?,?,?,?)",
                                  (game_id, entry["turn"], entry["actor_id"], entry["kind"], entry["text"], encode(entry["details"]), encode(entry["causes"]), now()))
            event_id = cursor.lastrowid
            ids.append(event_id)
            for char in set(entry["recipients"]):
                conn.execute("INSERT INTO event_recipients VALUES(?,?)", (event_id, char))
                source = "judgment" if entry["kind"] == "intent" else "told" if entry["kind"] == "speak" and char != entry["actor_id"] else "observed"
                conn.execute("INSERT INTO character_memories VALUES(?,?,?,?)", (event_id, game_id, char, source))
        return ids

    def create(self, mode, max_turns, goals, scenario_id="festival"):
        game_id = uuid.uuid4().hex
        world = initial_world(max_turns, goals, scenario_id)
        with self.connection(write=True) as conn:
            conn.execute("INSERT INTO game_sessions VALUES(?,?,?,?,?)", (game_id, mode, encode(world), now(), now()))
            opening = "谢幕已经过去很久。广播却还在叫你的名字。沿小路调查公告栏和杂货铺，在最后一声钟响前离镇。WASD 走动不消耗回合，靠近后按 E 交互。" if scenario_id == "night" else "庆典就要开始。周师傅负责舞台，阿栗有备用音箱；去听听大家的打算吧。"
            entries = [event(world, "system", "opening", opening, list(world["characters"]),
                             {"positions": {a: c["location"] for a, c in world["characters"].items()}, "facilities": dict(world["facilities"])})]
            entries.append(event(world, "player", "observe", "你站在广场南侧的小路上。纸灯笼轻轻摇晃，没有风。" if scenario_id == "night" else "你来到庆典广场，临时志愿者的工作开始了。", ["player"], observation(world, "square")))
            for actor in NPCS:
                entries.append(event(world, actor, "briefing", world["characters"][actor]["briefing"], [actor]))
            self._append(conn, game_id, entries)
        return game_id

    def get(self, game_id, conn=None):
        if conn is None:
            with self.connection() as db:
                return self.get(game_id, db)
        row = conn.execute("SELECT * FROM game_sessions WHERE id=?", (game_id,)).fetchone()
        if not row:
            raise KeyError("存档不存在")
        return {**dict(row), "world": json.loads(row["world"])}

    def events(self, game_id, actor="player", after=0, through=None, limit=300, recent=False):
        with self.connection() as conn:
            params = [game_id, after]
            sql = "SELECT e.* FROM world_events e WHERE e.game_id=? AND e.id>?"
            if actor is not None:
                sql += " AND EXISTS (SELECT 1 FROM event_recipients r WHERE r.event_id=e.id AND r.character_id=?)"
                params.append(actor)
            if through is not None:
                sql += " AND e.id<=?"
                params.append(through)
            sql += " ORDER BY e.id DESC LIMIT ?" if recent else " ORDER BY e.id LIMIT ?"
            params.append(limit)
            rows = conn.execute(sql, params).fetchall()
            if recent:
                rows = reversed(rows)
            return [{**dict(r), "details": json.loads(r["details"]), "causes": json.loads(r["causes"])} for r in rows]

    def list_games(self):
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM game_sessions ORDER BY updated_at DESC LIMIT 20").fetchall()
            return [{"id": r["id"], "mode": r["mode"], "created_at": r["created_at"], "updated_at": r["updated_at"],
                     "scenario_id": json.loads(r["world"]).get("scenario_id", "festival"),
                     **{k: json.loads(r["world"])[k] for k in ("turn", "max_turns", "status")}} for r in rows]

    def pending(self, game_id=None):
        with self.connection() as conn:
            sql = "SELECT * FROM turn_runs WHERE status='pending'"
            rows = conn.execute(sql + (" AND game_id=?" if game_id else ""), (game_id,) if game_id else ()).fetchall()
            return [dict(row) for row in rows]

    def begin_turn(self, game_id, request_id, action):
        with self.connection(write=True) as conn:
            existing = conn.execute("SELECT id,status FROM turn_runs WHERE game_id=? AND request_id=?", (game_id, request_id)).fetchone()
            if existing:
                return dict(existing)
            game = self.get(game_id, conn)
            world = game["world"]
            if conn.execute("SELECT 1 FROM turn_runs WHERE game_id=? AND status='pending'", (game_id,)).fetchone():
                raise RuleError("角色正在行动，请等待本回合结束")
            # Players cannot forge evidence or actor identities.
            action = action.model_copy(update={"related_event_ids": []})
            if action.action != "observe":
                world["turn"] += 1
            entries = apply_action(world, "player", action)
            night = world.get("scenario_id") == "night"
            if night:
                from .routines import recipients
                for entry in entries:
                    if entry["kind"] == "anomaly":
                        entry["recipients"] = sorted(set(recipients(world, "player", world["player_position"])))
            actors = [action.target_id] if night and action.action == "speak" else [] if night else list(NPCS)
            status = "done" if action.action == "observe" or not actors else "pending"
            if status == "done" and action.action != "observe":
                ending = settle(world)
                if ending:
                    entries.append(ending)
            world["version"] += 1
            ids = self._append(conn, game_id, entries)
            if night and game["mode"] == "ai":
                from .routines import queue_thought
                for event_id, entry in zip(ids, entries):
                    queue_thought(world, event_id, entry)
            conn.execute("UPDATE game_sessions SET world=?,updated_at=? WHERE id=?", (encode(world), now(), game_id))
            turn_id = uuid.uuid4().hex
            snapshot = {"world": world, "event_cursor": ids[-1], "mode": game["mode"], "actors": actors}
            conn.execute("INSERT INTO turn_runs VALUES(?,?,?,?,?,?,?)", (turn_id, game_id, request_id, world["turn"], status, encode(snapshot), now()))
            return {"id": turn_id, "status": status}

    def save_proposal(self, turn_id, actor, proposal, call):
        with self.connection(write=True) as conn:
            turn = conn.execute("SELECT * FROM turn_runs WHERE id=? AND status='pending'", (turn_id,)).fetchone()
            if not turn:
                return
            snapshot = json.loads(turn["snapshot"])
            if actor not in snapshot.get("actors", NPCS):
                return
            cursor = conn.execute("INSERT OR IGNORE INTO action_proposals(turn_id,character_id,proposal) VALUES(?,?,?)", (turn_id, actor, encode(proposal)))
            if cursor.rowcount:
                conn.execute("INSERT INTO llm_calls(game_id,turn_id,character_id,data,created_at) VALUES(?,?,?,?,?)", (turn["game_id"], turn_id, actor, encode(call), now()))

    def proposals(self, turn_id):
        with self.connection() as conn:
            return {r["character_id"]: json.loads(r["proposal"]) for r in conn.execute("SELECT * FROM action_proposals WHERE turn_id=?", (turn_id,))}

    def resolve(self, turn_id):
        with self.connection(write=True) as conn:
            turn = conn.execute("SELECT * FROM turn_runs WHERE id=?", (turn_id,)).fetchone()
            if not turn or turn["status"] != "pending":
                return
            world = self.get(turn["game_id"], conn)["world"]
            snapshot = json.loads(turn["snapshot"])
            if world["version"] != snapshot["world"]["version"]:
                raise RuntimeError("世界版本与回合快照不一致")
            proposals = {r["character_id"]: json.loads(r["proposal"]) for r in conn.execute("SELECT * FROM action_proposals WHERE turn_id=?", (turn_id,))}
            offset = (world["turn"] - 1) % len(NPCS)
            order = NPCS[offset:] + NPCS[:offset]
            for actor in order:
                if actor not in snapshot.get("actors", NPCS):
                    continue
                try:
                    action = Action.model_validate(proposals.get(actor, {"action": "wait"}))
                    # Failures must not partially mutate the authoritative world.
                    import copy
                    candidate = copy.deepcopy(world)
                    entries = apply_action(candidate, actor, action)
                    world = candidate
                    result = {"ok": True, "message": entries[0]["text"]}
                    if action.intent_summary:
                        entries.append(event(world, actor, "intent", action.intent_summary, [actor], {"source_type": "judgment"}))
                except (ValueError, RuleError) as exc:
                    result = {"ok": False, "message": str(exc)}
                    entries = [event(world, actor, "rejected", f"行动未执行：{exc}", [actor])]
                self._append(conn, turn["game_id"], entries)
                conn.execute("UPDATE action_proposals SET result=? WHERE turn_id=? AND character_id=?", (encode(result), turn_id, actor))
            ending = settle(world)
            if ending:
                self._append(conn, turn["game_id"], [ending])
            world["version"] += 1
            conn.execute("UPDATE game_sessions SET world=?,updated_at=? WHERE id=?", (encode(world), now(), turn["game_id"]))
            conn.execute("UPDATE turn_runs SET status='done' WHERE id=?", (turn_id,))

    def walk(self, game_id, x, y):
        from .mystery import walk
        with self.connection(write=True) as conn:
            world = self.get(game_id, conn)["world"]
            if conn.execute("SELECT 1 FROM turn_runs WHERE game_id=? AND status='pending'", (game_id,)).fetchone():
                raise RuleError("请等当前对话结束，再继续走动")
            entries = walk(world, x, y)
            self._append(conn, game_id, entries)
            world["version"] += 1
            conn.execute("UPDATE game_sessions SET world=?,updated_at=? WHERE id=?", (encode(world), now(), game_id))
            return world["player_position"]

    def pulse(self, game_id, at=None, talking_to=None):
        from .routines import advance
        with self.connection(write=True) as conn:
            world = self.get(game_id, conn)["world"]
            if world.get("scenario_id") != "night" or world["status"] != "playing":
                return
            if conn.execute("SELECT 1 FROM turn_runs WHERE game_id=? AND status='pending'", (game_id,)).fetchone():
                return
            entries = advance(world, time.time() if at is None else at, talking_to=talking_to)
            from .routines import apply_decision
            for actor, routine in world.get("routines", {}).get("actors", {}).items():
                thought = routine.get("thinking")
                if not thought:
                    continue
                row = conn.execute("SELECT data FROM llm_calls WHERE game_id=? AND turn_id=? AND character_id=? ORDER BY id DESC LIMIT 1",
                                   (game_id, f"routine-{thought['event_id']}", actor)).fetchone()
                if row:
                    entries.extend(apply_decision(world, actor, thought["event_id"], json.loads(row["data"]).get("decision", {})))
            self._append(conn, game_id, entries)
            world["version"] += 1
            conn.execute("UPDATE game_sessions SET world=? WHERE id=?", (encode(world), game_id))

    def thought_requests(self, game_id):
        game = self.get(game_id)
        if game["mode"] != "ai" or game["world"]["status"] != "playing":
            return []
        result = []
        with self.connection() as conn:
            for actor, routine in game["world"].get("routines", {}).get("actors", {}).items():
                thought = routine.get("thinking")
                if thought and not conn.execute("SELECT 1 FROM llm_calls WHERE game_id=? AND turn_id=? AND character_id=?",
                    (game_id, f"routine-{thought['event_id']}", actor)).fetchone():
                    result.append({"game_id": game_id, "actor": actor, **thought})
        return result

    def record_thought(self, request, call):
        with self.connection(write=True) as conn:
            identity = (request["game_id"], f"routine-{request['event_id']}", request["actor"])
            if not conn.execute("SELECT 1 FROM llm_calls WHERE game_id=? AND turn_id=? AND character_id=?", identity).fetchone():
                conn.execute("INSERT INTO llm_calls(game_id,turn_id,character_id,data,created_at) VALUES(?,?,?,?,?)", (*identity, encode(call), now()))

    def debug(self, game_id):
        game = self.get(game_id)
        with self.connection() as conn:
            calls = [{**dict(r), "data": json.loads(r["data"])} for r in conn.execute("SELECT * FROM llm_calls WHERE game_id=? ORDER BY id DESC LIMIT 100", (game_id,))]
            proposals = [{**dict(r), "proposal": json.loads(r["proposal"]), "result": json.loads(r["result"]) if r["result"] else None}
                         for r in conn.execute("SELECT p.* FROM action_proposals p JOIN turn_runs t ON t.id=p.turn_id WHERE t.game_id=? ORDER BY t.turn DESC", (game_id,))]
        return {"world": game["world"], "events": self.events(game_id, actor=None, limit=2000), "calls": calls, "proposals": proposals,
                "memories": {a: self.events(game_id, a, limit=1000) for a in NPCS}}
