from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-panel-clean.png"
OUTPUT = ROOT / ".harness" / "qa" / "obsui" / "panel-top-inspect.png"


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    image.crop((500, 0, 1600, 190)).resize((1100, 190), Image.Resampling.NEAREST).save(OUTPUT)
    pixels = np.asarray(image)
    tab_region = pixels[30:130, 552:1533, 3] > 0
    max_visible = int(tab_region.sum(axis=1).max())
    assert max_visible < 200, f"rectangular Tab base remains: {max_visible} visible pixels per row"
    print(f"tab_region_max_visible_pixels_per_row={max_visible}: no rectangular base PASS")
    for y in (0, 20, 40, 60, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 210):
        visible = np.where(pixels[y, :, 3] > 0)[0]
        segments = []
        if len(visible):
            starts = visible[np.r_[True, np.diff(visible) > 1]]
            ends = visible[np.r_[np.diff(visible) > 1, True]] + 1
            segments = [(int(start), int(end)) for start, end in zip(starts, ends)]
        print(f"row={y} alpha_segments={segments[:6]} sample={tuple(int(v) for v in pixels[y, 900])}")
    print(OUTPUT)


if __name__ == "__main__":
    main()
