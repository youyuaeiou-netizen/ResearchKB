"""Create deterministic high-density device-shell rasters from the supplied PNGs."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "reference" / "device-shell"
OUTPUT_DIR = ROOT / "assets" / "reference" / "device-shell-hidpi"
TARGET_SIZE = (2064, 1119)
SHELLS = (
    "shell-target",
    "shell-local",
    "shell-repository",
    "shell-literature",
    "shell-hdd",
)


def render(source: Path, output: Path) -> None:
    with Image.open(source) as image:
        # RGBa keeps edge colours premultiplied while Lanczos interpolates alpha.
        rendered = image.convert("RGBA").convert("RGBa").resize(TARGET_SIZE, Image.Resampling.LANCZOS).convert("RGBA")
        rendered.save(output, format="PNG", optimize=True)


def verify(output: Path) -> None:
    with Image.open(output) as image:
        if image.size != TARGET_SIZE or image.mode != "RGBA":
            raise ValueError(f"{output.name} must be an RGBA {TARGET_SIZE[0]}x{TARGET_SIZE[1]} PNG.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate already-rendered files without writing them.")
    args = parser.parse_args()

    if not args.check:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        for name in SHELLS:
            render(SOURCE_DIR / f"{name}.png", OUTPUT_DIR / f"{name}-3x.png")

    for name in SHELLS:
        verify(OUTPUT_DIR / f"{name}-3x.png")


if __name__ == "__main__":
    main()
