#!/usr/bin/env python3
"""Prepare and persist the interactive quarterly Review for ResearchKB.

This module is deliberately a state machine, not an autonomous decision maker.
It reads existing lifecycle outputs, asks for batched human answers through the
Codex task, and writes only Harness staging/state/report files until an exact
confirmation is supplied.  Natural-language answers are never treated as file
operations or rule changes.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
DEFAULT_CONFIG = HARNESS_ROOT / "config" / "knowledge-lifecycle.json"
REVIEW_SCHEMA = "researchkb-quarterly-review/v1"
ACTION_SCHEMA = "researchkb-quarterly-actions/v1"
QUARTER_RE = re.compile(r"^(20\d{2})-Q([1-4])$")
CONFIRM_TEXT = "确认执行季度 Review 草案"
ALLOWED_ACTIONS = {
    "set-upgrade-threshold",
    "archive-harness-report",
    "archive-raw",
}


class ReviewError(RuntimeError):
    pass


def load_lifecycle_module() -> Any:
    script = HARNESS_ROOT / "scripts" / "knowledge_lifecycle.py"
    spec = importlib.util.spec_from_file_location("knowledge_lifecycle_for_review", script)
    if not spec or not spec.loader:
        raise ReviewError(f"无法加载生命周期模块：{script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def quarter_id(value: date) -> str:
    return f"{value.year}-Q{((value.month - 1) // 3) + 1}"


def parse_quarter(value: str) -> tuple[int, int]:
    match = QUARTER_RE.fullmatch(value.strip())
    if not match:
        raise ReviewError(f"季度格式无效，应为 YYYY-Qn：{value!r}")
    return int(match.group(1)), int(match.group(2))


def quarter_bounds(value: str) -> tuple[date, date]:
    year, quarter = parse_quarter(value)
    start_month = (quarter - 1) * 3 + 1
    start = date(year, start_month, 1)
    if quarter == 4:
        next_start = date(year + 1, 1, 1)
    else:
        next_start = date(year, start_month + 3, 1)
    return start, next_start - timedelta(days=1)


def previous_quarter(value: date | None = None) -> str:
    current = value or datetime.now().astimezone().date()
    year, quarter = parse_quarter(quarter_id(current))
    if quarter == 1:
        return f"{year - 1}-Q4"
    return f"{year}-Q{quarter - 1}"


def is_first_working_day_of_quarter(value: date | None = None) -> bool:
    current = value or datetime.now().astimezone().date()
    if current.month not in {1, 4, 7, 10}:
        return False
    first = date(current.year, current.month, 1)
    while first.weekday() >= 5:
        first += timedelta(days=1)
    return current == first


def load_json(path: Path, *, required: bool = False) -> Any:
    if not path.is_file():
        if required:
            raise ReviewError(f"JSON 文件不存在：{path}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        if required:
            raise ReviewError(f"无法读取 JSON：{path}: {exc}") from exc
        return {"_status": "HOLD", "_error": str(exc)}


def optional_snapshot(path: Path, root: Path, lifecycle: Any) -> dict[str, Any]:
    relative = lifecycle.rel_path(path, root)
    if not path.is_file():
        return {"status": "MISSING", "path": relative}
    payload = load_json(path)
    if not isinstance(payload, dict) or payload.get("_status") == "HOLD":
        return {
            "status": "HOLD",
            "path": relative,
            "reason": "文件无法解析为有效 JSON",
        }
    return {"status": "OK", "path": relative, "payload": payload}


def latest_json(directory: Path, patterns: tuple[str, ...], root: Path, lifecycle: Any) -> dict[str, Any]:
    candidates: list[Path] = []
    for pattern in patterns:
        candidates.extend(directory.glob(pattern))
    for path in sorted(
        {candidate.resolve() for candidate in candidates if candidate.is_file()},
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    ):
        payload = load_json(path)
        if isinstance(payload, dict) and payload.get("_status") != "HOLD":
            return {
                "status": "OK",
                "path": lifecycle.rel_path(path, root),
                "payload": payload,
            }
    return {"status": "MISSING", "patterns": list(patterns)}


def area_snapshot(root: Path, paths: dict[str, Path], lifecycle: Any) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    derived: dict[str, int] = {}
    managed_markers = (
        "<!-- BEGIN CODEX MANAGED: AREA -->",
        "<!-- END CODEX MANAGED: AREA -->",
    )
    for path in lifecycle.iter_files(paths["areas"]):
        if path.suffix.lower() != ".md":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            text = ""
        frontmatter = lifecycle.parse_frontmatter(path)
        derived_from = str(frontmatter.get("derived_from", "")).strip()
        if derived_from:
            derived[derived_from] = derived.get(derived_from, 0) + 1
        files.append({
            "path": lifecycle.rel_path(path, root),
            "sha256": lifecycle.sha256_file(path),
            "managed_area": text.count(managed_markers[0]) == 1 and text.count(managed_markers[1]) == 1,
            "derived_from": derived_from,
        })
    return {
        "file_count": len(files),
        "managed_area_file_count": sum(1 for item in files if item["managed_area"]),
        "protected_area_file_count": sum(1 for item in files if not item["managed_area"]),
        "duplicate_derived_from": sorted(key for key, count in derived.items() if count > 1),
        "files": files,
    }


def compact_upgrade(snapshot: dict[str, Any]) -> dict[str, Any]:
    payload = snapshot.get("payload", {}) if snapshot.get("status") == "OK" else {}
    decisions = payload.get("decisions", []) if isinstance(payload, dict) else []
    if not isinstance(decisions, list):
        decisions = []
    return {
        "status": snapshot.get("status"),
        "path": snapshot.get("path"),
        "decision_status": payload.get("status") if isinstance(payload, dict) else None,
        "eligible_resources": payload.get("eligible_resources", []) if isinstance(payload, dict) else [],
        "holds": [
            {"resource_id": item.get("resource_id"), "reason": item.get("reason")}
            for item in decisions
            if isinstance(item, dict) and item.get("action") == "hold"
        ],
        "threshold": payload.get("distinct_tasks_threshold") if isinstance(payload, dict) else None,
        "window_days": payload.get("window_days") if isinstance(payload, dict) else None,
    }


def compact_areas(snapshot: dict[str, Any]) -> dict[str, Any]:
    payload = snapshot.get("payload", {}) if snapshot.get("status") == "OK" else {}
    decisions = payload.get("decisions", []) if isinstance(payload, dict) else []
    if not isinstance(decisions, list):
        decisions = []
    return {
        "status": snapshot.get("status"),
        "path": snapshot.get("path"),
        "sync_status": payload.get("status") if isinstance(payload, dict) else None,
        "areas_writes": payload.get("areas_writes", 0) if isinstance(payload, dict) else 0,
        "candidates": [
            {"resource_id": item.get("resource_id"), "action": item.get("action"), "area_path": item.get("area_path")}
            for item in decisions
            if isinstance(item, dict) and item.get("action") in {"create-area", "update-area"}
        ],
        "holds": [
            {"resource_id": item.get("resource_id"), "reason": item.get("reason")}
            for item in decisions
            if isinstance(item, dict) and item.get("action") == "hold"
        ],
    }


def build_snapshot(root: Path, config: dict[str, Any], lifecycle: Any) -> dict[str, Any]:
    paths = lifecycle.lifecycle_paths(root, config)
    scan = lifecycle.scan_workspace(root, config)
    usage = optional_snapshot(paths["usage_aggregate"], root, lifecycle)
    upgrade = optional_snapshot(paths["upgrade_state"], root, lifecycle)
    areas = optional_snapshot(paths["areas_state"], root, lifecycle)
    iteration = latest_json(paths["report_packages"], ("*/run-manifest.json",), root, lifecycle)
    v3_preflight = latest_json(paths["runs"], ("v3-preflight-*.json",), root, lifecycle)
    v3_lint = latest_json(paths["runs"], ("v3-lint-*.json",), root, lifecycle)
    usage_payload = usage.get("payload", {}) if usage.get("status") == "OK" else {}
    resources = usage_payload.get("resources", {}) if isinstance(usage_payload, dict) else {}
    if not isinstance(resources, dict):
        resources = {}
    usage_rows = []
    for resource_id, stats in resources.items():
        if not isinstance(stats, dict):
            continue
        usage_rows.append({
            "resource_id": str(resource_id),
            "uses_90d": stats.get("uses_90d", 0),
            "uses_30d": stats.get("uses_30d", 0),
            "distinct_tasks": stats.get("distinct_tasks", 0),
            "last_used": stats.get("last_used"),
        })
    usage_rows.sort(key=lambda item: (-int(item["uses_90d"] or 0), str(item["resource_id"])))
    return {
        "generated_at": now_iso(),
        "workspace_root": str(root),
        "scan": {
            "status": scan["status"],
            "raw_count": scan["raw"]["count"],
            "curated_count": scan["curated"]["count"],
            "curated_missing_fields": scan["curated"]["missing_required_fields"],
            "curated_duplicate_id_groups": scan["curated"]["duplicate_id_groups"],
            "missing_directories": scan["missing_directories"],
        },
        "knowledge_iteration": iteration,
        "usage": {
            "status": usage.get("status"),
            "path": usage.get("path"),
            "total_uses": usage_payload.get("total_uses", 0) if isinstance(usage_payload, dict) else 0,
            "uses_30d": usage_payload.get("uses_30d", 0) if isinstance(usage_payload, dict) else 0,
            "uses_90d": usage_payload.get("uses_90d", 0) if isinstance(usage_payload, dict) else 0,
            "resources": usage_rows,
        },
        "upgrade": compact_upgrade(upgrade),
        "areas": compact_areas(areas),
        "area_inventory": area_snapshot(root, paths, lifecycle),
        "v3": {"preflight": v3_preflight, "lint": v3_lint},
        "configuration": {
            "window_days": int(config.get("upgrade", {}).get("window_days", 90)),
            "distinct_tasks_threshold": int(config.get("upgrade", {}).get("distinct_tasks_threshold", 5)),
            "auto_areas_apply": bool(config.get("upgrade", {}).get("auto_areas_apply", False)),
        },
    }


def make_question_batches(snapshot: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    upgrade = snapshot["upgrade"]
    usage = snapshot["usage"]
    areas = snapshot["areas"]
    inventory = snapshot["area_inventory"]
    threshold = snapshot["configuration"]["distinct_tasks_threshold"]
    batches: list[dict[str, Any]] = []

    def add_batch(batch_id: str, category: str, summary: str, prompts: list[str]) -> None:
        if not prompts:
            return
        questions = [
            {
                "question_id": f"{batch_id}-q{index}",
                "prompt": prompt,
            }
            for index, prompt in enumerate(prompts, start=1)
        ]
        batches.append({
            "batch_id": batch_id,
            "category": category,
            "summary": summary,
            "status": "pending",
            "questions": questions[: max(3, min(5, int(config.get("review", {}).get("question_batch_size", 5))))],
            "answers": [],
        })

    eligible = upgrade.get("eligible_resources", [])
    if eligible or upgrade.get("holds"):
        add_batch(
            "batch-01-auto-upgrades",
            "auto_upgrades",
            f"90 天升级候选 {len(eligible)} 个，硬结构 hold {len(upgrade.get('holds', []))} 个。",
            [
                "这些自动升级结果是否符合你对可复用知识的判断？请指出需要保留、暂停或回退的资源。",
                "已生成或待生成的 Areas 是否有明显的范围、分类或来源追踪问题？",
                "对于硬结构 hold，是否有需要安排修复的优先项？普通语义差异不需要逐项审批。",
            ],
        )
    if usage.get("resources"):
        hotspots = usage["resources"][:5]
        hotspot_text = "、".join(str(item["resource_id"]) for item in hotspots) or "无"
        add_batch(
            "batch-02-usage-hotspots",
            "usage_hotspots",
            f"已有 {len(usage['resources'])} 个有 usage 记录的 Curated；热点：{hotspot_text}。",
            [
                "当前 usage 热点是否代表真实长期工作需要？哪些热点需要补充说明、关联或重写？",
                "同一任务同一资源最多计 1 次的统计是否仍然可信？是否发现误计数迹象？",
                "是否有已被实际使用但来源说明或 Curated 结构仍不足的资源？",
            ],
        )
        low = [item for item in usage["resources"] if int(item.get("uses_90d") or 0) == 0]
        if low:
            add_batch(
                "batch-03-low-usage",
                "low_usage",
                f"90 天无使用资源 {len(low)} 个，系统只提出建议，不自动归档。",
                [
                    "90 天无使用的资源中，哪些仍应保留为低频但有价值的参考？",
                    "哪些低使用项需要降级、合并或进入后续归档候选？请给出理由。",
                    "是否存在因为路径、命名或链接问题导致的假性低使用？",
                ],
            )
    if areas.get("areas_writes", 0) or areas.get("candidates") or inventory["file_count"]:
        add_batch(
            "batch-04-area-changes",
            "area_changes",
            f"Areas 文件 {inventory['file_count']} 个，受控自动文件 {inventory['managed_area_file_count']} 个，本次写入 {areas.get('areas_writes', 0)} 个。",
            [
                "Areas 的新增或更新是否保持了 Curated → Areas 的来源追踪和 SHA-256？",
                "人工 Areas 是否保持不变，自动内容是否只位于 _Codex-Auto 或受控 managed 区域？",
                "哪些 Area 需要保留、调整、暂停自动更新或进入人工处理？",
            ],
        )
    health_signals = (
        snapshot["scan"]["status"] != "OK_EMPTY"
        or snapshot["scan"]["curated_missing_fields"]
        or snapshot["scan"]["curated_duplicate_id_groups"]
        or snapshot["scan"]["missing_directories"]
        or upgrade.get("status") != "OK"
        or areas.get("status") not in {"OK", "MISSING"}
        or snapshot["v3"]["preflight"].get("status") == "HOLD"
        or snapshot["v3"]["lint"].get("status") == "HOLD"
    )
    if health_signals:
        add_batch(
            "batch-05-health",
            "conflicts_and_health",
            "发现结构、状态或最近运行健康信号，需要人工确认处理优先级。",
            [
                "最近的周度运行、v3 preflight/lint、usage 和 Areas 状态是否有需要立即处理的异常？",
                "分类、链接、来源追踪或结构检查中，哪些问题是真正的硬阻断，哪些只是待整理项？",
                "本季度是否需要保守暂停某一类自动写入或仅生成提案？",
            ],
        )
    add_batch(
        "batch-06-thresholds",
        "threshold_and_rules",
        f"当前升级窗口为 {snapshot['configuration']['window_days']} 天，distinct_tasks 阈值为 {threshold}。",
        [
            f"滚动 {snapshot['configuration']['window_days']} 天、distinct_tasks >= {threshold} 的升级规则是否继续适合你的工作节奏？",
            "是否需要提出阈值或窗口调整？如果需要，请给出目标值、理由和生效范围；未明确的建议不会自动执行。",
            "RAW 180 天、Reports 空间阈值、季度 Review 频率和 Archive 只移动不删除的边界是否保持？",
        ],
    )
    return batches


def state_path_for(root: Path, config: dict[str, Any], quarter: str, lifecycle: Any) -> Path:
    path = lifecycle.lifecycle_paths(root, config)["review_state_root"] / f"{quarter}.json"
    if not lifecycle.is_within(path, lifecycle.lifecycle_paths(root, config)["review_state_root"]):
        raise ReviewError("Review 状态路径越界")
    return path


def package_path_for(root: Path, config: dict[str, Any], quarter: str, lifecycle: Any) -> Path:
    path = lifecycle.lifecycle_paths(root, config)["review_proposal_root"] / quarter
    if not lifecycle.is_within(path, lifecycle.lifecycle_paths(root, config)["review_proposal_root"]):
        raise ReviewError("Review staging 路径越界")
    return path


def report_path_for(root: Path, config: dict[str, Any], quarter: str, lifecycle: Any) -> Path:
    path = lifecycle.lifecycle_paths(root, config)["review_report_root"] / quarter
    if not lifecycle.is_within(path, lifecycle.lifecycle_paths(root, config)["review_report_root"]):
        raise ReviewError("Review report 路径越界")
    return path


def write_state(path: Path, state: dict[str, Any], lifecycle: Any) -> None:
    lifecycle.atomic_write(path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def state_summary(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "quarter": state.get("quarter"),
        "status": state.get("status"),
        "question_batch_count": len(state.get("question_batches", [])),
        "pending_batches": [
            item.get("batch_id")
            for item in state.get("question_batches", [])
            if isinstance(item, dict) and item.get("status") != "completed"
        ],
        "answer_count": len(state.get("answers", [])),
        "proposed_action_count": len(state.get("proposed_actions", [])),
        "report_root": state.get("report_root"),
    }


def load_state(root: Path, config: dict[str, Any], quarter: str, lifecycle: Any) -> tuple[Path, dict[str, Any]]:
    path = state_path_for(root, config, quarter, lifecycle)
    payload = load_json(path, required=True)
    if not isinstance(payload, dict) or payload.get("schema") != REVIEW_SCHEMA:
        raise ReviewError("Review 状态 schema 不匹配")
    return path, payload


def prepare(root: Path, config: dict[str, Any], quarter: str, lifecycle: Any, *, write: bool) -> dict[str, Any]:
    state_path = state_path_for(root, config, quarter, lifecycle)
    if state_path.is_file():
        existing = load_json(state_path, required=True)
        if not isinstance(existing, dict) or existing.get("schema") != REVIEW_SCHEMA:
            raise ReviewError("已有 Review 状态不可识别，保守 hold")
        return {"status": "EXISTING", "state_path": lifecycle.rel_path(state_path, root), "review": state_summary(existing)}
    snapshot = build_snapshot(root, config, lifecycle)
    batches = make_question_batches(snapshot, config)
    package_root = package_path_for(root, config, quarter, lifecycle)
    state = {
        "schema": REVIEW_SCHEMA,
        "quarter": quarter,
        "period": {"start": quarter_bounds(quarter)[0].isoformat(), "end": quarter_bounds(quarter)[1].isoformat()},
        "status": "pending_start",
        "prepared_at": now_iso(),
        "staging_root": lifecycle.rel_path(package_root, root),
        "report_root": lifecycle.rel_path(report_path_for(root, config, quarter, lifecycle), root),
        "source_snapshot": snapshot,
        "question_batches": batches,
        "answers": [],
        "proposed_actions": [],
        "actions_path": lifecycle.rel_path(package_root / "approved-actions.json", root),
        "apply_authorization": {
            "required": True,
            "confirmation": CONFIRM_TEXT,
            "formal_vault_writes": False,
            "permanent_delete": False,
        },
        "deletions": 0,
    }
    result = {
        "status": "PREPARED" if write else "DRY_RUN_READY",
        "quarter": quarter,
        "trigger_is_first_working_day": is_first_working_day_of_quarter(),
        "state_path": lifecycle.rel_path(state_path, root),
        "staging_root": lifecycle.rel_path(package_root, root),
        "question_batch_count": len(batches),
        "skipped_empty_categories": [
            category
            for category in [
                "auto_upgrades",
                "usage_hotspots",
                "low_usage",
                "area_changes",
                "conflicts_and_health",
                "threshold_and_rules",
            ]
            if category not in {batch["category"] for batch in batches}
        ],
        "review": state_summary(state),
    }
    if not write:
        return result
    package_root.mkdir(parents=True, exist_ok=True)
    lifecycle.atomic_write(package_root / "review-input.json", json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
    lifecycle.atomic_write(package_root / "question-batches.json", json.dumps(batches, ensure_ascii=False, indent=2) + "\n")
    lifecycle.atomic_write(
        package_root / "approved-actions.json",
        json.dumps({"schema": ACTION_SCHEMA, "quarter": quarter, "actions": []}, ensure_ascii=False, indent=2) + "\n",
    )
    write_state(state_path, state, lifecycle)
    return result


def status(root: Path, config: dict[str, Any], quarter: str, lifecycle: Any) -> dict[str, Any]:
    path = state_path_for(root, config, quarter, lifecycle)
    if not path.is_file():
        return {"status": "NOT_PREPARED", "quarter": quarter, "state_path": lifecycle.rel_path(path, root)}
    _, state = load_state(root, config, quarter, lifecycle)
    return {
        "status": state.get("status"),
        "quarter": quarter,
        "state_path": lifecycle.rel_path(path, root),
        "pending_batches": [
            batch.get("batch_id")
            for batch in state.get("question_batches", [])
            if isinstance(batch, dict) and batch.get("status") != "completed"
        ],
        "answered_batches": [
            batch.get("batch_id")
            for batch in state.get("question_batches", [])
            if isinstance(batch, dict) and batch.get("status") == "completed"
        ],
        "answer_count": len(state.get("answers", [])),
        "proposed_action_count": len(state.get("proposed_actions", [])),
        "apply_authorized": state.get("status") == "awaiting_confirmation",
    }


def start_review(root: Path, config: dict[str, Any], quarter: str, lifecycle: Any, *, write: bool) -> dict[str, Any]:
    path, state = load_state(root, config, quarter, lifecycle)
    current = state.get("status")
    if current not in {"pending_start", "active", "awaiting_finalize"}:
        raise ReviewError(f"当前 Review 状态不允许开始：{current}")
    if current == "pending_start":
        state["status"] = "active"
        state["started_at"] = now_iso()
        if write:
            write_state(path, state, lifecycle)
    return {
        "status": "STARTED" if write else "DRY_RUN_READY",
        "quarter": quarter,
        "state": state_summary(state),
        "state_path": lifecycle.rel_path(path, root),
    }


def load_answers(path: Path, root: Path, lifecycle: Any) -> dict[str, Any]:
    if not lifecycle.is_within(path, root / ".harness"):
        raise ReviewError("answers-file 必须位于 .harness 内")
    payload = load_json(path, required=True)
    if not isinstance(payload, dict):
        raise ReviewError("回答文件必须是 JSON 对象")
    return payload


def checkpoint(
    root: Path,
    config: dict[str, Any],
    quarter: str,
    batch_id: str,
    answers_file: Path,
    lifecycle: Any,
    *,
    write: bool,
) -> dict[str, Any]:
    path, state = load_state(root, config, quarter, lifecycle)
    if state.get("status") not in {"active", "awaiting_finalize"}:
        raise ReviewError(f"当前 Review 状态不允许 checkpoint：{state.get('status')}")
    payload = load_answers(answers_file.resolve(), root, lifecycle)
    if str(payload.get("batch_id", "")) != batch_id:
        raise ReviewError("回答文件 batch_id 与命令参数不一致")
    answers = payload.get("answers")
    if not isinstance(answers, list):
        raise ReviewError("回答文件 answers 必须是列表")
    batch = next((item for item in state.get("question_batches", []) if item.get("batch_id") == batch_id), None)
    if not isinstance(batch, dict):
        raise ReviewError(f"不存在的 Review 批次：{batch_id}")
    if batch.get("status") == "completed":
        raise ReviewError(f"Review 批次已完成，拒绝重复 checkpoint：{batch_id}")
    expected = {str(item.get("question_id")) for item in batch.get("questions", [])}
    actual: dict[str, str] = {}
    for item in answers:
        if not isinstance(item, dict):
            raise ReviewError("回答条目必须是对象")
        question_id = str(item.get("question_id", ""))
        if question_id not in expected or question_id in actual:
            raise ReviewError(f"回答 question_id 无效或重复：{question_id}")
        actual[question_id] = str(item.get("answer", "")).strip()
    if set(actual) != expected:
        missing = sorted(expected - set(actual))
        raise ReviewError(f"回答未覆盖本批次全部问题：{missing}")
    record = {
        "batch_id": batch_id,
        "checkpointed_at": now_iso(),
        "answers": [{"question_id": key, "answer": actual[key]} for key in sorted(actual)],
        "notes": str(payload.get("notes", "")).strip(),
    }
    batch["status"] = "completed"
    batch["answered_at"] = record["checkpointed_at"]
    batch["answers"] = record["answers"]
    state.setdefault("answers", []).append(record)
    pending = [item for item in state.get("question_batches", []) if item.get("status") != "completed"]
    state["status"] = "awaiting_finalize" if not pending else "active"
    if write:
        write_state(path, state, lifecycle)
    return {
        "status": "CHECKPOINTED" if write else "DRY_RUN_READY",
        "quarter": quarter,
        "batch_id": batch_id,
        "remaining_batches": [item.get("batch_id") for item in pending],
        "state_path": lifecycle.rel_path(path, root),
    }


def validate_actions(payload: Any, quarter: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or payload.get("schema") != ACTION_SCHEMA:
        raise ReviewError("Review actions schema 不匹配")
    if str(payload.get("quarter")) != quarter:
        raise ReviewError("Review actions quarter 不匹配")
    actions = payload.get("actions", [])
    if not isinstance(actions, list):
        raise ReviewError("Review actions 必须是列表")
    seen: set[str] = set()
    valid: list[dict[str, Any]] = []
    for action in actions:
        if not isinstance(action, dict):
            raise ReviewError("Review action 必须是对象")
        action_id = str(action.get("id", "")).strip()
        action_type = str(action.get("type", "")).strip()
        action_status = str(action.get("status", "proposed")).strip()
        if not action_id or action_id in seen:
            raise ReviewError(f"Review action id 缺失或重复：{action_id}")
        if action_type not in ALLOWED_ACTIONS:
            raise ReviewError(f"不支持的 Review action，保持 hold：{action_type}")
        if action_status not in {"proposed", "approved", "hold"}:
            raise ReviewError(f"Review action status 无效：{action_status}")
        if action_type == "set-upgrade-threshold":
            new_value = action.get("new_value")
            expected_old = action.get("expected_old_value")
            if type(new_value) is not int or not 1 <= new_value <= 100:
                raise ReviewError("升级阈值必须是 1-100 的整数")
            if type(expected_old) is not int or not 1 <= expected_old <= 100:
                raise ReviewError("升级阈值旧值必须是 1-100 的整数")
        elif action_type in {"archive-harness-report", "archive-raw"}:
            source = str(action.get("path", "")).strip()
            digest = str(action.get("sha256", "")).strip().lower()
            if not source or not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ReviewError(f"归档 action 缺少安全路径或 SHA-256：{action_id}")
        seen.add(action_id)
        valid.append(dict(action))
    return valid


def render_review_files(state: dict[str, Any]) -> dict[str, str]:
    snapshot = state.get("source_snapshot", {})
    scan = snapshot.get("scan", {})
    usage = snapshot.get("usage", {})
    upgrade = snapshot.get("upgrade", {})
    areas = snapshot.get("areas", {})
    lines = [
        f"# ResearchKB Quarterly Review {state['quarter']}",
        "",
        f"- 状态：`{state.get('status')}`",
        f"- Review 周期：`{state['period']['start']}` 至 `{state['period']['end']}`",
        f"- 准备时间：`{state.get('prepared_at')}`",
        f"- RAW：`{scan.get('raw_count', 0)}`；Curated：`{scan.get('curated_count', 0)}`；Areas：`{snapshot.get('area_inventory', {}).get('file_count', 0)}`",
        f"- usage 90 天使用次数：`{usage.get('uses_90d', 0)}`；热点资源：`{len(usage.get('resources', []))}`",
        f"- 升级候选：`{len(upgrade.get('eligible_resources', []))}`；Areas 写入：`{areas.get('areas_writes', 0)}`",
        "",
        "本 Review 只读现有运行结果；扫描、统计、问答和报告生成不记录 usage。日常自动升级不等待本 Review 审批。",
        "",
    ]
    qa_lines = [f"# Review Questions and Answers {state['quarter']}", ""]
    for batch in state.get("question_batches", []):
        qa_lines.extend([f"## {batch.get('batch_id')} / {batch.get('category')}", "", f"状态：`{batch.get('status')}`", ""])
        answers = {item.get("question_id"): item.get("answer", "") for item in batch.get("answers", [])}
        for question in batch.get("questions", []):
            question_id = question.get("question_id")
            qa_lines.append(f"- {question_id}: {question.get('prompt')}")
            qa_lines.append(f"  - 回答：{answers.get(question_id, '（待回答）')}")
        qa_lines.append("")
    draft_lines = [
        f"# Review Decision Draft {state['quarter']}",
        "",
        "以下栏目由当前对话根据回答归纳；自然语言回答不会直接执行文件或规则变更。",
        "",
        "## 保留",
        "",
        "- 待根据回答填写",
        "",
        "## 调整",
        "",
        "- 待根据回答填写；如涉及阈值，必须形成结构化 action 并经明确确认",
        "",
        "## 回退或暂停",
        "",
        "- 待根据回答填写；人工 Areas 和非受控路径默认保持不变",
        "",
        "## 归档建议",
        "",
        "- 只允许可追踪的移动，不执行永久删除；缺少来源、SHA 或目标冲突时 hold",
        "",
        "## 规则调整建议",
        "",
        f"- 当前窗口：{snapshot.get('configuration', {}).get('window_days', 90)} 天；当前阈值：{snapshot.get('configuration', {}).get('distinct_tasks_threshold', 5)}",
        "",
        f"- 可执行确认短语：`{CONFIRM_TEXT}`",
        "",
    ]
    return {
        "00-Review-Summary.md": "\n".join(lines),
        "01-Review-Questions-and-Answers.md": "\n".join(qa_lines),
        "02-Review-Decision-Draft.md": "\n".join(draft_lines),
        "run-manifest.json": json.dumps(state, ensure_ascii=False, indent=2) + "\n",
    }


def finalize(
    root: Path,
    config: dict[str, Any],
    quarter: str,
    lifecycle: Any,
    *,
    actions_file: Path | None,
    write: bool,
) -> dict[str, Any]:
    state_path, state = load_state(root, config, quarter, lifecycle)
    if state.get("status") not in {"active", "awaiting_finalize"}:
        raise ReviewError(f"当前 Review 状态不允许 finalize：{state.get('status')}")
    pending = [item.get("batch_id") for item in state.get("question_batches", []) if item.get("status") != "completed"]
    if pending:
        raise ReviewError(f"仍有未回答批次，不能 finalize：{pending}")
    package_root = package_path_for(root, config, quarter, lifecycle)
    default_actions = package_root / "approved-actions.json"
    selected_actions = actions_file.resolve() if actions_file else default_actions
    if not lifecycle.is_within(selected_actions, root / ".harness"):
        raise ReviewError("actions-file 必须位于 .harness 内")
    actions_payload = load_json(selected_actions) if selected_actions.is_file() else {"schema": ACTION_SCHEMA, "quarter": quarter, "actions": []}
    actions = validate_actions(actions_payload, quarter)
    state["proposed_actions"] = actions
    state["actions_path"] = lifecycle.rel_path(selected_actions, root)
    state["status"] = "awaiting_confirmation"
    state["finalized_at"] = now_iso()
    report_root = report_path_for(root, config, quarter, lifecycle)
    state["report_files"] = {
        name: lifecycle.rel_path(report_root / name, root)
        for name in render_review_files(state)
    }
    result = {
        "status": "FINALIZED" if write else "DRY_RUN_READY",
        "quarter": quarter,
        "pending_batches": pending,
        "proposed_action_count": len(actions),
        "report_root": lifecycle.rel_path(report_root, root),
        "state_path": lifecycle.rel_path(state_path, root),
        "review": state_summary(state),
    }
    if not write:
        return result
    report_root.mkdir(parents=True, exist_ok=True)
    for name, content in render_review_files(state).items():
        lifecycle.atomic_write(report_root / name, content)
    write_state(state_path, state, lifecycle)
    return result


def validate_action_paths(
    action: dict[str, Any],
    root: Path,
    paths: dict[str, Path],
    lifecycle: Any,
) -> tuple[Path, Path] | None:
    source = lifecycle.resolve_rel(root, str(action["path"]))
    if action["type"] == "archive-harness-report":
        if not lifecycle.is_within(source, paths["reports"]):
            raise ReviewError("报告归档 source 越过 .harness/reports 边界")
        relative = source.relative_to(paths["reports"])
        target = paths["report_archive"] / relative
        if not lifecycle.is_within(target, paths["report_archive"]):
            raise ReviewError("报告归档 target 越界")
        return source, target
    if not lifecycle.is_within(source, paths["raw"]):
        raise ReviewError("RAW 归档 source 越过 03-Resources/RAW 边界")
    relative = source.relative_to(paths["raw"])
    target = paths["archive"] / "RAW" / relative
    if not lifecycle.is_within(target, paths["archive"]):
        raise ReviewError("RAW 归档 target 越界")
    return source, target


def apply_actions(
    root: Path,
    config_path: Path,
    config: dict[str, Any],
    quarter: str,
    lifecycle: Any,
    *,
    confirmation: str,
) -> dict[str, Any]:
    if confirmation != CONFIRM_TEXT:
        raise ReviewError(f"必须提供精确确认短语：{CONFIRM_TEXT}")
    if config.get("review", {}).get("allow_formal_apply") is not True:
        raise ReviewError("配置未允许季度 Review apply")
    state_path, state = load_state(root, config, quarter, lifecycle)
    if state.get("status") != "awaiting_confirmation":
        raise ReviewError(f"当前 Review 状态不允许 apply：{state.get('status')}")
    paths = lifecycle.lifecycle_paths(root, config)
    actions_path = lifecycle.resolve_rel(root, str(state.get("actions_path", "")))
    payload = load_json(actions_path, required=True)
    actions = validate_actions(payload, quarter)
    results: list[dict[str, Any]] = []
    applied = 0
    for action in actions:
        result = {"id": action["id"], "type": action["type"], "status": "hold", "reason": ""}
        if action.get("status") != "approved":
            result["reason"] = "action 未标记为 approved，保持 hold"
            results.append(result)
            continue
        if action["type"] == "set-upgrade-threshold":
            current = config.get("upgrade", {}).get("distinct_tasks_threshold")
            if current != action["expected_old_value"]:
                result["reason"] = f"当前阈值 {current} 与期望旧值不一致"
            else:
                updated = json.loads(json.dumps(config))
                updated["upgrade"]["distinct_tasks_threshold"] = action["new_value"]
                lifecycle.atomic_write(config_path, json.dumps(updated, ensure_ascii=False, indent=2) + "\n")
                config.clear()
                config.update(updated)
                result.update({"status": "applied", "old_value": current, "new_value": action["new_value"]})
                applied += 1
            results.append(result)
            continue
        source, target = validate_action_paths(action, root, paths, lifecycle) or (None, None)
        if source is None or target is None:
            result["reason"] = "无法解析归档路径"
            results.append(result)
            continue
        if not source.is_file():
            result["reason"] = "源文件不存在"
            results.append(result)
            continue
        if target.exists():
            result["reason"] = "归档目标已存在，拒绝覆盖"
            results.append(result)
            continue
        before = lifecycle.sha256_file(source)
        if before != str(action["sha256"]).lower():
            result["reason"] = "源文件 SHA-256 与 action 不一致"
            results.append(result)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
        after = lifecycle.sha256_file(target)
        if before != after:
            if target.exists() and not source.exists():
                target.replace(source)
            raise ReviewError(f"归档 SHA-256 不一致，已尝试恢复：{source}")
        result.update({"status": "applied", "from": lifecycle.rel_path(source, root), "to": lifecycle.rel_path(target, root), "sha256": after})
        applied += 1
        results.append(result)
    state["apply_results"] = results
    state["applied_at"] = now_iso()
    state["status"] = "applied" if all(item["status"] == "applied" for item in results) else "applied_with_holds"
    state["deletions"] = 0
    write_state(state_path, state, lifecycle)
    report_root = report_path_for(root, config, quarter, lifecycle)
    report_root.mkdir(parents=True, exist_ok=True)
    lifecycle.atomic_write(report_root / "04-Apply-Result.json", json.dumps({"applied": applied, "results": results}, ensure_ascii=False, indent=2) + "\n")
    lifecycle.atomic_write(report_root / "run-manifest.json", json.dumps(state, ensure_ascii=False, indent=2) + "\n")
    return {
        "status": state["status"],
        "quarter": quarter,
        "applied": applied,
        "holds": sum(1 for item in results if item["status"] != "applied"),
        "deletions": 0,
        "state_path": lifecycle.rel_path(state_path, root),
    }


def resolve_quarter(value: str | None) -> str:
    return value.strip() if value else previous_quarter()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ResearchKB quarterly Review state machine")
    parser.add_argument("command", choices=("prepare", "status", "start", "checkpoint", "finalize", "apply"), nargs="?", default="prepare")
    parser.add_argument("--root", type=Path, default=WORKSPACE_ROOT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--quarter", type=str, default=None)
    parser.add_argument("--batch-id", type=str, default=None)
    parser.add_argument("--answers-file", type=Path, default=None)
    parser.add_argument("--actions-file", type=Path, default=None)
    parser.add_argument("--confirm", type=str, default=None)
    parser.add_argument("--no-write", action="store_true", help="仅生成/检查，不写 Review 状态、问答或报告")
    return parser


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    args = build_parser().parse_args(argv)
    try:
        lifecycle = load_lifecycle_module()
        config_path = args.config.resolve()
        config = lifecycle.load_config(config_path)
        root = lifecycle.validate_root(args.root, config)
        quarter = resolve_quarter(args.quarter)
        parse_quarter(quarter)
        if args.command == "prepare":
            result = prepare(root, config, quarter, lifecycle, write=not args.no_write)
        elif args.command == "status":
            result = status(root, config, quarter, lifecycle)
        elif args.command == "start":
            result = start_review(root, config, quarter, lifecycle, write=not args.no_write)
        elif args.command == "checkpoint":
            if not args.batch_id or not args.answers_file:
                raise ReviewError("checkpoint 必须提供 --batch-id 和 --answers-file")
            result = checkpoint(root, config, quarter, args.batch_id, args.answers_file, lifecycle, write=not args.no_write)
        elif args.command == "finalize":
            result = finalize(root, config, quarter, lifecycle, actions_file=args.actions_file, write=not args.no_write)
        else:
            if args.no_write:
                raise ReviewError("apply 不支持 --no-write；请使用 status 或 finalize 预览")
            if not args.confirm:
                raise ReviewError(f"apply 必须提供 --confirm {CONFIRM_TEXT!r}")
            result = apply_actions(root, config_path, config, quarter, lifecycle, confirmation=args.confirm)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ReviewError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
