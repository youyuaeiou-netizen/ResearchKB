"""Prepare source-derived visual pieces for the game UI Tab modal V2."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\86159\Desktop\ZZZ素材")
OUTPUT = ROOT / "assets" / "tab-modal-v2"

SOURCES = {
    "target": SOURCE / "32a096ee-b244-491d-94fc-e311b6dfe053.png",
    "local": SOURCE / "5c441dcd-1c8f-4849-a6a8-43782dba2954.png",
    "storage": SOURCE / "83b60d3e-5497-4171-8416-a568ace5731e.png",
    "literature": SOURCE / "0bb83f8c-ce94-4801-aee3-338e1b4cf5b4.png",
    "hdd": SOURCE / "2d83c66f-51c3-4de4-be09-fc12954e36a5.png",
    "local-rail": SOURCE / "ce83e6af-da5b-4abe-be6e-1bb094e60292.png",
}


CROPS = {
    "target-banner": ("target", (690, 270, 1260, 410)),
    "target-card": ("target", (512, 510, 1650, 828)),
    "local-card": ("local", (735, 421, 1647, 795)),
    "local-rail": ("local-rail", (735, 422, 1648, 800)),
    "local-progress": ("local", (650, 248, 1643, 349)),
    "rail-arrow": ("local-rail", (1620, 610, 1700, 710)),
    "storage-banner": ("storage", (690, 270, 1270, 410)),
    "literature-card-a": ("literature", (715, 528, 1648, 665)),
    "literature-card-b": ("literature", (715, 744, 1648, 882)),
    "hdd-banner": ("hdd", (690, 270, 1260, 410)),
    "hdd-card": ("hdd", (510, 332, 1648, 700)),
    "hud-token-1": ("literature", (1254, 48, 1314, 108)),
    "hud-token-2": ("literature", (1467, 48, 1525, 108)),
    "hud-token-3": ("literature", (1631, 48, 1690, 108)),
}


def crop_asset(name: str, source_key: str, box: tuple[int, int, int, int]) -> None:
    source_path = SOURCES[source_key]
    if not source_path.exists():
        raise FileNotFoundError(source_path)
    with Image.open(source_path) as source:
        image = source.convert("RGBA").crop(box)
        image.save(OUTPUT / f"{name}.png", format="PNG", optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, (source_key, box) in CROPS.items():
        crop_asset(name, source_key, box)

if __name__ == "__main__":
    main()
