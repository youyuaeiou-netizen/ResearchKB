from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).with_name("tab-font-inspection.png")


def main() -> None:
    fonts = [
        "C:/Windows/Fonts/HYYakuHei-85W.ttf",
        "C:/Windows/Fonts/FZTanHTJW.TTF",
        "C:/Windows/Fonts/FZSTK.TTF",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/NotoSansSC-VF.ttf",
    ]
    labels = "目标 本机 仓库 文献 H.D.D"
    rows = []
    for path in fonts:
        image = Image.new("RGBA", (980, 130), (248, 204, 5, 255))
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(path, 66)
        draw.text((32, 30), labels, font=font, fill=(8, 8, 8, 255), stroke_width=0)
        rows.append((Path(path).name, image))

    canvas = Image.new("RGBA", (980, len(rows) * 170), (18, 19, 20, 255))
    draw = ImageDraw.Draw(canvas)
    top = 0
    for name, row in rows:
        draw.text((10, top), name, fill=(242, 242, 236, 255))
        canvas.alpha_composite(row, (0, top + 28))
        top += 170
    canvas.convert("RGB").save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
