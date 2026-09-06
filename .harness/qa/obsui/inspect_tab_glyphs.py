from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "apps" / "ObsUI" / "assets" / "reference"
SOURCE = ASSETS / "device-panel.png"
OUTPUT = Path(__file__).with_name("tab-glyph-inspection.png")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    boxes = {
        "goal-idle": (560, 38, 752, 127),
        "local-active": (752, 38, 946, 127),
        "repository-idle": (957, 38, 1141, 127),
        "literature-idle": (1150, 38, 1331, 127),
        "storage-idle": (1340, 38, 1525, 127),
    }
    scale = 5
    tiles = []
    for label, box in boxes.items():
        tile = source.crop(box).resize(((box[2] - box[0]) * scale, (box[3] - box[1]) * scale), Image.Resampling.NEAREST)
        tiles.append((label, tile))

    for name in ("goal", "repository", "literature", "storage"):
        active = Image.open(ASSETS / "device-tabs" / "strips" / f"{name}.png").convert("RGBA")
        selected_boxes = {
            "goal": (8, 8, 200, 97),
            "repository": (405, 8, 589, 97),
            "literature": (598, 8, 779, 97),
            "storage": (788, 8, 973, 97),
        }
        box = selected_boxes[name]
        tile = active.crop(box).resize(((box[2] - box[0]) * scale, (box[3] - box[1]) * scale), Image.Resampling.NEAREST)
        tiles.append((f"{name}-active-current", tile))

    width = max(tile.width for _, tile in tiles)
    height = sum(tile.height + 44 for _, tile in tiles)
    canvas = Image.new("RGBA", (width, height), (18, 19, 20, 255))
    draw = ImageDraw.Draw(canvas)
    top = 0
    for label, tile in tiles:
        draw.text((0, top), label, fill=(242, 242, 236, 255))
        top += 30
        canvas.alpha_composite(tile, (0, top))
        top += tile.height + 14
    canvas.convert("RGB").save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
