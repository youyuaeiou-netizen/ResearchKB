from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / ".harness" / "qa" / "obsui" / "reference-tabs" / "long-tab-states.png"
STATE_TOPS = (0, 419, 841, 1264, 1684)


def runs(values: np.ndarray) -> list[tuple[int, int]]:
    padded = np.pad(values, (1, 1))
    starts = np.flatnonzero(~padded[:-1] & padded[1:])
    ends = np.flatnonzero(padded[:-1] & ~padded[1:])
    return [(int(start), int(end)) for start, end in zip(starts, ends, strict=True)]


image = np.asarray(Image.open(SOURCE).convert("RGBA"))
for state, top in enumerate(STATE_TOPS):
    for offset in (8, 12, 20, 30, 40):
        row = image[top + offset, :, :3].mean(axis=1) > 38
        alpha = image[top + offset, :, 3] > 16
        print(f"state={state + 1} y={offset:02d} color={runs(row[130:690])}")
        print(f"state={state + 1} y={offset:02d} alpha={runs(alpha[130:690])}")
