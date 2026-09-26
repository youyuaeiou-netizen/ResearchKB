import { readFile } from "node:fs/promises";
import { writeTextAtomically } from "./atomic-file";

/** Missing state is new state; unreadable or invalid existing state must remain untouched. */
export async function readJsonState<T>(path: string, fallback: T, isValid?: (value: unknown) => boolean): Promise<T> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
  let value: unknown;
  try { value = JSON.parse(contents); }
  catch (error) { throw new Error(`状态文件无法解析：${path}`, { cause: error }); }
  if (isValid && !isValid(value)) throw new Error(`状态文件格式无效：${path}`);
  return value as T;
}

export async function writeJsonState(path: string, value: unknown): Promise<void> {
  await writeTextAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}
