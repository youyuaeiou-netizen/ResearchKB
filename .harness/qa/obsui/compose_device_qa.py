from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
REFERENCE = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-panel.png"
IMPLEMENTATION = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-card-belt.png"
CLASP = ROOT / "apps" / "ObsUI" / "assets" / "reference" / "device-card-clasp.png"
OUTPUT = Path(__file__).with_name("device-panel-single-belt-comparison.png")


def main() -> None:
    implementation = Image.open(IMPLEMENTATION).convert("RGBA")
    implementation.alpha_composite(Image.open(CLASP).convert("RGBA"), (0, 0))
    implementation = implementation.convert("RGB")
    # Compare the exact 1266 × 512 source viewport with the same initial slice
    # of the reconstructed belt.  The belt owns the full fourth card, but the
    # fixed viewport clips its last 11 pixels until the user drags left.
    implementation_bay = implementation.crop((0, 0, 1266, 512))
    reference_bay = Image.open(REFERENCE).convert("RGB").crop((252, 302, 1518, 814))
    # The user asked to remove the first card's lower oval; apply the exact
    # same source-texture replacement as the live composite before comparing.
    reference_bay.paste(Image.open(REFERENCE).convert("RGB").crop((645, 729, 867, 801)), (15, 427))
    comparison = Image.new("RGB", (reference_bay.width + implementation_bay.width, implementation_bay.height))
    comparison.paste(reference_bay, (0, 0))
    comparison.paste(implementation_bay, (reference_bay.width, 0))
    comparison.save(OUTPUT, quality=96)


if __name__ == "__main__":
    main()
