from .rules import NPCS, ROOMS, RuleError, apply_action
from .models import Action
from .mystery import ANCHORS, NPC_POSITIONS, distance, is_night, nearby, puzzle_view, npc_position
from .scenario import scenario


def perceive(store, game_id, actor, world=None, through=None):
    world = world or store.get(game_id)["world"]
    char = world["characters"][actor]
    room = char["location"]
    memories = store.events(game_id, actor, through=through, limit=2000, recent=True)
    known_positions, known_facilities = {}, {}
    for entry in memories:
        known_positions.update(entry["details"].get("positions", {}))
        known_facilities.update(entry["details"].get("facilities", {}))
    visible = []
    for key, other in world["characters"].items():
        if other["location"] == room:
            known_positions[key] = room
            visible.append({"id": key, "name": other["name"], "role": other["role"], "color": other["color"], "location": room})
    if room == "stage":
        known_facilities.update({k: v for k, v in world["facilities"].items() if k != "stall_allocated"})
    if room == "square":
        known_facilities["stall_allocated"] = world["facilities"]["stall_allocated"]
    people = [{"id": key, "name": other["name"], "role": other["role"], "color": other["color"],
               "location": known_positions.get(key), "visible": other["location"] == room}
              for key, other in world["characters"].items()]
    visible_items = []
    for key, item in world["items"].items():
        if item["holder"] == actor or item["location"] == room or any(c["id"] == item["holder"] for c in visible):
            visible_items.append({"id": key, **item})
    if is_night(world):
        for person in people + visible:
            if person["id"] in NPC_POSITIONS:
                person["position"] = dict(npc_position(world, person["id"]))
                routine = world.get("routines", {}).get("actors", {}).get(person["id"], {})
                person["activity"] = routine.get("activity", "留意附近的动静")
                person["moving"] = routine.get("moving", False)
                from .routines import ambient_speech, motion_packet
                person["motion"] = motion_packet(world, person["id"])
                person["ambient_speech"] = ambient_speech(world, person["id"])
                person["thinking"] = bool(routine.get("thinking"))
                person["nearby"] = distance(world["player_position"], person["position"]) <= 31
        description = scenario("night")["rooms"][room]["description"]
        room_name = scenario("night")["rooms"][room]["name"]
        if room == "stage" and world["mystery"]["power_off"]:
            description = "红灯已经熄灭。空舞台终于安静下来。"
        if actor == "player":
            pos = world["player_position"]
            if pos["y"] >= 278:
                room_name = "南侧庭院"
                description = "小路绕过旧碑与石井，接回广场南侧。远处的灯笼没有随风晃动。"
            elif pos["x"] >= 448:
                room_name = "东侧林间步道"
                description = "树影把舞台遮在身后。路牌立在环路转弯处，南边的小路通往庭院。"
        return {"actor": {"id": actor, "name": char["name"], "role": char["role"], "location": room},
                "turn": world["turn"], "remaining": world["max_turns"] - world["turn"],
                "room": {"id": room, **scenario("night")["rooms"][room], "name": room_name, "description": description},
                "people": people, "visible_people": visible, "items": visible_items,
                "known_facilities": {}, "memories": memories}
    description = ROOMS[room]["description"]
    if room == "square" and world["facilities"]["stall_allocated"]:
        description = "彩旗已经挂起。公告栏上确认了阿栗的庆典摊位。"
    elif room == "shop" and not any(i["id"] == "speaker" for i in visible_items):
        description = "温暖的灯光照着货架，备用音箱已经不在店里了。"
    elif room == "stage" and world["facilities"]["inspection"] >= 2:
        description = "舞台已经通过安全检查，彩旗下的开幕准备正在进行。"
    return {"actor": {"id": actor, "name": char["name"], "role": char["role"], "location": room},
            "turn": world["turn"], "remaining": world["max_turns"] - world["turn"],
            "room": {"id": room, **ROOMS[room], "description": description}, "people": people, "visible_people": visible,
            "items": visible_items, "known_facilities": known_facilities, "memories": memories}


def legal_actions(world, actor):
    import copy
    from .rules import present
    room = world["characters"][actor]["location"]
    if is_night(world):
        actions = [{"action": "wait"}, {"action": "observe"}]
        if actor == "player":
            for anchor in ANCHORS.values():
                if nearby(world, anchor):
                    actions.extend({"action": "interact", "interaction": operation} for operation in anchor["actions"])
        return actions
    candidates = [{"action": "wait"}, {"action": "observe"}]
    candidates.extend({"action": "move", "target_id": r} for r in ROOMS[room]["exits"])
    for item_id in world["items"]:
        candidates.append({"action": "take", "item_id": item_id})
        candidates.extend({"action": "give", "item_id": item_id, "target_id": c} for c in present(world, room) if c != actor)
    for operation in ("unlock_stage", "inspect_stage", "install_speaker", "allocate_stall"):
        candidates.append({"action": "interact", "interaction": operation})
    if actor == "reporter":
        candidates.extend({"action": "interact", "interaction": "interview", "target_id": c} for c in present(world, room) if c != actor)
    valid = []
    for candidate in candidates:
        try:
            apply_action(copy.deepcopy(world), actor, Action(**candidate))
            valid.append(candidate)
        except RuleError:
            pass
    return valid


def player_view(store, game_id):
    game = store.get(game_id)
    world = game["world"]
    view = perceive(store, game_id, "player", world)
    memories = view.pop("memories")
    busy = store.pending(game_id)
    events = [e for e in memories if e["kind"] != "wait"]
    return {"id": game_id, "scenario_id": world.get("scenario_id", "festival"), "mode": game["mode"], "status": world["status"], "version": world["version"],
            **({"player_position": world["player_position"], "mystery": puzzle_view(world)} if is_night(world) else {}),
            "max_turns": world["max_turns"], "busy": bool(busy), "turn_id": busy[0]["id"] if busy else None,
            "created_at": game["created_at"], **view, "events": events,
            "cursor": memories[-1]["id"] if memories else 0,
            "legal_actions": legal_actions(world, "player") if world["status"] == "playing" else []}
