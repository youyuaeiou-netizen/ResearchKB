#!/usr/bin/env python3
"""Conservative RAW/Curated lifecycle foundation for ResearchKB.

The scanner inventories RAW and Curated.  The compile command creates stable,
reviewable Curated proposals below ``.harness/staging`` and may reuse the
existing v3 read-only Codex summarizer when explicitly requested.  It never
writes formal Curated cards, promotes Areas, records usage, moves files, or
deletes anything in this stage.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
DEFAULT_CONFIG = HARNESS_ROOT / "config" / "knowledge-lifecycle.json"

FRONTMATTER_RE = re.compile(r"\A\ufeff?---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.S)
KEY_VALUE_RE = re.compile(r"(?m)^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$")
REPORT_DATE_RE = re.compile(r"(?<!\d)(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?!\d)")
REPORT_WEEK_RE = re.compile(r"(?<!\d)(20\d{2})-W([0-5]\d)(?!\d)", re.IGNORECASE)
FAILURE_MARKERS = ("ERROR", "FAIL", "BLOCK", "EXCEPTION", "CRASH")


class LifecycleError(RuntimeError):
    pass


def normalize_rel(value: str | Path) -> str:
    normalized = str(value).replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")


def is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def rel_path(path: Path, root: Path) -> str:
    return normalize_rel(path.resolve().relative_to(root.resolve()))


def load_config(path: Path = DEFAULT_CONFIG) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LifecycleError(f"无法读取生命周期配置：{path}: {exc}") from exc
    if config.get("schema") != "researchkb-knowledge-lifecycle/v1":
        raise LifecycleError(f"生命周期配置 schema 不匹配：{config.get('schema')!r}")
    policy = config.get("policy", {})
    if policy.get("default_anomaly_action") != "hold":
        raise LifecycleError("生命周期异常默认动作必须为 hold")
    if policy.get("allow_permanent_delete") is not False:
        raise LifecycleError("生命周期阶段禁止永久删除")
    return config


def validate_root(root: Path, config: dict[str, Any]) -> Path:
    resolved = root.resolve()
    configured = config.get("workspace_root")
    configured_path = (Path(str(configured)) if Path(str(configured)).is_absolute() else WORKSPACE_ROOT / str(configured)).resolve() if configured else None
    if configured_path and configured_path != resolved:
        raise LifecycleError(
            f"workspace_root 不匹配：配置={configured_path}，实际={resolved}"
        )
    if not (resolved / ".harness").is_dir():
        raise LifecycleError(f"不是 ResearchKB 工作区：缺少 {resolved / '.harness'}")
    return resolved


def resolve_rel(root: Path, value: str) -> Path:
    rel = normalize_rel(value)
    if not rel or rel == "." or rel.startswith("../") or "/../" in f"/{rel}/":
        raise LifecycleError(f"非法相对路径：{value!r}")
    path = (root / Path(rel)).resolve()
    if not is_within(path, root):
        raise LifecycleError(f"路径越界：{value!r}")
    return path


def lifecycle_paths(root: Path, config: dict[str, Any]) -> dict[str, Path]:
    vault = config.get("vault_paths", {})
    harness = config.get("harness_paths", {})
    compile_config = config.get("compile", {})
    usage_config = config.get("usage", {})
    upgrade_config = config.get("upgrade", {})
    areas_config = config.get("areas", {})
    review_config = config.get("review", {})
    paths = {
        "raw": resolve_rel(root, str(vault["raw"])),
        "curated": resolve_rel(root, str(vault["curated"])),
        "curated_report_root": resolve_rel(root, str(vault["curated_report_root"])),
        "archive": resolve_rel(root, str(vault["archive"])),
        "areas": resolve_rel(root, str(vault.get("areas", "02-Areas"))),
        "state": resolve_rel(root, str(harness["state"])),
        "staging": resolve_rel(root, str(harness["staging"])),
        "runs": resolve_rel(root, str(harness["runs"])),
        "reports": resolve_rel(root, str(harness["reports"])),
        "report_packages": resolve_rel(
            root,
            str(harness.get("report_packages", ".harness/reports/Knowledge-Iteration")),
        ),
        "report_archive": resolve_rel(
            root,
            str(harness.get("report_archive", ".harness/archive/reports")),
        ),
        "proposal_root": resolve_rel(
            root,
            str(compile_config.get("proposal_root", ".harness/staging/knowledge-lifecycle/curated-proposals")),
        ),
        "usage_events": resolve_rel(
            root,
            str(usage_config.get("events_path", ".harness/state/knowledge-usage-events.jsonl")),
        ),
        "usage_aggregate": resolve_rel(
            root,
            str(usage_config.get("aggregate_path", ".harness/state/knowledge-usage.json")),
        ),
        "upgrade_state": resolve_rel(
            root,
            str(upgrade_config.get("decision_state_path", ".harness/state/knowledge-upgrade.json")),
        ),
        "areas_proposal_root": resolve_rel(
            root,
            str(areas_config.get("proposal_root", ".harness/staging/knowledge-lifecycle/areas-proposals")),
        ),
        "areas_state": resolve_rel(
            root,
            str(areas_config.get("state_path", ".harness/state/knowledge-areas.json")),
        ),
        "areas_auto_root": resolve_rel(
            root,
            str(areas_config.get("auto_root", "02-Areas/_Codex-Auto")),
        ),
        "review_proposal_root": resolve_rel(
            root,
            str(review_config.get("proposal_root", ".harness/staging/knowledge-lifecycle/quarterly-review")),
        ),
        "review_state_root": resolve_rel(
            root,
            str(review_config.get("state_root", ".harness/state/quarterly-review")),
        ),
        "review_report_root": resolve_rel(
            root,
            str(review_config.get("report_root", ".harness/reports/Quarterly-Review")),
        ),
    }
    if not is_within(paths["state"], root / ".harness"):
        raise LifecycleError("state 必须位于 .harness 内")
    if not is_within(paths["staging"], root / ".harness"):
        raise LifecycleError("staging 必须位于 .harness 内")
    if not is_within(paths["runs"], root / ".harness"):
        raise LifecycleError("runs 必须位于 .harness 内")
    if not is_within(paths["reports"], root / ".harness"):
        raise LifecycleError("reports 必须位于 .harness 内")
    if not is_within(paths["report_packages"], root / ".harness"):
        raise LifecycleError("report_packages 必须位于 .harness 内")
    if not is_within(paths["report_archive"], root / ".harness"):
        raise LifecycleError("report_archive 必须位于 .harness 内")
    if not is_within(paths["proposal_root"], root / ".harness"):
        raise LifecycleError("proposal_root 必须位于 .harness 内")
    if not is_within(paths["usage_events"], root / ".harness"):
        raise LifecycleError("usage_events 必须位于 .harness 内")
    if not is_within(paths["usage_aggregate"], root / ".harness"):
        raise LifecycleError("usage_aggregate 必须位于 .harness 内")
    if not is_within(paths["upgrade_state"], root / ".harness"):
        raise LifecycleError("upgrade_state 必须位于 .harness 内")
    if not is_within(paths["areas"], root / "02-Areas"):
        raise LifecycleError("areas 必须位于 02-Areas 内")
    if not is_within(paths["areas_proposal_root"], root / ".harness"):
        raise LifecycleError("areas_proposal_root 必须位于 .harness 内")
    if not is_within(paths["areas_state"], root / ".harness"):
        raise LifecycleError("areas_state 必须位于 .harness 内")
    if not is_within(paths["areas_auto_root"], paths["areas"]):
        raise LifecycleError("areas_auto_root 必须位于 02-Areas 内")
    if not is_within(paths["review_proposal_root"], root / ".harness"):
        raise LifecycleError("review_proposal_root 必须位于 .harness 内")
    if not is_within(paths["review_state_root"], root / ".harness"):
        raise LifecycleError("review_state_root 必须位于 .harness 内")
    if not is_within(paths["review_report_root"], root / ".harness"):
        raise LifecycleError("review_report_root 必须位于 .harness 内")
    return paths


def required_directories(root: Path, config: dict[str, Any]) -> list[Path]:
    paths = lifecycle_paths(root, config)
    directories = [
        paths["raw"],
        paths["curated"],
        paths["curated_report_root"],
        paths["staging"],
        paths["runs"],
        paths["reports"],
        paths["report_packages"],
        paths["areas_proposal_root"],
        paths["review_proposal_root"],
        paths["review_state_root"],
        paths["review_report_root"],
    ]
    directories.extend(paths["curated"] / str(category) for category in config.get("curated_categories", []))
    return directories


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
    ) as handle:
        temporary = Path(handle.name)
        handle.write(content)
    temporary.replace(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_frontmatter(path: Path) -> dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return {}
    match = FRONTMATTER_RE.search(text)
    if not match:
        return {}
    return {
        key: value.strip().strip('"\'')
        for key, value in KEY_VALUE_RE.findall(match.group(1))
    }


def iter_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    result: list[Path] = []
    for current, directories, files in os.walk(directory, topdown=True, followlinks=False):
        current_path = Path(current)
        directories[:] = [
            name for name in directories
            if not (current_path / name).is_symlink() and name not in {".git", "__pycache__"}
        ]
        for name in files:
            path = current_path / name
            if not path.is_symlink():
                result.append(path.resolve())
    return sorted(result, key=lambda value: str(value).lower())


def initialize(root: Path, config: dict[str, Any], apply: bool) -> dict[str, Any]:
    directories = required_directories(root, config)
    operations = [
        {
            "operation": "create_directory",
            "path": rel_path(directory, root),
            "already_exists": directory.is_dir(),
        }
        for directory in directories
    ]
    state_path = lifecycle_paths(root, config)["state"]
    state_created = False
    if apply:
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
        if not state_path.exists():
            state = {
                "schema": "researchkb-knowledge-lifecycle-state/v1",
                "status": "initialized",
                "initialized_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "last_run_id": None,
                "last_run_at": None,
                "last_summary": None,
            }
            atomic_write(state_path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")
            state_created = True
    return {
        "status": "INITIALIZED" if apply else "DRY_RUN_READY",
        "applied": apply,
        "directories": operations,
        "state_path": rel_path(state_path, root),
        "state_created": state_created,
        "formal_card_writes": 0,
        "deletions": 0,
    }


def scan_workspace(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    paths = lifecycle_paths(root, config)
    missing = [rel_path(path, root) for path in required_directories(root, config) if not path.is_dir()]
    raw_files = iter_files(paths["raw"])
    curated_files = [path for path in iter_files(paths["curated"]) if path.suffix.lower() == ".md"]

    raw_records: list[dict[str, Any]] = []
    raw_by_hash: defaultdict[str, list[str]] = defaultdict(list)
    for path in raw_files:
        digest = sha256_file(path)
        relative = rel_path(path, root)
        raw_by_hash[digest].append(relative)
        stat = path.stat()
        raw_records.append(
            {
                "path": relative,
                "raw_id": f"raw-{digest[:16]}",
                "sha256": digest,
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(),
            }
        )

    curated_records: list[dict[str, Any]] = []
    curated_by_id: defaultdict[str, list[str]] = defaultdict(list)
    required = [str(field) for field in config.get("curated_required_fields", [])]
    missing_fields: list[dict[str, Any]] = []
    for path in curated_files:
        relative = rel_path(path, root)
        frontmatter = parse_frontmatter(path)
        curated_id = frontmatter.get("id", "")
        if curated_id:
            curated_by_id[curated_id].append(relative)
        absent = [field for field in required if not frontmatter.get(field)]
        if absent:
            missing_fields.append({"path": relative, "missing": absent})
        curated_records.append(
            {
                "path": relative,
                "id": curated_id,
                "title": frontmatter.get("title", ""),
                "sources": frontmatter.get("sources", ""),
                "source_items": frontmatter.get("source_items", ""),
                "source_sha256": frontmatter.get("source_sha256", ""),
                "sha256": sha256_file(path),
                "missing_fields": absent,
            }
        )

    duplicate_raw = {digest: values for digest, values in raw_by_hash.items() if len(values) > 1}
    duplicate_curated = {curated_id: values for curated_id, values in curated_by_id.items() if len(values) > 1}
    status = "OK"
    if missing:
        status = "NOT_INITIALIZED"
    elif missing_fields or duplicate_raw or duplicate_curated:
        status = "OK_WITH_WARNINGS"
    elif not raw_records and not curated_records:
        status = "OK_EMPTY"

    return {
        "schema": "researchkb-knowledge-lifecycle-scan/v1",
        "status": status,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "workspace_root": str(root),
        "paths": {key: rel_path(value, root) for key, value in paths.items()},
        "missing_directories": missing,
        "raw": {
            "files": raw_records,
            "count": len(raw_records),
            "duplicate_hash_groups": duplicate_raw,
        },
        "curated": {
            "cards": curated_records,
            "count": len(curated_records),
            "missing_required_fields": missing_fields,
            "duplicate_id_groups": duplicate_curated,
        },
        "automation": {
            "curated_generation": "staging_proposal_only",
            "auto_curated_promotion": bool(config.get("policy", {}).get("auto_curated_promotion", False)),
            "auto_areas_promotion": bool(config.get("policy", {}).get("auto_areas_promotion", False)),
            "usage_recording": False,
            "default_anomaly_action": "hold",
        },
    }


def safe_component(value: str, fallback: str = "item") -> str:
    component = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value)).strip(".-")
    return component or fallback


def compile_title(path: Path) -> str:
    title = path.stem.strip().replace("_", " ")
    return title or "Untitled RAW source"


def read_raw_excerpt(path: Path, config: dict[str, Any], limit: int = 4000) -> str:
    extensions = {
        str(value).lower()
        for value in (config.get("compile", {}).get("text_extensions", []) or [])
    }
    if path.suffix.lower() not in extensions:
        return ""
    try:
        data = path.read_bytes()
    except OSError:
        return ""
    if b"\x00" in data[:8192]:
        return ""
    text = data.decode("utf-8", errors="replace")
    return text[:limit].strip()


def build_compile_item(root: Path, record: dict[str, Any], excerpt: str) -> dict[str, Any]:
    relative = str(record["path"])
    digest = str(record["sha256"])
    return {
        "source_id": f"raw:{digest[:16]}",
        "adapter": "raw-vault",
        "title": compile_title(Path(relative)),
        "authors": [],
        "year": "",
        "doi": "",
        "url": "",
        "source_path": relative,
        "source_identity": f"content:{digest}",
        "source_identity_kind": "content_sha256",
        "source_sha256": digest,
        "excerpt": excerpt,
        "evidence_anchor": f"RAW file {relative}; SHA-256 {digest}",
        "evidence_kind": "raw-file",
        "tags": [],
        "raw": {"path": relative, "size": record["size"]},
    }


def load_v3_module() -> Any:
    script = HARNESS_ROOT / "scripts" / "researchkb_v3.py"
    spec = importlib.util.spec_from_file_location("researchkb_v3_for_lifecycle", script)
    if not spec or not spec.loader:
        raise LifecycleError(f"无法加载现有 v3 编译器：{script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_source_registry() -> dict[str, Any]:
    path = HARNESS_ROOT / "config" / "source-registry.yaml"
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LifecycleError(f"无法读取现有 source registry：{path}: {exc}") from exc
    if not isinstance(value, dict):
        raise LifecycleError(f"source registry 不是对象：{path}")
    return value


def run_reused_codex_summary(
    item: dict[str, Any],
    run_dir: Path,
) -> tuple[str, dict[str, Any]]:
    """Reuse v3's existing read-only Codex adapter for a staged proposal."""
    module = load_v3_module()
    return module.codex_summary(item, load_source_registry(), run_dir)


def new_run_id(root: Path, config: dict[str, Any], prefix: str) -> str:
    timestamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    paths = lifecycle_paths(root, config)
    for suffix in range(1, 100):
        marker = "" if suffix == 1 else f"-{suffix}"
        run_id = f"{prefix}-{timestamp}{marker}"
        candidates = (
            paths["runs"] / f"{run_id}.json",
            paths["reports"] / f"{run_id}.md",
            paths["proposal_root"] / run_id,
        )
        if not any(candidate.exists() for candidate in candidates):
            return run_id
    raise LifecycleError(f"无法生成唯一运行 ID：{prefix}-{timestamp}")


def proposal_markdown(proposal: dict[str, Any], *, formal: bool = False) -> str:
    def quote(value: Any) -> str:
        return json.dumps(str(value), ensure_ascii=False)

    sources = json.dumps(proposal["sources"], ensure_ascii=False)
    source_items = json.dumps(proposal["source_items"], ensure_ascii=False)
    record_kind = "curated" if formal else "curated-proposal"
    promotion_status = "applied-with-human-review-pending" if formal else "staged"
    lines = [
        "---",
        f"record_kind: {quote(record_kind)}",
        f"promotion_status: {quote(promotion_status)}",
        f"id: {quote(proposal['curated_id'])}",
        f"title: {quote(proposal['title'])}",
        f"status: {quote(proposal['status'])}",
        f"review_status: {quote(proposal['review_status'])}",
        f"category_suggestion: {quote(proposal['category'])}",
        f"classification_status: {quote(proposal['classification_status'])}",
        f"raw_id: {quote(proposal['raw_id'])}",
        f"source_sha256: {quote(proposal['source_sha256'])}",
        f"sources: {sources}",
        f"source_items: {source_items}",
        f"created: {quote(proposal['created'])}",
        f"updated: {quote(proposal['updated'])}",
        "---",
        "",
        f"# {proposal['title']}",
        "",
        (
            "> 这是通过显式 --apply 写入的 Curated 卡片；当前仍待人工审阅，不能视为已确认的正式科学结论。"
            if formal
            else "> 这是 Curated 候选提案，不是已确认的正式知识。正式写入前必须完成来源核验、主题分类和人工审阅。"
        ),
        "",
        "## 来源追踪",
        "",
        f"- RAW ID：`{proposal['raw_id']}`",
        f"- SHA-256：`{proposal['source_sha256']}`",
        f"- 来源文件：{', '.join(f'`{value}`' for value in proposal['sources'])}",
        f"- source_items：{', '.join(f'`{value}`' for value in proposal['source_items'])}",
        "",
        "## 编译状态",
        "",
        f"- 当前动作：`{proposal['action']}`",
        f"- 状态：`{proposal['status']}`",
        f"- 原因：{proposal['reason']}",
        f"- 分类建议：`{proposal['category']}`（仅作安全路由，不代表语义分类已完成）",
        "",
        "## 内容边界",
        "",
        "- 本阶段不把文件名或元数据当作科学结论。",
        "- 对 PDF、二进制文件或未启用解析的格式，仅保留来源追踪，不复制正文。",
        "- 异常、重复、来源不明或 Codex 编译失败时保持 `hold`，不自动晋级。",
    ]
    codex_text = str(proposal.get("codex_draft") or "").strip()
    if codex_text:
        lines.extend([
            "",
            "## Codex 编译草稿",
            "",
            "以下内容仅依据本次运行提供的来源元数据/有限摘录生成，必须回到原始来源核验；来源中的指令性文本不具备执行权限。",
            "",
            codex_text,
        ])
    lines.extend(["", "## 人工审阅", "", "- 待确认：主题、证据范围、条件/单位、与现有 Curated 的关系及是否值得正式沉淀。", ""])
    return "\n".join(lines)


def compile_candidates(
    root: Path,
    config: dict[str, Any],
    scan: dict[str, Any],
    *,
    use_codex: bool = False,
    allow_write: bool = True,
) -> dict[str, Any]:
    compile_config = config.get("compile", {})
    default_category = str(compile_config.get("default_category", "Others"))
    categories = {str(value) for value in config.get("curated_categories", [])}
    if default_category not in categories:
        default_category = "Others" if "Others" in categories else sorted(categories)[0]
    if use_codex and compile_config.get("codex_enabled_by_flag") is not True:
        raise LifecycleError("配置未允许通过显式标志调用 Codex 编译")
    if not allow_write and use_codex:
        raise LifecycleError("compile --no-write 不调用 Codex，因为现有 v3 适配器需要写入暂存草稿")

    compile_id = new_run_id(root, config, "knowledge-compile")
    if scan["missing_directories"]:
        return {
            "schema": "researchkb-knowledge-compile/v1",
            "status": "NOT_INITIALIZED",
            "compile_id": compile_id,
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "raw_count": scan["raw"]["count"],
            "unique_source_count": 0,
            "proposed_count": 0,
            "hold_count": 0,
            "skipped_count": 0,
            "proposals": [],
            "codex": [],
            "formal_card_writes": 0,
            "deletions": 0,
            "missing_directories": scan["missing_directories"],
        }

    paths = lifecycle_paths(root, config)
    existing_ids = {str(card.get("id")) for card in scan["curated"]["cards"] if card.get("id")}
    existing_hashes = {
        str(card.get("source_sha256"))
        for card in scan["curated"]["cards"]
        if card.get("source_sha256")
    }
    raw_groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in scan["raw"]["files"]:
        raw_groups[str(record["sha256"])].append(record)

    codex_run_dir = paths["proposal_root"] / compile_id
    if use_codex and allow_write:
        codex_run_dir.mkdir(parents=True, exist_ok=True)

    proposals: list[dict[str, Any]] = []
    codex_statuses: list[dict[str, Any]] = []
    codex_budget = int(compile_config.get("max_items_per_run", 5))
    codex_used = 0
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    for digest in sorted(raw_groups):
        records = sorted(raw_groups[digest], key=lambda value: str(value["path"]).lower())
        source_items = [str(value["path"]) for value in records]
        canonical = records[0]
        curated_id = f"curated-{digest[:16]}"
        title = compile_title(Path(str(canonical["path"])))
        proposal = {
            "curated_id": curated_id,
            "title": title,
            "category": default_category,
            "classification_status": "needs-codex-review",
            "raw_id": str(canonical["raw_id"]),
            "source_sha256": digest,
            "sources": source_items,
            "source_items": source_items,
            "created": generated_at,
            "updated": generated_at,
            "action": "hold",
            "status": "pending-human-review",
            "review_status": "pending",
            "reason": "",
            "codex": {"status": "NOT_REQUESTED"},
            "codex_draft": "",
        }
        if curated_id in existing_ids or digest in existing_hashes:
            proposal["action"] = "skip"
            proposal["status"] = "already-curated"
            proposal["reason"] = "已有 Curated 卡片通过稳定 ID 或 source_sha256 关联该来源"
        elif len(records) > 1:
            proposal["reason"] = "多个 RAW 文件内容哈希相同，等待人工确认保留哪一个来源路径"
            proposal["codex"]["status"] = "SKIPPED_DUPLICATE"
        elif use_codex and codex_used < codex_budget:
            excerpt = read_raw_excerpt(Path(root / str(canonical["path"])), config)
            item = build_compile_item(root, canonical, excerpt)
            codex_used += 1
            try:
                codex_text, codex_status = run_reused_codex_summary(item, codex_run_dir)
            except (OSError, LifecycleError, ImportError) as exc:
                codex_text = ""
                codex_status = {"status": "ERROR", "error": str(exc)}
            proposal["codex"] = codex_status
            proposal["codex_draft"] = codex_text
            codex_statuses.append({"curated_id": curated_id, **codex_status})
            if codex_status.get("status") == "OK" and codex_text.strip():
                proposal["action"] = "propose"
                proposal["reason"] = "已生成 Codex 编译草稿，仍需人工审阅后才能进入正式 Curated"
            else:
                proposal["reason"] = "Codex 编译未成功，保留待处理，不自动晋级"
        elif use_codex:
            proposal["codex"] = {"status": "SKIPPED_BUDGET"}
            proposal["reason"] = "达到本次运行 Codex 项目数上限，保留待下次周编译"
        else:
            proposal["reason"] = "未请求 Codex 语义编译，仅生成来源提案；保持 hold"
        proposals.append(proposal)

    proposed_count = sum(1 for item in proposals if item["action"] == "propose")
    hold_count = sum(1 for item in proposals if item["action"] == "hold")
    skipped_count = sum(1 for item in proposals if item["action"] == "skip")
    if not proposals:
        status = "OK_EMPTY"
    elif proposed_count:
        status = "STAGING_PROPOSALS_READY"
    else:
        status = "STAGING_HOLDS_ONLY"
    return {
        "schema": "researchkb-knowledge-compile/v1",
        "status": status,
        "compile_id": compile_id,
        "generated_at": generated_at,
        "raw_count": scan["raw"]["count"],
        "unique_source_count": len(raw_groups),
        "proposed_count": proposed_count,
        "hold_count": hold_count,
        "skipped_count": skipped_count,
        "proposals": proposals,
        "codex": codex_statuses,
        "formal_card_writes": 0,
        "deletions": 0,
        "formal_curated_apply": False,
        "staging_root": rel_path(paths["proposal_root"], root),
        "default_category": default_category,
    }


def update_compile_state(root: Path, config: dict[str, Any], result: dict[str, Any]) -> None:
    state_path = lifecycle_paths(root, config)["state"]
    previous: dict[str, Any] = {}
    if state_path.exists():
        try:
            previous = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = {}
    state = dict(previous)
    state.update({
        "schema": "researchkb-knowledge-lifecycle-state/v1",
        "status": "active",
        "last_compile_id": result["compile_id"],
        "last_compile_at": result["generated_at"],
        "last_compile_summary": {
            "status": result["status"],
            "raw_count": result["raw_count"],
            "unique_source_count": result["unique_source_count"],
            "proposed_count": result["proposed_count"],
            "hold_count": result["hold_count"],
            "skipped_count": result["skipped_count"],
            "formal_card_writes": result.get("formal_card_writes", 0),
        },
    })
    atomic_write(state_path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def render_compile_report(result: dict[str, Any]) -> str:
    lines = [
        f"# ResearchKB Curated compile {result['compile_id']}",
        "",
        f"- 状态：`{result['status']}`",
        f"- 生成时间：{result['generated_at']}",
        f"- RAW 文件：{result['raw_count']}",
        f"- 唯一内容源：{result['unique_source_count']}",
        f"- 待审阅提案：{result['proposed_count']}",
        f"- 保留 hold：{result['hold_count']}",
        f"- 已有 Curated 而跳过：{result['skipped_count']}",
        f"- Codex 调用记录：{len(result['codex'])}",
        f"- 正式 Curated 写入：{result.get('formal_card_writes', 0)}",
        "",
        "## 本阶段边界",
        "",
        "- 提案先写入 `.harness/staging`；只有显式 `--apply` 且满足写入条件时才写入正式 `03-Resources/Curated`。",
        "- 稳定 Curated ID 由 RAW 内容 SHA-256 派生；同内容多路径默认 hold。",
        "- `sources` 与 `source_items` 同时保留来源路径，便于后续来源追踪和去重。",
        "- 未请求 Codex、来源重复、已有正式关联、Codex 失败或目标文件已存在时均不写入。",
        "- 本阶段不写 Areas、不记录 usage、不执行 90 天升级、不移动或删除 RAW。",
        "",
    ]
    if result.get("proposals"):
        lines.extend(["## 提案明细", "", "| Curated ID | 动作 | 分类建议 | 来源 | 原因 |", "|---|---|---|---|---|"])
        for item in result["proposals"]:
            sources = "<br>".join(f"`{value}`" for value in item["sources"])
            reason = str(item["reason"]).replace("|", "\\|")
            lines.append(
                f"| `{item['curated_id']}` | `{item['action']}` | `{item['category']}` | {sources} | {reason} |"
            )
        lines.append("")
    return "\n".join(lines)


def persist_compile_outputs(root: Path, config: dict[str, Any], result: dict[str, Any]) -> None:
    paths = lifecycle_paths(root, config)
    compile_id = str(result["compile_id"])
    staging_dir = paths["proposal_root"] / compile_id
    manifest_path = staging_dir / "compile-manifest.json"
    run_path = paths["runs"] / f"{compile_id}.json"
    report_path = paths["reports"] / f"{compile_id}.md"
    paths["runs"].mkdir(parents=True, exist_ok=True)
    paths["reports"].mkdir(parents=True, exist_ok=True)
    atomic_write(manifest_path, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    atomic_write(run_path, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    atomic_write(report_path, render_compile_report(result))
    update_compile_state(root, config, result)


def write_compile_outputs(root: Path, config: dict[str, Any], result: dict[str, Any]) -> dict[str, str]:
    paths = lifecycle_paths(root, config)
    compile_id = str(result["compile_id"])
    staging_dir = paths["proposal_root"] / compile_id
    staging_dir.mkdir(parents=True, exist_ok=True)
    for proposal in result["proposals"]:
        if proposal["action"] not in {"propose", "hold"}:
            continue
        category_dir = staging_dir / "curated" / safe_component(str(proposal["category"]), "others")
        proposal_path = category_dir / f"{safe_component(str(proposal['curated_id']))}.md"
        atomic_write(proposal_path, proposal_markdown(proposal))
        proposal["staging_path"] = rel_path(proposal_path, root)

    persist_compile_outputs(root, config, result)
    manifest_path = staging_dir / "compile-manifest.json"
    run_path = paths["runs"] / f"{compile_id}.json"
    report_path = paths["reports"] / f"{compile_id}.md"
    return {
        "compile_id": compile_id,
        "staging": str(staging_dir),
        "manifest": str(manifest_path),
        "run": str(run_path),
        "report": str(report_path),
    }


def apply_formal_proposals(root: Path, config: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """Apply only successful, non-duplicate proposals; never overwrite a card."""
    compile_config = config.get("compile", {})
    if compile_config.get("allow_formal_curated_apply") is not True:
        raise LifecycleError("配置未允许正式 Curated apply；保持默认 hold")
    paths = lifecycle_paths(root, config)
    created: list[str] = []
    held: list[dict[str, str]] = []
    for proposal in result["proposals"]:
        if proposal.get("action") != "propose":
            continue
        codex = proposal.get("codex") if isinstance(proposal.get("codex"), dict) else {}
        if codex.get("status") != "OK" or not str(proposal.get("codex_draft") or "").strip():
            proposal["action"] = "hold"
            proposal["reason"] = "缺少成功的 Codex 编译草稿，拒绝正式写入"
            held.append({"curated_id": proposal["curated_id"], "reason": proposal["reason"]})
            continue
        staging_value = proposal.get("staging_path")
        if not staging_value:
            proposal["action"] = "hold"
            proposal["reason"] = "缺少 staging 路径，拒绝正式写入"
            held.append({"curated_id": proposal["curated_id"], "reason": proposal["reason"]})
            continue
        staging_path = resolve_rel(root, str(staging_value))
        if not is_within(staging_path, paths["proposal_root"]) or not staging_path.is_file():
            proposal["action"] = "hold"
            proposal["reason"] = "staging 路径越界或文件不存在，拒绝正式写入"
            held.append({"curated_id": proposal["curated_id"], "reason": proposal["reason"]})
            continue
        category = str(proposal["category"])
        if category not in {str(value) for value in config.get("curated_categories", [])}:
            proposal["action"] = "hold"
            proposal["reason"] = "分类不在受控 Curated 目录清单内，拒绝正式写入"
            held.append({"curated_id": proposal["curated_id"], "reason": proposal["reason"]})
            continue
        target = paths["curated"] / category / f"{safe_component(str(proposal['curated_id']))}.md"
        if not is_within(target, paths["curated"]) or target.suffix.lower() != ".md":
            raise LifecycleError(f"正式 Curated 路径越界：{target}")
        if target.exists():
            proposal["action"] = "hold"
            proposal["reason"] = "正式目标文件已存在，拒绝覆盖"
            held.append({"curated_id": proposal["curated_id"], "reason": proposal["reason"]})
            continue
        formal_proposal = dict(proposal)
        formal_proposal["action"] = "applied"
        formal_proposal["status"] = "curated-pending-review"
        formal_proposal["reason"] = "显式 --apply 已写入 Curated，仍待人工审阅"
        formal_proposal["formal_path"] = rel_path(target, root)
        atomic_write(target, proposal_markdown(formal_proposal, formal=True))
        proposal.update({
            "action": "applied",
            "status": "curated-pending-review",
            "reason": "显式 --apply 已写入 Curated，仍待人工审阅",
            "formal_path": rel_path(target, root),
        })
        created.append(rel_path(target, root))
    result["formal_card_writes"] = len(created)
    result["formal_curated_apply"] = True
    result["formal_apply"] = {
        "status": "APPLIED" if created else "NO_OP",
        "created": created,
        "held": held,
        "deletions": 0,
    }
    if created:
        result["status"] = "CURATED_APPLIED"
    return result


def iso_report_period(value: datetime) -> str:
    calendar = value.isocalendar()
    return f"{calendar.year}-W{calendar.week:02d}"


def report_period_from_text(value: str) -> str:
    week_match = REPORT_WEEK_RE.search(value)
    if week_match:
        return f"{week_match.group(1)}-W{int(week_match.group(2)):02d}"
    date_match = REPORT_DATE_RE.search(value)
    if date_match:
        try:
            parsed = datetime(
                int(date_match.group(1)),
                int(date_match.group(2)),
                int(date_match.group(3)),
            )
            return iso_report_period(parsed)
        except ValueError:
            return ""
    return ""


def quarter_from_period(period: str) -> str:
    match = REPORT_WEEK_RE.fullmatch(period)
    if not match:
        return ""
    try:
        parsed = datetime.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)
    except ValueError:
        return ""
    return f"{parsed.year}-Q{((parsed.month - 1) // 3) + 1}"


def report_unit_sha256(path: Path) -> str:
    if path.is_file():
        return sha256_file(path)
    digest = hashlib.sha256()
    for child in iter_files(path):
        digest.update(str(child.relative_to(path)).replace("\\", "/").encode("utf-8"))
        digest.update(sha256_file(child).encode("ascii"))
    return digest.hexdigest()


def report_unit_text(path: Path, limit: int = 65536) -> str:
    files = [path] if path.is_file() else iter_files(path)
    chunks: list[str] = []
    remaining = limit
    for child in files:
        if remaining <= 0:
            break
        try:
            data = child.read_bytes()[:remaining]
        except OSError:
            continue
        chunks.append(data.decode("utf-8", errors="replace"))
        remaining -= len(data)
    return "\n".join(chunks)


def iter_report_units(root: Path, reports_root: Path) -> list[dict[str, Any]]:
    if not reports_root.is_dir():
        return []
    units: list[dict[str, Any]] = []
    for entry in sorted(reports_root.iterdir(), key=lambda value: str(value).lower()):
        if entry.is_symlink():
            continue
        if entry.is_dir():
            files = iter_files(entry)
            if not files:
                continue
            size = sum(child.stat().st_size for child in files)
            modified_at = max(child.stat().st_mtime for child in files)
        elif entry.is_file():
            files = [entry]
            size = entry.stat().st_size
            modified_at = entry.stat().st_mtime
        else:
            continue
        relative = rel_path(entry, root)
        period = report_period_from_text(relative)
        if not period:
            for child in files:
                period = report_period_from_text(str(child))
                if period:
                    break
        text = report_unit_text(entry)
        upper = f"{relative}\n{text}".upper()
        failed = any(marker in upper for marker in FAILURE_MARKERS)
        reports_relative = normalize_rel(entry.resolve().relative_to(reports_root.resolve()))
        units.append({
            "path": relative,
            "relative_to_reports": reports_relative,
            "kind": "directory" if entry.is_dir() else "file",
            "size": size,
            "modified_at": datetime.fromtimestamp(modified_at).astimezone().isoformat(timespec="seconds"),
            "mtime": modified_at,
            "sha256": report_unit_sha256(entry),
            "period": period,
            "quarter": quarter_from_period(period),
            "failed": failed,
        })
    return units


def evaluate_report_retention(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    paths = lifecycle_paths(root, config)
    units = iter_report_units(root, paths["reports"])
    retention = config.get("retention", {})
    threshold = int(retention.get("report_space_threshold_bytes", 209715200))
    total_bytes = sum(int(unit["size"]) for unit in units)
    threshold_reached = total_bytes > threshold
    keep_latest_count = int(retention.get("report_keep_latest", 12))
    ordered = sorted(units, key=lambda item: float(item["mtime"]), reverse=True)
    latest_paths = {item["path"] for item in ordered[:keep_latest_count]}
    quarterly_paths: dict[str, str] = {}
    if retention.get("preserve_quarterly_reports") is True:
        for unit in ordered:
            quarter = str(unit.get("quarter") or "")
            if quarter and quarter not in quarterly_paths:
                quarterly_paths[quarter] = str(unit["path"])

    for unit in units:
        if not threshold_reached:
            unit["action"] = "keep-below-threshold"
            unit["reason"] = "Reports 空间未超过配置阈值"
        elif unit["path"] in latest_paths:
            unit["action"] = "keep-latest"
            unit["reason"] = f"保留最新 {keep_latest_count} 个报告单元"
        elif unit["path"] in set(quarterly_paths.values()):
            unit["action"] = "keep-quarterly"
            unit["reason"] = "保留季度代表报告"
        elif unit["failed"] and retention.get("preserve_failed_runs") is True:
            unit["action"] = "hold-failed"
            unit["reason"] = "检测到失败标记，保守保留"
        elif unit["period"]:
            unit["action"] = "archive-candidate"
            unit["reason"] = "超过空间阈值且不属于最新/季度/失败保留集合"
        else:
            unit["action"] = "hold"
            unit["reason"] = "报告日期无法可靠识别，默认保留"
        unit.pop("mtime", None)
    archive_candidates = [unit for unit in units if unit["action"] == "archive-candidate"]
    return {
        "unit_count": len(units),
        "total_bytes": total_bytes,
        "threshold_bytes": threshold,
        "threshold_reached": threshold_reached,
        "keep_latest_count": keep_latest_count,
        "quarterly_representatives": quarterly_paths,
        "archive_candidate_count": len(archive_candidates),
        "units": units,
    }


def integer_frontmatter(value: str) -> int:
    try:
        return max(0, int(str(value).strip()))
    except (TypeError, ValueError):
        return 0


def evaluate_raw_retention(root: Path, config: dict[str, Any], scan: dict[str, Any]) -> dict[str, Any]:
    paths = lifecycle_paths(root, config)
    retention = config.get("retention", {})
    max_age = int(retention.get("raw_max_age_days", 180))
    archive_root = resolve_rel(root, str(retention.get("raw_archive_root", "04-Archive/RAW")))
    if not is_within(archive_root, paths["archive"]):
        raise LifecycleError("raw_archive_root 必须位于 04-Archive 内")
    evaluations: list[dict[str, Any]] = []
    now = datetime.now().astimezone()
    for record in scan["raw"]["files"]:
        source = resolve_rel(root, str(record["path"]))
        modified = datetime.fromtimestamp(source.stat().st_mtime).astimezone()
        age_days = max(0, int((now - modified).total_seconds() // 86400))
        frontmatter = parse_frontmatter(source)
        usage_count = integer_frontmatter(frontmatter.get("usage_count", "0"))
        last_used = frontmatter.get("last_used", "").strip()
        value = (frontmatter.get("value") or frontmatter.get("knowledge_value") or "").strip().lower()
        explicit_action = (frontmatter.get("retention_action") or "").strip().lower()
        if age_days <= max_age:
            action = "keep"
            reason = f"未超过 RAW {max_age} 天评估窗口"
        elif explicit_action == "archive" and usage_count == 0 and not last_used and value in {"low", "none", "zero"}:
            action = "archive-candidate"
            reason = "超过生命周期且来源明确标记为低价值、无使用"
        else:
            action = "hold"
            reason = "超过生命周期但缺少可信 usage/value 判据，保守保留"
        evaluations.append({
            "path": record["path"],
            "raw_id": record["raw_id"],
            "sha256": record["sha256"],
            "size": record["size"],
            "modified_at": record["modified_at"],
            "age_days": age_days,
            "usage_count": usage_count,
            "last_used": last_used,
            "value": value,
            "retention_action": explicit_action,
            "action": action,
            "reason": reason,
            "archive_path": rel_path(archive_root / Path(str(record["path"])), root),
        })
    return {
        "max_age_days": max_age,
        "archive_root": rel_path(archive_root, root),
        "file_count": len(evaluations),
        "archive_candidate_count": sum(1 for item in evaluations if item["action"] == "archive-candidate"),
        "evaluations": evaluations,
    }


def load_latest_compile_result(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    paths = lifecycle_paths(root, config)
    candidates = sorted(
        paths["runs"].glob("knowledge-compile-*.json"),
        key=lambda value: value.stat().st_mtime,
        reverse=True,
    )
    for path in candidates:
        try:
            result = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(result, dict):
            return result
    return {}


def build_iteration_result(root: Path, config: dict[str, Any], scan: dict[str, Any]) -> dict[str, Any]:
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    period = iso_report_period(datetime.now().astimezone())
    iteration_id = f"knowledge-iteration-{period}-{datetime.now().astimezone().strftime('%Y%m%d-%H%M%S')}"
    compile_result = load_latest_compile_result(root, config)
    raw_retention = evaluate_raw_retention(root, config, scan)
    report_retention = evaluate_report_retention(root, config)
    compile_summary = {
        key: compile_result.get(key)
        for key in (
            "compile_id",
            "status",
            "raw_count",
            "unique_source_count",
            "proposed_count",
            "hold_count",
            "skipped_count",
            "formal_card_writes",
        )
        if key in compile_result
    }
    return {
        "schema": "researchkb-knowledge-iteration/v1",
        "iteration_id": iteration_id,
        "report_period": period,
        "generated_at": generated_at,
        "status": "OK_WITH_HOLDS" if raw_retention["archive_candidate_count"] or report_retention["archive_candidate_count"] else "OK",
        "paths": {
            "harness_package_root": rel_path(lifecycle_paths(root, config)["report_packages"], root),
            "formal_report_root": rel_path(lifecycle_paths(root, config)["curated_report_root"], root),
        },
        "input": {
            "raw_count": scan["raw"]["count"],
            "raw_duplicate_hash_groups": len(scan["raw"]["duplicate_hash_groups"]),
            "raw_retention": raw_retention,
        },
        "curated": {
            "card_count": scan["curated"]["count"],
            "missing_required_fields": scan["curated"]["missing_required_fields"],
            "duplicate_id_groups": scan["curated"]["duplicate_id_groups"],
            "compile": compile_summary,
        },
        "promotion": {
            "formal_curated_apply": compile_result.get("formal_curated_apply", False),
            "formal_card_writes": compile_result.get("formal_card_writes", 0),
            "auto_areas_promotion": bool(config.get("policy", {}).get("auto_areas_promotion", False)),
            "usage_recording": False,
        },
        "reports": report_retention,
        "exceptions": [],
        "formal_report_writes": 0,
        "report_archive_moves": 0,
        "raw_archive_moves": 0,
        "deletions": 0,
    }


def render_iteration_files(result: dict[str, Any]) -> dict[str, str]:
    raw_items = result["input"]["raw_retention"]["evaluations"]
    report_units = result["reports"]["units"]
    compile_summary = result["curated"]["compile"]
    summary = "\n".join([
        f"# ResearchKB Knowledge Iteration {result['report_period']}",
        "",
        f"- 状态：`{result['status']}`",
        f"- 运行 ID：`{result['iteration_id']}`",
        f"- 生成时间：{result['generated_at']}",
        f"- RAW：{result['input']['raw_count']}",
        f"- Curated：{result['curated']['card_count']}",
        f"- 报告单元：{result['reports']['unit_count']}",
        f"- 正式 Curated 写入：{result['promotion']['formal_card_writes']}",
        f"- 正式报告文件写入：{result['formal_report_writes']}",
        "",
        "本报告由系统生成；RAW、Curated 和 Archive 的异常默认保守处理，不自动删除或误升级。",
        "",
    ])
    input_lines = [
        f"# Input Report {result['report_period']}",
        "",
        f"- RAW 文件：{result['input']['raw_count']}",
        f"- 生命周期窗口：{result['input']['raw_retention']['max_age_days']} 天",
        f"- 可归档候选：{result['input']['raw_retention']['archive_candidate_count']}",
        "",
        "| RAW | 年龄(天) | 动作 | SHA-256 | 原因 |",
        "|---|---:|---|---|---|",
    ]
    for item in raw_items:
        input_lines.append(
            f"| `{item['path']}` | {item['age_days']} | `{item['action']}` | `{item['sha256'][:16]}` | {item['reason']} |"
        )
    if not raw_items:
        input_lines.append("| （无） | - | `OK_EMPTY` | - | 当前 RAW 为空 |")
    curated_lines = [
        f"# Curated Changes {result['report_period']}",
        "",
        f"- Curated 卡片：{result['curated']['card_count']}",
        f"- 最新编译：`{compile_summary.get('compile_id', '无')}`",
        f"- 编译状态：`{compile_summary.get('status', '无')}`",
        f"- 候选提案：{compile_summary.get('proposed_count', 0)}",
        f"- 正式写入：{result['promotion']['formal_card_writes']}",
        "",
        "本阶段不自动写 Areas、不记录 usage；正式 Curated 写入仍由显式 `--apply` 控制。",
        "",
    ]
    promotion_lines = [
        f"# Promotion Actions {result['report_period']}",
        "",
        f"- Curated formal apply：`{result['promotion']['formal_curated_apply']}`",
        f"- Areas 自动升级：`{result['promotion']['auto_areas_promotion']}`",
        f"- usage 记录：`{result['promotion']['usage_recording']}`",
        f"- 本次正式报告写入：{result['formal_report_writes']}",
        "",
        "- RAW 180 天评估结果只生成保留/hold/归档候选，不自动永久删除。",
        "- 报告达到空间阈值后，才会产生报告归档候选；当前保留最新、季度和失败记录。",
        "",
    ]
    exception_lines = [
        f"# Exceptions {result['report_period']}",
        "",
    ]
    if result["input"]["raw_duplicate_hash_groups"]:
        exception_lines.append(f"- RAW 重复哈希组：{result['input']['raw_duplicate_hash_groups']}")
    if result["curated"]["missing_required_fields"]:
        exception_lines.append(f"- Curated 缺少必填字段：{len(result['curated']['missing_required_fields'])}")
    if result["curated"]["duplicate_id_groups"]:
        exception_lines.append(f"- Curated 重复 ID 组：{len(result['curated']['duplicate_id_groups'])}")
    raw_holds = sum(1 for item in raw_items if item["action"] == "hold")
    report_holds = sum(1 for item in report_units if item["action"].startswith("hold"))
    if raw_holds:
        exception_lines.append(f"- RAW 保守 hold：{raw_holds}")
    if report_holds:
        exception_lines.append(f"- 报告保守 hold：{report_holds}")
    if len(exception_lines) == 2:
        exception_lines.append("- 无异常；当前评估结果可继续运行。")
    exception_lines.append("")
    manifest = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    return {
        "00-Run-Summary.md": summary,
        "01-Input-Report.md": "\n".join(input_lines) + "\n",
        "02-Curated-Changes.md": "\n".join(curated_lines),
        "03-Promotion-Actions.md": "\n".join(promotion_lines),
        "04-Exceptions.md": "\n".join(exception_lines),
        "run-manifest.json": manifest,
    }


def update_maintenance_state(root: Path, config: dict[str, Any], result: dict[str, Any]) -> None:
    state_path = lifecycle_paths(root, config)["state"]
    previous: dict[str, Any] = {}
    if state_path.exists():
        try:
            previous = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = {}
    state = dict(previous)
    state.update({
        "schema": "researchkb-knowledge-lifecycle-state/v1",
        "status": "active",
        "last_maintenance_id": result["iteration_id"],
        "last_maintenance_at": result["generated_at"],
        "last_maintenance_summary": {
            "status": result["status"],
            "report_period": result["report_period"],
            "raw_count": result["input"]["raw_count"],
            "curated_count": result["curated"]["card_count"],
            "report_unit_count": result["reports"]["unit_count"],
            "formal_report_writes": result["formal_report_writes"],
            "report_archive_moves": result["report_archive_moves"],
            "raw_archive_moves": result["raw_archive_moves"],
            "deletions": 0,
        },
    })
    atomic_write(state_path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def persist_iteration_outputs(root: Path, config: dict[str, Any], result: dict[str, Any]) -> None:
    paths = lifecycle_paths(root, config)
    package_dir = paths["report_packages"] / str(result["report_period"])
    package_dir.mkdir(parents=True, exist_ok=True)
    file_contents = render_iteration_files(result)
    result["report_files"] = {
        name: rel_path(package_dir / name, root)
        for name in file_contents
    }
    file_contents["run-manifest.json"] = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    for name, content in file_contents.items():
        atomic_write(package_dir / name, content)
    run_path = paths["runs"] / f"{result['iteration_id']}.json"
    flat_report_path = paths["reports"] / f"{result['iteration_id']}.md"
    paths["runs"].mkdir(parents=True, exist_ok=True)
    paths["reports"].mkdir(parents=True, exist_ok=True)
    atomic_write(run_path, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    atomic_write(flat_report_path, file_contents["00-Run-Summary.md"])
    update_maintenance_state(root, config, result)


def apply_formal_iteration_report(root: Path, config: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    if config.get("policy", {}).get("formal_report_write_enabled") is not True:
        raise LifecycleError("配置未允许正式 Reports 写入；保持 Harness staging")
    paths = lifecycle_paths(root, config)
    package_dir = paths["report_packages"] / str(result["report_period"])
    formal_dir = paths["curated_report_root"] / str(result["report_period"])
    if formal_dir.exists() and any(formal_dir.iterdir()):
        result["formal_report_status"] = "HOLD_EXISTING"
        result["formal_report_reason"] = "目标季度/周报告目录已有内容，拒绝覆盖"
        return result
    file_contents = render_iteration_files(result)
    result["formal_report_writes"] = len(file_contents)
    result["formal_report_status"] = "APPLIED"
    result["formal_report_reason"] = "显式 --apply 发布 Harness 生成的周报告包"
    result["formal_report_files"] = {
        name: rel_path(formal_dir / name, root)
        for name in file_contents
    }
    persist_iteration_outputs(root, config, result)
    file_contents = render_iteration_files(result)
    formal_dir.mkdir(parents=True, exist_ok=True)
    for name in file_contents:
        source = package_dir / name
        if not source.is_file():
            raise LifecycleError(f"报告 staging 文件缺失：{source}")
        atomic_write(formal_dir / name, source.read_text(encoding="utf-8"))
    return result


def archive_report_units(root: Path, config: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    paths = lifecycle_paths(root, config)
    moves: list[dict[str, str]] = []
    held: list[dict[str, str]] = []
    for unit in result["reports"]["units"]:
        if unit.get("action") != "archive-candidate":
            continue
        source = resolve_rel(root, str(unit["path"]))
        target = paths["report_archive"] / Path(str(unit["relative_to_reports"]))
        if not is_within(source, paths["reports"]) or not is_within(target, paths["report_archive"]):
            raise LifecycleError(f"报告归档路径越界：{source} -> {target}")
        if target.exists():
            held.append({"path": unit["path"], "reason": "归档目标已存在，拒绝覆盖"})
            continue
        before = report_unit_sha256(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
        after = report_unit_sha256(target)
        if before != after:
            raise LifecycleError(f"报告归档 SHA-256 不一致：{source} -> {target}")
        unit["action"] = "archived"
        unit["archive_path"] = rel_path(target, root)
        moves.append({"from": str(unit["path"]), "to": rel_path(target, root), "sha256": after})
    result["report_archive_moves"] = len(moves)
    result["report_archive"] = {"status": "APPLIED" if moves else "NO_OP", "moves": moves, "held": held}
    return result


def archive_raw_candidates(root: Path, config: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    paths = lifecycle_paths(root, config)
    moves: list[dict[str, str]] = []
    held: list[dict[str, str]] = []
    for item in result["input"]["raw_retention"]["evaluations"]:
        if item.get("action") != "archive-candidate":
            continue
        source = resolve_rel(root, str(item["path"]))
        target = resolve_rel(root, str(item["archive_path"]))
        if not is_within(source, paths["raw"]) or not is_within(target, paths["archive"]):
            raise LifecycleError(f"RAW 归档路径越界：{source} -> {target}")
        if target.exists():
            held.append({"path": item["path"], "reason": "归档目标已存在，拒绝覆盖"})
            continue
        before = sha256_file(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
        after = sha256_file(target)
        if before != after:
            raise LifecycleError(f"RAW 归档 SHA-256 不一致：{source} -> {target}")
        item["action"] = "archived"
        item["archived_path"] = rel_path(target, root)
        moves.append({"from": str(item["path"]), "to": rel_path(target, root), "sha256": after})
    result["raw_archive_moves"] = len(moves)
    result["raw_archive"] = {"status": "APPLIED" if moves else "NO_OP", "moves": moves, "held": held}
    return result


def update_state(root: Path, config: dict[str, Any], scan: dict[str, Any], run_id: str) -> None:
    state_path = lifecycle_paths(root, config)["state"]
    previous: dict[str, Any] = {}
    if state_path.exists():
        try:
            previous = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = {}
    state = {
        "schema": "researchkb-knowledge-lifecycle-state/v1",
        "status": "active",
        "initialized_at": previous.get("initialized_at"),
        "last_run_id": run_id,
        "last_run_at": scan["generated_at"],
        "last_summary": {
            "status": scan["status"],
            "raw_count": scan["raw"]["count"],
            "curated_count": scan["curated"]["count"],
            "missing_directories": scan["missing_directories"],
            "duplicate_raw_groups": len(scan["raw"]["duplicate_hash_groups"]),
            "duplicate_curated_groups": len(scan["curated"]["duplicate_id_groups"]),
        },
    }
    atomic_write(state_path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def render_report(scan: dict[str, Any], run_id: str) -> str:
    raw = scan["raw"]
    curated = scan["curated"]
    lines = [
        f"# ResearchKB lifecycle scan {run_id}",
        "",
        f"- 状态：`{scan['status']}`",
        f"- 生成时间：{scan['generated_at']}",
        f"- RAW 文件：{raw['count']}",
        f"- Curated 卡片：{curated['count']}",
        f"- 缺失目录：{len(scan['missing_directories'])}",
        f"- RAW 重复哈希组：{len(raw['duplicate_hash_groups'])}",
        f"- Curated 重复 ID 组：{len(curated['duplicate_id_groups'])}",
        f"- Curated 缺失字段文件：{len(curated['missing_required_fields'])}",
        "",
        "## 当前阶段边界",
        "",
        "- `compile` 可生成仅位于 `.harness/staging` 的 Curated 候选提案；本扫描命令本身不生成正式内容。",
        "- 不写入 Areas、Projects、Skills，不记录 usage，不执行升级。",
        "- 异常默认 `hold`；不移动、不覆盖、不删除。",
        "- 运行报告写入 `.harness/reports`，不自动写入 Vault `_Reports`。",
        "",
    ]
    if scan["missing_directories"]:
        lines.extend(["## 缺失目录", "", *[f"- `{value}`" for value in scan["missing_directories"]], ""])
    if curated["missing_required_fields"]:
        lines.extend(["## Curated 字段问题", "", "| 路径 | 缺少字段 |", "|---|---|"])
        for item in curated["missing_required_fields"]:
            lines.append(f"| `{item['path']}` | {', '.join(item['missing'])} |")
        lines.append("")
    return "\n".join(lines)


def write_scan_outputs(root: Path, config: dict[str, Any], scan: dict[str, Any]) -> dict[str, str]:
    paths = lifecycle_paths(root, config)
    run_id = f"knowledge-lifecycle-{datetime.now().astimezone().strftime('%Y%m%d-%H%M%S')}"
    run_path = paths["runs"] / f"{run_id}.json"
    report_path = paths["reports"] / f"{run_id}.md"
    payload = dict(scan)
    payload["run_id"] = run_id
    paths["runs"].mkdir(parents=True, exist_ok=True)
    paths["reports"].mkdir(parents=True, exist_ok=True)
    atomic_write(run_path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    atomic_write(report_path, render_report(scan, run_id))
    update_state(root, config, scan, run_id)
    return {"run_id": run_id, "run": str(run_path), "report": str(report_path)}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ResearchKB lifecycle foundation")
    parser.add_argument(
        "command",
        choices=("preflight", "initialize", "weekly", "compile", "maintain"),
        nargs="?",
        default="preflight",
    )
    parser.add_argument("--root", type=Path, default=WORKSPACE_ROOT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="显式允许 initialize 创建目录、compile 写入 Curated 或 maintain 发布 Reports",
    )
    parser.add_argument("--no-write", action="store_true", help="仅扫描/评估，不写 runs/reports/state")
    parser.add_argument("--codex", action="store_true", help="compile 显式调用现有只读 Codex 编译器")
    parser.add_argument("--archive-reports", action="store_true", help="maintain 显式归档超过空间阈值的报告")
    parser.add_argument("--archive-raw", action="store_true", help="maintain 显式归档有明确低价值标记的过期 RAW")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        config = load_config(args.config.resolve())
        root = validate_root(args.root, config)
        if args.command == "preflight":
            directories = required_directories(root, config)
            print(json.dumps({
                "status": "PASS" if all(path.is_dir() for path in directories) else "NOT_INITIALIZED",
                "workspace_root": str(root),
                "missing_directories": [rel_path(path, root) for path in directories if not path.is_dir()],
                "curated_categories": config.get("curated_categories", []),
                "formal_card_writes": 0,
                "deletions": 0,
            }, ensure_ascii=False, indent=2))
            return 0
        if args.command == "initialize":
            if args.no_write:
                raise LifecycleError("initialize 不支持 --no-write；不带 --apply 即为 dry-run")
            if args.codex:
                raise LifecycleError("initialize 不支持 --codex")
            result = initialize(root, config, apply=args.apply)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        if args.command == "compile":
            if args.apply and args.no_write:
                raise LifecycleError("compile --apply 不得与 --no-write 同时使用")
            if args.apply and config.get("compile", {}).get("allow_formal_curated_apply") is not True:
                raise LifecycleError("配置未允许正式 Curated apply；保持默认 hold")
            scan = scan_workspace(root, config)
            result = compile_candidates(
                root,
                config,
                scan,
                use_codex=args.codex,
                allow_write=not args.no_write,
            )
            if args.no_write:
                print(json.dumps({
                    "status": result["status"],
                    "compile_id": result["compile_id"],
                    "raw_count": result["raw_count"],
                    "unique_source_count": result["unique_source_count"],
                    "proposed_count": result["proposed_count"],
                    "hold_count": result["hold_count"],
                    "skipped_count": result["skipped_count"],
                    "formal_card_writes": 0,
                    "deletions": 0,
                }, ensure_ascii=False, indent=2))
            else:
                outputs = write_compile_outputs(root, config, result)
                if args.apply:
                    apply_formal_proposals(root, config, result)
                    persist_compile_outputs(root, config, result)
                print(json.dumps({"status": "COMPILE_COMPLETE", **outputs, "compile": result}, ensure_ascii=False, indent=2))
            return 0
        if args.command == "maintain":
            if args.codex:
                raise LifecycleError("maintain 阶段不接受 --codex；请先运行 compile --codex")
            if (args.archive_reports or args.archive_raw) and not args.apply:
                raise LifecycleError("--archive-reports/--archive-raw 必须与 --apply 同时使用")
            if args.apply and config.get("policy", {}).get("formal_report_write_enabled") is not True:
                raise LifecycleError("配置未允许正式 Reports apply；保持 Harness staging")
            scan = scan_workspace(root, config)
            result = build_iteration_result(root, config, scan)
            if args.no_write:
                print(json.dumps({
                    "status": result["status"],
                    "iteration_id": result["iteration_id"],
                    "report_period": result["report_period"],
                    "raw_count": result["input"]["raw_count"],
                    "curated_count": result["curated"]["card_count"],
                    "report_unit_count": result["reports"]["unit_count"],
                    "report_threshold_reached": result["reports"]["threshold_reached"],
                    "raw_archive_candidates": result["input"]["raw_retention"]["archive_candidate_count"],
                    "report_archive_candidates": result["reports"]["archive_candidate_count"],
                    "formal_report_writes": 0,
                    "deletions": 0,
                }, ensure_ascii=False, indent=2))
            else:
                paths = lifecycle_paths(root, config)
                package_dir = paths["report_packages"] / str(result["report_period"])
                persist_iteration_outputs(root, config, result)
                if args.apply:
                    apply_formal_iteration_report(root, config, result)
                if args.archive_reports:
                    archive_report_units(root, config, result)
                if args.archive_raw:
                    archive_raw_candidates(root, config, result)
                if args.apply or args.archive_reports or args.archive_raw:
                    persist_iteration_outputs(root, config, result)
                outputs = {
                    "iteration_id": result["iteration_id"],
                    "package": str(package_dir),
                    "manifest": str(package_dir / "run-manifest.json"),
                    "run": str(paths["runs"] / f"{result['iteration_id']}.json"),
                    "report": str(paths["reports"] / f"{result['iteration_id']}.md"),
                }
                print(json.dumps({"status": "MAINTENANCE_COMPLETE", **outputs, "maintenance": result}, ensure_ascii=False, indent=2))
            return 0
        if args.apply:
            raise LifecycleError("weekly 阶段不接受 --apply；当前只执行扫描和运行记录")
        if args.codex:
            raise LifecycleError("weekly 阶段不接受 --codex；请使用 compile --codex")
        scan = scan_workspace(root, config)
        if args.no_write:
            print(json.dumps({
                "status": scan["status"],
                "raw_count": scan["raw"]["count"],
                "curated_count": scan["curated"]["count"],
                "missing_directories": scan["missing_directories"],
                "duplicate_raw_groups": len(scan["raw"]["duplicate_hash_groups"]),
                "duplicate_curated_groups": len(scan["curated"]["duplicate_id_groups"]),
            }, ensure_ascii=False, indent=2))
        else:
            outputs = write_scan_outputs(root, config, scan)
            print(json.dumps({"status": "SCAN_COMPLETE", **outputs, "scan": scan}, ensure_ascii=False, indent=2))
        return 0
    except (LifecycleError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
