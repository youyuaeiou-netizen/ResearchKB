from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
USER_REFERENCE = Path("C:/Users/86159/Desktop/112.png")
LIVE = ROOT / ".harness" / "qa" / "obsui" / "tab-style-replica-live-local.png"
REFERENCE_CROP = ROOT / ".harness" / "qa" / "obsui" / "tab-style-reference-local.png"
COMPARISON = ROOT / ".harness" / "qa" / "obsui" / "tab-style-reference-vs-live-local.png"

# These coordinates are the local-selected row and the five native slots in
# the supplied five-state reference at its 688×2048 review scale.
REFERENCE_SIZE = (688, 2048)
LOCAL_TAB_BOX = (156, 0, 663, 0)


def scale_box(box: tuple[int, int, int, int], size: tuple[int, int]) -> tuple[int, int, int, int]:
    sx = size[0] / REFERENCE_SIZE[0]
    sy = size[1] / REFERENCE_SIZE[1]
    return tuple(round(value * (sx if index % 2 == 0 else sy)) for index, value in enumerate(box))  # type: ignore[return-value]


def main() -> None:
    source = Image.open(USER_REFERENCE).convert("RGBA")
    live = Image.open(LIVE).convert("RGBA")
    pixels = source.load()
    gold_rows = []
    for y in range(source.height):
        hits = sum(
            1
            for x in range(round(source.width * .18), round(source.width * .96))
            if pixels[x, y][0] > 190 and pixels[x, y][1] > 130 and pixels[x, y][2] < 45
        )
        if hits > 20:
            gold_rows.append(y)

    gold_runs: list[tuple[int, int]] = []
    for y in gold_rows:
        if not gold_runs or y > gold_runs[-1][1] + 1:
            gold_runs.append((y, y))
        else:
            gold_runs[-1] = (gold_runs[-1][0], y)
    tab_gold_runs = [run for run in gold_runs if run[1] - run[0] >= 8]
    if len(tab_gold_runs) < 5:
        raise RuntimeError(f"Expected five selected-tab colour runs, found {gold_runs}")
    local_gold_top, _ = tab_gold_runs[1]
    scale_y = source.height / REFERENCE_SIZE[1]
    left, _, right, _ = scale_box(LOCAL_TAB_BOX, source.size)
    top = max(0, local_gold_top - round(8 * scale_y))
    box = (left, top, right, top + round(58 * scale_y))
    reference = source.crop(box)
    reference.save(REFERENCE_CROP, "PNG", optimize=True)

    normalized_reference = reference.resize(live.size, Image.Resampling.LANCZOS)
    comparison = Image.new("RGBA", (live.width, live.height * 2 + 8), (8, 9, 10, 255))
    comparison.alpha_composite(normalized_reference, (0, 0))
    comparison.alpha_composite(live, (0, live.height + 8))
    comparison.save(COMPARISON, "PNG", optimize=True)
    print(f"reference={USER_REFERENCE} size={source.size} crop={box}")
    print(f"gold_runs={tab_gold_runs}")
    print(f"live={LIVE} size={live.size}")
    print(f"comparison={COMPARISON} size={comparison.size}")


if __name__ == "__main__":
    main()
