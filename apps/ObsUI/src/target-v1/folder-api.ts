export async function openTargetFolder(folderPath: string): Promise<string> {
  const path = folderPath.trim();
  if (!path) throw new Error("该任务尚未关联文件夹。");
  const response = await fetch("/api/folders/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath: path }),
  });
  const payload = await response.json().catch(() => null) as { message?: unknown } | null;
  if (!response.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "无法打开关联文件夹。");
  return typeof payload?.message === "string" ? payload.message : "已打开关联文件夹。";
}
