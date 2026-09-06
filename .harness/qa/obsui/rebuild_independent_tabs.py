from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = REPO_ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-tabs" / "components"
REFERENCE_TAB_DIR = OUTPUT_DIR.parent
WIDTH, HEIGHT = 200, 100
SCALE = 6
HI_WIDTH, HI_HEIGHT = WIDTH * SCALE, HEIGHT * SCALE

CHINESE_FONT = Path("C:/Windows/Fonts/HYYakuHei-85W.ttf")
LATIN_FONT = Path("C:/Windows/Fonts/arialbi.ttf")

TABS = {
    "goal": "目标",
    "local": "本机",
    "repository": "仓库",
    "literature": "文献",
    "storage": "H.D.D",
}


def scaled_box(box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    return tuple(round(value * SCALE) for value in box)  # type: ignore[return-value]


def shell_mask() -> Image.Image:
    mask = Image.new("L", (HI_WIDTH, HI_HEIGHT), 0)
    draw = ImageDraw.Draw(mask)
    # The shared silhouette keeps active and inactive states on exactly the
    # same baseline and preserves the existing yellow selected-state geometry.
    draw.rounded_rectangle(scaled_box((0, 2, 200, 99)), radius=14 * SCALE, fill=255)
    draw.rectangle(scaled_box((0, 17, 200, 97)), fill=255)
    draw.rounded_rectangle(scaled_box((0, 5, 200, 97)), radius=11 * SCALE, fill=255)
    draw.rectangle(scaled_box((0, 17, 200, 96)), fill=255)
    return mask


def inner_mask() -> Image.Image:
    mask = Image.new("L", (HI_WIDTH, HI_HEIGHT), 0)
    draw = ImageDraw.Draw(mask)
    # The fill follows the established active-state geometry.  Its visual
    # treatment changes below, but its bounds never alter the tab's layout.
    draw.rounded_rectangle(scaled_box((0, 5, 200, 90)), radius=11 * SCALE, fill=255)
    draw.rectangle(scaled_box((0, 17, 200, 89)), fill=255)
    return mask


def make_gradient(active: bool, seed: int) -> Image.Image:
    if active:
        stops = ((0.0, (255, 235, 36)), (0.22, (255, 222, 20)), (0.60, (255, 205, 4)), (1.0, (239, 173, 0)))
    else:
        stops = ((0.0, (151, 154, 154)), (0.12, (111, 114, 114)), (0.43, (82, 85, 85)), (0.76, (64, 67, 67)), (1.0, (43, 46, 46)))
    rng = random.Random(seed)
    image = Image.new("RGBA", (HI_WIDTH, HI_HEIGHT), (0, 0, 0, 0))
    pixels = image.load()
    for y in range(HI_HEIGHT):
        position = max(0.0, min(1.0, (y / SCALE - 5) / 80))
        for index in range(len(stops) - 1):
            if stops[index][0] <= position <= stops[index + 1][0]:
                left, left_color = stops[index]
                right, right_color = stops[index + 1]
                amount = (position - left) / (right - left)
                color = tuple(round(left_color[channel] + (right_color[channel] - left_color[channel]) * amount) for channel in range(3))
                break
        else:
            color = stops[-1][1]
        for x in range(HI_WIDTH):
            # A restrained centre lift and fine grain supply the reference's
            # stamped-metal depth without turning into a noisy texture.
            centre_lift = max(0, round(4 * (1 - abs(x / SCALE - 100) / 100)))
            grain = rng.randrange(-1, 2) if y % 4 == 0 and x % 3 == 0 else 0
            pixels[x, y] = tuple(max(0, min(255, channel + centre_lift + grain)) for channel in color) + (255,)
    return image


def load_font(label: str, size: int) -> ImageFont.FreeTypeFont:
    path = LATIN_FONT if label == "H.D.D" else CHINESE_FONT
    if not path.exists():
        raise FileNotFoundError(f"Required Windows font not found: {path}")
    return ImageFont.truetype(str(path), size * SCALE)


def add_text(image: Image.Image, label: str, active: bool) -> None:
    draw = ImageDraw.Draw(image)
    font_size = 27 if label != "H.D.D" else 26
    font = load_font(label, font_size)
    stroke_width = round(1.0 * SCALE)
    fill = (20, 21, 19, 255) if active else (245, 245, 238, 255)
    stroke = (238, 170, 0, 220) if active else (21, 23, 23, 255)
    bbox = draw.textbbox((0, 0), label, font=font, stroke_width=stroke_width)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (HI_WIDTH - text_width) // 2 - bbox[0]
    y = round(46.5 * SCALE - (bbox[1] + bbox[3]) / 2)
    draw.text((x, y), label, font=font, fill=fill, stroke_width=stroke_width, stroke_fill=stroke)


def build_tab(label: str, active: bool, seed: int) -> Image.Image:
    outer = shell_mask()
    inner = inner_mask()
    image = Image.new("RGBA", (HI_WIDTH, HI_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # The dark shell is a thin exterior contour, not a separate backing plate.
    # It is clipped to the tab silhouette so no rectangular bridge can appear.
    draw.bitmap((0, 0), outer, fill=(10, 12, 13, 255))
    gradient = make_gradient(active, seed)
    image.paste(gradient, (0, 0), inner)

    bevel = Image.new("RGBA", (HI_WIDTH, HI_HEIGHT), (0, 0, 0, 0))
    bevel_draw = ImageDraw.Draw(bevel)
    bevel_draw.line([((14 * SCALE), (6 * SCALE)), ((186 * SCALE), (6 * SCALE))], fill=(255, 255, 255, 78 if active else 92), width=1 * SCALE)
    bevel_draw.line([((14 * SCALE), (8 * SCALE)), ((186 * SCALE), (8 * SCALE))], fill=(255, 255, 255, 28 if active else 34), width=1 * SCALE)
    bevel_draw.line([((10 * SCALE), (89 * SCALE)), ((190 * SCALE), (89 * SCALE))], fill=(95, 73, 0, 120) if active else (19, 21, 22, 180), width=1 * SCALE)
    image.alpha_composite(bevel)

    # Keep all visual pixels clipped to the same alpha silhouette. This makes
    # active/inactive state swaps geometrically identical, including corners.
    image.putalpha(outer)
    add_text(image, label, active)
    image.putalpha(outer)
    image = image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)

    # Remove RGB residue from fully transparent pixels left by antialiasing.
    rgba = image.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if rgba[x, y][3] == 0:
                rgba[x, y] = (0, 0, 0, 0)
    return image


def build_inactive_from_reference(key: str) -> Image.Image:
    """Normalize the supplied idle-tab raster without its left neighbour seam."""
    source_path = REFERENCE_TAB_DIR / f"{key}-idle.png"
    source = Image.open(source_path).convert("RGBA")

    # These source crops include 8 px of the preceding tab's edge at the
    # left.  Dropping that neighbour avoids restoring the rejected standalone
    # vertical bar while retaining the supplied face, bevel, grain and glyph.
    source = source.crop((9, 0, source.width, source.height))
    image = source.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)

    # Keep the reference texture but enforce the same transparent silhouette
    # for every slot, so no black backing rectangle or edge residue survives.
    image.putalpha(shell_mask().resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS))
    rgba = image.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if rgba[x, y][3] == 0:
                rgba[x, y] = (0, 0, 0, 0)
    return image


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for index, (key, label) in enumerate(TABS.items()):
        # The user explicitly approved the live yellow/black selected state.
        # Only the grey inactive layer is regenerated in this styling pass.
        output_path = OUTPUT_DIR / f"{key}-inactive.png"
        build_inactive_from_reference(key).save(output_path, "PNG", optimize=True)
        print(output_path)


if __name__ == "__main__":
    main()
