from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

import rebuild_device_assets as builder


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "apps" / "ObsUI" / "assets" / "reference"
OUTPUT = Path(__file__).with_name("tab-mask-variants.png")


def mask(image: Image.Image, box: tuple[int, int, int, int], threshold: int, gain: float, filter_size: int) -> Image.Image:
    luminance = image.crop(box).convert("L").filter(ImageFilter.UnsharpMask(radius=1, percent=220, threshold=2))
    result = luminance.point(lambda value: builder.clamp((value - threshold) * gain))
    return result.filter(ImageFilter.MaxFilter(filter_size)) if filter_size > 1 else result


def binary_mask(image: Image.Image, box: tuple[int, int, int, int], threshold: int) -> Image.Image:
    luminance = image.crop(box).convert("L").filter(ImageFilter.UnsharpMask(radius=1, percent=220, threshold=2))
    return luminance.point(lambda value: 255 if value >= threshold else 0).filter(ImageFilter.MaxFilter(3))


def inner_glyph_mask(image: Image.Image, box: tuple[int, int, int, int], threshold: int) -> Image.Image:
    white = binary_mask(image, box, threshold)
    width, height = white.size
    wall = list(white.getdata())
    outside = [False] * (width * height)
    stack = []
    for x in range(width):
        stack.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        stack.extend(((0, y), (width - 1, y)))
    while stack:
        x, y = stack.pop()
        index = y * width + x
        if x < 0 or y < 0 or x >= width or y >= height or outside[index] or wall[index] != 0:
            continue
        outside[index] = True
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    result = Image.new("L", (width, height), 0)
    result.putdata([255 if wall[index] == 0 and not outside[index] else 0 for index in range(width * height)])
    return result


def render(name: str, tab_box: tuple[int, int, int, int], threshold: int, gain: float, filter_size: int, binary: bool = False, inner: bool = False) -> Image.Image:
    source = Image.open(ASSETS / "device-panel.png").convert("RGBA")
    idle = source.crop(tab_box)
    selected_local = source.crop((752, 38, 946, 127))
    glyph_box = (22, 10, 170, 68)
    active = builder.erase_tab_label(selected_local.resize(idle.size), glyph_box)
    glyph = Image.new("RGBA", active.size, (0, 0, 0, 0))
    alpha = inner_glyph_mask(idle, glyph_box, threshold) if inner else binary_mask(idle, glyph_box, threshold) if binary else mask(idle, glyph_box, threshold, gain, filter_size)
    glyph.paste((9, 9, 9, 255), glyph_box[:2], alpha)
    active.alpha_composite(glyph)
    return active


def main() -> None:
    tab_box = (560, 38, 752, 127)
    variants = [
        ("current 188 x3 max3", 188, 3.8, 3),
        ("core 160 x2.7 max3", 160, 2.7, 3),
        ("core 140 x2.2 max3", 140, 2.2, 3),
        ("binary 180 max3", 180, 1, 1, True),
        ("binary 160 max3", 160, 1, 1, True),
        ("binary 140 max3", 140, 1, 1, True),
        ("inner 180", 180, 1, 1, False, True),
        ("inner 160", 160, 1, 1, False, True),
        ("inner 140", 140, 1, 1, False, True),
        ("core 188 x3.8", 188, 3.8, 1),
        ("core 160 x2.7", 160, 2.7, 1),
        ("core 140 x2.2", 140, 2.2, 1),
        ("core 120 x1.9", 120, 1.9, 1),
    ]
    scale = 5
    samples = []
    for item in variants:
        label, threshold, gain, filter_size, *flags = item
        binary = flags[0] if len(flags) >= 1 else False
        inner = flags[1] if len(flags) >= 2 else False
        samples.append((label, render("goal", tab_box, threshold, gain, filter_size, binary, inner).resize((960, 445), Image.Resampling.NEAREST)))
    canvas = Image.new("RGBA", (960, len(samples) * 490), (18, 19, 20, 255))
    draw = ImageDraw.Draw(canvas)
    top = 0
    for label, sample in samples:
        draw.text((0, top), label, fill=(242, 242, 236, 255))
        top += 32
        canvas.alpha_composite(sample, (0, top))
        top += 458
    canvas.convert("RGB").save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
