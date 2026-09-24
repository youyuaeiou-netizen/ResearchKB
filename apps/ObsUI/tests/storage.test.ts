import "fake-indexeddb/auto";
import { createBackup, createInitialState, DB_NAME, loadAppState, loadWorkbenchSettings, normalizeAppState, parseBackup, saveAppState, saveWorkbenchSettings, touch } from "../src/storage";
import { DEFAULT_WORKBENCH_SETTINGS, normalizeWorkbenchSettings } from "../src/workbench-settings";

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB test database remained open"));
  });
});

describe("ObsUI v1 backup boundary", () => {
  it("round-trips a valid backup without changing its data", () => {
    const state = createInitialState();
    const restored = parseBackup(createBackup(state));
    expect(restored.schemaVersion).toBe(1);
    expect(restored.projects).toEqual(state.projects);
    expect(restored.tasks).toEqual(state.tasks);
    expect(restored.resources).toEqual(state.resources);
    expect(restored.repositories).toEqual(state.repositories);
  });

  it("rejects malformed backups before replacement", () => {
    expect(() => parseBackup({ app: "obsui", format: "obsui-backup-v1", state: { schemaVersion: 1 } })).toThrow();
  });

  it("touches only the state timestamp", () => {
    const state = createInitialState();
    const next = touch(state);
    expect(next.projects).toEqual(state.projects);
    expect(next.tasks).toEqual(state.tasks);
    expect(next.updatedAt).not.toBe("");
  });

  it("persists the state in the app-owned IndexedDB store", async () => {
    const state = createInitialState();
    state.projects[0].title = "持久化后的项目";
    await saveAppState(state);
    const loaded = await loadAppState();
    expect(loaded.projects[0].title).toBe("持久化后的项目");
  });

  it("stores workbench preferences separately from project data", async () => {
    const initial = await loadWorkbenchSettings();
    expect(initial).toEqual(DEFAULT_WORKBENCH_SETTINGS);
    const customized = {
      ...initial,
      profile: { ...initial.profile, nickname: "H", birthday: "2000-01-02", school: "示例大学" },
      hdd: { ...initial.hdd, customInstructions: "回答时先给结论。" },
    };
    await saveWorkbenchSettings(customized);
    expect(await loadWorkbenchSettings()).toEqual(customized);
    expect((await loadAppState()).projects.length).toBeGreaterThan(0);
  });

  it("normalizes invalid workbench preference fields", () => {
    const settings = normalizeWorkbenchSettings({
      wallpaperDataUrl: "https://example.com/wallpaper.png",
      profile: { nickname: "n", birthday: "not-a-date", school: "s" },
      hdd: { model: "unknown", reasoningEffort: "impossible", customInstructions: 3 },
      petEnabled: "yes",
    });
    expect(settings.wallpaperDataUrl).toBeNull();
    expect(settings.profile.birthday).toBe("");
    expect(settings.hdd).toEqual(DEFAULT_WORKBENCH_SETTINGS.hdd);
    expect(settings.translation.enabled).toBe(true);
    expect(settings.petEnabled).toBe(false);
  });

  it("preserves an explicitly disabled selection translation capability", () => {
    expect(normalizeWorkbenchSettings({ translation: { enabled: false } }).translation.enabled).toBe(false);
  });

  it("normalizes local-model and external CLI H.D.D providers without mixing Codex models", () => {
    const ollama = normalizeWorkbenchSettings({ hdd: { provider: "ollama", model: "qwen3.5:9b-128k", reasoningEffort: "low" } });
    expect(ollama.hdd.provider).toBe("ollama");
    expect(ollama.hdd.model).toBe("qwen3.5:9b-128k");

    const cli = normalizeWorkbenchSettings({ hdd: {
      provider: "cli",
      model: "ollama/qwen3.5:9b-64k",
      cliProfiles: [{ id: "cli-123e4567-e89b-42d3-a456-426614174000", label: "OpenCode", executablePath: "C:/Tools/opencode.ps1", model: "ollama/qwen3.5:9b-64k", argsTemplate: "run --format default", preset: "opencode" }],
      selectedCliProfileId: "missing",
    } });
    expect(cli.hdd.provider).toBe("cli");
    expect(cli.hdd.cliProfiles).toHaveLength(1);
    expect(cli.hdd.selectedCliProfileId).toBe("cli-123e4567-e89b-42d3-a456-426614174000");
  });

  it("migrates legacy task status and priority fields without dropping user data", () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete legacy.targetLastOpenedMonth;
    legacy.tasks = [{
      id: "legacy-task",
      title: "旧任务",
      projectId: null,
      dueDate: "2026-08-27",
      status: "done",
      priority: "high",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    }];
    const migrated = normalizeAppState(legacy);
    expect(migrated?.tasks[0]).toMatchObject({
      id: "legacy-task",
      status: "completed",
      priority: 5,
      folderPath: "",
      dueTime: "23:59",
      completedAt: "2026-08-21T00:00:00.000Z",
    });
    expect(migrated?.targetLastOpenedMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it("adds an empty repository registry when loading an older state or backup", () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete legacy.repositories;
    expect(normalizeAppState(legacy)?.repositories).toEqual([]);
    expect(parseBackup({ app: "obsui", format: "obsui-backup-v1", exportedAt: new Date().toISOString(), state: legacy }).repositories).toEqual([]);
  });
});
