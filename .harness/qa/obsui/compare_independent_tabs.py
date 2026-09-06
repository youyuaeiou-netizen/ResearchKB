from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / ".harness" / "qa" / "obsui" / "reference-tabs" / "long-tab-states.png"
LIVE = ROOT / ".harness" / "qa" / "obsui" / "tab-structure-final-goal.png"
OUTPUT = ROOT / ".harness" / "qa" / "obsui" / "tab-source-vs-independent-live.png"


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA").crop((145, 0, 630, 58))
    live = Image.open(LIVE).convert("RGBA").crop((410, 12, 1185, 105))
    canvas = Image.new("RGB", (1120, 300), (20, 23, 26))
    draw = ImageDraw.Draw(canvas)
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    label_font = ImageFont.truetype(str(font_path), 17) if font_path.exists() else ImageFont.load_default()
    panels = (("visual reference only — long source", source), ("implementation — independent transparent PNGs", live))
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
