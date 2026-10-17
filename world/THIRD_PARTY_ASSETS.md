# Pixel art credits

The game uses the following original PNG tilesheets downloaded from Kenney's official asset pages. Both packs include a Creative Commons Zero (CC0) license permitting use in personal, educational and commercial projects. Attribution is optional; we credit Kenney here and in the game.

| Pack | Source | Included files | License |
| --- | --- | --- | --- |
| Tiny Town 1.1 | https://kenney.nl/assets/tiny-town | `frontend/public/assets/kenney-tiny-town/` | Included `License.txt`; CC0 1.0 |
| Tiny Dungeon | https://kenney.nl/assets/tiny-dungeon | `frontend/public/assets/kenney-tiny-dungeon/` | Included `License.txt`; CC0 1.0 |

Official archive SHA-256 values recorded when downloaded:

```text
kenney_tiny-town.zip
9768692dccff1d706408a5aedd6ca4f6cd1409506cbc84cb2f862919764be977

kenney_tiny-dungeon.zip
c109438ab06f65fd80f9b2686a4cf9c7c11dc64444b47333ec71d602f8bb5fc7
```

License text: https://creativecommons.org/publicdomain/zero/1.0/

The Tiled-compatible layout in `frontend/src/maps/night-town.json` is assembled for this game. Its interaction points, character positions and walkable rectangles are exported from the existing game rules by `scripts/build-town-map.py`. Original atlas files are unchanged. Night lighting and puzzle-specific indicators are rendered by the game.

LimeZu Modern Interiors assets are not included. No paid assets have been copied or redistributed.

## Engine

Phaser 4.2.1 is installed from the official npm `phaser` package. Copyright (c) 2026 Richard Davey, Phaser Studio Inc. Licensed under MIT; the complete notice is included at `frontend/public/licenses/Phaser-MIT.txt` and is distributed with the frontend build.
