"""Deterministic puzzle rules. Hidden answers never enter player/model views."""
import math
import json
from functools import lru_cache
from pathlib import Path

from .scenario import scenario

WORLD_SIZE = {"width": 768, "height": 480}
WALK_RECTS = [(96, 165, 390, 199), (225, 138, 254, 278), (104, 138, 134, 198), (363, 141, 391, 198),
              (390, 165, 686, 199), (225, 278, 254, 352), (225, 320, 686, 352),
              (654, 165, 686, 352), (495, 199, 527, 352)]
ANCHORS = {
    "notice": {"name": "公告栏", "x": 289, "y": 177, "room": "square", "actions": ["read_notice"]},
    "ledger": {"name": "旧账册 / 回收柜", "x": 116, "y": 151, "room": "shop", "actions": ["read_ledger", "open_locker"]},
    "console": {"name": "舞台控制台", "x": 375, "y": 153, "room": "stage", "actions": ["mute_broadcast", "seal_slip", "cut_power", "play_music", "answer_voice"]},
    "gate": {"name": "南侧铁门", "x": 239, "y": 265, "room": "square", "actions": ["leave_town"]},
    "trail": {"name": "林间路牌", "x": 668, "y": 186, "room": "stage", "actions": ["read_trail"]},
    "garden": {"name": "庭院旧碑", "x": 510, "y": 333, "room": "square", "actions": ["inspect_garden"]},
}
NPC_POSITIONS = {"mayor": {"x": 260, "y": 189}, "reporter": {"x": 206, "y": 180},
                 "shopkeeper": {"x": 132, "y": 174}, "caretaker": {"x": 363, "y": 180}}
RULES_TEXT = "夜间留镇须知\n① 离镇前，请将归还联封存于舞台控制台，再关闭舞台电源。\n② 广播叫到你的名字时，不要回应。\n③ 有日期的交接记录比无署名的口头通知更可信。\n④【新贴红字，无署名】请先播放开幕音乐，完成最后的谢幕。"
LEDGER_TEXT = "柜台旧账册 · 10月16日\n17:55　柜号 7　晚场归还\n17:20　柜号 3　午后归还\n17:40　柜号 1　场间归还\n页脚：回收柜按当日从早到晚的柜号次序复位。\n交接备注：先静音，再封存归还联，最后断电。"


def is_night(world):
    return world.get("scenario_id") == "night"


def walkable(x, y):
    return 5 <= x <= WORLD_SIZE["width"] - 5 and 5 <= y <= WORLD_SIZE["height"] - 5 and not any(
        left - 2 <= x <= right + 2 and top - 2 <= y <= bottom + 2 for left, top, right, bottom in obstacles())


@lru_cache(maxsize=1)
def obstacles():
    path = Path(__file__).resolve().parents[1] / "scenarios/night_collision.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else [[32, 48, 160, 128], [320, 48, 448, 143]]


def npc_position(world, actor):
    return world.get("routines", {}).get("actors", {}).get(actor, {}).get("position", NPC_POSITIONS[actor])


def room_at(x, y):
    if y >= 278:
        return "square"
    return "shop" if x < 165 else "stage" if x > 325 else "square"


def distance(pos, target):
    return math.hypot(pos["x"] - target["x"], pos["y"] - target["y"])


def walk(world, x, y):
    from .rules import RuleError, event, observation, present
    if not is_night(world) or world["status"] != "playing":
        raise RuleError("只有进行中的夜间探索可以步行")
    pos = world["player_position"]
    length = math.hypot(x - pos["x"], y - pos["y"])
    if length > 42:
        raise RuleError("这一步太远了，请沿小路移动")
    samples = max(1, math.ceil(length / 2))
    if any(not walkable(pos["x"] + (x - pos["x"]) * i / samples, pos["y"] + (y - pos["y"]) * i / samples) for i in range(1, samples + 1)):
        raise RuleError("前面有树木、建筑或其他障碍，绕一下就能过去")
    before = world["characters"]["player"]["location"]
    after = room_at(x, y)
    world["player_position"] = {"x": round(x, 2), "y": round(y, 2)}
    world["characters"]["player"]["location"] = after
    if before == after:
        return []
    rooms = scenario("night")["rooms"]
    recipients = sorted(set(present(world, before) + present(world, after) + ["player"]))
    return [event(world, "player", "move", f"你沿着小路走进{rooms[after]['name']}。", recipients,
                  {"positions": {"player": after}, "from": before, "to": after}),
            event(world, "player", "observe", rooms[after]["description"], ["player"], observation(world, after))]


def nearby(world, anchor):
    return distance(world["player_position"], anchor) <= 27


def puzzle_view(world):
    state = world["mystery"]
    journal = []
    if "notice" in state["clues"]:
        journal.append({"id": "notice", "title": "夜间留镇须知", "text": RULES_TEXT, "source": "亲眼调查 · 广场公告栏"})
    if "ledger" in state["clues"]:
        journal.append({"id": "ledger", "title": "柜台旧账册", "text": LEDGER_TEXT, "source": "亲眼调查 · 杂货铺柜台"})
    if state["locker_open"]:
        journal.append({"id": "slip", "title": "回收柜中的归还联", "text": "纸上有旧章：票归位，声归静，灯归暗。交接完成后，南门放行。", "source": "已取得的实物"})
    if "trail" in state["clues"]:
        journal.append({"id": "trail", "title": "林间路牌背面", "text": "主路通往舞台，环路回到南庭。路牌背面刻着：喇叭会模仿人，墨水却记得年月。", "source": "亲眼调查 · 东侧林间步道"})
    if "garden" in state["clues"]:
        journal.append({"id": "garden", "title": "庭院交接旧碑", "text": "碑上有三幅依次排列的图案：被划去的喇叭、压在框中的票、熄灭的灯。最下方一行：离镇走广场南门，不走林间环路。", "source": "亲眼调查 · 南侧庭院"})
    # Terminal equipment is physical, public state, not a secret or lock solution.
    return {"clues": journal, "anomalies": state["anomalies"], "max_anomalies": 3,
            "muted": state["muted"], "sealed": state["sealed"], "power_off": state["power_off"],
            "locker_open": state["locker_open"], "escaped": state["escaped"],
            "anchors": [{"id": key, **anchor, "nearby": nearby(world, anchor)} for key, anchor in ANCHORS.items()],
            "walkable": WALK_RECTS, "obstacles": obstacles(), "world_size": WORLD_SIZE}


def apply(world, actor, action):
    from .rules import RuleError, event, present, observation
    if world["status"] != "playing":
        raise RuleError("本局已经结束，请重新开局")
    chars = world["characters"]
    if actor not in chars:
        raise RuleError("角色不存在")
    room, name = chars[actor]["location"], chars[actor]["name"]
    recipients = present(world, room)
    if action.action == "observe":
        return [event(world, actor, "observe", scenario("night")["rooms"][room]["description"], [actor], observation(world, room))]
    if action.action == "speak":
        target = action.target_id
        if target not in chars or target == actor or chars[target]["location"] != room:
            raise RuleError("只能与同一地点的角色交谈")
        if actor == "player" and distance(world["player_position"], npc_position(world, target)) > 31:
            raise RuleError("靠近角色后按 E，才能交谈")
        if target == "player" and actor != "player" and distance(world["player_position"], npc_position(world, actor)) > 31:
            raise RuleError("对方已经走远，无法交谈")
        return [event(world, actor, "speak", f"{name}说：“{action.message.strip()}”", [actor, target] if action.private else recipients,
                      {"target_id": target, "message": action.message.strip(), "private": action.private}, action.related_event_ids)]
    if action.action == "wait":
        return [event(world, actor, "wait", f"{name}屏住呼吸，听了一会儿。", [actor])]
    if actor != "player":
        raise RuleError("这项交接必须由玩家亲自完成；角色不能替玩家解谜")
    if action.action != "interact":
        raise RuleError("按 WASD 沿小路走动，靠近调查点后按 E 操作")
    operation = action.interaction
    anchor = next((a for a in ANCHORS.values() if operation in a["actions"]), None)
    if not anchor or not nearby(world, anchor):
        raise RuleError("请先走到对应调查点附近（E 交互）")
    state = world["mystery"]
    text, kind, details = "", "interact", {"interaction": operation}
    if operation in {"read_trail", "inspect_garden"}:
        clue_id = "trail" if operation == "read_trail" else "garden"
        if clue_id not in state["clues"]:
            state["clues"].append(clue_id)
        text = next(clue["text"] for clue in puzzle_view(world)["clues"] if clue["id"] == clue_id)
        kind = "clue"
        details["clue_id"] = clue_id
    elif operation in {"read_notice", "read_ledger"}:
        clue_id = "notice" if operation == "read_notice" else "ledger"
        if clue_id not in state["clues"]:
            state["clues"].append(clue_id)
        text, kind = (RULES_TEXT if clue_id == "notice" else LEDGER_TEXT), "clue"
        details["clue_id"] = clue_id
    elif operation == "open_locker":
        if state["locker_open"]:
            raise RuleError("回收柜已经打开，归还联已取出")
        if not action.code:
            raise RuleError("请输入三位柜号")
        if action.code != "317":
            state["anomalies"] += 1
            text, kind = "锁轮空转了一圈，柜里响起了指甲声。账册的页脚写的是时间顺序，不是抄写顺序。", "anomaly"
        else:
            state["locker_open"] = True
            world["items"]["return_slip"].update(holder="player", location=None)
            text = "回收柜打开了。你取出盖有旧章的归还联：票归位，声归静，灯归暗。南门等待交接完成。"
    elif operation == "mute_broadcast":
        if state["power_off"] or state["muted"]:
            raise RuleError("广播已经停止")
        state["muted"] = True
        text = "你按下静音键。广播最后一次叫出你的名字，随后沉寂。你没有回应。"
    elif operation == "seal_slip":
        if not state["muted"]:
            state["anomalies"] += 1
            text, kind = "广播抢先念出了归还联上的字。贴票框把纸弹了回来——交接备注的第一步还没完成。", "anomaly"
        elif state["sealed"]:
            raise RuleError("归还联已经封存")
        elif world["items"]["return_slip"]["holder"] != "player":
            raise RuleError("需要先取得杂货铺回收柜中的归还联")
        else:
            state["sealed"] = True
            world["items"]["return_slip"].update(holder=None, location="stage")
            text = "你将归还联封进控制台的贴票框。旧章微微发热，南门方向传来一声锁舌响。"
    elif operation == "cut_power":
        if state["power_off"]:
            raise RuleError("电闸已经断开")
        if not state["muted"] or not state["sealed"]:
            state["anomalies"] += 1
            text, kind = "电闸被一股冷意顶了回来。交接尚未完成：先静音，再封存归还联，最后才能断电。", "anomaly"
        else:
            state["power_off"] = True
            text = "你拉下电闸。红灯熄灭，舞台的影子终于与你保持一致。南门已经可以放行。"
    elif operation in {"play_music", "answer_voice"}:
        if state["power_off"]:
            raise RuleError("设备已经断电，无法回应")
        state["anomalies"] += 1
        text, kind = ("你按下播放键。音乐倒着响起，红字的墨迹流向了地面——这条无署名的规则并不可靠。" if operation == "play_music" else "你回应了那个声音。广播里多了一道与你完全相同的呼吸声。"), "anomaly"
    elif operation == "leave_town":
        if state["power_off"] and state["sealed"] and state["muted"]:
            state["escaped"] = True
            text = "南门的锁自动落下。你跨过白线，身后有人喊你的名字。你继续向前，没有回头。"
        else:
            text = "铁门纹丝不动。门牌上刻着：交接未毕，不得离镇。可以回去继续寻找证据。"
    else:
        raise RuleError("这里没有这样的交互")
    return [event(world, actor, kind, text, ["player"], details)]


def settle(world):
    from .rules import event
    if world["status"] != "playing":
        return None
    state = world["mystery"]
    if state["escaped"]:
        world["status"] = "won"
        text = "你离开了松果镇。天亮后，你口袋里的归还联存根上只剩一句话：不要回头。"
    elif state["anomalies"] >= 3:
        world["status"] = "lost"
        text = "第三次异常发生，广播终于学会了你的声音。南门不再出现在小路尽头。你留在了谢幕之后。"
    elif world["turn"] >= world["max_turns"]:
        world["status"] = "lost"
        text = "最后一声钟响过，你还没有完成离镇交接。所有人的影子一起转向了你。"
    else:
        return None
    return event(world, "system", "ending", text, ["player"], {"outcome": world["status"]})
