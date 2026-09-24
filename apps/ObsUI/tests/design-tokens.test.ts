import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const tokensPath = resolve(root, "src", "design-tokens.css");
const mainPath = resolve(root, "src", "main.tsx");
const stylesPath = resolve(root, "src", "styles.css");
const functionalThemePath = resolve(root, "src", "tab-modal-v2", "functional-theme.css");
const targetPath = resolve(root, "src", "target-v1", "target-v1.css");
const literaturePath = resolve(root, "src", "tab-modal-v2", "literature.css");
const modalPath = resolve(root, "src", "tab-modal-v2", "tab-modal-v2.css");

describe("ObsUI design tokens", () => {
  it("defines the semantic color, material, shape and motion vocabulary", () => {
    const tokens = readFileSync(tokensPath, "utf8");
    const requiredTokens = [
      "--obsui-color-action-primary",
      "--obsui-color-state-info",
      "--obsui-color-state-success",
      "--obsui-color-state-warning",
      "--obsui-color-state-danger",
      "--obsui-color-category-violet",
      "--obsui-color-content-primary",
      "--obsui-color-border-focus",
      "--obsui-surface-shell",
      "--obsui-surface-frame",
      "--obsui-surface-panel",
      "--obsui-surface-card",
      "--obsui-surface-inset",
      "--obsui-surface-control",
      "--obsui-surface-light",
      "--obsui-texture-metal",
      "--obsui-texture-carbon",
      "--obsui-texture-button",
      "--obsui-edge-bevel",
      "--obsui-edge-inset",
      "--obsui-shadow-shell",
      "--obsui-shadow-card",
      "--obsui-shadow-focus",
      "--obsui-font-ui",
      "--obsui-radius-sm",
      "--obsui-motion-standard",
    ];

    for (const token of requiredTokens) expect(tokens).toContain(token);
  });

  it("loads before application styles and is consumed by all functional material layers", () => {
    const main = readFileSync(mainPath, "utf8");
    const functionalTheme = readFileSync(functionalThemePath, "utf8");
    const target = readFileSync(targetPath, "utf8");
    const literature = readFileSync(literaturePath, "utf8");
    const modal = readFileSync(modalPath, "utf8");

    expect(main.indexOf('import "./design-tokens.css"')).toBeLessThan(main.indexOf('import App from "./App"'));
    expect(main.indexOf('import "./design-tokens.css"')).toBeLessThan(main.indexOf('import "./styles.css"'));
    expect(functionalTheme).toContain("var(--obsui-surface-shell)");
    expect(functionalTheme).toContain("var(--obsui-surface-card)");
    expect(functionalTheme).toContain("var(--obsui-surface-inset)");
    expect(functionalTheme).toContain("var(--obsui-texture-carbon)");
    expect(target).toContain("var(--obsui-color-state-success)");
    expect(literature).toContain("var(--obsui-texture-carbon)");
    expect(modal).toContain("var(--obsui-color-state-info)");
  });

  it("keeps the approved homepage right rail on frozen aliases without changing its geometry", () => {
    const styles = readFileSync(stylesPath, "utf8");
    const frozenSelectors = [
      ".dashboard-aside",
      ".mission-card",
      ".date-weather",
      ".mission-copy",
      ".mission-task",
      ".automation-status",
      ".system-card",
      ".connection-card",
      ".progress-card",
    ];

    for (const selector of frozenSelectors) expect(styles).toContain(selector);
    expect(styles).toContain("background: var(--obsui-home-surface-weather)");
    expect(styles).toContain("background: var(--obsui-home-surface-task)");
    expect(styles).toContain("grid-template-columns: 7.42cqw 1fr");
    expect(styles).toContain("gap: 50px");
  });
});
