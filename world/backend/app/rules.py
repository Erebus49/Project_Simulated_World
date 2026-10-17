from .models import Action
from .scenario import scenario

NPCS = ("mayor", "caretaker", "shopkeeper", "reporter")
ROOMS = scenario()["rooms"]


class RuleError(ValueError):
    pass


def present(world, room):
    return [key for key, value in world["characters"].items() if value["location"] == room]


def event(world, actor, kind, text, recipients=None, details=None, causes=None):
    return {"actor_id": actor, "kind": kind, "text": text, "turn": world["turn"],
            "recipients": recipients or [actor], "details": details or {}, "causes": causes or []}


def observation(world, room):
    return {"positions": {a: room for a in present(world, room)},
            "facilities": {k: v for k, v in world["facilities"].items() if k != "stall_allocated"} if room == "stage" else
            {"stall_allocated": world["facilities"]["stall_allocated"]} if room == "square" else {}}


def apply_action(world, actor, action: Action):
    if world.get("scenario_id") == "night":
        from .mystery import apply
        return apply(world, actor, action)
    if actor not in world["characters"]:
        raise RuleError("角色不存在")
    if world["status"] != "playing":
        raise RuleError("本局已经结束，请重新开局")
    char = world["characters"][actor]
    room, name = char["location"], char["name"]
    listeners = present(world, room)
    target = action.target_id
    chars, items, fac = world["characters"], world["items"], world["facilities"]
    details = {}
    kind = action.action
    if kind == "move":
        if target not in ROOMS[room]["exits"]:
            raise RuleError("需要沿小路移动：商店和舞台之间要经过广场")
        char["location"] = target
        recipients = sorted(set(listeners + present(world, target)))
        details = {"positions": {actor: target}, "from": room, "to": target}
        # Observers at the destination gain its current local facts.
        result = event(world, actor, kind, f"{name}从{ROOMS[room]['name']}走向{ROOMS[target]['name']}。", recipients, details)
        return [result, event(world, actor, "observe", f"{name}来到{ROOMS[target]['name']}。", [actor], observation(world, target))]
    if kind == "observe":
        return [event(world, actor, kind, f"{name}观察了{ROOMS[room]['name']}。", [actor], observation(world, room))]
    if kind == "speak":
        if target not in chars or target == actor or chars[target]["location"] != room:
            raise RuleError("只能和同一地点的其他角色交谈")
        recipients = [actor, target] if action.private else listeners
        details = {"target_id": target, "message": action.message.strip(), "private": action.private}
        prefix = "悄悄对" if action.private else "对"
        return [event(world, actor, kind, f"{name}{prefix}{chars[target]['name']}说：“{action.message.strip()}”", recipients, details, action.related_event_ids)]
    if kind in {"take", "give"}:
        if action.item_id not in items:
            raise RuleError("不存在这件物品")
        item = items[action.item_id]
        if kind == "take":
            if item["holder"] is not None or item["location"] != room:
                raise RuleError("只能拿取当前地点无人持有的物品；别人的物品需要对方交付")
            if action.item_id == "speaker" and fac["speaker_installed"]:
                raise RuleError("已经安装的音箱不能直接取走")
            item.update(holder=actor, location=None)
            text = f"{name}拿起了{item['name']}。"
        else:
            if item["holder"] != actor:
                raise RuleError("你没有持有这件物品")
            if target not in chars or target == actor or chars[target]["location"] != room:
                raise RuleError("只能把物品交给同地点的其他角色")
            item.update(holder=target, location=None)
            text = f"{name}把{item['name']}交给了{chars[target]['name']}。"
        details = {"item_id": action.item_id, "holder": item["holder"], "target_id": target}
    elif kind == "interact":
        operation = action.interaction
        if operation == "unlock_stage":
            if room != "stage" or items["key"]["holder"] != actor:
                raise RuleError("需要持有钥匙并来到舞台入口")
            if fac["stage_open"]:
                raise RuleError("舞台已经打开")
            fac["stage_open"] = True
            text = f"{name}用钥匙打开了舞台。"
        elif operation == "inspect_stage":
            if room != "stage" or actor != "caretaker" or not fac["stage_open"]:
                raise RuleError("需要管理员在已打开的舞台进行安全检查")
            if fac["inspection"] >= 2:
                raise RuleError("安全检查已经完成")
            fac["inspection"] += 1
            text = f"{name}完成了一轮安全检查（{fac['inspection']}/2）。"
        elif operation == "install_speaker":
            if room != "stage" or not fac["stage_open"]:
                raise RuleError("需要先打开舞台")
            item = items["speaker"]
            if item["holder"] != actor and not (item["holder"] is None and item["location"] == room):
                raise RuleError("先把音箱带到舞台，或由持有人安装")
            if fac["speaker_installed"]:
                raise RuleError("音箱已经安装")
            item.update(holder=None, location="stage")
            fac["speaker_installed"] = True
            text = f"{name}连接了备用音箱，试音声响起来了。"
        elif operation == "allocate_stall":
            if actor != "mayor" or room != "square":
                raise RuleError("只有镇长能在广场确认摊位安排")
            if fac["stall_allocated"]:
                raise RuleError("摊位已经确认")
            fac["stall_allocated"] = True
            text = f"{name}在公告栏上确认了阿栗的庆典摊位。"
        elif operation == "interview":
            if actor != "reporter" or target not in chars or target == actor or chars[target]["location"] != room:
                raise RuleError("记者只能采访同地点的其他角色")
            text = f"{name}采访了{chars[target]['name']}，记录下目前能核实的现场情况。"
        else:
            raise RuleError("这项交互还没有世界规则支持")
        details = {"interaction": operation, **observation(world, room), "target_id": target}
    elif kind == "wait":
        return [event(world, actor, kind, f"{name}暂时等待。", [actor])]
    else:
        raise RuleError("未知行动")
    return [event(world, actor, kind, text, listeners, details, action.related_event_ids)]


def settle(world):
    if world.get("scenario_id") == "night":
        from .mystery import settle as settle_mystery
        return settle_mystery(world)
    fac = world["facilities"]
    success = fac["stage_open"] and fac["inspection"] >= 2 and fac["speaker_installed"]
    if not success and world["turn"] < world["max_turns"]:
        return None
    world["status"] = "won" if success else "lost"
    missing = []
    if not fac["stage_open"]:
        missing.append("舞台尚未打开")
    if fac["inspection"] < 2:
        missing.append("安全检查尚未完成")
    if not fac["speaker_installed"]:
        missing.append("音箱尚未安装")
    text = "灯光亮起，第一首歌传遍广场。庆典顺利开幕！" if success else "开幕时间到了，庆典未能按时开始：" + "、".join(missing) + "。"
    return event(world, "system", "ending", text, list(world["characters"]), {"outcome": world["status"], "facilities": dict(fac)})

