import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const themePath = resolve(root, "src", "tab-modal-v2", "functional-theme.css");
const modalPath = resolve(root, "src", "tab-modal-v2", "TabModalV2.tsx");

describe("functional workspace visual theme", () => {
  it("loads after the existing structural styles and covers all five workspaces", () => {
    const modal = readFileSync(modalPath, "utf8");
    const theme = readFileSync(themePath, "utf8");

    expect(modal.indexOf('import "./functional-theme.css"')).toBeGreaterThan(modal.indexOf('import "./tab-modal-v1-shell.css"'));
    expect(theme).toContain(".obsui-v1-shell .target-v1");
    expect(theme).toContain(".tab-modal-v2__content-card");
    expect(theme).toContain(".tab-modal-v2__repository-page");
    expect(theme).toContain(".literature-workspace");
    expect(theme).toContain(".tab-modal-v2__hdd-workbench");
  });

  it("keeps the shared theme art-only", () => {
    const theme = readFileSync(themePath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const layoutProperty = /^\s*(?:display|position|inset|top|right|bottom|left|z-index|width|height|min-width|min-height|max-width|max-height|padding|margin|gap|grid|grid-template|grid-template-columns|grid-template-rows|grid-column|grid-row|place-items|align-items|align-content|justify-content|justify-self|flex|flex-basis|flex-direction|overflow|overflow-x|overflow-y|transform)\s*:/m;

    expect(theme).not.toMatch(layoutProperty);
  });

  it("uses video-derived colors as semantic states rather than page themes", () => {
    const theme = readFileSync(themePath, "utf8");

    expect(theme).toContain("color is semantic rather than decorative");
    expect(theme).toContain("structural card edges remain neutral");
    expect(theme).not.toContain("[data-active-tab=");
    expect(theme).toContain(".tab-modal-v2__content-card--blue");
    expect(theme).toContain(".tab-modal-v2__content-card--gold");
    expect(theme).toContain(".tab-modal-v2__content-card--green");
    expect(theme).toContain(".tab-modal-v2__content-card--violet");
    expect(theme).toContain("border-left-color: var(--function-line)");
    expect(theme).not.toContain("border-left-color: #ff7a24");
    expect(theme).toContain("--v2-blue: var(--obsui-color-state-info)");
    expect(theme).toContain("--function-gold: var(--obsui-color-action-primary)");
  });

  it("keeps compatibility aliases while separating the four material layers", () => {
    const theme = readFileSync(themePath, "utf8");

    expect(theme).toContain("--function-bg-soft: var(--obsui-surface-shell)");
    expect(theme).toContain("background: var(--obsui-surface-frame)");
    expect(theme).toContain("background: var(--obsui-surface-panel)");
    expect(theme).toContain("background: var(--obsui-surface-card)");
    expect(theme).toContain("background: var(--obsui-surface-inset)");
    expect(theme).toContain("background: var(--obsui-surface-control)");
  });

  it("keeps local read-only data surfaces flat against their parent cards", () => {
    const theme = readFileSync(themePath, "utf8");
    expect(theme).toMatch(/\.tab-modal-v2__device-profile-card \.tab-modal-v2__device-profile-field\s*\{[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
    expect(theme).toMatch(/\.tab-modal-v2__local-model-overview-card \.tab-modal-v2__overview-model-list\s*\{[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
    expect(theme).toMatch(/\.tab-modal-v2__local-model-overview-card \.tab-modal-v2__overview-model-row\s*\{[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
  });

  it("keeps literature emphasis limited to selection and real source status", () => {
    const theme = readFileSync(themePath, "utf8");

    expect(theme).toContain("--literature-selected: rgba(255, 212, 0, .10)");
    expect(theme).toContain("--literature-success: var(--obsui-color-state-success)");
    expect(theme).toContain(".literature-item-attachment");
    expect(theme).toContain(".literature-extension-fields dd");
    expect(theme).toContain("color: var(--function-muted);");
  });
});
