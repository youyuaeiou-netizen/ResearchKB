import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout } from "node:timers/promises";

async function replaceFile(temporaryPath: string, path: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporaryPath, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || attempt >= 7 || !["EACCES", "EBUSY", "EPERM"].includes(code ?? "")) throw error;
      await setTimeout(10 * (attempt + 1));
    }
  }
}

/** Replace a file only after its complete contents have been written beside it. */
export async function writeTextAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await replaceFile(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
