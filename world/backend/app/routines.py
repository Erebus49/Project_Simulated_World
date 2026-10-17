"""Fixed jobs with continuous movement plans; thinking is event-triggered."""
import heapq
import math

from .mystery import NPC_POSITIONS, distance, room_at, walkable

SPEED = 24.0
ROUTINE_VERSION = 3
ROUTES = {
    "mayor": [(270, 183, "查看公告栏", "林镇长对着新贴的红字又读了一遍，像是在确认什么。"),
              (242, 228, "检查南门方向", "林镇长望向南门，压低声音：最后一首歌还没放呢。"),
              (260, 189, "巡视广场", "林镇长整理了一下衣领，又走回广场。")],
    "reporter": [(306, 192, "比对公告墨迹", "小满蹲在公告栏前，记下了新旧墨迹的区别。"),
                 (210, 185, "整理采访笔记", "小满把记下的说法逐条比对，在没有证据的地方画了问号。"),
                 (181, 179, "记录广播声音", "小满收起本子，停下来分辨广播里的呼吸声。")],
    "shopkeeper": [(116, 151, "清点回收票据", "阿栗把柜台上的票据按时间理齐。"),
                   (144, 180, "照看杂货铺门口", "阿栗走到门边，看了看广场，又回头确认柜子。"),
                   (132, 174, "整理货箱", "阿栗检查门边的货箱，把凌乱的物件一一摆好。")],
    "caretaker": [(375, 153, "巡查控制台", "周师傅俯身查看控制台，手避开了播放键。"),
                  (392, 181, "检查舞台灯光", "周师傅检查了一遍电线和红灯，没有碰播放键。"),
                  (354, 180, "守候舞台", "周师傅停下来听广播，没有应声。")],
}
WORK_SECONDS = {"mayor": [10., 9., 8.], "reporter": [12., 14., 10.],
                "shopkeeper": [14., 9., 12.], "caretaker": [12., 12., 9.]}

# Short authored work chatter, never a model request or a new puzzle fact.
WORK_CHATTER = {
    "mayor": [("这张告示……我再看看。", "风都停了，纸怎么还卷着。"),
              ("门还关着啊。", "这里的灯，可别也灭了。"),
              ("广场上还得再检查一遍。", "人都没走齐，还不能收工。")],
    "reporter": [("这两处墨迹，颜色不一样。", "先记下来，别急着下结论。"),
                 ("刚才那句话，我得核对一下。", "笔记越理，问号越多了。"),
                 ("嘘……我在听。", "再听一会儿，先别出声。")],
    "shopkeeper": [("一张，两张……再数一遍。", "这些票据不能弄乱了。"),
                   ("门口别堆东西，留条路。", "我就在这儿照看一会儿。"),
                   ("这个箱子，还是摆整齐点。", "忙了一晚上，还没收拾完。")],
    "caretaker": [("先看看这盏指示灯。", "这个按钮，暂时别碰。"),
                  ("线头都要检查一遍。", "灯还亮着，我再看看。"),
                  ("我在这里守着。", "有动静就叫我。")],
}


def ambient_speech(world, actor):
    state = world.get("routines", {})
    routine = state.get("actors", {}).get(actor)
    if not routine or world["status"] != "playing" or distance(routine["position"], world["player_position"]) > 72:
        return ""
    if routine["phase"] == "paused":
        return "你说，我听着。"
    if actor == "caretaker" and world["mystery"].get("power_off"):
        return "灯熄了，我再检查一圈。"
    if actor == "reporter" and world["mystery"].get("muted"):
        return "安静下来，反而有点不习惯。"
    if routine["phase"] == "walking":
        return f"我去{ROUTES[actor][routine['route']][2]}。"
    choices = WORK_CHATTER[actor][routine["route"]]
    return choices[int(state.get("clock", 0) // 7) % len(choices)]


def line_clear(a, b):
    steps = max(1, math.ceil(distance(a, b) / 1.5))
    return all(walkable(a["x"] + (b["x"] - a["x"]) * i / steps,
                        a["y"] + (b["y"] - a["y"]) * i / steps) for i in range(steps + 1))


def path_to(start, target):
    """Local A* only when a straight route crosses a trunk or prop."""
    if line_clear(start, target):
        return [dict(target)]
    cell = 4
    origin = (round(start["x"] / cell), round(start["y"] / cell))
    frontier = [(0., origin)]
    previous, costs = {origin: None}, {origin: 0.}
    found = None
    while frontier and len(previous) < 5000:
        _, node = heapq.heappop(frontier)
        point = {"x": node[0] * cell, "y": node[1] * cell}
        if distance(point, target) <= 7 and line_clear(point, target):
            found = node
            break
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            following = (node[0] + dx, node[1] + dy)
            next_point = {"x": following[0] * cell, "y": following[1] * cell}
            if distance(next_point, start) > 150 or not line_clear(point, next_point):
                continue
            cost = costs[node] + cell
            if cost < costs.get(following, float("inf")):
                previous[following], costs[following] = node, cost
                heapq.heappush(frontier, (cost + distance(next_point, target), following))
    if found is None:
        return []
    reverse = []
    while found is not None:
        reverse.append({"x": found[0] * cell, "y": found[1] * cell})
        found = previous[found]
    points = [dict(start)] + list(reversed(reverse)) + [dict(target)]
    # Shorten the grid path into straight, collision-checked segments.
    result, index = [], 0
    while index < len(points) - 1:
        next_index = len(points) - 1
        while next_index > index + 1 and not line_clear(points[index], points[next_index]):
            next_index -= 1
        if not line_clear(points[index], points[next_index]):
            return []
        result.append(points[next_index]); index = next_index
    return result


def start_job(routine, actor, index):
    routine["route"] = index
    x, y, _, _ = ROUTES[actor][index]
    routine["path"] = path_to(routine["position"], {"x": x, "y": y})
    routine["phase"] = "walking" if routine["path"] else "working"
    routine["work_left"] = WORK_SECONDS[actor][index]
    routine["revision"] = routine.get("revision", 0) + 1
    routine["moving"] = bool(routine["path"])


def initialize(world, now):
    old = world.get("routines", {}).get("actors", {})
    state = {"version": ROUTINE_VERSION, "last_at": now, "clock": 0., "actors": {}}
    for actor, initial in NPC_POSITIONS.items():
        position = dict(old.get(actor, {}).get("position", initial))
        routine = {"position": position, "revision": 0, "reactions": old.get(actor, {}).get("reactions", []),
                   "activity": "准备开始手头的工作", "thinking": None}
        start_job(routine, actor, 0)
        state["actors"][actor] = routine
    return state


def ensure(world, now):
    if world.get("routines", {}).get("version") != ROUTINE_VERSION:
        world["routines"] = initialize(world, now)
    return world["routines"]


def recipients(world, actor, position):
    from .mystery import npc_position
    room = room_at(position["x"], position["y"])
    return [person for person in world["characters"] if world["characters"][person]["location"] == room and
            distance(position, world["player_position"] if person == "player" else npc_position(world, person)) <= 86] + [actor]


def queue_thought(world, event_id, source):
    """Only people who actually witnessed this anomaly may reconsider a job."""
    if source["kind"] != "anomaly" or world["status"] != "playing":
        return
    state = ensure(world, 0.)
    for actor in source["recipients"]:
        if actor not in ROUTES:
            continue
        routine = state["actors"][actor]
        routine["thinking"] = {"event_id": event_id, "text": source["text"]}


def apply_decision(world, actor, event_id, decision):
    from .rules import event
    routine = world.get("routines", {}).get("actors", {}).get(actor)
    if not routine or not routine.get("thinking") or routine["thinking"]["event_id"] != event_id:
        return []
    routine["thinking"] = None
    index = decision.get("task_index")
    if type(index) is not int or not 0 <= index < len(ROUTES[actor]):
        return []
    start_job(routine, actor, index)
    text = f"{world['characters'][actor]['name']}留意到刚才的异常，重新安排了手头的事：{ROUTES[actor][index][2]}。"
    return [event(world, actor, "routine", text, recipients(world, actor, routine["position"]),
                  {"activity": ROUTES[actor][index][2], "trigger_event_id": event_id}, [event_id])]


def advance(world, now, talking_to=None):
    from .rules import event
    if world.get("scenario_id") != "night" or world["status"] != "playing":
        return []
    state = ensure(world, now)
    delta = max(0., min(1.2, now - state["last_at"]))
    state["last_at"] = now
    state["clock"] += delta
    entries = []
    for actor, routine in state["actors"].items():
        position = routine["position"]
        if actor == "caretaker" and world["mystery"]["muted"] and "muted" not in routine["reactions"]:
            routine["reactions"].append("muted")
            entries.append(event(world, actor, "routine", "周师傅听见广播停了，松开了紧握的手：总算能听清自己的脚步了。",
                                 recipients(world, actor, position), {"activity": "留意广播的变化"}))
        _, _, label, text = ROUTES[actor][routine["route"]]
        if actor == talking_to and distance(position, world["player_position"]) <= 38:
            if routine["phase"] != "paused":
                routine["resume_phase"] = routine["phase"]; routine["phase"] = "paused"; routine["revision"] += 1
            routine["moving"] = False
            routine["activity"] = label + " · 抬头看向你"
            continue
        if routine["phase"] == "paused":
            routine["phase"] = routine.pop("resume_phase", "walking"); routine["revision"] += 1
        routine["moving"] = routine["phase"] == "walking"
        routine["activity"] = ("前往" if routine["moving"] else "正在") + label
        if routine["phase"] == "working":
            routine["work_left"] -= delta
            if routine["work_left"] <= 0:
                start_job(routine, actor, (routine["route"] + 1) % len(ROUTES[actor]))
            continue
        budget = SPEED * delta
        while routine["path"] and budget > 0:
            target = routine["path"][0]
            remaining = distance(position, target)
            step = min(remaining, budget)
            if remaining > .0001:
                position["x"] += (target["x"] - position["x"]) / remaining * step
                position["y"] += (target["y"] - position["y"]) / remaining * step
            budget -= step
            if remaining - step < .001:
                routine["path"].pop(0)
            else:
                break
        position.update(x=round(position["x"], 4), y=round(position["y"], 4))
        world["characters"][actor]["location"] = room_at(position["x"], position["y"])
        if not routine["path"]:
            routine["phase"] = "working"; routine["moving"] = False; routine["revision"] += 1
            routine["activity"] = "正在" + label
            entries.append(event(world, actor, "routine", text, recipients(world, actor, position), {"activity": label}))
    return entries


def motion_packet(world, actor):
    state = world.get("routines", {})
    routine = state.get("actors", {}).get(actor)
    if not routine or state.get("version") != ROUTINE_VERSION:
        return None
    return {"revision": routine["revision"], "sampled_at": state["last_at"], "phase": routine["phase"],
            "path": routine["path"], "speed": SPEED, "work_left": max(0., routine["work_left"]),
            "task_id": f"{actor}-{routine['route']}"}
