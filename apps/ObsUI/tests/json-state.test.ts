import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonState, writeJsonState } from "../src/json-state";
import { getLiteratureDatabaseRoot, LITERATURE_DATABASE_ROOT } from "../src/literature";
import { DEFAULT_LOCAL_MODEL_SETTINGS, parsePersistedLocalModelSettings } from "../src/local-models";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function temporaryStatePath() {
  const directory = await mkdtemp(join(tmpdir(), "obsui-json-state-"));
  directories.push(directory);
  return join(directory, "state.json");
}

describe("file-backed state", () => {
  it("uses defaults only for a missing file", async () => {
    const path = await temporaryStatePath();
    expect(await readJsonState(path, { version: 1 })).toEqual({ version: 1 });
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects malformed JSON and incompatible schema without changing the saved data", async () => {
    const path = await temporaryStatePath();
    await writeFile(path, "{broken", "utf8");
    await expect(readJsonState(path, { records: [] })).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("{broken");
    await writeFile(path, '{"records":null}', "utf8");
    await expect(readJsonState(path, { records: [] }, (value) => Array.isArray((value as { records?: unknown }).records))).rejects.toThrow("状态文件格式无效");
    expect(await readFile(path, "utf8")).toBe('{"records":null}');
  });

  it("keeps the previous file when serialization fails", async () => {
    const path = await temporaryStatePath();
    await writeJsonState(path, { version: 1 });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(writeJsonState(path, circular)).rejects.toThrow();
    expect(await readJsonState(path, null)).toEqual({ version: 1 });
  });

  it("uses distinct temporary files for simultaneous replacements", async () => {
    const path = await temporaryStatePath();
    await Promise.all([writeJsonState(path, { revision: 1 }), writeJsonState(path, { revision: 2 })]);
    expect([1, 2]).toContain((await readJsonState(path, { revision: 0 })).revision);
    expect(await readdir(join(path, ".."))).toEqual(["state.json"]);
  });

  it("allows a machine-specific database root while preserving the legacy default", () => {
    const previous = process.env.OBSUI_LITERATURE_DATABASE_ROOT;
    try {
      delete process.env.OBSUI_LITERATURE_DATABASE_ROOT;
      expect(getLiteratureDatabaseRoot()).toBe(LITERATURE_DATABASE_ROOT);
      process.env.OBSUI_LITERATURE_DATABASE_ROOT = "D:\\ObsUIData";
      expect(getLiteratureDatabaseRoot()).toBe("D:\\ObsUIData");
    } finally {
      if (previous === undefined) delete process.env.OBSUI_LITERATURE_DATABASE_ROOT;
      else process.env.OBSUI_LITERATURE_DATABASE_ROOT = previous;
    }
  });

  it("loads older model settings while rejecting unrelated or invalid saved content", () => {
    expect(parsePersistedLocalModelSettings({ contextLength: 65_536, maxOutputTokens: 8_192 })).toMatchObject({
      ...DEFAULT_LOCAL_MODEL_SETTINGS,
      contextLength: 65_536,
      maxOutputTokens: 8_192,
    });
    expect(parsePersistedLocalModelSettings({ unrelated: true })).toBeNull();
    expect(parsePersistedLocalModelSettings({ contextLength: 123 })).toBeNull();
  });
});
