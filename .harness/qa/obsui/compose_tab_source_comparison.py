from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / ".harness" / "qa" / "obsui" / "reference-tabs" / "long-tab-states.png"
LIVE_DIR = ROOT / ".harness" / "qa" / "obsui"
OUTPUT = ROOT / ".harness" / "qa" / "obsui" / "tab-source-vs-live.png"
TOPS = (0, 419, 841, 1264, 1684)
NAMES = ("目标", "本机", "仓库", "文献", "H.D.D")
TARGET_SIZE = (750, 76)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    canvas = Image.new("RGB", (TARGET_SIZE[0] * 2, len(NAMES) * 100), (8, 8, 8))
    draw = ImageDraw.Draw(canvas)
    for index, (top, name) in enumerate(zip(TOPS, NAMES, strict=True)):
        source_crop = source.crop((140, top, 680, top + 100)).resize(TARGET_SIZE, Image.Resampling.LANCZOS).convert("RGB")
        filename = "goal" if index == 0 else "local" if index == 1 else "repository" if index == 2 else "literature" if index == 3 else "storage"
        live = Image.open(LIVE_DIR / f"live-full-{filename}.png").convert("RGB").crop((422, 22, 1173, 100)).resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        y = index * 100 + 20
        canvas.paste(source_crop, (0, y))
        canvas.paste(live, (TARGET_SIZE[0], y))
        draw.text((8, index * 100 + 4), f"{name} · source", fill=(240, 240, 240))
        draw.text((TARGET_SIZE[0] + 8, index * 100 + 4), f"{name} · browser", fill=(240, 240, 240))
    canvas.save(OUTPUT)
    print(f"comparison={OUTPUT} size={canvas.size}")


if __name__ == "__main__":
    main()
