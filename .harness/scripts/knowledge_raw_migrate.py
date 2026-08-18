#!/usr/bin/env python3
"""Move the approved external source folders into the ResearchKB RAW root.

The command is intentionally narrow and conservative:
- without --apply it only prints a migration plan;
- --apply writes a SHA-256 manifest before moving anything;
- every moved tree is verified byte-for-byte and rolled back on failure;
- it never deletes files or touches Curated, Areas, Reports, Horizon staging,
  Zotero, Obsidian, or system directories.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
DEFAULT_ROOT = HARNESS_ROOT.parent
EXPECTED_ROOT = WORKSPACE_ROOT.resolve()
SOURCE_NAMES = ("Clipper", "horizon", "literatures")


class MigrationError(RuntimeError):
    pass


def iso_now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tree_manifest(path: Path, root: Path) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    for child in sorted(path.rglob("*")):
        if not child.is_file():
            continue
        relative = child.relative_to(path).as_posix()
        files.append(
            {
                "path": relative,
                "size": child.stat().st_size,
                "sha256": sha256_file(child),
            }
        )
    canonical = json.dumps(files, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return {
        "path": str(path.resolve().relative_to(root.resolve())).replace("\\", "/"),
        "file_count": len(files),
        "bytes": sum(int(item["size"]) for item in files),
        "tree_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "files": files,
    }


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary_path = Path(temporary)
        if temporary_path.exists():
            temporary_path.unlink()


def validate_root(root: Path) -> Path:
    resolved = root.resolve()
    if resolved != EXPECTED_ROOT:
        raise MigrationError(f"RAW 归位只允许当前工作区根，收到：{resolved}")
    if not resolved.is_dir():
        raise MigrationError(f"工作区不存在：{resolved}")
    return resolved


def build_plan(root: Path) -> dict[str, Any]:
    raw_root = root / "03-Resources" / "RAW"
    if not raw_root.is_dir():
        raise MigrationError(f"RAW 根目录不存在：{raw_root}")

    items: list[dict[str, Any]] = []
    for name in SOURCE_NAMES:
        source = root / "03-Resources" / name
        target = raw_root / name
        if source.is_symlink() or target.is_symlink():
            status = "hold-symlink"
            source_manifest = None
            target_manifest = None
        elif source.is_dir() and not target.exists():
            status = "ready"
            source_manifest = tree_manifest(source, root)
            target_manifest = None
        elif not source.exists() and target.is_dir():
            status = "already-migrated"
            source_manifest = None
            target_manifest = tree_manifest(target, root)
        elif source.is_dir() and target.exists():
            status = "hold-target-exists"
            source_manifest = tree_manifest(source, root)
            target_manifest = tree_manifest(target, root) if target.is_dir() else None
        else:
            status = "hold-missing-source"
            source_manifest = None
            target_manifest = tree_manifest(target, root) if target.is_dir() else None
        items.append(
            {
                "name": name,
                "source": str(source.resolve().relative_to(root)).replace("\\", "/"),
                "target": str(target.resolve().relative_to(root)).replace("\\", "/"),
                "status": status,
                "source_manifest": source_manifest,
                "target_manifest": target_manifest,
            }
        )
    return {
        "schema": "researchkb-raw-migration/v1",
        "workspace_root": str(root),
        "generated_at": iso_now(),
        "raw_root": "03-Resources/RAW",
        "source_names": list(SOURCE_NAMES),
        "items": items,
        "permanent_delete": False,
    }


def apply_plan(root: Path, plan: dict[str, Any]) -> dict[str, Any]:
    items = plan["items"]
    blockers = [item for item in items if item["status"] not in {"ready", "already-migrated"}]
    if blockers:
        names = ", ".join(f"{item['name']}={item['status']}" for item in blockers)
        raise MigrationError(f"存在未解决的归位阻断，未移动任何目录：{names}")

    manifest_path = HARNESS_ROOT / "runs" / f"raw-migration-{dt.datetime.now().astimezone().strftime('%Y%m%d-%H%M%S')}.json"
    record = dict(plan)
    record["status"] = "planned"
    record["manifest_path"] = str(manifest_path)
    atomic_write(manifest_path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")

    moved: list[tuple[Path, Path]] = []
    try:
        for item in items:
            if item["status"] != "ready":
                continue
            source = root / item["source"]
            target = root / item["target"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
            moved.append((source, target))
            observed = tree_manifest(target, root)
            expected = item["source_manifest"]
            if observed["tree_sha256"] != expected["tree_sha256"] or observed["files"] != expected["files"]:
                raise MigrationError(f"SHA-256 校验失败：{item['name']}")
            item["target_manifest"] = observed
            item["status"] = "migrated"
    except Exception:
        for source, target in reversed(moved):
            if target.exists() and not source.exists():
                shutil.move(str(target), str(source))
        raise

    record = dict(plan)
    record["status"] = "applied"
    record["applied_at"] = iso_now()
    record["manifest_path"] = str(manifest_path)
    atomic_write(manifest_path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description="ResearchKB RAW source migration")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--apply", action="store_true", help="perform the reversible move")
    args = parser.parse_args()
    try:
        root = validate_root(args.root)
        plan = build_plan(root)
        if args.apply:
            result = apply_plan(root, plan)
        else:
            result = dict(plan)
            result["status"] = "dry-run"
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (MigrationError, OSError, ValueError) as exc:
        print(f"RAW migration failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
