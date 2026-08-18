#!/usr/bin/env python3
"""Apply the guarded Curated -> Areas stage for ResearchKB.

The upgrade gate is the only source of candidates.  This stage adds source
traceability and an isolated automatic Areas namespace.  Existing knowledge
files are never selected as update targets unless they are explicit
ResearchKB-managed Area files with the exact managed marker.
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
UPGRADE_SCHEMA = "researchkb-upgrade-decision/v1"
AREA_SCHEMA = "researchkb-area-sync/v1"
AREA_FILE_SCHEMA = "researchkb-area/v1"
AREA_START = "<!-- BEGIN CODEX MANAGED: AREA -->"
AREA_END = "<!-- END CODEX MANAGED: AREA -->"
CURATED_ID_RE = re.compile(r"^curated-[A-Za-z0-9][A-Za-z0-9._-]*$")


class AreasError(RuntimeError):
    pass


def load_lifecycle_module() -> Any:
    script = HARNESS_ROOT / "scripts" / "knowledge_lifecycle.py"
    spec = importlib.util.spec_from_file_location("knowledge_lifecycle_for_areas", script)
    if not spec or not spec.loader:
        raise AreasError(f"无法加载生命周期模块：{script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_upgrade_state(root: Path, config: dict[str, Any], lifecycle: Any) -> dict[str, Any]:
    path = lifecycle.lifecycle_paths(root, config)["upgrade_state"]
    if not path.is_file():
        raise AreasError(f"升级决策不存在，不能处理 Areas：{path}")
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AreasError(f"无法读取升级决策：{path}: {exc}") from exc
    if not isinstance(state, dict) or state.get("schema") != UPGRADE_SCHEMA:
        raise AreasError("升级决策 schema 不匹配，停止 Areas 写入")
    if not isinstance(state.get("decisions", []), list):
        raise AreasError("升级决策 decisions 不是列表，停止 Areas 写入")
    if not isinstance(state.get("auto_areas_apply"), bool):
        raise AreasError("升级决策的 auto_areas_apply 必须是布尔值")
    return state


def normalize_text(value: Any, fallback: str = "") -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip() or fallback


def safe_component(value: str, fallback: str = "Others") -> str:
    value = normalize_text(value, fallback)
    value = re.sub(r"[^0-9A-Za-z_\-\u3400-\u9fff]+", "-", value, flags=re.UNICODE)
    value = value.strip(".-_")
    return value or fallback


def quote(value: Any) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def area_category(card: dict[str, Any], curated_root: Path, root: Path) -> str:
    try:
        relative = Path(str(card["path"]).replace("\\", "/")).relative_to(
            Path(lifecycle_rel(curated_root, root))
        )
    except (KeyError, ValueError):
        return "Others"
    return safe_component(relative.parts[0] if relative.parts else "Others")


def lifecycle_rel(path: Path, root: Path) -> str:
    return str(path.resolve().relative_to(root.resolve())).replace("\\", "/")


def marker_counts(text: str) -> tuple[int, int]:
    return text.count(AREA_START), text.count(AREA_END)


def has_valid_area_markers(text: str) -> bool:
    starts, ends = marker_counts(text)
    if starts != 1 or ends != 1:
        return False
    return text.index(AREA_START) < text.index(AREA_END)


def managed_block(decision: dict[str, Any]) -> str:
    sources = normalize_text(decision.get("sources"), "[]").replace("`", "")
    source_items = normalize_text(decision.get("source_items"), "[]").replace("`", "")
    title = normalize_text(decision.get("title"), decision["resource_id"])
    curated_path = str(decision["curated_path"]).replace("\\", "/")
    return "\n".join(
        [
            AREA_START,
            "## Curated 来源",
            "",
            f"- `derived_from`：`{decision['derived_from']}`",
            f"- Curated：[[{curated_path}|{title.replace(']', '')}]]",
            f"- Curated SHA-256：`{decision['curated_sha256']}`",
            f"- `sources`：`{sources}`",
            f"- `source_items`：`{source_items}`",
            "",
            "## 自动沉淀状态",
            "",
            f"- 使用门：滚动 {decision['window_days']} 天 `distinct_tasks >= {decision['threshold']}`",
            f"- 当前任务数：`{decision.get('distinct_tasks', 0)}`",
            "- 状态：日常使用门已满足；季度人工 Review 只负责系统体检和非日常调整。",
            AREA_END,
        ]
    )


def new_area_markdown(decision: dict[str, Any]) -> str:
    title = normalize_text(decision.get("title"), decision["resource_id"])
    today = datetime.now().astimezone().date().isoformat()
    sources = normalize_text(decision.get("sources"), "[]")
    return "\n".join(
        [
            "---",
            f"schema: {quote(AREA_FILE_SCHEMA)}",
            'record_kind: "area"',
            'knowledge_status: "auto-derived"',
            'managed_by: "researchkb"',
            f"derived_from: {quote(decision['derived_from'])}",
            f"source_curated: {quote(decision['curated_path'])}",
            f"source_sha256: {quote(decision['curated_sha256'])}",
            f"sources: {quote(sources)}",
            f"created: {quote(today)}",
            f"updated: {quote(today)}",
            "---",
            "",
            f"# {title}",
            "",
            "> 此页由 Curated 使用升级门自动生成，保留来源追踪；季度人工 Review 负责系统体检，不替代来源核验和人工判断。",
            "",
            managed_block(decision),
            "",
            "## 人工 Review",
            "",
            "- [ ] 核验 Curated 内容与原始来源",
            "- [ ] 确认是否纳入本 Area",
            "- [ ] 确认结构、条件、单位和适用范围",
            "",
        ]
    )


def replace_managed_block(text: str, decision: dict[str, Any]) -> str:
    if not has_valid_area_markers(text):
        raise AreasError("目标 Area 缺少唯一且完整的 CODEX MANAGED: AREA 区域")
    start = text.index(AREA_START)
    end = text.index(AREA_END, start)
    return text[:start] + managed_block(decision) + text[end + len(AREA_END) :]


def read_area_inventory(root: Path, paths: dict[str, Path], lifecycle: Any) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    claims: dict[str, list[dict[str, Any]]] = {}
    if paths["areas"].is_dir():
        candidates = [path for path in lifecycle.iter_files(paths["areas"]) if path.suffix.lower() == ".md"]
    else:
        candidates = []
    for path in candidates:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            text = ""
        frontmatter = lifecycle.parse_frontmatter(path)
        derived_from = str(frontmatter.get("derived_from", "")).strip()
        record = {
            "path": lifecycle.rel_path(path, root),
            "absolute_path": path,
            "derived_from": derived_from,
            "managed": has_valid_area_markers(text),
            "frontmatter": frontmatter,
            "text": text,
        }
        files.append(record)
        if derived_from:
            claims.setdefault(derived_from, []).append(record)
    managed = sum(1 for item in files if item["managed"])
    return {
        "files": files,
        "claims": claims,
        "file_count": len(files),
        "managed_file_count": managed,
        "protected_file_count": len(files) - managed,
    }


def curated_cards(scan: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], set[str]]:
    duplicate_groups = scan.get("curated", {}).get("duplicate_id_groups", {})
    duplicate_ids = set(duplicate_groups) if isinstance(duplicate_groups, dict) else set()
    cards: dict[str, dict[str, Any]] = {}
    for card in scan.get("curated", {}).get("cards", []):
        resource_id = str(card.get("id", "")).strip()
        if resource_id and resource_id not in duplicate_ids:
            cards[resource_id] = card
    return cards, duplicate_ids


def make_decision(
    upgrade_decision: dict[str, Any],
    cards: dict[str, dict[str, Any]],
    duplicate_ids: set[str],
    inventory: dict[str, Any],
    paths: dict[str, Path],
    root: Path,
    config: dict[str, Any],
) -> dict[str, Any]:
    resource_id = normalize_text(upgrade_decision.get("resource_id"))
    derived_from = normalize_text(upgrade_decision.get("derived_from"))
    decision: dict[str, Any] = {
        "resource_id": resource_id,
        "derived_from": derived_from,
        "eligible": False,
        "action": "hold",
        "reason": "",
        "distinct_tasks": upgrade_decision.get("distinct_tasks", 0),
        "threshold": upgrade_decision.get("threshold", config.get("upgrade", {}).get("distinct_tasks_threshold", 5)),
        "window_days": upgrade_decision.get("window_days", config.get("upgrade", {}).get("window_days", 90)),
    }
    if not bool(upgrade_decision.get("eligible")) or upgrade_decision.get("action") != "propose-area-upgrade":
        decision["reason"] = f"升级阶段未生成 Areas 候选：{normalize_text(upgrade_decision.get('reason'), '保持 Curated') }"
        return decision
    if not resource_id or resource_id != derived_from:
        decision["reason"] = "resource_id 与 derived_from 不一致，保守 hold"
        return decision
    if not CURATED_ID_RE.fullmatch(resource_id):
        decision["reason"] = "derived_from 不是合法 Curated ID，保守 hold"
        return decision
    if resource_id in duplicate_ids:
        decision["reason"] = "Curated ID 重复，禁止生成 Areas"
        return decision
    card = cards.get(resource_id)
    if not card:
        decision["reason"] = "对应 Curated 卡片不存在，禁止生成 Areas"
        return decision
    sources = normalize_text(card.get("sources"), "")
    if sources.lower() in {"", "[]", "{}", "null", "none"}:
        decision["reason"] = "Curated 来源身份无法追踪，禁止生成 Areas"
        return decision

    category = area_category(card, paths["curated"], root)
    target = paths["areas_auto_root"] / category / f"{resource_id}.md"
    claims = inventory["claims"].get(resource_id, [])
    other_claims = [item for item in claims if item["absolute_path"].resolve() != target.resolve()]
    decision.update(
        {
            "eligible": True,
            "curated_path": card["path"],
            "curated_sha256": card.get("sha256", ""),
            "title": card.get("title", resource_id),
            "sources": card.get("sources", "[]"),
            "source_items": card.get("source_items", "[]"),
            "category": category,
            "area_path": lifecycle_rel(target, root),
            "existing_area_claims": [item["path"] for item in claims],
        }
    )
    if other_claims:
        decision["eligible"] = False
        decision["reason"] = "已有其他 Area 声明相同 derived_from，禁止自动合并"
    elif target.is_file():
        frontmatter = next(
            (item["frontmatter"] for item in inventory["files"] if item["absolute_path"].resolve() == target.resolve()),
            {},
        )
        target_text = next(
            (item["text"] for item in inventory["files"] if item["absolute_path"].resolve() == target.resolve()),
            "",
        )
        if frontmatter.get("derived_from") != resource_id:
            decision["eligible"] = False
            decision["reason"] = "自动 Area 目标已存在但 derived_from 不匹配，禁止覆盖"
        elif frontmatter.get("managed_by") != "researchkb" or not has_valid_area_markers(target_text):
            decision["eligible"] = False
            decision["reason"] = "自动 Area 目标缺少受控 managed 标记，禁止覆盖"
        else:
            decision["action"] = "update-area"
            decision["reason"] = "更新自动 Area 的 CODEX MANAGED: AREA 区域，保留其余内容"
    else:
        decision["action"] = "create-area"
        decision["reason"] = "满足升级门且无同源 Area；写入隔离的 _Codex-Auto 目录"
    if not decision["eligible"]:
        decision["action"] = "hold"
    return decision


def evaluate_areas(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    lifecycle = load_lifecycle_module()
    paths = lifecycle.lifecycle_paths(root, config)
    upgrade = load_upgrade_state(root, config, lifecycle)
    scan = lifecycle.scan_workspace(root, config)
    cards, duplicate_ids = curated_cards(scan)
    inventory = read_area_inventory(root, paths, lifecycle)
    decisions = [
        make_decision(item, cards, duplicate_ids, inventory, paths, root, config)
        for item in upgrade.get("decisions", [])
        if isinstance(item, dict)
    ]
    candidates = [item for item in decisions if item["action"] in {"create-area", "update-area"}]
    if not decisions:
        status = "OK_EMPTY"
    elif candidates:
        status = "AREA_CANDIDATES_READY"
    else:
        status = "NO_ELIGIBLE_RESOURCES"
    return {
        "schema": AREA_SCHEMA,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": status,
        "source_upgrade_generated_at": upgrade.get("generated_at"),
        "window_days": int(config.get("upgrade", {}).get("window_days", 90)),
        "distinct_tasks_threshold": int(config.get("upgrade", {}).get("distinct_tasks_threshold", 5)),
        "areas_file_count": inventory["file_count"],
        "managed_area_file_count": inventory["managed_file_count"],
        "protected_area_file_count": inventory["protected_file_count"],
        "decisions": decisions,
        "formal_apply": False,
        "areas_writes": 0,
        "deletions": 0,
    }


def write_proposals(root: Path, config: dict[str, Any], result: dict[str, Any], lifecycle: Any) -> Path:
    paths = lifecycle.lifecycle_paths(root, config)
    stamp = datetime.now().astimezone().strftime("areas-%Y%m%d-%H%M%S")
    run_root = paths["areas_proposal_root"] / stamp
    suffix = 1
    while run_root.exists():
        suffix += 1
        run_root = paths["areas_proposal_root"] / f"{stamp}-{suffix}"
    candidates = [item for item in result["decisions"] if item["action"] in {"create-area", "update-area"}]
    for decision in candidates:
        proposal_path = run_root / f"{safe_component(decision['resource_id'])}.md"
        lifecycle.atomic_write(proposal_path, new_area_markdown(decision))
        decision["proposal_path"] = lifecycle.rel_path(proposal_path, root)
    manifest = {
        "schema": AREA_SCHEMA,
        "generated_at": result["generated_at"],
        "status": result["status"],
        "formal_apply": result["formal_apply"],
        "decisions": result["decisions"],
        "deletions": 0,
    }
    lifecycle.atomic_write(run_root / "run-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    result["proposal_run"] = lifecycle.rel_path(run_root, root)
    return run_root


def apply_area_candidates(root: Path, config: dict[str, Any], result: dict[str, Any], lifecycle: Any) -> None:
    paths = lifecycle.lifecycle_paths(root, config)
    if not bool(config.get("areas", {}).get("allow_formal_apply", False)):
        raise AreasError("配置未允许 Areas 的显式 formal apply")
    writes = 0
    for decision in result["decisions"]:
        if decision["action"] not in {"create-area", "update-area"}:
            continue
        target = root / Path(str(decision["area_path"]).replace("/", "\\"))
        if not lifecycle.is_within(target, paths["areas_auto_root"]):
            decision["action"] = "hold"
            decision["eligible"] = False
            decision["reason"] = "目标路径越过 _Codex-Auto 边界，禁止写入"
            continue
        if decision["action"] == "create-area":
            if target.exists():
                decision["action"] = "hold"
                decision["eligible"] = False
                decision["reason"] = "扫描后目标已存在，禁止覆盖"
                continue
            lifecycle.atomic_write(target, new_area_markdown(decision))
            writes += 1
            continue
        if not target.is_file():
            decision["action"] = "hold"
            decision["eligible"] = False
            decision["reason"] = "扫描后更新目标消失，禁止重建"
            continue
        try:
            current = target.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            decision["action"] = "hold"
            decision["eligible"] = False
            decision["reason"] = f"无法读取更新目标，保守 hold：{exc}"
            continue
        frontmatter = lifecycle.parse_frontmatter(target)
        if frontmatter.get("derived_from") != decision["resource_id"] or frontmatter.get("managed_by") != "researchkb":
            decision["action"] = "hold"
            decision["eligible"] = False
            decision["reason"] = "更新目标在应用前不再满足 managed/derived_from 门禁"
            continue
        try:
            updated = replace_managed_block(current, decision)
        except AreasError as exc:
            decision["action"] = "hold"
            decision["eligible"] = False
            decision["reason"] = str(exc)
            continue
        if updated != current:
            lifecycle.atomic_write(target, updated)
            writes += 1
    result["areas_writes"] = writes
    result["formal_apply"] = True
    if writes:
        result["status"] = "AREAS_APPLIED"


def run_sync(root: Path, config: dict[str, Any], *, apply: bool = False, write: bool = True) -> dict[str, Any]:
    lifecycle = load_lifecycle_module()
    result = evaluate_areas(root, config)
    result["formal_apply"] = bool(apply)
    if not write:
        result["written"] = False
        return result
    write_proposals(root, config, result, lifecycle)
    if apply:
        apply_area_candidates(root, config, result, lifecycle)
    state_path = lifecycle.lifecycle_paths(root, config)["areas_state"]
    lifecycle.atomic_write(state_path, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    result["written"] = True
    result["state_path"] = lifecycle.rel_path(state_path, root)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ResearchKB guarded Curated to Areas sync")
    parser.add_argument("command", choices=("sync",), nargs="?", default="sync")
    parser.add_argument("--root", type=Path, default=WORKSPACE_ROOT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--apply", action="store_true", help="仅显式应用到 02-Areas/_Codex-Auto")
    parser.add_argument("--no-write", action="store_true", help="只评估，不写提案、状态或 Areas")
    args = parser.parse_args(argv)
    if args.apply and args.no_write:
        parser.error("--apply 与 --no-write 不能同时使用")
    try:
        lifecycle = load_lifecycle_module()
        config = lifecycle.load_config(args.config.resolve())
        root = lifecycle.validate_root(args.root, config)
        result = run_sync(root, config, apply=args.apply, write=not args.no_write)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (RuntimeError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
