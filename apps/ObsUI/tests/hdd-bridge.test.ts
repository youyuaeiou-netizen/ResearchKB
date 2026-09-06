import { describe, expect, it } from "vitest";
import { buildCodexExecArgs, conversationPath, extractCodexJsonLines, HDD_KNOWLEDGE_ROOTS, HDD_MODELS, isAllowedKnowledgePath, isSafeConversationId, parseHddContextRoots, parseHddModel, parseHddReasoningEffort } from "../src/hdd-bridge";

describe("H.D.D local bridge guards", () => {
  it("accepts only UUID v4 conversation ids and keeps the filename inside the chat root", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(isSafeConversationId(id)).toBe(true);
    expect(conversationPath("F:/ResearchKB/03-Resources/v3-auto/HDD-Chats", id).replaceAll("\\", "/")).toBe("F:/ResearchKB/03-Resources/v3-auto/HDD-Chats/123e4567-e89b-42d3-a456-426614174000.json");
    expect(isSafeConversationId("../secrets")).toBe(false);
    expect(() => conversationPath("F:/ResearchKB/03-Resources/v3-auto/HDD-Chats", "../secrets" )).toThrow();
  });

  it("allows only Markdown/TXT knowledge and excludes settings, harnesses, and secrets", () => {
    expect(HDD_KNOWLEDGE_ROOTS).toHaveLength(6);
    expect(isAllowedKnowledgePath("02-Areas/notes/topic.md")).toBe(true);
    expect(isAllowedKnowledgePath("05-Skills/readme.txt")).toBe(true);
    expect(isAllowedKnowledgePath("02-Areas/.obsidian/app.json")).toBe(false);
    expect(isAllowedKnowledgePath("03-Resources/_system/index.md")).toBe(false);
    expect(isAllowedKnowledgePath("01-Projects/.env.local")).toBe(false);
    expect(isAllowedKnowledgePath("01-Projects/credentials.json")).toBe(false);
  });

  it("converts Codex JSONL agent messages to a single streamed answer", () => {
    const jsonl = [
      JSON.stringify({ type: "thread.started", thread_id: "t" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "第一段" } }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "第一段第二段" } }),
      JSON.stringify({ type: "turn.completed" }),
    ].join("\n");
    const parsed = extractCodexJsonLines(jsonl);
    expect(parsed.events).toHaveLength(4);
    expect(parsed.text).toBe("第一段第二段");
  });

  it("accepts only the six fixed knowledge roots for conversation context", () => {
    expect(parseHddContextRoots({ content: "问题" })).toBeUndefined();
    expect(parseHddContextRoots({ contextRoots: ["02-Areas", "05-Skills", "02-Areas"] })).toEqual(["02-Areas", "05-Skills"]);
    expect(parseHddContextRoots({ contextRoots: [] })).toEqual([]);
    expect(() => parseHddContextRoots({ contextRoots: ["C:/Users/86159/secret.md"] })).toThrow("知识目录选择无效");
  });

  it("validates the Codex model and reasoning effort before building scoped CLI args", () => {
    expect(HDD_MODELS.map((model) => model.label)).toEqual(["5.5", "5.6 Luna", "5.6 Terra", "5.6 Sol"]);
    expect(parseHddModel({ model: "gpt-5.6-terra" })).toBe("gpt-5.6-terra");
    expect(parseHddModel({ content: "问题" })).toBeUndefined();
    expect(() => parseHddModel({ model: "--sandbox danger-full-access" })).toThrow("Codex 模型选择无效");
    expect(parseHddReasoningEffort({ reasoningEffort: "xhigh" })).toBe("xhigh");
    expect(parseHddReasoningEffort({ reasoningEffort: "max" })).toBe("max");
    expect(parseHddReasoningEffort({ content: "问题" })).toBeUndefined();
    expect(() => parseHddReasoningEffort({ reasoningEffort: "--sandbox danger-full-access" })).toThrow("模型强度选择无效");
    const args = buildCodexExecArgs("C:/Temp/obsui-hdd", "回答问题", "gpt-5.6-luna", "high");
    expect(args).toContain("--model");
    expect(args).toContain("gpt-5.6-luna");
    expect(args).toContain('model_reasoning_effort="high"');
    expect(buildCodexExecArgs("C:/Temp/obsui-hdd", "回答问题")).not.toContain("--model");
  });
});
