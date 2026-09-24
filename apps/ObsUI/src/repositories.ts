export type RepositoryKind = "git" | "obsidian" | "material";

export type RepositoryEntry = {
  id: string;
  kind: RepositoryKind;
  name: string;
  localPath: string;
  remoteUrl: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type RepositoryRelation = {
  id: string;
  a: string;
  b: string;
  createdAt: string;
};

export type GitWorktreeState = "clean" | "modified" | "untracked" | "conflicted";

export type GitStatusSnapshot = {
  rootPath: string;
  branch: string | null;
  detached: boolean;
  state: GitWorktreeState;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  originUrl: string | null;
  latestCommit: {
    shortHash: string;
    committedAt: string;
    subject: string;
  } | null;
  checkedAt: string;
};

export type GitStatusResponse =
  | { status: "ready"; snapshot: GitStatusSnapshot }
  | { status: "unavailable"; message: string; checkedAt: string };

export type ObsidianVaultEntry = {
  kind: "directory" | "note";
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
};

export type RepositoryFolderEntry = {
  name: string;
  relativePath: string;
};

export type ObsidianNote = {
  relativePath: string;
  content: string;
  version: string;
  modifiedAt: string;
};

export type ObsidianGraphNode = {
  id: string;
  label: string;
  relativePath: string;
};

export type ObsidianGraphEdge = {
  source: string;
  target: string;
};

export type ObsidianGraph = {
  nodes: ObsidianGraphNode[];
  edges: ObsidianGraphEdge[];
  truncated: boolean;
};

export function normalizeRepositoryRelation(value: unknown): RepositoryRelation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim() ||
    typeof candidate.a !== "string" || !candidate.a.trim() ||
    typeof candidate.b !== "string" || !candidate.b.trim() || candidate.a === candidate.b ||
    typeof candidate.createdAt !== "string") return null;
  return { id: candidate.id, a: candidate.a, b: candidate.b, createdAt: candidate.createdAt };
}

export type ParsedGitStatus = Pick<GitStatusSnapshot, "branch" | "detached" | "state" | "staged" | "unstaged" | "untracked" | "conflicted">;

const repositoryKinds: RepositoryKind[] = ["git", "obsidian", "material"];
const conflictPairs = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

export function parseGitStatusPorcelain(output: string): ParsedGitStatus {
  let branch: string | null = null;
  let detached = false;
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflicted = 0;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.startsWith("## ")) {
      const head = line.slice(3).trim();
      if (/^HEAD \(no branch\)/i.test(head)) {
        detached = true;
        branch = null;
      } else {
        branch = head.split("...")[0].replace(/^No commits yet on /i, "").trim() || null;
      }
      continue;
    }

    if (line.startsWith("??")) {
      untracked += 1;
      continue;
    }
    if (line.length < 2) continue;
    const indexStatus = line[0];
    const worktreeStatus = line[1];
    if (!/^[ MADRCU?!][ MADRCU?!]$/.test(`${indexStatus}${worktreeStatus}`)) continue;
    if (indexStatus === "!" && worktreeStatus === "!") continue;
    if (conflictPairs.has(`${indexStatus}${worktreeStatus}`) || indexStatus === "U" || worktreeStatus === "U") conflicted += 1;
    if (indexStatus !== " " && indexStatus !== "?") staged += 1;
    if (worktreeStatus !== " " && worktreeStatus !== "?") unstaged += 1;
  }

  const state: GitWorktreeState = conflicted > 0
    ? "conflicted"
    : staged + unstaged > 0
      ? "modified"
      : untracked > 0
        ? "untracked"
        : "clean";

  return { branch, detached, state, staged, unstaged, untracked, conflicted };
}

export function parseGitLatestCommit(output: string): GitStatusSnapshot["latestCommit"] {
  const line = output.trim();
  if (!line) return null;
  const [shortHash, committedAt, ...subjectParts] = line.split("\x1f");
  if (!shortHash || !committedAt || !subjectParts.length) return null;
  if (Number.isNaN(Date.parse(committedAt))) return null;
  return { shortHash, committedAt, subject: subjectParts.join("\x1f") };
}

function redactUrlCredentials(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/(?:token|secret|password|passwd|auth|credential|key)/i.test(key)) parsed.searchParams.set(key, "[redacted]");
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

export function redactRemoteUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const scpLike = trimmed.match(/^(?:[^@/:]+)@([^:]+:.+)$/);
  if (scpLike) return scpLike[1];
  return redactUrlCredentials(trimmed);
}

export function normalizeRepository(value: unknown): RepositoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim() ||
    typeof candidate.name !== "string" || !candidate.name.trim() ||
    typeof candidate.localPath !== "string" || !candidate.localPath.trim() ||
    typeof candidate.createdAt !== "string" || typeof candidate.updatedAt !== "string" ||
    !repositoryKinds.includes(candidate.kind as RepositoryKind)) return null;
  return {
    id: candidate.id,
    kind: candidate.kind as RepositoryKind,
    name: candidate.name,
    localPath: candidate.localPath,
    remoteUrl: typeof candidate.remoteUrl === "string" ? candidate.remoteUrl : "",
    note: typeof candidate.note === "string" ? candidate.note : "",
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

export function isRepositoryKind(value: unknown): value is RepositoryKind {
  return repositoryKinds.includes(value as RepositoryKind);
}
