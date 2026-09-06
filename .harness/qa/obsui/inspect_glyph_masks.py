from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-panel.png"
OUTPUT = Path(__file__).with_name("glyph-mask-inspection.png")


def mask_from_idle(image: Image.Image, threshold: int) -> Image.Image:
    luminance = image.convert("L")
    return luminance.point(lambda value: max(0, min(255, round((value - threshold) * 255 / (255 - threshold)))))


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    local = source.crop((752, 38, 946, 127))
    repository = source.crop((957, 38, 1141, 127))
    glyph_box = (22, 10, 170, 68)
    yellow = Image.new("RGBA", repository.size, (250, 203, 4, 255))
    tiles = [("source selected local", local)]
    for threshold in (115, 135, 155, 175):
        tile = yellow.copy()
        glyph = Image.new("RGBA", repository.size, (0, 0, 0, 0))
        mask = mask_from_idle(repository.crop(glyph_box), threshold)
        glyph.paste((10, 10, 8, 255), glyph_box[:2], mask)
        tile.alpha_composite(glyph)
        tiles.append((f"repository idle core threshold {threshold}", tile))
    for expansion in (3, 5, 7, 9):
        tile = yellow.copy()
        glyph = Image.new("RGBA", repository.size, (0, 0, 0, 0))
        mask = mask_from_idle(repository.crop(glyph_box), 145).filter(ImageFilter.MaxFilter(expansion))
        glyph.paste((10, 10, 8, 255), glyph_box[:2], mask)
        tile.alpha_composite(glyph)
        tiles.append((f"repository idle core expanded {expansion}px", tile))

    scale = 5
    canvas = Image.new("RGBA", (repository.width * scale, len(tiles) * (repository.height * scale + 34)), (18, 19, 20, 255))
    draw = ImageDraw.Draw(canvas)
    top = 0
    for label, tile in tiles:
        draw.text((0, top), label, fill=(242, 242, 236, 255))
        canvas.alpha_composite(tile.resize((tile.width * scale, tile.height * scale), Image.Resampling.NEAREST), (0, top + 22))
        top += tile.height * scale + 34
    canvas.convert("RGB").save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
