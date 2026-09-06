from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "apps" / "ObsUI" / "assets" / "reference"
SOURCE = ASSETS / "device-panel.png"
COMPONENT = ASSETS / "device-tabs" / "components" / "goal-inactive.png"
OUTPUT = ASSETS / "device-panel-clean.png"
TAB_BOX = (552, 30, 1533, 130)
OLD_TAB_TOP = TAB_BOX[1]
OLD_TAB_HEIGHT = TAB_BOX[3] - TAB_BOX[1]


def main() -> None:
    panel = Image.open(SOURCE).convert("RGBA")
    component_alpha = Image.open(COMPONENT).convert("RGBA").getchannel("A")
    group_width = TAB_BOX[2] - TAB_BOX[0]
    for index in range(5):
        left = TAB_BOX[0] + round(index * group_width / 5)
        right = TAB_BOX[0] + round((index + 1) * group_width / 5)
        slot_width = right - left
        mask = component_alpha.resize((slot_width, OLD_TAB_HEIGHT), Image.Resampling.LANCZOS)
        # Remove only the old tab silhouettes.  The replacement components use
        # the source's native 981×100 tab grid, so their full silhouette—not a
        # rectangular strip—must be clear before they are layered back in.
        mask = mask.filter(ImageFilter.MaxFilter(5))
        # The source frame contains antialiased edge pixels. Treat every
        # touched pixel as part of the old silhouette so no pale source edge
        # can survive just outside the replacement Tab.
        mask = mask.point(lambda value: 255 if value > 0 else 0)
        alpha = panel.getchannel("A")
        alpha.paste(0, (left, OLD_TAB_TOP), mask)
        panel.putalpha(alpha)

    panel.save(OUTPUT, "PNG", optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
