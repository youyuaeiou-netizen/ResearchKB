from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-panel.png"
IMPLEMENTATION = Path(__file__).with_name("device-panel-group-smooth-rail.png")
OUTPUT = Path(__file__).with_name("device-panel-group-smooth-rail-comparison.png")


def main() -> None:
    # Focus on the uninterrupted top connector and the rounded card starts.
    source = Image.open(SOURCE).convert("RGB").crop((928, 302, 1518, 406))
    implementation = Image.open(IMPLEMENTATION).convert("RGB").crop((445, 230, 930, 310))
    source = source.resize(implementation.size, Image.Resampling.LANCZOS)
    comparison = Image.new("RGB", (source.width + implementation.width, implementation.height))
    comparison.paste(source, (0, 0))
    comparison.paste(implementation, (source.width, 0))
    comparison.save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
