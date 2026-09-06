from pathlib import Path

from PIL import Image


SOURCE = Path(r"C:\Users\86159\Desktop\112.png")
WORKSPACE = Path(__file__).resolve().parents[3]
DEST = WORKSPACE / "apps" / "ObsUI" / "assets" / "reference" / "device-tabs" / "tops"
STATES = {
    "goal": 0,
    "local": 420,
    "repository": 841,
    "literature": 1264,
    "storage": 1684,
}
CROP_WIDTH = 727
CROP_HEIGHT = 130


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    DEST.mkdir(parents=True, exist_ok=True)
    for state, top in STATES.items():
        crop = source.crop((0, top, CROP_WIDTH, top + CROP_HEIGHT))
        crop.save(DEST / f"{state}.png", optimize=True)


if __name__ == "__main__":
    main()
