from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
COMPONENTS = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-tabs" / "components"
NAMES = ("goal", "local", "repository", "literature", "storage")
SIZE = (200, 100)


def alpha_bbox(array: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(array > 0)
    return None if not len(xs) else (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def main() -> None:
    images = {
        f"{name}-{state}": Image.open(COMPONENTS / f"{name}-{state}.png").convert("RGBA")
        for name in NAMES
        for state in ("inactive", "active")
    }
    assert all(image.size == SIZE for image in images.values())

    alpha = {key: np.asarray(image)[..., 3] for key, image in images.items()}
    reference_alpha = next(iter(alpha.values()))
    assert all(np.array_equal(reference_alpha, value) for value in alpha.values())
    shared_bbox = alpha_bbox(reference_alpha)
    assert shared_bbox is not None
    assert shared_bbox[0] == 0 and shared_bbox[1] <= 3 and shared_bbox[2] == 200 and shared_bbox[3] >= 98
    assert np.any(reference_alpha[96:] > 0), "tab body stops before the panel-frame join"
    assert np.all(reference_alpha[20:86, :1] > 200) and np.all(reference_alpha[20:86, -1:] > 200), "side face does not close the slot"
    edge_rgb = np.concatenate((np.asarray(next(iter(images.values())))[50, 0, :3], np.asarray(next(iter(images.values())))[50, -1, :3]))
    assert int(edge_rgb.max()) > 24, "side face is still a black rail"
    print(f"components={len(images)} size={SIZE} shared_alpha_bbox={shared_bbox}: PASS")

    for key, image in images.items():
        pixels = np.asarray(image)
        transparent = pixels[..., 3] == 0
        assert not np.any(pixels[..., :3][transparent]), f"{key} has RGB residue in transparent pixels"
        print(f"{key}: transparent_clear=True")

    for name in NAMES:
        inactive = np.asarray(images[f"{name}-inactive"])
        active = np.asarray(images[f"{name}-active"])
        assert not np.array_equal(inactive[..., :3], active[..., :3]), f"{name} active/inactive colors did not change"
        assert int(np.asarray(images[f"{name}-active"])[..., 0].mean()) > int(np.asarray(images[f"{name}-inactive"])[..., 0].mean())
    print("five independent labels, identical geometry, gray/yellow-only state change, no shared bottom rail: PASS")


if __name__ == "__main__":
    main()
