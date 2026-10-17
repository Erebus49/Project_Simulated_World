"""Build the Tiled-compatible map from Kenney tile IDs and game semantics.

Run from the repository root: .venv/Scripts/python scripts/build-town-map.py
Optional --preview needs Pillow; it writes an inspection image under ignored data.
"""
import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.mystery import ANCHORS, NPC_POSITIONS, WALK_RECTS, WORLD_SIZE

WIDTH, HEIGHT, TILE = WORLD_SIZE["width"] // 16, WORLD_SIZE["height"] // 16, 16
layers = []
objects = []


def properties(**values):
    return [{"name": key, "type": "string", "value": json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value} for key, value in values.items()]


def tile_layer(name, data, **extra):
    layer = {"id": len(layers) + 1, "name": name, "type": "tilelayer", "width": WIDTH, "height": HEIGHT,
             "x": 0, "y": 0, "opacity": 1, "visible": True, "data": data, **extra}
    layers.append(layer)
    return layer


def object_tile(tile, x, y, *, dungeon=False, name="", scale=1):
    objects.append({"id": len(objects) + 1, "name": name, "type": "decoration", "gid": (1001 if dungeon else 1) + tile,
                    "x": x, "y": y + 16 * scale, "width": 16 * scale, "height": 16 * scale, "rotation": 0, "visible": True})


def tiles(matrix, x, y):
    for row, values in enumerate(matrix):
        for col, tile in enumerate(values):
            if tile is not None:
                object_tile(tile, x + col * TILE, y + row * TILE)


rng = random.Random(417)
ground = [1 + (1 if rng.randrange(8) == 0 else 0) for _ in range(WIDTH * HEIGHT)]
tile_layer("Meadow", ground)
for index, (left, top, right, bottom) in enumerate(WALK_RECTS):
    # A layer offset and explicit clipping keep the visible road on the exact
    # existing continuous movement geometry, rather than rounding collision tiles.
    cols, rows = (right - left + 15) // 16, (bottom - top + 15) // 16
    data = [0] * (WIDTH * HEIGHT)
    for y in range(rows):
        for x in range(cols):
            data[y * WIDTH + x] = 26
    tile_layer(f"Walkway {index + 1}", data, offsetx=left, offsety=top,
               properties=properties(clipRect=[left, top, right - left, bottom - top]))

# Timber shop. Door and paving line up with the existing shop approach.
tiles([[52, 53, 53, 53, 53, 53, 53, 54],
       [64, 65, 65, 65, 65, 67, 65, 66],
       [72, 73, 73, 73, 73, 73, 73, 75],
       [72, 84, 73, 84, 73, 73, 73, 75],
       [72, 73, 73, 73, 73, 86, 73, 75]], 32, 48)
object_tile(43, 112, 128)
object_tile(63, 99, 128, dungeon=True, name="Return locker")
object_tile(83, 129, 127, name="Shop sign")
object_tile(107, 41, 126, name="Crate")
object_tile(106, 147, 126, name="Barrel")
object_tile(2, 51, 132)

# Stage pavilion: matching slate tiles, timber support and a practical front.
tiles([[48, 49, 49, 49, 49, 49, 50],
       [60, 61, 61, 63, 61, 61, 62]], 320, 48)
for x in range(336, 432, 16):
    object_tile(73, x, 96)
    object_tile(73, x, 112)
    object_tile(81, x, 128)
for x in (320, 432):
    object_tile(47, x, 80)
    object_tile(59, x, 96)
    object_tile(71, x, 112)
object_tile(83, 368, 88, name="Stage placard")
object_tile(63, 367, 128, dungeon=True, name="Control desk")
object_tile(125, 342, 113, dungeon=True, name="Stage lamp")
object_tile(125, 413, 113, dungeon=True, name="Stage lamp")
object_tile(43, 368, 144)

# The square well and the rules board remain outside the walkable road.
for x in (216, 232, 248):
    object_tile(43, x, 116)
object_tile(104, 232, 108, name="Square well")
object_tile(83, 283, 143, name="Rules board")
object_tile(43, 283, 159)
object_tile(115, 180, 213, dungeon=True, name="Bench")
object_tile(115, 280, 213, dungeon=True, name="Bench")

# Fence, low tombstones, shrubbery and the narrow southern gate.
tiles([[44, 45, 45, 45, 46]], 16, 243)
object_tile(47, 16, 211)
object_tile(59, 16, 227)
object_tile(47, 80, 211)
object_tile(59, 80, 227)
object_tile(65, 32, 218, dungeon=True)
object_tile(65, 59, 226, dungeon=True)
object_tile(64, 46, 234, dungeon=True)
object_tile(123, 217, 254)
object_tile(124, 249, 254)
object_tile(99, 217, 238)
object_tile(100, 233, 238)
object_tile(101, 249, 238)
object_tile(68, 233, 254, dungeon=True, name="South gate")

for index, (x, y) in enumerate([(0, 22), (164, 17), (186, 0), (267, 21), (292, 0), (449, 24), (462, 88),
                              (8, 113), (148, 223), (177, 242), (303, 216), (331, 239), (407, 213), (449, 243),
                              (53, 174), (400, 218), (433, 212), (287, 73), (16, 4), (42, 0), (68, 5),
                              (344, 3), (370, 0), (397, 6), (466, 0)]):
    autumn = index % 5 == 0
    object_tile(3 if autumn else 4, x, y)
    object_tile(15 if autumn else 16, x, y + 16)
for x, y in [(144, 205), (116, 229), (331, 207), (464, 156), (35, 155), (428, 29), (175, 99), (192, 231)]:
    object_tile(28, x, y)
for x, y in [(172, 82), (290, 205), (366, 229), (111, 204), (406, 148), (55, 201)]:
    object_tile(2, x, y)
for x, y in [(190, 141), (314, 146), (263, 231)]:
    object_tile(125, x - 8, y - 12, dungeon=True, name="Path lantern")

# Expanded eastern grove and southern garden. Decorations never cover the
# server's walkable rectangles; the old puzzle coordinates stay compatible.
def on_road(x, y, pad=5):
    return any(left - pad <= x <= right + pad and top - pad <= y <= bottom + pad for left, top, right, bottom in WALK_RECTS)

for x in range(480, 754, 28):
    for y in range(16, 452, 32):
        if on_road(x + 8, y + 24) or (542 <= x <= 624 and 225 <= y <= 285):
            continue
        if rng.random() < .68:
            object_tile(3 if (x + y) % 5 == 0 else 4, x, y)
            object_tile(15 if (x + y) % 5 == 0 else 16, x, y + 16)
        elif rng.random() < .7:
            object_tile(2, x, y)
for x in range(112, 464, 32):
    for y in range(292, 456, 32):
        if not on_road(x + 8, y + 24) and rng.random() < .72:
            object_tile(4, x, y); object_tile(16, x, y + 16)
for x, y in [(450, 172), (570, 173), (671, 225), (671, 300), (589, 337), (422, 337), (285, 337), (511, 257)]:
    # Lantern is mounted just off the north/west edge of each footpath.
    object_tile(125, x - 8, y - 28, dungeon=True, name="Garden lantern")
for x in range(550, 623, 16):
    object_tile(43, x, 237)
    object_tile(43, x, 269)
object_tile(104, 577, 246, name="Garden well")
object_tile(83, 660, 153, name="Grove trail sign")
object_tile(65, 502, 303, dungeon=True, name="Old handover tablet")
for x, y in [(306, 371), (390, 371), (550, 370), (589, 370)]:
    object_tile(115, x, y, dungeon=True, name="Garden bench")
for x in range(254, 430, 16):
    object_tile(45, x, 388, name="Garden fence")
for x in range(480, 692, 16):
    if not on_road(x + 8, 402):
        object_tile(45, x, 402, name="Garden fence")

layers.append({"id": len(layers) + 1, "name": "Scenery", "type": "objectgroup", "draworder": "index", "opacity": 1, "visible": True, "objects": objects})
# Foot-level collision, shared by Python and the browser. Grass is traversable;
# roofs, tree trunks, wells, fences and solid props are the barriers.
collision_rects = [[32, 48, 160, 128], [320, 48, 448, 143]]
for obj in objects:
    gid, x, y = obj["gid"], obj["x"], obj["y"] - obj["height"]
    tile = gid - (1001 if gid >= 1001 else 1)
    if gid < 1001 and tile in {15, 16}:
        collision_rects.append([x + 4, y + 8, x + 12, y + 16])
    elif gid < 1001 and tile in {28, 83, 104, 106, 107}:
        collision_rects.append([x + 2, y + 7, x + 14, y + 16])
    elif gid < 1001 and tile in {44, 45, 46}:
        collision_rects.append([x, y + 5, x + 16, y + 12])
    elif gid >= 1001 and tile in {63, 64, 65, 115}:
        collision_rects.append([x + 2, y + 8, x + 14, y + 16])
collision_path = ROOT / "backend/scenarios/night_collision.json"
collision_path.write_text(json.dumps(collision_rects, separators=(",", ":")) + "\n", encoding="utf-8")
semantic = []
for key, anchor in ANCHORS.items():
    semantic.append({"id": len(objects) + len(semantic) + 1, "name": key, "type": "interaction", "point": True, "x": anchor["x"], "y": anchor["y"],
                     "properties": properties(label=anchor["name"], room=anchor["room"], actions=anchor["actions"], radius="27")})
for key, point in NPC_POSITIONS.items():
    semantic.append({"id": len(objects) + len(semantic) + 1, "name": key, "type": "character", "point": True, **point})
for index, (left, top, right, bottom) in enumerate(WALK_RECTS):
    semantic.append({"id": len(objects) + len(semantic) + 1, "name": f"walkable-{index + 1}", "type": "walkable", "x": left, "y": top, "width": right - left, "height": bottom - top})
layers.append({"id": len(layers) + 1, "name": "Game semantics", "type": "objectgroup", "visible": False, "opacity": 1, "objects": semantic})
tilesets = [{"firstgid": first, "name": name, "tilewidth": 16, "tileheight": 16, "tilecount": 132, "columns": 12,
             "image": f"../../public/assets/kenney-{name}/tilemap_packed.png", "imagewidth": 192, "imageheight": 176, "spacing": 0, "margin": 0}
            for first, name in [(1, "tiny-town"), (1001, "tiny-dungeon")]]
map_data = {"type": "map", "version": "1.10", "tiledversion": "1.11.2", "orientation": "orthogonal", "renderorder": "right-down",
            "width": WIDTH, "height": HEIGHT, "tilewidth": TILE, "tileheight": TILE, "infinite": False,
            "nextlayerid": len(layers) + 1, "nextobjectid": len(objects) + len(semantic) + 1,
            "properties": properties(author="Kenney assets; map layout by the Pinecone Town project", logicalViewport=[WORLD_SIZE["width"], WORLD_SIZE["height"]]),
            "tilesets": tilesets, "layers": layers}
target = ROOT / "frontend" / "src" / "maps" / "night-town.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(map_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {target.relative_to(ROOT)} ({len(objects)} scenery objects)")

parser = argparse.ArgumentParser()
parser.add_argument("--preview", action="store_true")
if parser.parse_args().preview:
    from PIL import Image
    sheets = {1: Image.open(ROOT / "frontend/public/assets/kenney-tiny-town/tilemap_packed.png").convert("RGBA"),
              1001: Image.open(ROOT / "frontend/public/assets/kenney-tiny-dungeon/tilemap_packed.png").convert("RGBA")}
    canvas = Image.new("RGBA", (WORLD_SIZE["width"], WORLD_SIZE["height"]))
    def paste(gid, x, y, w=16, h=16, dest=None):
        base = 1001 if gid >= 1001 else 1
        tile = gid - base
        image = sheets[base].crop((tile % 12 * 16, tile // 12 * 16, tile % 12 * 16 + 16, tile // 12 * 16 + 16))
        if (w, h) != (16, 16):
            image = image.resize((w, h), Image.Resampling.NEAREST)
        (dest or canvas).alpha_composite(image, (x, y))
    for layer in layers:
        if not layer["visible"]:
            continue
        if layer["type"] == "tilelayer":
            layer_image = Image.new("RGBA", canvas.size)
            for i, gid in enumerate(layer["data"]):
                if gid:
                    paste(gid, i % WIDTH * 16 + layer.get("offsetx", 0), i // WIDTH * 16 + layer.get("offsety", 0), dest=layer_image)
            clip = next((json.loads(p["value"]) for p in layer.get("properties", []) if p["name"] == "clipRect"), None)
            if clip:
                x, y, w, h = clip
                cropped = layer_image.crop((x, y, x + w, y + h))
                canvas.alpha_composite(cropped, (x, y))
            else:
                canvas.alpha_composite(layer_image)
        else:
            for obj in layer["objects"]:
                paste(obj["gid"], obj["x"], obj["y"] - obj["height"], obj["width"], obj["height"])
    preview = ROOT / "backend/data/asset-inspection/tile-town-preview.png"
    preview.parent.mkdir(parents=True, exist_ok=True)
    canvas.resize((WORLD_SIZE["width"] * 2, WORLD_SIZE["height"] * 2), Image.Resampling.NEAREST).save(preview)
    print(f"Wrote {preview.relative_to(ROOT)}")
