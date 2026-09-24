import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_MODEL_SETTINGS, groupLocalModels, localModelIdentity, localModelThinkingFor, normalizeLocalModelSettings, parseLocalModelSettings, parseLocalModelState, withLocalModelThinking } from "../src/local-models";

describe("local model settings", () => {
  it("uses the 64K desktop profile by default", () => {
    expect(DEFAULT_LOCAL_MODEL_SETTINGS).toMatchObject({
      contextLength: 65_536,
      maxOutputTokens: 8_192,
      thinking: "medium",
    });
  });

  it("normalizes tunable sampling parameters without changing the selected profiles", () => {
    expect(normalizeLocalModelSettings({
      contextLength: 204_800,
      maxOutputTokens: 16_384,
      temperature: 3,
      topP: -1,
      topK: 101,
      minP: 2,
      repeatPenalty: 0,
      thinking: "high",
    })).toEqual({
      contextLength: 204_800,
      maxOutputTokens: 16_384,
      temperature: 2,
      topP: 0,
      topK: 100,
      minP: 1,
      repeatPenalty: 0.8,
      thinking: "high",
      thinkingByModel: {},
    });
  });

  it("keeps thinking strength separate for each model family", () => {
    const qwenLow = withLocalModelThinking(DEFAULT_LOCAL_MODEL_SETTINGS, "qwen3.5:9b-64k", "low");
    const twoModels = withLocalModelThinking(qwenLow, "llama3.1:8b", "high");
    expect(twoModels.thinkingByModel).toEqual({ "qwen3.5:9b": "low", "llama3.1:8b": "high" });
    expect(localModelThinkingFor(twoModels, "qwen3.5:9b-200k")).toBe("low");
    expect(localModelThinkingFor(twoModels, "llama3.1:8b")).toBe("high");
    expect(localModelThinkingFor(twoModels, "another:7b")).toBe("medium");
  });

  it("strictly parses settings received from the persistence API", () => {
    expect(parseLocalModelSettings(DEFAULT_LOCAL_MODEL_SETTINGS)).toEqual(DEFAULT_LOCAL_MODEL_SETTINGS);
    expect(parseLocalModelSettings({ ...DEFAULT_LOCAL_MODEL_SETTINGS, contextLength: 32_768 })).toBeNull();
    expect(parseLocalModelSettings({ ...DEFAULT_LOCAL_MODEL_SETTINGS, contextLength: 123 })).toBeNull();
    expect(parseLocalModelSettings({ ...DEFAULT_LOCAL_MODEL_SETTINGS, thinking: "extreme" })).toBeNull();
    expect(parseLocalModelSettings({ ...DEFAULT_LOCAL_MODEL_SETTINGS, thinkingByModel: { "qwen3.5:9b": "extreme" } })).toBeNull();
  });
});

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

  it("accepts the local Ollama path, download, and busy metadata", () => {
    expect(parseLocalModelState({
      status: "ready",
      checkedAt: 1787230819075,
      models: [{ name: "qwen3.5:9b", size: 6_600_000_000, modifiedAt: 1787230819075 }],
      provider: "ollama",
      endpoint: "http://127.0.0.1:11434",
      modelRoot: "C:\\AIModels",
      configured: true,
      selectedModel: "qwen3.5:9b",
      busy: { status: "busy", runningModels: ["qwen3.5:9b"] },
      download: { status: "unknown", modelName: null, jobId: null, output: null },
    })).toMatchObject({ modelRoot: "C:\\AIModels", configured: true, busy: { status: "busy" } });
  });

  it("rejects malformed model state", () => {
    expect(parseLocalModelState({ status: "ready", checkedAt: null, models: [] })).toBeNull();
    expect(parseLocalModelState({ status: "ready", checkedAt: 1, models: [{ name: "" }] })).toBeNull();
    expect(parseLocalModelState({ status: "unknown", checkedAt: 1, models: [] })).toBeNull();
  });
});

describe("local model identity", () => {
  it("groups context profiles under one base model without collapsing unrelated tags", () => {
    expect(localModelIdentity("qwen3.5:9b-64k")).toBe("qwen3.5:9b");
    expect(localModelIdentity("qwen3.5:9b-200k")).toBe("qwen3.5:9b");
    expect(localModelIdentity("llama3.1:8b-64k")).toBe("llama3.1:8b");
    expect(localModelIdentity("llama3.1:8b-instruct")).toBe("llama3.1:8b-instruct");
    expect(groupLocalModels([
      { name: "qwen3.5:9b-200k", size: 30, modifiedAt: 3 },
      { name: "qwen3.5:9b-64k", size: 20, modifiedAt: 2 },
      { name: "qwen3.5:9b-128k", size: 25, modifiedAt: 4 },
      { name: "llama3.1:8b", size: 10, modifiedAt: 1 },
    ])).toEqual([
      { name: "qwen3.5:9b", variants: ["qwen3.5:9b-200k", "qwen3.5:9b-64k", "qwen3.5:9b-128k"], size: 30, modifiedAt: 4 },
      { name: "llama3.1:8b", variants: ["llama3.1:8b"], size: 10, modifiedAt: 1 },
    ]);
  });
});
