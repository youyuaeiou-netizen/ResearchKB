#!/usr/bin/env python3
"""Read-only maintenance audit for the ResearchKB workspace.

The audit produces a manifest and a human-readable report.  It never moves,
overwrites, or deletes a Vault file and has no delete/apply command.  Archive
actions in the manifest are recommendations only; ambiguous objects are held.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
DEFAULT_CONFIG = HARNESS_ROOT / "config" / "maintenance-policy.json"
DEFAULT_REPORT_DIR = HARNESS_ROOT / "reports"

TEXT_SUFFIXES = {
    ".cfg",
    ".csv",
    ".html",
    ".htm",
    ".ini",
    ".json",
    ".markdown",
    ".md",
    ".ps1",
    ".py",
    ".rst",
    ".toml",
    ".txt",
    ".yaml",
    ".yml",
}
HEALTHY_RUN_STATUSES = {
    "OK",
    "OK_EMPTY",
    "OK_WITH_WARNINGS",
    "DRY_RUN_READY",
    "COMPLETED_READ_ONLY",
    "APPLIED",
    "PASS",
}
FAILURE_MARKERS = ("ERROR", "FAIL", "BLOCK", "EXCEPTION", "CRASH")
DATE_RE = re.compile(r"(?<!\d)(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?!\d)")
FRONTMATTER_RE = re.compile(r"\A\ufeff?---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.S)
KEY_VALUE_RE = re.compile(r"(?m)^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$")


class AuditError(RuntimeError):
    """Raised for an unsafe or invalid audit request."""


def normalize_rel(value: str | Path) -> str:
    normalized = str(value).replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")


def path_is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def relative_path(path: Path, root: Path) -> str:
    return normalize_rel(path.resolve().relative_to(root.resolve()))


def load_policy(path: Path = DEFAULT_CONFIG) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        policy = json.load(handle)
    if policy.get("schema") != "researchkb-maintenance-policy/v1":
        raise AuditError(f"Unsupported maintenance policy schema: {policy.get('schema')!r}")
    disposal = policy.get("disposal", {})
    if disposal.get("mode") != "archive-only":
        raise AuditError("Maintenance audit requires archive-only disposal mode")
    if disposal.get("allow_permanent_delete") is not False:
        raise AuditError("Permanent deletion must remain disabled")
    return policy


def validate_workspace_root(root: Path, policy: dict[str, Any]) -> Path:
    resolved = root.resolve()
    configured_value = policy.get("workspace_root")
    configured = Path(str(configured_value)) if configured_value else None
    if configured and not configured.is_absolute():
        configured = WORKSPACE_ROOT / configured
    if configured and configured.resolve() != resolved:
        raise AuditError(
            f"Workspace root mismatch: policy={configured.resolve()} requested={resolved}"
        )
    if not (resolved / ".harness").is_dir():
        raise AuditError(f"Not a ResearchKB workspace: missing {resolved / '.harness'}")
    return resolved


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_text_if_supported(path: Path) -> str | None:
    if path.suffix.lower() not in TEXT_SUFFIXES:
        return None
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if b"\x00" in raw[:8192]:
        return None
    for encoding in ("utf-8", "utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def is_excluded(rel: str, excluded: Iterable[str]) -> bool:
    normalized = normalize_rel(rel).lower().rstrip("/")
    for item in excluded:
        candidate = normalize_rel(item).lower().rstrip("/")
        if normalized == candidate or normalized.startswith(candidate + "/"):
            return True
    return False


def iter_files(root: Path, policy: dict[str, Any]) -> list[Path]:
    scope = policy.get("scope", {})
    excluded = scope.get("excluded_relative_paths", [])
    roots: list[Path] = []
    for name in scope.get("root_files", []):
        roots.append(root / str(name))
    for name in scope.get("vault_roots", []):
        roots.append(root / str(name))
    harness = root / ".harness"
    for name in scope.get("harness_roots", []):
        roots.append(harness / str(name))

    result: list[Path] = []
    seen: set[Path] = set()
    for candidate in roots:
        if not candidate.exists() or candidate.is_symlink():
            continue
        if candidate.is_file():
            rel = relative_path(candidate, root)
            if not is_excluded(rel, excluded):
                resolved = candidate.resolve()
                if resolved not in seen:
                    result.append(resolved)
                    seen.add(resolved)
            continue
        for current, directories, files in os.walk(candidate, topdown=True, followlinks=False):
            current_path = Path(current)
            directories[:] = [
                name
                for name in directories
                if not is_excluded(relative_path(current_path / name, root), excluded)
                and not (current_path / name).is_symlink()
            ]
            for name in files:
                path = current_path / name
                if path.is_symlink():
                    continue
                rel = relative_path(path, root)
                if is_excluded(rel, excluded):
                    continue
                resolved = path.resolve()
                if resolved not in seen:
                    result.append(resolved)
                    seen.add(resolved)
    return sorted(result, key=lambda item: relative_path(item, root).lower())


def parse_frontmatter(text: str | None) -> dict[str, str]:
    if not text:
        return {}
    match = FRONTMATTER_RE.search(text)
    if not match:
        return {}
    values: dict[str, str] = {}
    for key, value in KEY_VALUE_RE.findall(match.group(1)):
        values[key] = value.strip().strip('"\'')
    return values


def file_location(rel: str) -> str:
    if rel == "AGENTS.md" or not rel.startswith(".harness/"):
        return "vault"
    return "harness"


def archive_destination(rel: str, policy: dict[str, Any]) -> str | None:
    rel = normalize_rel(rel)
    destinations = policy.get("archive_destinations", {})
    if rel.startswith(".harness/"):
        base = normalize_rel(destinations.get("harness_generated", ".harness/archive"))
        return normalize_rel(f"{base}/{rel.removeprefix('.harness/')}")
    if rel == "AGENTS.md":
        return None
    base = normalize_rel(destinations.get("vault_legacy", "04-Archive/legacy"))
    return normalize_rel(f"{base}/{rel}")


def parse_json_text(text: str | None) -> dict[str, Any] | None:
    if not text:
        return None
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def run_status(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("status", "result", "horizon_status", "run_status"):
            if key in value:
                return str(value[key]).upper()
    return ""


def has_failure_status(value: Any) -> bool:
    status = run_status(value)
    return bool(status) and (
        status not in HEALTHY_RUN_STATUSES
        or any(marker in status for marker in FAILURE_MARKERS)
    )


def date_key(path: Path, text: str | None = None) -> tuple[int, int, int, float]:
    match = DATE_RE.search(path.name)
    if not match and text:
        match = DATE_RE.search(text[:2000])
    if match:
        year, month, day = (int(part) for part in match.groups())
        return year, month, day, path.stat().st_mtime
    return 0, 0, 0, path.stat().st_mtime


def report_is_quarterly(path: Path, text: str | None) -> bool:
    haystack = f"{path.name}\n{text or ''}".lower()
    if "quarter" in haystack or "季度" in haystack:
        return True
    year, month, day, _ = date_key(path, text)
    return bool(year and month in {1, 4, 7, 10} and day <= 7)


def build_records(root: Path, paths: list[Path]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    records: list[dict[str, Any]] = []
    texts: dict[str, str] = {}
    for path in paths:
        rel = relative_path(path, root)
        try:
            stat = path.stat()
            digest = sha256_file(path)
        except OSError as exc:
            records.append(
                {
                    "path": rel,
                    "location": file_location(rel),
                    "classification": "conflict",
                    "action": "hold",
                    "recommended_action": "hold",
                    "reason": f"无法读取文件元数据或哈希：{exc}",
                    "sha256": None,
                    "size": None,
                    "modified_at": None,
                    "references": [],
                    "archive_path": None,
                }
            )
            continue
        text = read_text_if_supported(path)
        if text is not None:
            texts[rel] = text
        records.append(
            {
                "path": rel,
                "location": file_location(rel),
                "classification": "keep",
                "action": "keep",
                "recommended_action": "keep",
                "reason": "在受控范围内，未发现可安全归档依据",
                "sha256": digest,
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
                "references": [],
                "archive_path": None,
            }
        )
    return records, texts


def classify_legacy_records(
    records: list[dict[str, Any]],
    texts: dict[str, str],
    policy: dict[str, Any],
) -> None:
    legacy = policy.get("legacy_detection", {})
    active_dirs = {normalize_rel(value).lower().rstrip("/") for value in legacy.get("active_candidate_directories", [])}
    candidate_field = str(legacy.get("candidate_field", "candidate_id"))
    superseded_field = str(legacy.get("superseded_field", "superseded_by"))
    filename_markers = [str(value).lower() for value in legacy.get("historical_filename_markers", [])]

    for record in records:
        rel = record["path"]
        if record["location"] != "vault":
            continue
        text = texts.get(rel, "")
        frontmatter = parse_frontmatter(text)
        parent_dir = "/".join(rel.split("/")[:-1]).lower()
        origin = frontmatter.get("candidate_origin", "").lower()
        if rel.startswith(("01-Projects/", "02-Areas/", "04-Archive/", "05-Skills/")):
            continue
        if frontmatter.get(superseded_field):
            record.update(
                classification="superseded-history",
                action="archive",
                recommended_action="archive-after-link-review",
                reason=f"frontmatter 明确标记 {superseded_field}",
                archive_path=archive_destination(rel, policy),
            )
            continue
        if (
            candidate_field in frontmatter
            and origin == "zotero"
            and not any(parent_dir == active or parent_dir.startswith(active + "/") for active in active_dirs)
        ):
            record.update(
                classification="legacy-candidate",
                action="hold",
                recommended_action="archive-after-source-and-link-review",
                reason="存在 legacy candidate_id，但文件不在 v3-auto 候选目录；不能自动晋升或删除",
                archive_path=archive_destination(rel, policy),
            )
            continue
        if origin == "codex-project" or "交接" in Path(rel).name:
            record.update(
                classification="historical-candidate",
                action="hold",
                recommended_action="archive-after-claim-review",
                reason="候选来源为历史项目交接内容，可能包含仍有效的运行约束",
                archive_path=archive_destination(rel, policy),
            )
            continue
        if frontmatter.get("proposal_status") == "implemented-draft" or frontmatter.get("implementation_root"):
            record.update(
                classification="active-design-candidate",
                action="keep",
                recommended_action="keep",
                reason="标记为当前已实现的设计基线，不作为过时文件归档",
            )
            continue
        lower_name = Path(rel).name.lower()
        if any(marker in lower_name for marker in filename_markers):
            record.update(
                classification="historical-document",
                action="hold",
                recommended_action="archive-after-claim-review",
                reason="文件名包含历史/旧版本标记，但未证明其全部内容已失效",
                archive_path=archive_destination(rel, policy),
            )
        elif "交接" in Path(rel).name:
            record.update(
                classification="historical-handoff",
                action="hold",
                recommended_action="archive-after-claim-review",
                reason="交接文档可能同时包含仍有效的运行约束，需要逐项核对",
                archive_path=archive_destination(rel, policy),
            )


def classify_generated_records(
    root: Path,
    records: list[dict[str, Any]],
    texts: dict[str, str],
    policy: dict[str, Any],
) -> None:
    retention = policy.get("retention", {})
    report_records = [
        record for record in records if record["path"].startswith(".harness/reports/")
    ]
    report_records.sort(
        key=lambda record: date_key(root / Path(record["path"]), texts.get(record["path"])),
        reverse=True,
    )
    keep_report_paths = {record["path"] for record in report_records[: int(retention.get("report_keep_latest", 12))]}
    if retention.get("preserve_quarterly_reports", True):
        keep_report_paths.update(
            record["path"]
            for record in report_records
            if report_is_quarterly(root / Path(record["path"]), texts.get(record["path"]))
        )

    for record in records:
        rel = record["path"]
        if not rel.startswith(".harness/"):
            continue
        if rel.startswith(".harness/reports/"):
            if rel in keep_report_paths:
                record.update(
                    classification="generated-report-retained",
                    action="keep",
                    recommended_action="keep",
                    reason="属于最新报告保留窗口或季度报告",
                )
            else:
                record.update(
                    classification="generated-report-aged",
                    action="archive",
                    recommended_action="archive-only",
                    reason="超出报告保留窗口；只允许移动到 Harness archive，不永久删除",
                    archive_path=archive_destination(rel, policy),
                )
            continue
        if rel.startswith(".harness/runs/"):
            value = parse_json_text(texts.get(rel))
            if retention.get("preserve_failed_runs", True) and has_failure_status(value):
                record.update(
                    classification="generated-run-failure-retained",
                    action="keep",
                    recommended_action="keep",
                    reason="运行记录包含失败/阻塞状态，保留审计证据",
                )
            else:
                record.update(
                    classification="generated-run",
                    action="archive",
                    recommended_action="archive-only",
                    reason="历史运行记录；只允许移动到 Harness archive",
                    archive_path=archive_destination(rel, policy),
                )
            continue
        if rel.startswith(".harness/staging/horizon/"):
            record.update(
                classification="active-raw-staging",
                action="hold",
                recommended_action="hold-until-raw-lifecycle-is-defined",
                reason="source-registry 将其作为 Horizon 原始信号入口；在 RAW 生命周期实现前不移动",
            )
            continue
        if rel.startswith(".harness/staging/"):
            record.update(
                classification="generated-staging",
                action="archive",
                recommended_action="archive-after-reference-review",
                reason="生成性 staging；仍需先核对运行记录和报告引用",
                archive_path=archive_destination(rel, policy),
            )
            continue
        if "/__pycache__/" in f"/{rel}/" or rel.endswith(".pyc"):
            record.update(
                classification="rebuildable-cache",
                action="hold",
                recommended_action="remove-only-if-created-by-current-task",
                reason="可重建缓存；不作为知识归档对象，不在本阶段删除",
            )
            continue
        if rel.startswith(".harness/logs/") or rel.startswith(".harness/cache/"):
            record.update(
                classification="generated-support-artifact",
                action="archive",
                recommended_action="archive-only",
                reason="执行层生成物；只允许归档",
                archive_path=archive_destination(rel, policy),
            )


def find_references(records: list[dict[str, Any]], texts: dict[str, str]) -> None:
    path_counts = Counter(Path(record["path"]).name for record in records)
    candidates = [
        record for record in records if record["action"] in {"archive", "hold"} and record["archive_path"]
    ]
    for target in candidates:
        rel = target["path"]
        variants = {rel, rel.replace("/", "\\")}
        basename = Path(rel).name
        if path_counts[basename] == 1:
            variants.add(basename)
        references: list[str] = []
        for source, text in texts.items():
            if source == rel:
                continue
            if any(variant and variant in text for variant in variants):
                references.append(source)
        target["references"] = sorted(set(references))
        live_references = [
            source
            for source in references
            if not source.startswith(
                (".harness/reports/", ".harness/runs/", ".harness/staging/", ".harness/archive/")
            )
        ]
        if live_references and target["action"] == "archive":
            target["action"] = "hold"
            target["recommended_action"] = "archive-after-reference-rewrite-and-review"
            target["reason"] += "；发现引用，必须先生成并验证链接映射"


def _resolve_workspace_path(root: Path, value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute():
        return candidate.resolve()
    return (root / candidate).resolve()


def collect_findings(root: Path, records: list[dict[str, Any]], texts: dict[str, str]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    by_path = {record["path"]: record for record in records}

    state_rel = ".harness/state/horizon-daily-digest-state.json"
    state_text = texts.get(state_rel)
    state = parse_json_text(state_text)
    if state:
        output_value = state.get("last_output_path")
        if output_value:
            output_path = _resolve_workspace_path(root, str(output_value))
            if not output_path.exists():
                findings.append(
                    {
                        "kind": "stale-state-output",
                        "classification": "conflict",
                        "action": "hold",
                        "path": state_rel,
                        "related_paths": [normalize_rel(str(output_value))],
                        "reason": "Daily state 指向不存在的输出路径；在确认活动读取者前不归档或改写状态",
                    }
                )
                if state_rel in by_path:
                    by_path[state_rel].update(
                        classification="conflict",
                        action="hold",
                        recommended_action="hold-until-reader-audit",
                        reason="state 的 last_output_path 不存在；不能推断其已废弃",
                    )

    daily_task = ".harness/tasks/run-horizon-daily-digest.ps1"
    weekly_task = ".harness/tasks/run-horizon-weekly-digest.ps1"
    daily_text = texts.get(daily_task, "")
    weekly_text = texts.get(weekly_task, "")
    if "horizon_daily_digest.py" in daily_text and "horizon_daily_digest.py" in weekly_text:
        findings.append(
            {
                "kind": "duplicate-horizon-wrapper",
                "classification": "rule-conflict",
                "action": "hold",
                "path": daily_task,
                "related_paths": [weekly_task, ".harness/scripts/horizon_daily_digest.py"],
                "reason": "Daily 与 Weekly wrapper 调用同一实现；先核对调度者和输出语义，再统一入口",
            }
        )
        for path in (daily_task, weekly_task):
            if path in by_path:
                by_path[path].update(
                    classification="rule-conflict",
                    action="hold",
                    recommended_action="normalize-after-scheduler-review",
                    reason="Daily/Weekly wrapper 均调用 horizon_daily_digest.py；保留兼容入口，暂不删除",
                )

    registry = parse_json_text(texts.get(".harness/config/source-registry.yaml"))
    digest_config = parse_json_text(texts.get(".harness/config/horizon-daily-digest.json"))
    schedules = (registry or {}).get("schedules", {})
    registry_schedule = str(
        schedules.get("horizon_weekly_digest")
        or schedules.get("weekly_review", "")
    )
    digest_schedule = (digest_config or {}).get("schedule", {})
    digest_day = ",".join(str(value) for value in digest_schedule.get("days_of_week", []))
    digest_time = str(digest_schedule.get("local_time", ""))
    if registry_schedule and digest_schedule and (registry_schedule != f"{digest_day} {digest_time}"):
        findings.append(
            {
                "kind": "schedule-drift",
                "classification": "rule-conflict",
                "action": "hold",
                "path": ".harness/config/source-registry.yaml",
                "related_paths": [".harness/config/horizon-daily-digest.json"],
                "reason": f"source registry horizon_weekly_digest={registry_schedule!r}，Horizon digest={digest_day} {digest_time!r}；需统一 Horizon digest 的活动时间",
            }
        )

    missing_path_markers = (
        "03-Resources/horizon/Daily",
        "03-Resources\\horizon\\Daily",
        "03-Resources/Daily",
        "03-Resources\\Daily",
    )
    for path, text in texts.items():
        active_rule_file = (
            path == "AGENTS.md"
            or path in {".harness/AGENTS.md", ".harness/WORKSPACE.md"}
            or path.startswith(".harness/config/")
            or path.startswith(".harness/state/")
            or path.startswith(".harness/tasks/")
        )
        if not active_rule_file:
            continue
        hits = [marker for marker in missing_path_markers if marker in text]
        if hits:
            findings.append(
                {
                    "kind": "stale-path-reference",
                    "classification": "conflict",
                    "action": "hold",
                    "path": path,
                    "related_paths": hits,
                    "reason": "文本引用了当前不存在或未纳入活动目录的 Daily 路径；只报告，不自动改写",
                }
            )
    return findings


def audit_workspace(root: Path, policy: dict[str, Any]) -> dict[str, Any]:
    root = validate_workspace_root(root, policy)
    paths = iter_files(root, policy)
    records, texts = build_records(root, paths)
    classify_legacy_records(records, texts, policy)
    classify_generated_records(root, records, texts, policy)
    find_references(records, texts)
    findings = collect_findings(root, records, texts)

    counts = Counter(record["classification"] for record in records)
    action_counts = Counter(record["action"] for record in records)
    return {
        "schema": "researchkb-maintenance-audit/v1",
        "run_id": f"maintenance-audit-{datetime.now().astimezone().strftime('%Y%m%d-%H%M%S')}",
        "generated_at": datetime.now().astimezone().isoformat(),
        "workspace_root": str(root),
        "policy_schema": policy.get("schema"),
        "disposal": policy.get("disposal", {}),
        "scope": policy.get("scope", {}),
        "summary": {
            "scanned_files": len(records),
            "classification_counts": dict(sorted(counts.items())),
            "action_counts": dict(sorted(action_counts.items())),
            "finding_count": len(findings),
            "archive_recommendation_count": sum(
                1 for record in records if record["recommended_action"].startswith("archive")
            ),
            "hold_count": sum(1 for record in records if record["action"] == "hold"),
        },
        "findings": findings,
        "records": records,
    }


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
    ) as handle:
        temporary = Path(handle.name)
        handle.write(content)
    temporary.replace(path)


def write_outputs(audit: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    root = Path(audit["workspace_root"]).resolve()
    harness = root / ".harness"
    output_dir = output_dir.resolve()
    if not path_is_within(output_dir, harness):
        raise AuditError(f"Audit output must remain under {harness}")
    output_dir.mkdir(parents=True, exist_ok=True)
    run_id = str(audit["run_id"])
    json_path = output_dir / f"{run_id}.json"
    markdown_path = output_dir / f"{run_id}.md"
    atomic_write(json_path, json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
    atomic_write(markdown_path, render_report(audit))
    return json_path, markdown_path


def render_report(audit: dict[str, Any]) -> str:
    summary = audit["summary"]
    lines = [
        f"# ResearchKB maintenance audit {audit['run_id']}",
        "",
        f"- 生成时间：{audit['generated_at']}",
        f"- 工作区：`{audit['workspace_root']}`",
        "- 处置模式：`archive-only`；本报告不执行移动、覆盖或删除",
        f"- 扫描文件：{summary['scanned_files']}",
        f"- 发现项：{summary['finding_count']}",
        f"- 建议归档：{summary['archive_recommendation_count']}",
        f"- 保守保留/待核对：{summary['hold_count']}",
        "",
        "## 分类统计",
        "",
        "| 分类 | 数量 |",
        "|---|---:|",
    ]
    for key, value in summary["classification_counts"].items():
        lines.append(f"| `{key}` | {value} |")
    lines.extend(["", "## 需要处理的文件", "", "| 路径 | 分类 | 动作 | 引用数 | 原因 |", "|---|---|---|---:|---|"])
    for record in audit["records"]:
        if record["classification"] == "keep":
            continue
        reason = str(record["reason"]).replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| `{record['path']}` | `{record['classification']}` | `{record['action']}` | "
            f"{len(record['references'])} | {reason} |"
        )
    if all(record["classification"] == "keep" for record in audit["records"]):
        lines.append("| — | `keep` | `keep` | 0 | 未发现文件级清理候选 |")
    lines.extend(["", "## 规则与路径发现", ""])
    if audit["findings"]:
        for finding in audit["findings"]:
            related = ", ".join(f"`{value}`" for value in finding.get("related_paths", []))
            suffix = f"；关联：{related}" if related else ""
            lines.append(
                f"- `{finding['classification']}` / `{finding['action']}`："
                f"`{finding['path']}` — {finding['reason']}{suffix}"
            )
    else:
        lines.append("- 未发现规则或路径冲突。")
    lines.extend(
        [
            "",
            "## 安全边界",
            "",
            "- `hold` 对象不应自动移动。",
            "- 本审计器没有永久删除或 apply 接口。",
            "- `_system`、`.obsidian`、`.claudian`、Horizon vendor 和外部任务不在扫描写入范围。",
            "",
        ]
    )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ResearchKB read-only maintenance audit")
    parser.add_argument("command", choices=("audit",), nargs="?", default="audit")
    parser.add_argument("--root", type=Path, default=WORKSPACE_ROOT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--no-write", action="store_true", help="只执行扫描，不写报告文件")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        policy = load_policy(args.config.resolve())
        root = args.root.resolve()
        audit = audit_workspace(root, policy)
        if args.no_write:
            print(json.dumps(audit["summary"], ensure_ascii=False, indent=2))
        else:
            json_path, markdown_path = write_outputs(audit, args.output_dir)
            print(json.dumps({
                "status": "AUDIT_COMPLETE",
                "run_id": audit["run_id"],
                "manifest": str(json_path),
                "report": str(markdown_path),
                "summary": audit["summary"],
            }, ensure_ascii=False, indent=2))
        return 0
    except (AuditError, OSError, json.JSONDecodeError) as exc:
        print(f"maintenance audit failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
