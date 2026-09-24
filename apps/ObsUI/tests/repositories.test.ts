import { describe, expect, it } from "vitest";
import { normalizeRepository, parseGitLatestCommit, parseGitStatusPorcelain, redactRemoteUrl } from "../src/repositories";

describe("Git 仓库状态解析", () => {
  it("识别 clean 状态和当前分支", () => {
    expect(parseGitStatusPorcelain("## main...origin/main\n")).toMatchObject({ branch: "main", detached: false, state: "clean", staged: 0, unstaged: 0, untracked: 0, conflicted: 0 });
  });

  it("分别统计暂存、未暂存和未跟踪变更", () => {
    expect(parseGitStatusPorcelain(["## main", "M  staged.txt", " M working.txt", "?? new.txt"].join("\n"))).toMatchObject({ state: "modified", staged: 1, unstaged: 1, untracked: 1, conflicted: 0 });
    expect(parseGitStatusPorcelain(["## main", "?? new.txt"].join("\n")).state).toBe("untracked");
  });

  it("把冲突状态放在普通修改之前", () => {
    expect(parseGitStatusPorcelain(["## main", "UU conflict.txt", " M working.txt"].join("\n"))).toMatchObject({ state: "conflicted", conflicted: 1, unstaged: 2 });
  });

  it("识别 detached HEAD、无提交和异常输出而不抛错", () => {
    expect(parseGitStatusPorcelain("## HEAD (no branch)\n")).toMatchObject({ branch: null, detached: true, state: "clean" });
    expect(parseGitStatusPorcelain("## No commits yet on main\n")).toMatchObject({ branch: "main", detached: false });
    expect(parseGitStatusPorcelain("unexpected git output")).toMatchObject({ branch: null, detached: false, state: "clean" });
  });

  it("解析最近提交并保留摘要", () => {
    expect(parseGitLatestCommit("abc1234\x1f2026-09-16T08:00:00+08:00\x1f修复仓库状态\n")).toEqual({ shortHash: "abc1234", committedAt: "2026-09-16T08:00:00+08:00", subject: "修复仓库状态" });
    expect(parseGitLatestCommit("")).toBeNull();
  });
});

describe("仓库登记数据边界", () => {
  it("去除远程地址中的账号、密码和 token", () => {
    expect(redactRemoteUrl("https://alice:secret@example.com/org/repo.git?token=abc")).toBe("https://example.com/org/repo.git?token=%5Bredacted%5D");
    expect(redactRemoteUrl("git@github.com:org/repo.git")).toBe("github.com:org/repo.git");
  });

  it("兼容可选备注和远程地址字段", () => {
    expect(normalizeRepository({ id: "repo-1", kind: "git", name: "ResearchKB", localPath: "C:/WorkSpace/ResearchKB", createdAt: "2026-09-16", updatedAt: "2026-09-16" })).toMatchObject({ remoteUrl: "", note: "" });
    expect(normalizeRepository({ id: "repo-2", kind: "other", name: "bad", localPath: "C:/bad", createdAt: "now", updatedAt: "now" })).toBeNull();
  });
});
