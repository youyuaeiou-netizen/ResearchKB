from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "apps" / "ObsUI" / "assets" / "reference"
OUTPUT = Path(__file__).with_name("latest-frame-and-tabs-comparison.png")


def main() -> None:
    source = Image.open(ASSETS / "device-panel.png").convert("RGBA")
    live = Image.open(ASSETS / "device-panel-clean.png").convert("RGBA")
    belt = Image.open(ASSETS / "device-card-belt.png").convert("RGBA")
    clasp = Image.open(ASSETS / "device-card-clasp.png").convert("RGBA")

    viewport = Image.new("RGBA", (1266, 512), (0, 0, 0, 0))
    viewport.alpha_composite(belt.crop((0, 0, 1266, 512)))
    viewport.alpha_composite(clasp, (0, 0))
    live.alpha_composite(viewport, (252, 302))

    tab_names = ("goal", "local", "repository", "literature", "storage")
    strips = [
        Image.open(ASSETS / "device-tabs" / "strips" / f"{name}.png").convert("RGBA")
        for name in tab_names
    ]

    gutter = 24
    tab_height = sum(strip.height for strip in strips)
    canvas = Image.new(
        "RGBA",
        (source.width * 2 + gutter, source.height + gutter + tab_height),
        (21, 22, 23, 255),
    )
    canvas.alpha_composite(source, (0, 0))
    canvas.alpha_composite(live, (source.width + gutter, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, source.height, canvas.width, source.height + gutter), fill=(6, 7, 8, 255))

    top = source.height + gutter
    for strip in strips:
        left = (canvas.width - strip.width) // 2
        canvas.alpha_composite(strip, (left, top))
        top += strip.height

    canvas.convert("RGB").save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
