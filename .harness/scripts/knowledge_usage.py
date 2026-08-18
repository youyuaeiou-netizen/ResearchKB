#!/usr/bin/env python3
"""Real Curated usage ledger for ResearchKB.

Only an explicit ``record`` call creates an ``effective_use`` event.  Reads,
scans, tests, maintenance runs, and aggregate calculations never count as
usage.  The ledger is append-only, task/resource idempotent, and aggregation
is limited to the configured 30/90-day windows.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
DEFAULT_CONFIG = HARNESS_ROOT / "config" / "knowledge-lifecycle.json"
USAGE_SCHEMA = "researchkb-usage-event/v1"
AGGREGATE_SCHEMA = "researchkb-usage-aggregate/v1"


class UsageError(RuntimeError):
    pass


def load_lifecycle_module() -> Any:
    script = HARNESS_ROOT / "scripts" / "knowledge_lifecycle.py"
    spec = importlib.util.spec_from_file_location("knowledge_lifecycle_for_usage", script)
    if not spec or not spec.loader:
        raise UsageError(f"无法加载生命周期模块：{script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_identifier(value: str, label: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise UsageError(f"{label} 不能为空")
    if len(normalized) > 240 or any(char in normalized for char in "\\/\r\n\t"):
        raise UsageError(f"{label} 含非法字符或过长")
    return normalized


def validate_resource_id(value: str) -> str:
    resource_id = normalize_identifier(value, "resource_id")
    if not resource_id.startswith("curated-"):
        raise UsageError("usage 只能记录 Curated ID（必须以 curated- 开头）")
    return resource_id


def parse_event_time(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise UsageError("usage 事件缺少 time")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise UsageError(f"usage time 无法解析：{value!r}") from exc
    if parsed.tzinfo is None:
        raise UsageError("usage time 必须包含时区")
    return parsed.astimezone()


def event_key(event: dict[str, Any]) -> tuple[str, str]:
    return str(event["task_id"]), str(event["resource_id"])


def expected_event_id(task_id: str, resource_id: str, event_type: str) -> str:
    raw = "\0".join((task_id, resource_id, event_type)).encode("utf-8")
    return f"usage-{hashlib.sha256(raw).hexdigest()[:24]}"


def usage_paths(lifecycle: Any, root: Path, config: dict[str, Any]) -> dict[str, Path]:
    paths = lifecycle.lifecycle_paths(root, config)
    return {
        "events": paths["usage_events"],
        "aggregate": paths["usage_aggregate"],
        "state": paths["state"],
    }


def acquire_ledger_lock(events_path: Path) -> Path:
    lock_path = events_path.with_name(f"{events_path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(descriptor)
    except FileExistsError as exc:
        raise UsageError(f"usage ledger 正在被其他进程写入：{lock_path}") from exc
    return lock_path


def release_ledger_lock(lock_path: Path) -> None:
    try:
        lock_path.unlink()
    except FileNotFoundError:
        pass


def read_events(events_path: Path, config: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    if not events_path.exists():
        return [], []
    expected_type = str(config.get("usage", {}).get("event_type", "effective_use"))
    events: list[dict[str, Any]] = []
    errors: list[str] = []
    try:
        lines = events_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as exc:
        return [], [f"无法读取 usage ledger：{exc}"]
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"第 {line_number} 行 JSON 无效：{exc.msg}")
            continue
        if not isinstance(event, dict):
            errors.append(f"第 {line_number} 行不是对象")
            continue
        required = ("schema", "event_id", "task_id", "resource_id", "event", "time", "context")
        missing = [key for key in required if not event.get(key)]
        if missing:
            errors.append(f"第 {line_number} 行缺少字段：{', '.join(missing)}")
            continue
        if event.get("schema") != USAGE_SCHEMA or event.get("event") != expected_type:
            errors.append(f"第 {line_number} 行 schema/event 不受支持")
            continue
        try:
            task_id = normalize_identifier(str(event["task_id"]), "task_id")
            resource_id = validate_resource_id(str(event["resource_id"]))
            parse_event_time(event["time"])
        except UsageError as exc:
            errors.append(f"第 {line_number} 行无效：{exc}")
            continue
        expected_id = expected_event_id(task_id, resource_id, expected_type)
        if event.get("event_id") != expected_id:
            errors.append(f"第 {line_number} 行 event_id 不匹配")
            continue
        events.append(event)
    return events, errors


def make_event(task_id: str, resource_id: str, context: str, config: dict[str, Any]) -> dict[str, Any]:
    usage_config = config.get("usage", {})
    event_type = str(usage_config.get("event_type", "effective_use"))
    allowed_contexts = {str(value) for value in usage_config.get("contexts", [])}
    if context not in allowed_contexts:
        raise UsageError(f"context 不在配置清单内：{context!r}")
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    return {
        "schema": USAGE_SCHEMA,
        "event_id": expected_event_id(task_id, resource_id, event_type),
        "task_id": task_id,
        "resource_id": resource_id,
        "event": event_type,
        "time": now,
        "context": context,
        "source": "knowledge_usage.py",
    }


def record_usage(root: Path, config: dict[str, Any], task_id: str, resource_id: str, context: str) -> dict[str, Any]:
    lifecycle = load_lifecycle_module()
    paths = usage_paths(lifecycle, root, config)
    task_id = normalize_identifier(task_id, "task_id")
    resource_id = validate_resource_id(resource_id)
    event = make_event(task_id, resource_id, context, config)
    lock_path = acquire_ledger_lock(paths["events"])
    try:
        events, errors = read_events(paths["events"], config)
        if errors:
            return {
                "status": "ERROR_LEDGER_INVALID",
                "task_id": task_id,
                "resource_id": resource_id,
                "errors": errors,
                "appended": False,
            }
        key = (task_id, resource_id)
        if any(event_key(existing) == key for existing in events):
            return {
                "status": "DUPLICATE_IGNORED",
                "event_id": event["event_id"],
                "task_id": task_id,
                "resource_id": resource_id,
                "appended": False,
            }
        paths["events"].parent.mkdir(parents=True, exist_ok=True)
        with paths["events"].open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        return {"status": "RECORDED", **event, "appended": True}
    finally:
        release_ledger_lock(lock_path)


def build_aggregate(events: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    usage_config = config.get("usage", {})
    recent_days = int(usage_config.get("recent_days", 30))
    window_days = int(usage_config.get("window_days", 90))
    if recent_days <= 0 or window_days < recent_days:
        raise UsageError("usage 时间窗口配置无效")
    now = datetime.now().astimezone()
    resources: dict[str, dict[str, Any]] = {}
    global_tasks: set[str] = set()
    unique_events: list[dict[str, Any]] = []
    duplicate_count = 0
    seen: set[tuple[str, str]] = set()
    future_events: list[str] = []
    for event in events:
        timestamp = parse_event_time(event["time"])
        age_days = (now - timestamp).total_seconds() / 86400
        if age_days < -0.01:
            future_events.append(str(event["event_id"]))
            continue
        key = event_key(event)
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        unique_events.append(event)
        resource_id = str(event["resource_id"])
        stats = resources.setdefault(resource_id, {
            "total_uses": 0,
            "uses_30d": 0,
            "uses_90d": 0,
            "distinct_tasks": 0,
            "last_used": None,
            "_tasks_90d": set(),
        })
        stats["total_uses"] += 1
        previous_last = stats["last_used"]
        if previous_last is None or timestamp > parse_event_time(previous_last):
            stats["last_used"] = timestamp.isoformat(timespec="seconds")
        if age_days <= recent_days:
            stats["uses_30d"] += 1
        if age_days <= window_days:
            stats["uses_90d"] += 1
            stats["_tasks_90d"].add(str(event["task_id"]))
            global_tasks.add(str(event["task_id"]))
    if future_events:
        raise UsageError(f"usage 存在未来时间事件，拒绝更新聚合：{', '.join(future_events)}")
    for stats in resources.values():
        stats["distinct_tasks"] = len(stats.pop("_tasks_90d"))
    ordered_resources = dict(sorted(resources.items(), key=lambda item: item[0]))
    total_uses = len(unique_events)
    uses_30d = sum(int(stats["uses_30d"]) for stats in ordered_resources.values())
    uses_90d = sum(int(stats["uses_90d"]) for stats in ordered_resources.values())
    status = "OK_EMPTY" if not unique_events else ("OK_WITH_DUPLICATES" if duplicate_count else "OK")
    return {
        "schema": AGGREGATE_SCHEMA,
        "generated_at": now.isoformat(timespec="seconds"),
        "event_type": str(usage_config.get("event_type", "effective_use")),
        "recent_days": recent_days,
        "window_days": window_days,
        "status": status,
        "total_uses": total_uses,
        "uses_30d": uses_30d,
        "uses_90d": uses_90d,
        "distinct_tasks": len(global_tasks),
        "duplicate_events_ignored": duplicate_count,
        "resources": ordered_resources,
    }


def aggregate_usage(root: Path, config: dict[str, Any], write: bool) -> dict[str, Any]:
    lifecycle = load_lifecycle_module()
    paths = usage_paths(lifecycle, root, config)
    lock_path = acquire_ledger_lock(paths["events"])
    try:
        events, errors = read_events(paths["events"], config)
        if errors:
            return {"status": "ERROR_LEDGER_INVALID", "errors": errors, "written": False}
        aggregate = build_aggregate(events, config)
        if write:
            paths["events"].parent.mkdir(parents=True, exist_ok=True)
            paths["events"].touch(exist_ok=True)
            lifecycle.atomic_write(paths["aggregate"], json.dumps(aggregate, ensure_ascii=False, indent=2) + "\n")
            aggregate["written"] = True
        else:
            aggregate["written"] = False
        return aggregate
    finally:
        release_ledger_lock(lock_path)


def check_usage(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    lifecycle = load_lifecycle_module()
    paths = usage_paths(lifecycle, root, config)
    events, errors = read_events(paths["events"], config)
    if errors:
        return {"status": "ERROR_LEDGER_INVALID", "errors": errors, "aggregate_exists": paths["aggregate"].is_file()}
    expected = build_aggregate(events, config)
    aggregate_exists = paths["aggregate"].is_file()
    aggregate_matches = None
    aggregate_errors: list[str] = []
    if aggregate_exists:
        try:
            actual = json.loads(paths["aggregate"].read_text(encoding="utf-8"))
            for key in ("total_uses", "uses_30d", "uses_90d", "distinct_tasks"):
                if actual.get(key) != expected.get(key):
                    aggregate_errors.append(f"聚合字段不一致：{key}")
            aggregate_matches = not aggregate_errors
        except (OSError, json.JSONDecodeError) as exc:
            aggregate_errors.append(f"无法读取聚合文件：{exc}")
            aggregate_matches = False
    return {
        "status": "PASS" if not aggregate_errors else "FAIL_AGGREGATE_DRIFT",
        "event_count": len(events),
        "duplicate_events_ignored": expected["duplicate_events_ignored"],
        "aggregate_exists": aggregate_exists,
        "aggregate_matches": aggregate_matches,
        "errors": aggregate_errors,
        "invariants": {
            "event_type_only_effective_use": expected["event_type"] == "effective_use",
            "window_days": expected["window_days"],
            "same_task_resource_counted_once": True,
        },
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ResearchKB real usage ledger")
    parser.add_argument("command", choices=("record", "aggregate", "check"), nargs="?", default="check")
    parser.add_argument("--root", type=Path, default=WORKSPACE_ROOT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--task-id", default="")
    parser.add_argument("--resource", default="")
    parser.add_argument("--context", default="codex")
    parser.add_argument("--no-write", action="store_true", help="aggregate 只计算，不更新聚合文件")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        lifecycle = load_lifecycle_module()
        config = lifecycle.load_config(args.config.resolve())
        root = lifecycle.validate_root(args.root, config)
        if args.command == "record":
            if args.no_write:
                raise UsageError("record 不支持 --no-write；显式 record 就是真实 usage 写入")
            result = record_usage(root, config, args.task_id, args.resource, args.context)
        elif args.command == "aggregate":
            result = aggregate_usage(root, config, write=not args.no_write)
        else:
            if args.no_write:
                raise UsageError("check 不支持 --no-write")
            result = check_usage(root, config)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if not str(result.get("status", "")).startswith(("ERROR", "FAIL")) else 2
    except (UsageError, OSError, json.JSONDecodeError, lifecycle.LifecycleError if "lifecycle" in locals() else UsageError) as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
