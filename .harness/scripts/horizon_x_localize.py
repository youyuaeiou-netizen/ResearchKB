#!/usr/bin/env python3
"""Fill deterministic translation hashes in a Horizon X staging manifest."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
if str(SCRIPT_PATH.parent) not in sys.path:
    sys.path.insert(0, str(SCRIPT_PATH.parent))

import horizon_daily_digest as digest


def fill_hashes(path: Path) -> dict[str, Any]:
    resolved = path.resolve()
    staging_root = (HARNESS_ROOT / "staging").resolve()
    if staging_root not in resolved.parents:
        raise ValueError("本地化清单必须位于 .harness/staging 目录。")
    try:
        manifest = json.loads(resolved.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"无法读取本地化清单：{resolved}: {exc}") from exc
    if not isinstance(manifest, dict) or manifest.get("schema") != digest.LOCALIZATION_SCHEMA:
        raise ValueError("本地化清单 schema 不匹配。")
    entries = manifest.get("entries")
    if not isinstance(entries, list):
        raise ValueError("本地化清单 entries 必须为列表。")
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("本地化清单 entry 必须为对象。")
        title = str(entry.get("title_zh") or "").strip()
        body = str(entry.get("body_zh") or "").strip()
        if not entry.get("source_identity") or not entry.get("source_sha256") or not title or not body:
            raise ValueError("每条本地化 entry 必须先填写 source_identity、source_sha256、title_zh、body_zh。")
        entry["translation_sha256"] = digest.x_translation_sha256(
            str(entry["source_identity"]),
            str(entry["source_sha256"]),
            title,
            body,
        )
    digest.atomic_write(resolved, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fill Horizon X translation hashes in staging")
    parser.add_argument("--fill-hashes", action="store_true", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = fill_hashes(args.manifest)
        print(json.dumps({"status": "OK", "manifest": str(args.manifest), "entries": len(result["entries"])}, ensure_ascii=False, indent=2))
        return 0
    except ValueError as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
