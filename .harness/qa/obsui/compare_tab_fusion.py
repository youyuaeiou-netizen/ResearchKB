from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path("C:/Users/86159/AppData/Local/Temp/codex-clipboard-5bda13ff-8dde-4574-a976-6ef6f5f9d112.png")
LIVE = ROOT / ".harness" / "qa" / "obsui" / "tab-fusion-final-goal.png"
OUTPUT = ROOT / ".harness" / "qa" / "obsui" / "tab-fusion-source-vs-live.png"


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA").crop((120, 0, 755, 78))
    live = Image.open(LIVE).convert("RGBA").crop((440, 25, 1160, 120))
    canvas = Image.new("RGB", (1120, 300), (20, 23, 26))
    draw = ImageDraw.Draw(canvas)
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    label_font = ImageFont.truetype(str(font_path), 17) if font_path.exists() else ImageFont.load_default()
    panels = (
        ("reference — Tab + native panel frame", source),
        ("implementation — current Tab + native panel frame", live),
    )
    for index, (label, image) in enumerate(panels):
        top = 18 + index * 138
        draw.text((24, top), label, font=label_font, fill=(224, 228, 231))
        fitted = ImageOps.contain(image, (1040, 92), method=Image.Resampling.LANCZOS).convert("RGB")
        left = (1120 - fitted.width) // 2
        canvas.paste(fitted, (left, top + 27))
    canvas.save(OUTPUT, "PNG", optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
