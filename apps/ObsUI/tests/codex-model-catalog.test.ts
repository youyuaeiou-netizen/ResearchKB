import { describe, expect, it } from "vitest";
import { parseCodexModelList } from "../src/codex-model-catalog";

describe("Codex model/list parsing", () => {
  it("keeps only visible, safe, capability-advertised models", () => {
    expect(parseCodexModelList({ data: [
      { id: "gpt-6-sol", model: "gpt-6-sol", displayName: "GPT-6-Sol", hidden: false, isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "ultra" }] },
      { id: "gpt-6-hidden", model: "gpt-6-hidden", hidden: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }] },
      { id: "--sandbox", model: "--sandbox", hidden: false, supportedReasoningEfforts: [{ reasoningEffort: "low" }] },
      { id: "gpt-7-new", model: "gpt-7-new", hidden: false, supportedReasoningEfforts: [{ reasoningEffort: "medium" }] },
    ] })).toEqual([
      { id: "gpt-6-sol", label: "GPT-6-Sol", reasoningEfforts: ["low", "ultra"], isDefault: true },
      { id: "gpt-7-new", label: "gpt-7-new", reasoningEfforts: ["medium"], isDefault: false },
    ]);
  });
});
