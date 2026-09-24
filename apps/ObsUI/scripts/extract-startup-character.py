"""Extract one complete Sharkboo layer without splitting its anatomy."""

from collections import deque
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageFilter


def largest_component(mask: Image.Image) -> Image.Image:
    width, height = mask.size
    source = mask.load()
    seen = bytearray(width * height)
    largest: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if seen[offset] or source[x, y] == 0:
                continue
            seen[offset] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                    for next_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                        next_offset = next_y * width + next_x
                        if not seen[next_offset] and source[next_x, next_y] != 0:
                            seen[next_offset] = 1
                            queue.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component

    output = Image.new("L", mask.size)
    pixels = output.load()
    for x, y in largest:
        pixels[x, y] = 255
    return output


def fill_holes(mask: Image.Image) -> Image.Image:
    width, height = mask.size
    source = mask.load()
    outside = Image.new("L", mask.size)
    outside_pixels = outside.load()
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))
    while queue:
        x, y = queue.popleft()
        if outside_pixels[x, y] or source[x, y] != 0:
            continue
        outside_pixels[x, y] = 255
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))
    return ImageChops.lighter(mask, ImageChops.invert(outside))


def build_character_mask(image: Image.Image) -> Image.Image:
    """Flood the neutral checkerboard from the canvas edge, then keep the subject."""
    width, height = image.size
    source = image.convert("RGB").load()
    outside = Image.new("L", image.size)
    outside_pixels = outside.load()
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))

    def is_checkerboard(x: int, y: int) -> bool:
        red, green, blue = source[x, y]
        spread = max(red, green, blue) - min(red, green, blue)
        value = max(red, green, blue)
        return spread <= 24 and 72 <= value <= 248

    while queue:
        x, y = queue.popleft()
        if outside_pixels[x, y] or not is_checkerboard(x, y):
            continue
        outside_pixels[x, y] = 255
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    subject = largest_component(ImageChops.invert(outside))
    subject = fill_holes(subject)
    return subject.filter(ImageFilter.GaussianBlur(0.65))


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract-startup-character.py SOURCE OUTPUT_DIR")
    source_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    source = Image.open(source_path).convert("RGBA")
    alpha = build_character_mask(source)
    bounds = alpha.getbbox()
    if bounds is None:
        raise SystemExit("character mask is empty")
    padding = 14
    crop = (
        max(0, bounds[0] - padding),
        max(0, bounds[1] - padding),
        min(source.width, bounds[2] + padding),
        min(source.height, bounds[3] + padding),
    )
    body = source.crop(crop)
    body.putalpha(alpha.crop(crop))

    # Blink is derived from the same pixels. Only the yellow rings are darkened;
    # silhouette, feet, fins and tail remain byte-for-byte aligned.
    blink = body.copy()
    blink_pixels = blink.load()
    for y in range(blink.height):
        for x in range(blink.width):
            red, green, blue, alpha_value = blink_pixels[x, y]
            if red > 130 and green > 105 and blue < 135:
                blink_pixels[x, y] = (21, 22, 20, alpha_value)

    body.save(output_dir / "sharkboo-body.webp", "WEBP", quality=90, method=6)
    blink.save(output_dir / "sharkboo-body-blink.webp", "WEBP", quality=90, method=6)
    print(f"crop={crop} size={body.size}")


if __name__ == "__main__":
    main()
