from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / ".harness" / "qa" / "obsui" / "tab-fusion-final-goal.png"
OUTPUT = ROOT / ".harness" / "qa" / "obsui" / "tab-fusion-final-crop.png"


def main() -> None:
    image = Image.open(SOURCE).convert("RGB")
    image.crop((400, 8, 1190, 125)).resize((1185, 175), Image.Resampling.NEAREST).save(OUTPUT)
    pixels = np.asarray(image)
    # The final Tab group ends at about y=99 CSS px. Inspect only the join
    # below that boundary so the selected yellow face itself is not reported
    # as a bottom residual.
    for y in range(100, 126):
        bright = np.sum(np.all(pixels[y, 420:1180] > 135, axis=1))
        if bright:
            xs = np.where(np.all(pixels[y, 420:1180] > 135, axis=1))[0] + 420
            print(f"screen_row={y} bright_pixels={int(bright)} span={(int(xs.min()), int(xs.max()) + 1)}")
    print(OUTPUT)


if __name__ == "__main__":
    main()
