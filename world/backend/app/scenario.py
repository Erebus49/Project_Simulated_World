from copy import deepcopy
from pathlib import Path

import yaml

SCENARIO_PATH = Path(__file__).resolve().parents[1] / "scenarios" / "festival.yaml"


def scenario(scenario_id="festival"):
    path = SCENARIO_PATH.with_name("night.yaml") if scenario_id == "night" else SCENARIO_PATH
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def initial_world(max_turns=18, goals=None, scenario_id="festival"):
    config = scenario(scenario_id)
    chars = deepcopy(config["characters"])
    for actor, goal in (goals or {}).items():
        if actor not in chars or actor == "player" or not goal.strip() or len(goal) > 600:
            raise ValueError("只能设置四个 NPC 的目标，长度为 1—600 字")
        chars[actor]["goal"] = goal.strip()
    world = {
        "scenario_id": scenario_id,
        "scenario_version": config["version"], "turn": 0, "max_turns": max_turns,
        "version": 0, "status": "playing", "characters": chars,
        "items": deepcopy(config["items"]),
        "facilities": {"stage_open": False, "inspection": 0, "speaker_installed": False, "stall_allocated": False},
    }
    if scenario_id == "night":
        world["player_position"] = {"x": 239.0, "y": 211.0}
        world["mystery"] = {"clues": [], "anomalies": 0, "muted": False, "sealed": False,
                            "power_off": False, "locker_open": False, "escaped": False, "last_broadcast": -1}
    return world

