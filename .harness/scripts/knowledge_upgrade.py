#!/usr/bin/env python3
"""Evaluate the 90-day Curated upgrade gate.

This stage only decides whether a Curated resource has enough distinct real
tasks to become an Areas upgrade candidate.  It never writes Areas or
modifies Curated.  Areas application is a separate later stage.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
DEFAULT_CONFIG = HARNESS_ROOT / "config" / "knowledge-lifecycle.json"
AGGREGATE_SCHEMA = "researchkb-usage-aggregate/v1"
DECISION_SCHEMA = "researchkb-upgrade-decision/v1"
CURATED_ID_RE = re.compile(r"^curated-[A-Za-z0-9][A-Za-z0-9._-]*$")


class UpgradeError(RuntimeError):
    pass


def load_lifecycle_module() -> Any:
    script = HARNESS_ROOT / "scripts" / "knowledge_lifecycle.py"
    spec = importlib.util.spec_from_file_location("knowledge_lifecycle_for_upgrade", script)
    if not spec or not spec.loader:
        raise UpgradeError(f"无法加载生命周期模块：{script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_aggregate(root: Path, config: dict[str, Any], lifecycle: Any) -> dict[str, Any]:
    path = lifecycle.lifecycle_paths(root, config)["usage_aggregate"]
    if not path.is_file():
        raise UpgradeError(f"usage 聚合不存在，不能进行升级判断：{path}")
    try:
        aggregate = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UpgradeError(f"无法读取 usage 聚合：{path}: {exc}") from exc
    if not isinstance(aggregate, dict) or aggregate.get("schema") != AGGREGATE_SCHEMA:
        raise UpgradeError("usage 聚合 schema 不匹配")
    if aggregate.get("event_type") != "effective_use":
        raise UpgradeError("升级判断只接受 effective_use 聚合")
    expected_window = int(config.get("upgrade", {}).get("window_days", 90))
    if int(aggregate.get("window_days", -1)) != expected_window:
        raise UpgradeError("usage 聚合窗口与升级配置不一致")
    if not isinstance(aggregate.get("resources", {}), dict):
        raise UpgradeError("usage 聚合 resources 不是对象")
    return aggregate


def has_source_identity(card: dict[str, Any]) -> bool:
    """Return whether a Curated card still identifies at least one source.

    Missing title/date fields are ordinary normalization work.  A missing or
    empty source identity is different: Areas cannot preserve provenance, so
    it remains a hard structural hold.
    """

    value = str(card.get("sources", "")).strip().strip("\"'")
    return value.lower() not in {"", "[]", "{}", "null", "none"}


def evaluate_upgrade(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    lifecycle = load_lifecycle_module()
    aggregate = load_aggregate(root, config, lifecycle)
    scan = lifecycle.scan_workspace(root, config)
    cards = {str(card.get("id")): card for card in scan["curated"]["cards"] if card.get("id")}
    duplicate_ids = set(scan["curated"].get("duplicate_id_groups", {}))
    upgrade_config = config.get("upgrade", {})
    threshold = int(upgrade_config.get("distinct_tasks_threshold", 5))
    window_days = int(upgrade_config.get("window_days", 90))
    if threshold <= 0 or window_days <= 0:
        raise UpgradeError("升级阈值或窗口配置无效")

    decisions: list[dict[str, Any]] = []
    eligible: list[str] = []
    for resource_id in sorted(aggregate.get("resources", {})):
        stats = aggregate["resources"][resource_id]
        distinct_tasks = stats.get("distinct_tasks")
        decision: dict[str, Any] = {
            "resource_id": resource_id,
            "derived_from": resource_id,
            "window_days": window_days,
            "distinct_tasks": distinct_tasks,
            "threshold": threshold,
            "uses_90d": stats.get("uses_90d", 0),
            "last_used": stats.get("last_used"),
            "eligible": False,
            "action": "hold",
            "reason": "",
        }
        if not CURATED_ID_RE.fullmatch(resource_id):
            decision["reason"] = "资源 ID 不是 Curated ID，保守 hold"
        elif resource_id in duplicate_ids:
            decision["reason"] = "Curated ID 重复，保守 hold"
        elif resource_id not in cards:
            decision["reason"] = "Curated 卡片不存在，禁止升级"
        elif not has_source_identity(cards[resource_id]):
            decision["reason"] = "Curated 来源身份无法追踪，保守 hold"
        elif type(distinct_tasks) is not int or distinct_tasks < 0:
            decision["reason"] = "distinct_tasks 无效，禁止升级"
        elif distinct_tasks >= threshold:
            decision["eligible"] = True
            decision["action"] = "propose-area-upgrade"
            decision["reason"] = "满足 90 天 distinct_tasks 升级阈值，等待 Areas 阶段处理"
            eligible.append(resource_id)
        else:
            decision["reason"] = "未达到 90 天 distinct_tasks 升级阈值，继续保留 Curated"
        decisions.append(decision)

    if not decisions:
        status = "OK_EMPTY"
    elif eligible:
        status = "UPGRADE_CANDIDATES_READY"
    else:
        status = "NO_ELIGIBLE_RESOURCES"
    return {
        "schema": DECISION_SCHEMA,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": status,
        "source_aggregate_generated_at": aggregate.get("generated_at"),
        "window_days": window_days,
        "distinct_tasks_threshold": threshold,
        "eligible_resources": eligible,
        "decisions": decisions,
        "auto_areas_apply": bool(upgrade_config.get("auto_areas_apply", False)),
        "areas_writes": 0,
        "curated_writes": 0,
        "deletions": 0,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ResearchKB 90-day upgrade gate")
    parser.add_argument("command", choices=("evaluate",), nargs="?", default="evaluate")
    parser.add_argument("--root", type=Path, default=WORKSPACE_ROOT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--no-write", action="store_true", help="只评估，不更新升级状态")
    args = parser.parse_args(argv)
    try:
        lifecycle = load_lifecycle_module()
        config = lifecycle.load_config(args.config.resolve())
        root = lifecycle.validate_root(args.root, config)
        result = evaluate_upgrade(root, config)
        if not args.no_write:
            state_path = lifecycle.lifecycle_paths(root, config)["upgrade_state"]
            lifecycle.atomic_write(state_path, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
            result["written"] = True
            result["state_path"] = str(state_path)
        else:
            result["written"] = False
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (UpgradeError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
