import { describe, expect, it } from "vitest";
import { parseLocalModelState } from "../src/local-models";

describe("parseLocalModelState", () => {
  it("accepts a ready Ollama model list", () => {
    expect(parseLocalModelState({
      status: "ready",
      checkedAt: 1787230819075,
      models: [{ name: " qwen3:4b " }, { name: "embeddinggemma:latest" }],
    })).toEqual({
      status: "ready",
      checkedAt: 1787230819075,
      models: [{ name: "qwen3:4b" }, { name: "embeddinggemma:latest" }],
    });
  });

  it("accepts an unavailable local model runner", () => {
    expect(parseLocalModelState({ status: "unavailable", checkedAt: null, models: [] })).toEqual({
      status: "unavailable",
      checkedAt: null,
      models: [],
    });
  });

  it("rejects malformed model state", () => {
    expect(parseLocalModelState({ status: "ready", checkedAt: null, models: [] })).toBeNull();
    expect(parseLocalModelState({ status: "ready", checkedAt: 1, models: [{ name: "" }] })).toBeNull();
    expect(parseLocalModelState({ status: "unknown", checkedAt: 1, models: [] })).toBeNull();
  });
});
