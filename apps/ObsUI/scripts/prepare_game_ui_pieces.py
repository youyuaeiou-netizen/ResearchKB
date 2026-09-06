"""Extract small, content-free UI pieces from the supplied game captures.

The source captures are references only. The generated pieces deliberately remove
game labels, counters, character art, and activity imagery before the files are
imported by TabModalV2.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = Path(r"C:\Users\86159\Desktop\ZZZ素材")
OUTPUT_DIR = ROOT / "assets" / "tab-modal-v2" / "pieces"

SOURCES = {
    "target": "32a096ee-b244-491d-94fc-e311b6dfe053.png",
    "local": "5c441dcd-1c8f-4849-a6a8-43782dba2954.png",
    "storage": "83b60d3e-5497-4171-8416-a568ace5731e.png",
    "literature": "0bb83f8c-ce94-4801-aee3-338e1b4cf5b4.png",
    "hdd": "2d83c66f-51c3-4de4-be09-fc12954e36a5.png",
}


def source_image(key: str) -> Image.Image:
    path = SOURCE_DIR / SOURCES[key]
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def blur_out(image: Image.Image, box: tuple[int, int, int, int], radius: int = 18) -> None:
    """Remove baked game text/art while retaining the sampled UI material."""

    blurred = image.filter(ImageFilter.GaussianBlur(radius))
    image.paste(blurred.crop(box), box)


def texture_patch(
    image: Image.Image,
    target: tuple[int, int, int, int],
    donor: tuple[int, int, int, int],
) -> None:
    x, y, right, bottom = target
    donor_image = image.crop(donor)
    patch = ImageOps.fit(donor_image, (right - x, bottom - y), method=Image.Resampling.LANCZOS)
    image.paste(patch, (x, y))


def orange_material(image: Image.Image, box: tuple[int, int, int, int]) -> None:
    """Keep the local-only rail's orange material without retaining lettering."""

    x, y, right, bottom = box
    gray = ImageOps.grayscale(image.crop(box))
    colored = ImageOps.colorize(gray, black="#3a2116", white="#ff7527").convert("RGBA")
    image.paste(colored, (x, y))


def neutral_material(image: Image.Image, box: tuple[int, int, int, int]) -> None:
    """Remove colored game-state highlights while retaining the grey panel material."""

    x, y, right, bottom = box
    gray = ImageOps.grayscale(image.crop(box))
    colored = ImageOps.colorize(gray, black="#252627", white="#68696a").convert("RGBA")
    image.paste(colored, (x, y))


def save_piece(
    group: str,
    name: str,
    source: str,
    box: tuple[int, int, int, int],
    operations: tuple[tuple[str, tuple[int, int, int, int], tuple[int, int, int, int] | None], ...] = (),
) -> dict[str, object]:
    source_image_value = source_image(source)
    piece = source_image_value.crop(box)
    for operation, target, donor in operations:
        if operation == "blur":
            blur_out(piece, target)
        elif operation == "blur-strong":
            blur_out(piece, target, radius=38)
        elif operation == "patch" and donor is not None:
            texture_patch(piece, target, donor)
        elif operation == "orange":
            orange_material(piece, target)
        elif operation == "neutral":
            neutral_material(piece, target)
        else:
            raise ValueError(f"Unsupported operation: {operation}")
    output = OUTPUT_DIR / group / f"{name}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    piece.save(output, format="PNG", optimize=True)
    return {
        "source": SOURCES[source],
        "source_key": source,
        "source_box": list(box),
        "output": str(output.relative_to(ROOT)).replace("\\", "/"),
        "natural_size": list(piece.size),
    }


def main() -> None:
    manifest: dict[str, object] = {
        "reference_dir": str(SOURCE_DIR),
        "content_policy": "UI materials only; baked game labels, counters, character art, activity art, and HUD are excluded.",
        "pieces": [],
    }
    pieces = manifest["pieces"]
    assert isinstance(pieces, list)

    definitions = [
        # Shared frame edges are clean source strips, not a full screenshot.
        ("shared", "frame-left", "target", (126, 171, 178, 988), ()),
        ("shared", "frame-right", "target", (1747, 171, 1788, 988), ()),
        ("shared", "frame-bottom", "target", (126, 950, 1788, 989), ()),
        ("shared", "tab-active", "target", (706, 145, 888, 220), (("blur", (36, 18, 146, 62), None),)),
        ("shared", "tab-idle", "local", (708, 145, 890, 220), (("blur", (36, 18, 146, 62), None),)),
        ("shared", "close-button", "target", (1710, 226, 1810, 314), ()),
        ("shared", "selected-nav", "target", (168, 325, 438, 438), (("blur", (38, 30, 232, 90), None),)),
        # A clean action-button shell from the tactics page. The old crop began
        # on a NEW! badge, which made every business button inherit that label.
        ("shared", "action-button", "hdd", (1390, 247, 1682, 302), (("blur", (44, 8, 248, 48), None),)),
        ("shared", "arrow", "local", (1625, 625, 1690, 705), ()),
        ("shared", "progress-check", "local", (710, 260, 790, 330), (("blur", (0, 50, 80, 70), None),)),
        ("shared", "card-material", "storage", (500, 329, 796, 758), (("blur-strong", (0, 0, 296, 429), None),)),
        # Goal / target page.
        ("target", "left-panel", "target", (158, 202, 442, 947), (("blur", (8, 8, 276, 737), None), ("patch", (0, 90, 284, 270), (24, 520, 260, 720)), ("neutral", (0, 0, 284, 745), None))),
        ("target", "progress-track", "target", (650, 270, 1280, 325), (("blur", (0, 0, 630, 55), None),)),
        ("target", "card", "target", (490, 497, 860, 925), (("blur-strong", (0, 0, 370, 428), None),)),
        # Local / daily page. The orange rail is intentionally local-only.
        ("local", "orange-device-rail", "local", (132, 193, 323, 965), (("blur", (50, 350, 185, 765), None), ("patch", (50, 350, 185, 765), (286, 40, 323, 280)))),
        ("local", "orange-strip", "local", (286, 193, 323, 965), ()),
        ("local", "device", "local", (139, 382, 258, 548), ()),
        ("local", "activity-progress", "local", (350, 247, 1660, 351), (("blur-strong", (0, 0, 1310, 104), None), ("patch", (0, 25, 1310, 58), (520, 31, 590, 52)))),
        ("local", "daily-card", "local", (373, 398, 792, 918), (("blur-strong", (0, 0, 419, 520), None),)),
        # Storage / training page.
        ("storage", "left-panel", "storage", (158, 202, 442, 947), (("blur", (8, 8, 276, 737), None), ("patch", (0, 90, 284, 270), (24, 520, 260, 720)), ("neutral", (0, 0, 284, 745), None))),
        ("storage", "card", "storage", (500, 329, 796, 758), (("blur-strong", (0, 0, 296, 429), None),)),
        ("storage", "bottom-action", "storage", (480, 807, 1665, 941), (("blur-strong", (0, 0, 1185, 134), None),)),
        # Literature / combat page.
        ("literature", "left-panel", "literature", (158, 202, 442, 947), (("blur", (8, 8, 276, 737), None), ("patch", (0, 90, 284, 270), (24, 520, 260, 720)), ("neutral", (0, 0, 284, 745), None))),
        ("literature", "progress-track", "literature", (492, 270, 1305, 326), (("blur-strong", (0, 0, 813, 56), None),)),
        ("literature", "row", "literature", (492, 496, 1662, 713), (("blur-strong", (0, 0, 1170, 217), None),)),
        # H.D.D / tactics page.
        ("hdd", "left-panel", "hdd", (158, 202, 442, 947), (("blur", (8, 8, 276, 737), None), ("patch", (0, 90, 284, 270), (24, 520, 260, 720)), ("neutral", (0, 0, 284, 745), None))),
        ("hdd", "header", "hdd", (492, 126, 1667, 302), (("blur-strong", (0, 0, 1175, 176), None),)),
        ("hdd", "card", "hdd", (492, 322, 1668, 713), (("blur-strong", (0, 0, 1176, 391), None),)),
    ]

    for definition in definitions:
        pieces.append(save_piece(*definition))

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
