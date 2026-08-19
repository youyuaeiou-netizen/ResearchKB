import "fake-indexeddb/auto";
import { createBackup, createInitialState, DB_NAME, loadAppState, parseBackup, saveAppState, touch } from "../src/storage";

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
});
