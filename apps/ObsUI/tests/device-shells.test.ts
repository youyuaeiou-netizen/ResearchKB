import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const shells = ["target", "local", "repository", "literature", "hdd"];

function pngInfo(path: string) {
  const file = readFileSync(path);
  return {
    signature: file.subarray(0, 8).toString("hex"),
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    colorType: file[25],
  };
}

describe("high-density device shells", () => {
  it("keeps every selected state as an RGBA 3x canvas", () => {
    for (const shell of shells) {
      const image = pngInfo(resolve(root, "assets", "reference", "device-shell-hidpi", `shell-${shell}-3x.png`));
      expect(image.signature).toBe("89504e470d0a1a0a");
      expect(image.width).toBe(2064);
      expect(image.height).toBe(1119);
      expect(image.colorType).toBe(6);
    }
  });

  it("does not reintroduce runtime shell stretching or a workspace rectangle shadow", () => {
    const app = readFileSync(resolve(root, "src", "App.tsx"), "utf8");
    const css = readFileSync(resolve(root, "src", "styles.css"), "utf8");
    expect(app).not.toContain("shellScaleY");
    expect(css).not.toContain("scaleY(var(--shell-scale-y");
    expect(css).toMatch(/\.device-workspace\s*\{[\s\S]*?box-shadow:\s*none;/);
    expect(css).toMatch(/\.device-shell-image\s*\{[\s\S]*?transform:\s*none;/);
  });
});
