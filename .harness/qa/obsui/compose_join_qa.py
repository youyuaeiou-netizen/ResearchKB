from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-panel.png"
IMPLEMENTATION = Path(__file__).with_name("device-panel-group-cadence.png")
OUTPUT = Path(__file__).with_name("device-panel-group-cadence-comparison.png")


def main() -> None:
    # Compare the supplied narrow-card / right-card cadence with the live
    # memory / disk continuation at the same 1280 × 720 browser scale.
    source = Image.open(SOURCE).convert("RGB").crop((928, 302, 1518, 814))
    implementation = Image.open(IMPLEMENTATION).convert("RGB").crop((445, 231, 930, 623))
    source = source.resize(implementation.size, Image.Resampling.LANCZOS)
    comparison = Image.new("RGB", (source.width + implementation.width, implementation.height))
    comparison.paste(source, (0, 0))
    comparison.paste(implementation, (source.width, 0))
    comparison.save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
