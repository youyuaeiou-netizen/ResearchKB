from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / ".harness" / "qa" / "obsui" / "reference-tabs" / "long-tab-states.png"
OUTPUT = ROOT / ".harness" / "qa" / "obsui" / "long-tab-top-montage.png"
RAW_OUTPUT = ROOT / ".harness" / "qa" / "obsui" / "long-tab-raw-montage.png"
SLOT_OUTPUT = ROOT / ".harness" / "qa" / "obsui" / "long-tab-slot-montage.png"
STATE_TOPS = (0, 419, 841, 1264, 1684)
SLOT_EDGES = (156, 258, 359, 461, 561, 663)


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    crops = [image.crop((120, top, 670, top + 86)) for top in STATE_TOPS]
    scale = 2
    canvas = Image.new("RGBA", (crops[0].width * scale, len(crops) * crops[0].height * scale), (10, 10, 10, 255))
    draw = ImageDraw.Draw(canvas)
    for index, crop in enumerate(crops):
        canvas.alpha_composite(crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.NEAREST), (0, index * crop.height * scale))
        draw.text((8, index * crop.height * scale + 8), str(index + 1), fill=(255, 0, 255, 255))
    canvas.convert("RGB").save(OUTPUT, quality=96)
    raw_crops = [image.crop((140, top, 640, top + 60)) for top in STATE_TOPS]
    raw_canvas = Image.new("RGBA", (raw_crops[0].width * scale, len(raw_crops) * raw_crops[0].height * scale), (10, 10, 10, 255))
    raw_draw = ImageDraw.Draw(raw_canvas)
    for index, crop in enumerate(raw_crops):
        raw_canvas.alpha_composite(crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.NEAREST), (0, index * crop.height * scale))
        raw_draw.text((8, index * crop.height * scale + 8), str(index + 1), fill=(255, 0, 255, 255))
    raw_canvas.convert("RGB").save(RAW_OUTPUT, quality=96)
    slot_crops = []
    for index, top in enumerate(STATE_TOPS):
        for slot in range(5):
            slot_crops.append(image.crop((SLOT_EDGES[slot], top, SLOT_EDGES[slot + 1], top + 48)))
    slot_scale = 3
    slot_canvas = Image.new("RGBA", (SLOT_EDGES[-1] - SLOT_EDGES[0], len(slot_crops) * 48), (10, 10, 10, 255))
    slot_canvas = Image.new("RGBA", (102 * slot_scale, len(slot_crops) * 48 * slot_scale), (10, 10, 10, 255))
    for index, crop in enumerate(slot_crops):
        slot_canvas.alpha_composite(crop.resize((crop.width * slot_scale, crop.height * slot_scale), Image.Resampling.NEAREST), (0, index * 48 * slot_scale))
    slot_canvas.convert("RGB").save(SLOT_OUTPUT, quality=96)
    print(f"source={image.size} output={OUTPUT}")
    print(f"raw_output={RAW_OUTPUT}")
    print(f"slot_output={SLOT_OUTPUT}")
    print(f"state_tops={STATE_TOPS}")


if __name__ == "__main__":
    main()
