import { describe, expect, it } from "vitest";
import { buildCodexExecArgs, conversationPath, expandHddCliArguments, extractCodexJsonLines, HDD_KNOWLEDGE_ROOTS, isAllowedKnowledgePath, isSafeConversationId, parseHddCliArgs, parseHddCliPath, parseHddContextRoots, parseHddCustomInstructions, parseHddModel, parseHddProvider, parseHddReasoningEffort, tokenizeHddCliArguments } from "../src/hdd-bridge";
import { hddReasoningEfforts, normalizeHddReasoningEffort } from "../src/hdd-models";

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
    expect(parseHddModel({ model: "gpt-6-sol" })).toBe("gpt-6-sol");
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

  it("exposes only the reasoning strengths supported by the selected model", () => {
    expect(hddReasoningEfforts("codex", "gpt-5.5")).toEqual(["low", "medium", "high", "xhigh"]);
    expect(hddReasoningEfforts("codex", "gpt-5.6-luna")).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(hddReasoningEfforts("codex", "gpt-5.6-sol")).toEqual(["low", "medium", "high", "xhigh", "max", "ultra"]);
    expect(hddReasoningEfforts("ollama", "qwen3.5:9b-64k")).toEqual(["off", "low", "medium", "high"]);
    expect(hddReasoningEfforts("ollama", "gpt-oss:20b")).toEqual(["low", "medium", "high"]);
    expect(hddReasoningEfforts("cli", "ollama/qwen3.5:9b-64k")).toEqual(["off", "low", "medium", "high"]);
    expect(normalizeHddReasoningEffort("ollama", "qwen3.5:9b-64k", "xhigh")).toBe("medium");
  });

  it("accepts provider-specific local and external model names", () => {
    expect(parseHddProvider({ provider: "ollama" })).toBe("ollama");
    expect(parseHddProvider({ content: "问题" })).toBeUndefined();
    expect(() => parseHddProvider({ provider: "remote-shell" })).toThrow("提供方选择无效");
    expect(parseHddModel({ model: "qwen3.5:9b-128k" }, "ollama")).toBe("qwen3.5:9b-128k");
    expect(parseHddModel({ model: "ollama/qwen3.5:9b-64k" }, "cli")).toBe("ollama/qwen3.5:9b-64k");
    expect(parseHddModel({ model: "" }, "cli")).toBe("");
    expect(() => parseHddModel({ model: "qwen3.5:9b; whoami" }, "ollama")).toThrow("模型名称无效");
  });

  it("keeps external CLI paths and arguments out of a command shell", () => {
    expect(parseHddCliPath({ cliPath: "C:/Tools/opencode.ps1" })).toBe("C:/Tools/opencode.ps1");
    expect(() => parseHddCliPath({ cliPath: "opencode.ps1" })).toThrow("绝对路径");
    expect(() => parseHddCliPath({ cliPath: "C:/Tools/opencode.txt" })).toThrow("绝对路径");
    expect(parseHddCliArgs({ cliArgs: "run --format default" })).toBe("run --format default");
    expect(tokenizeHddCliArguments('run --format "plain text"')).toEqual(["run", "--format", "plain text"]);
    expect(() => tokenizeHddCliArguments("run; whoami")).toThrow("shell 字符");
    expect(expandHddCliArguments({ preset: "opencode", argsTemplate: "run --format default" }, "ollama/qwen3.5:9b-64k", "回答问题")).toEqual({
      args: ["run", "--format", "default", "--model", "ollama/qwen3.5:9b-64k", "回答问题"],
      promptProvided: true,
    });
    expect(expandHddCliArguments({ preset: "opencode", argsTemplate: "run --format default" }, "ollama/qwen3.5:9b-64k", "回答问题", "high").args).toEqual(["run", "--format", "default", "--model", "ollama/qwen3.5:9b-64k", "--variant", "high", "回答问题"]);
    expect(expandHddCliArguments({ preset: "generic", argsTemplate: "--prompt {prompt}" }, "", "比较 A; B")).toEqual({ args: ["--prompt", "比较 A; B"], promptProvided: true });
  });

  it("accepts bounded H.D.D custom instructions", () => {
    expect(parseHddCustomInstructions({ customInstructions: "  先给结论  " })).toBe("先给结论");
    expect(parseHddCustomInstructions({})).toBeUndefined();
    expect(() => parseHddCustomInstructions({ customInstructions: "x".repeat(12_001) })).toThrow("12000");
  });
});
