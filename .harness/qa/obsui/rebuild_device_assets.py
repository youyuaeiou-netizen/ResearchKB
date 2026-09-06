from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-panel.png"
ASSET_DIR = SOURCE.parent
TAB_DIR = ASSET_DIR / "device-tabs"
TAB_REFERENCE_DIR = ROOT / ".harness" / "qa" / "obsui" / "reference-tabs"


def complete_card_right_edge(card: Image.Image, donor: Image.Image, edge_width: int = 32) -> Image.Image:
    """Restore a clipped card edge from the intact right edge of a source card."""
    completed = card.copy()
    right_edge = donor.crop((donor.width - edge_width, 0, donor.width, donor.height))
    completed.alpha_composite(right_edge, (completed.width - edge_width, 0))
    return completed


def build_tabs(source: Image.Image) -> None:
    """Retained for history; Tab output is now built by independent assets."""
    # Never recreate screenshot-cropped Tab strips from the long reference.
    return

    # Legacy implementation kept below for historical diffs only.
    strip_box = (552, 30, 1533, 130)
    strip_dir = TAB_DIR / "strips"
    strip_dir.mkdir(exist_ok=True)

    source_strip = source.crop(strip_box).convert("RGBA")
    source_array = np.array(source_strip)
    source_array[..., 3] = np.where(source_array[..., 3] < 16, 0, source_array[..., 3])
    source_strip = Image.fromarray(source_array, "RGBA")

    slot_names = ("goal", "local", "repository", "literature", "storage")
    slot_width = 200
    strip_width = slot_width * len(slot_names)
    shell_top = 4
    shell_height = 81
    text_center_y = 46
    slots = {name: index * slot_width for index, name in enumerate(slot_names)}
    selected_crops = {
        "goal": (TAB_REFERENCE_DIR / "goal-selected.png", (565, 23, 766, 114)),
        "repository": (TAB_REFERENCE_DIR / "repository-selected.png", (966, 39, 1150, 139)),
        "literature": (TAB_REFERENCE_DIR / "literature-selected.png", (1162, 35, 1343, 135)),
        "storage": (TAB_REFERENCE_DIR / "storage-selected.png", (232, 21, 417, 121)),
    }
    # The selected-goal reference contains a clean gray 本机 donor. Only its
    # glyph pixels are read; the screenshot background never enters a strip.
    local_gray = Image.open(TAB_REFERENCE_DIR / "goal-selected.png").convert("RGB").crop((772, 29, 958, 129))

    def clean_mask(mask: Image.Image, threshold: int = 16) -> Image.Image:
        data = np.array(mask.convert("L"))
        return Image.fromarray(np.where(data < threshold, 0, data).astype("uint8"), "L")

    def text_data(image: Image.Image, kind: str) -> tuple[tuple[int, int, int, int], Image.Image]:
        pixels = np.array(image.convert("RGB"))
        luminance = pixels.mean(axis=2)
        height, width = luminance.shape
        roi = np.zeros((height, width), dtype=bool)
        roi[20 : min(65, height), 40 : max(40, width - 40)] = True
        if kind == "black":
            core = roi & (luminance < 90)
            ys, xs = np.where(core)
            if not len(xs):
                raise ValueError("selected tab glyph not found")
            bbox = (int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1))
            pad = 3
            expanded = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(width, bbox[2] + pad), min(height, bbox[3] + pad))
            alpha = np.zeros((height, width), dtype="uint8")
            dark = roi & (luminance < 155)
            alpha[dark] = np.clip((155 - luminance[dark]) * 2.0, 0, 255).astype("uint8")
        else:
            core = roi & (luminance > 180)
            ys, xs = np.where(core)
            if not len(xs):
                raise ValueError("gray tab glyph not found")
            bbox = (int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1))
            pad = 5
            expanded = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(width, bbox[2] + pad), min(height, bbox[3] + pad))
            white = roi & (luminance > 145)
            black = roi & (luminance < 85)
            white_dilated = np.array(Image.fromarray((white.astype("uint8") * 255), "L").filter(ImageFilter.MaxFilter(5))) > 0
            alpha = np.zeros((height, width), dtype="uint8")
            alpha[white] = 255
            alpha[black & white_dilated] = 255
        bounded = np.zeros_like(alpha)
        bounded[expanded[1] : expanded[3], expanded[0] : expanded[2]] = alpha[expanded[1] : expanded[3], expanded[0] : expanded[2]]
        return expanded, Image.fromarray(bounded, "L")

    def inpaint_text(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
        pixels = np.array(image.convert("RGB")).astype("float32")
        x0, y0, x1, y1 = bbox
        for y in range(y0, y1):
            left = pixels[y, max(0, x0 - 2)]
            right = pixels[y, min(pixels.shape[1] - 1, x1 + 1)]
            span = max(1, x1 - x0 - 1)
            for x in range(x0, x1):
                t = (x - x0) / span
                pixels[y, x] = left * (1 - t) + right * t
        return Image.fromarray(np.clip(pixels, 0, 255).astype("uint8"), "RGB")

    def resize_mask(mask: Image.Image) -> Image.Image:
        data = np.array(mask.resize((slot_width, shell_height), Image.Resampling.BILINEAR))
        return Image.fromarray(np.where(data < 32, 0, data).astype("uint8"), "L")

    def clean_shell(image: Image.Image, kind: str, mask: Image.Image) -> Image.Image:
        bbox, _ = text_data(image, kind)
        cleaned = inpaint_text(image, bbox).resize((slot_width, shell_height), Image.Resampling.LANCZOS).convert("RGBA")
        cleaned.putalpha(mask)
        alpha = np.asarray(cleaned.getchannel("A"))
        _, xs = np.where(alpha > 16)
        if not len(xs):
            raise ValueError("normalized tab shell is empty")
        left = int(xs.min())
        return cleaned.crop((left, 0, slot_width, shell_height)).resize((slot_width, shell_height), Image.Resampling.LANCZOS)

    def paste_glyph(base: Image.Image, donor: Image.Image, left: int, kind: str) -> None:
        bbox, alpha = text_data(donor, kind)
        glyph = donor.crop(bbox).convert("RGBA")
        glyph.putalpha(alpha.crop(bbox))
        x = left + (slot_width - glyph.width) // 2
        y = int(round(text_center_y - glyph.height / 2))
        base.alpha_composite(glyph, (x, y))

    def largest_component(mask: np.ndarray) -> np.ndarray:
        height, width = mask.shape
        seen = np.zeros_like(mask, dtype=bool)
        largest: list[tuple[int, int]] = []
        for y in range(height):
            for x in range(width):
                if not mask[y, x] or seen[y, x]:
                    continue
                queue = deque([(y, x)])
                seen[y, x] = True
                component: list[tuple[int, int]] = []
                while queue:
                    yy, xx = queue.popleft()
                    component.append((yy, xx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = yy + dy, xx + dx
                        if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            queue.append((ny, nx))
                if len(component) > len(largest):
                    largest = component
        result = np.zeros_like(mask, dtype=bool)
        for y, x in largest:
            result[y, x] = True
        return result

    # Use the complete target-selected reference as the canonical yellow shell
    # instead of the local-selected source crop. The padded crop includes the
    # full reference contour; the alpha mask is normalized from its connected
    # yellow face rather than inheriting a cut source edge.
    selected_reference = Image.open(TAB_REFERENCE_DIR / "goal-selected.png").convert("RGB")
    selected_shell_source = selected_reference.crop((565, 23, 766, 114)).convert("RGBA")
    selected_rgb = np.array(selected_shell_source.convert("RGB"))
    red, green, blue = selected_rgb[..., 0], selected_rgb[..., 1], selected_rgb[..., 2]
    yellow_pixels = (red > 120) & (green > 80) & (blue < 110) & (red > green * 1.03) & (green > blue * 1.35)
    face_component = largest_component(yellow_pixels)
    face = np.zeros_like(face_component, dtype=bool)
    for y in range(face_component.shape[0]):
        row = np.flatnonzero(face_component[y])
        if len(row):
            face[y, row.min() : row.max() + 1] = True
    shell_mask_source = Image.fromarray((face.astype("uint8") * 255), "L").filter(ImageFilter.MaxFilter(9))
    gray_source = source_strip.crop((0, 0, 200, 85)).convert("RGBA")
    selected_mask = resize_mask(shell_mask_source)
    selected_shell = clean_shell(selected_shell_source, "black", selected_mask)
    gray_shell = clean_shell(gray_source, "white", selected_mask)

    rail_source = source_strip.resize((strip_width, source_strip.height), Image.Resampling.LANCZOS)
    rail = Image.new("RGBA", (strip_width, source_strip.height), (0, 0, 0, 0))
    rail.alpha_composite(rail_source.crop((0, 84, strip_width, source_strip.height)), (0, 84))
    canonical_geometry = rail.copy()
    for left in slots.values():
        canonical_geometry.alpha_composite(selected_shell, (left, shell_top))
    canonical_alpha = np.asarray(canonical_geometry.getchannel("A"))

    inactive_donors = {
        "goal": gray_source.convert("RGB"),
        "local": local_gray,
        "repository": source_strip.crop((405, 10, 589, 85)).convert("RGB"),
        "literature": source_strip.crop((598, 10, 779, 85)).convert("RGB"),
        "storage": source_strip.crop((788, 10, 973, 85)).convert("RGB"),
    }
    active_donors = {"local": source_strip.crop((200, 4, 394, 85)).convert("RGB")}
    for name, (reference_path, crop) in selected_crops.items():
        active_donors[name] = Image.open(reference_path).convert("RGB").crop(crop)

    strips: dict[str, Image.Image] = {}
    for active_name in slot_names:
        strip = rail.copy()
        for name in slot_names:
            left = slots[name]
            shell = selected_shell if name == active_name else gray_shell
            strip.alpha_composite(shell, (left, shell_top))
            donor = active_donors[name] if name == active_name else inactive_donors[name]
            paste_glyph(strip, donor, left, "black" if name == active_name else "white")
        strips[active_name] = strip

    for name, strip in strips.items():
        data = np.array(strip.convert("RGBA"))
        data[..., 3] = np.where(canonical_alpha < 16, 0, canonical_alpha)
        Image.fromarray(data, "RGBA").save(strip_dir / f"{name}.png")


def build_card_assets(source: Image.Image) -> None:
    # The long source rectangle is the fixed scroll viewport. Keep the four
    # cards as one contiguous moving image so their seams and rounded corners
    # remain the supplied artwork.
    body = source.crop((252, 322, 585, 814))
    body.paste(source.crop((645, 729, 867, 801)), (15, 407))

    plain_body = body.copy()
    plain_body.paste(source.crop((299, 322, 346, 360)), (2, 0))
    card = Image.new("RGBA", (body.width, body.height + 20), (0, 0, 0, 0))
    card.alpha_composite(plain_body, (0, 20))
    card.save(ASSET_DIR / "device-card.png")

    lead = Image.new("RGBA", (body.width, body.height + 20), (0, 0, 0, 0))
    lead.alpha_composite(body, (0, 20))
    lead.alpha_composite(source.crop((252, 302, 300, 360)), (0, 0))
    lead.save(ASSET_DIR / "device-card-lead.png")

    for name, box in {
        "device-card-2.png": (605, 322, 907, 814),
        "device-card-3.png": (928, 322, 1209, 814),
        "device-card-4.png": (1227, 322, 1518, 814),
    }.items():
        body = source.crop(box)
        panel = Image.new("RGBA", (body.width, body.height + 20), (0, 0, 0, 0))
        panel.alpha_composite(body, (0, 20))
        panel.save(ASSET_DIR / name)

    group = source.crop((252, 302, 1518, 814))
    group.paste(source.crop((645, 729, 867, 801)), (15, 427))
    group.save(ASSET_DIR / "device-card-group.png")

    complete_edge_donor = source.crop((252, 322, 585, 814))
    card_2 = complete_card_right_edge(source.crop((605, 322, 907, 814)), complete_edge_donor)
    card_1 = card_2.resize((333, 492), Image.Resampling.LANCZOS)
    card_positions = (0, 353, 706, 1059)
    group_width = 1392
    gap_width = 20
    tile_width = (group_width + gap_width) * 2
    belt = Image.new("RGBA", (tile_width, group.height), (13, 14, 15, 255))
    for group_left in (0, group_width + gap_width):
        for card_left in card_positions:
            belt.alpha_composite(card_1, (group_left + card_left, 20))

    rail_source = source.crop((342, 302, 585, 322))
    mirrored_rail = Image.new("RGBA", (rail_source.width * 2, rail_source.height))
    mirrored_rail.alpha_composite(rail_source, (0, 0))
    mirrored_rail.alpha_composite(ImageOps.mirror(rail_source), (rail_source.width, 0))
    top_rail = mirrored_rail.resize((belt.width, 20), Image.Resampling.LANCZOS)
    belt.alpha_composite(top_rail, (0, 0))
    belt.save(ASSET_DIR / "device-card-belt.png")

    clasp = source.crop((252, 302, 300, 360))
    orange_pixels = clasp.convert("RGB")
    mask_data = []
    for red, green, blue in orange_pixels.get_flattened_data():
        mask_data.append(255 if red > 110 and red > green * 1.35 and red > blue * 1.8 else 0)
    orange_mask = Image.new("L", clasp.size, 0)
    orange_mask.putdata(mask_data)
    clasp.putalpha(orange_mask.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(1)))
    clasp.save(ASSET_DIR / "device-card-clasp.png")

    texture = source.crop((589, 390, 600, 700))
    clean_frame = source.copy()
    moving_zone = (244, 302, 1518, 814)
    moving_fill = Image.new("RGBA", (moving_zone[2] - moving_zone[0], moving_zone[3] - moving_zone[1]), (13, 14, 15, 255))
    for top in range(0, moving_fill.height, texture.height):
        for left in range(0, moving_fill.width, texture.width):
            moving_fill.alpha_composite(texture, (left, top))
    clean_frame.alpha_composite(moving_fill, moving_zone[:2])

    right_residual = (1518, 302, 1567, 814)
    residual_fill = Image.new("RGBA", (right_residual[2] - right_residual[0], right_residual[3] - right_residual[1]), (13, 14, 15, 255))
    for top in range(0, residual_fill.height, texture.height):
        for left in range(0, residual_fill.width, texture.width):
            residual_fill.alpha_composite(texture, (left, top))
    clean_frame.alpha_composite(residual_fill, right_residual[:2])
    # The workspace renders the complete tab strip as a separate state image.
    # Clear the matching rectangle from the frame so the source panel's
    # built-in local-selected tabs can never sit underneath it and leak a
    # second border, rail, or yellow edge into another state.
    clean_frame.paste((0, 0, 0, 0), (552, 30, 1533, 130))
    clean_frame.save(ASSET_DIR / "device-panel-clean.png")

    viewport_box = (252, 302, 1518, 814)
    viewport = Image.new("RGBA", (viewport_box[2] - viewport_box[0], viewport_box[3] - viewport_box[1]), (13, 14, 15, 255))
    for top in range(0, viewport.height, texture.height):
        for left in range(0, viewport.width, texture.width):
            viewport.alpha_composite(texture, (left, top))
    viewport.save(ASSET_DIR / "device-card-viewport.png")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    # Tab artwork is intentionally generated by rebuild_independent_tabs.py
    # and composited by rebuild_panel_clean_for_tabs.py. Keep this legacy
    # card-only builder from recreating screenshot-cropped tab strips.
    build_card_assets(source)


if __name__ == "__main__":
    main()
