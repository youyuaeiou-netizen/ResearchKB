import "fake-indexeddb/auto";
import { createBackup, createInitialState, DB_NAME, loadAppState, normalizeAppState, parseBackup, saveAppState, touch } from "../src/storage";

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
      completedAt: "2026-08-21T00:00:00.000Z",
    });
    expect(migrated?.targetLastOpenedMonth).toMatch(/^\d{4}-\d{2}$/);
  });
});
