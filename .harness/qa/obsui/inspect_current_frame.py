from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "apps" / "ObsUI" / "assets" / "reference"
OUTPUT = Path(__file__).with_name("current-frame-inspection.png")


def live_frame() -> Image.Image:
    frame = Image.open(ASSETS / "device-panel-clean.png").convert("RGBA")
    belt = Image.open(ASSETS / "device-card-belt.png").convert("RGBA")
    clasp = Image.open(ASSETS / "device-card-clasp.png").convert("RGBA")
    viewport = Image.new("RGBA", (1266, 512), (0, 0, 0, 0))
    viewport.alpha_composite(belt.crop((0, 0, 1266, 512)))
    viewport.alpha_composite(clasp)
    frame.alpha_composite(viewport, (252, 302))
    return frame


def main() -> None:
    source = Image.open(ASSETS / "device-panel.png").convert("RGBA")
    current = live_frame()
    crop_box = (1430, 278, 1555, 842)
    source_crop = source.crop(crop_box).resize((500, 2256), Image.Resampling.NEAREST)
    current_crop = current.crop(crop_box).resize((500, 2256), Image.Resampling.NEAREST)

    canvas = Image.new("RGBA", (1036, 2328), (22, 23, 24, 255))
    canvas.alpha_composite(source_crop, (12, 60))
    canvas.alpha_composite(current_crop, (524, 60))
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 18), "SOURCE RIGHT FRAME", fill=(242, 242, 237, 255))
    draw.text((524, 18), "CURRENT LIVE COMPOSITE", fill=(242, 242, 237, 255))
    canvas.convert("RGB").save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
