import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSettings } from "../src/workbench-settings-server";
import { DEFAULT_STARTUP_SETTINGS } from "../src/workbench-settings";

const previousRoot = process.env.OBSUI_LITERATURE_DATABASE_ROOT;
const directories: string[] = [];
afterEach(async () => {
  if (previousRoot === undefined) delete process.env.OBSUI_LITERATURE_DATABASE_ROOT;
  else process.env.OBSUI_LITERATURE_DATABASE_ROOT = previousRoot;
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function settingsPath() {
  const directory = await mkdtemp(join(tmpdir(), "obsui-startup-settings-"));
  directories.push(directory);
  process.env.OBSUI_LITERATURE_DATABASE_ROOT = directory;
  return join(directory, "workbench-startup-settings.json");
}

describe("workbench startup settings persistence", () => {
  it("uses defaults for a fresh directory without creating a file", async () => {
    const path = await settingsPath();
    expect(await readSettings()).toEqual(DEFAULT_STARTUP_SETTINGS);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("normalizes legacy settings and preserves the original file", async () => {
    const path = await settingsPath();
    const legacy = '{"windowsStartup":true,"applications":{"zotero":true,"flclash":false,"ollama":false}}';
    await writeFile(path, legacy, "utf8");
    expect(await readSettings()).toMatchObject({ windowsStartup: true, applications: { zotero: true, flclash: false, ollama: false }, customApplications: [] });
    expect(await readFile(path, "utf8")).toBe(legacy);
  });

  it("rejects a damaged file without replacing it with defaults", async () => {
    const path = await settingsPath();
    await writeFile(path, '{"applications":null}', "utf8");
    await expect(readSettings()).rejects.toThrow("状态文件格式无效");
    expect(await readFile(path, "utf8")).toBe('{"applications":null}');
  });
});
