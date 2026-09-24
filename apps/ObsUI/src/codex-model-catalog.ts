import { spawn } from "node:child_process";
import { HDD_REASONING_EFFORTS, isCodexModelId, type HddReasoningEffort } from "./hdd-models";

export type CodexModel = { id: string; label: string; reasoningEfforts: HddReasoningEffort[]; isDefault: boolean };

export function parseCodexModelList(value: unknown): CodexModel[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { data?: unknown }).data)) return [];
  return (value as { data: unknown[] }).data.flatMap((entry): CodexModel[] => {
    if (!entry || typeof entry !== "object") return [];
    const model = entry as Record<string, unknown>;
    const id = typeof model.model === "string" ? model.model : model.id;
    if (!isCodexModelId(id) || model.hidden === true || !Array.isArray(model.supportedReasoningEfforts)) return [];
    const reasoningEfforts = model.supportedReasoningEfforts.flatMap((option): HddReasoningEffort[] => {
      const effort = option && typeof option === "object" ? (option as Record<string, unknown>).reasoningEffort : null;
      return typeof effort === "string" && HDD_REASONING_EFFORTS.includes(effort as HddReasoningEffort) ? [effort as HddReasoningEffort] : [];
    });
    if (!reasoningEfforts.length) return [];
    return [{ id, label: typeof model.displayName === "string" && model.displayName.trim() ? model.displayName.trim().slice(0, 80) : id, reasoningEfforts: [...new Set(reasoningEfforts)], isDefault: model.isDefault === true }];
  });
}

export function queryCodexModels(cliPath: string): Promise<CodexModel[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, ["app-server", "--stdio"], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let settled = false;
    let buffer = "";
    const timer = setTimeout(() => finish(new Error("Codex 模型列表查询超时。")), 8_000);
    const finish = (error?: Error, models?: CodexModel[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(models ?? []);
    };
    child.on("error", (error) => finish(error));
    child.on("exit", () => finish(new Error("Codex 模型列表查询中断。")));
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > 512 * 1024) return finish(new Error("Codex 模型列表过大。"));
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        let message: Record<string, unknown>;
        try { message = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
        if (message.id === 1) {
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "model/list", params: { limit: 100, includeHidden: false } }) + "\n");
        } else if (message.id === 2) {
          if (message.error) finish(new Error("Codex 模型列表查询失败。"));
          else finish(undefined, parseCodexModelList(message.result));
          return;
        }
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "obsui", version: "0.1.0" }, capabilities: null } }) + "\n");
  });
}

let cached: { path: string; checkedAt: number; models: CodexModel[] } | null = null;
let pending: Promise<CodexModel[]> | null = null;

export async function getCodexModels(cliPath: string): Promise<CodexModel[]> {
  if (cached?.path === cliPath && Date.now() - cached.checkedAt < 30_000) return cached.models;
  if (pending) return pending;
  pending = queryCodexModels(cliPath).then((models) => {
    cached = { path: cliPath, checkedAt: Date.now(), models };
    return models;
  }).finally(() => { pending = null; });
  return pending;
}
