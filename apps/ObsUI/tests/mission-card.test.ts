import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage mission task affordance", () => {
  it("keeps the checkbox above the clipped task text layer", async () => {
    const styles = (await readFile(join(process.cwd(), "src", "styles.css"), "utf8")).replace(/\r\n/g, "\n");

    expect(styles).toContain(".mission-card .mission-copy > .mission-task {\n");
    expect(styles).toContain("  overflow: visible;\n");
    expect(styles).toContain(".mission-task-check-button { position: relative; z-index: 1; }");
    expect(styles).toContain(".mission-task-copy { min-width: 0; overflow: hidden; }");
  });
});
