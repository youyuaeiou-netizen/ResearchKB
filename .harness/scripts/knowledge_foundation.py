#!/usr/bin/env python3
"""Build the managed foundation-learning layer from existing Curated cards.

This is deliberately a narrow, deterministic layer.  It never modifies a
manual Area, never labels a generated card as verified, and retains every
Curated card as a traceable candidate even when it does not map to the active
learning track.
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


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
DEFAULT_CONFIG = HARNESS_ROOT / "config" / "knowledge-lifecycle.json"
SCHEMA = "researchkb-foundation-learning/v1"
CARD_SCHEMA = "researchkb-foundation-card/v1"
MARKER_START = "<!-- BEGIN CODEX MANAGED: FOUNDATION -->"
MARKER_END = "<!-- END CODEX MANAGED: FOUNDATION -->"
GRAPH_MARKER_START = "<!-- BEGIN CODEX MANAGED: FOUNDATION GRAPH -->"
GRAPH_MARKER_END = "<!-- END CODEX MANAGED: FOUNDATION GRAPH -->"
CURATED_ID_RE = re.compile(r"^curated-[A-Za-z0-9][A-Za-z0-9._-]*$")
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")


class FoundationError(RuntimeError):
    pass


def load_lifecycle_module() -> Any:
    script = HARNESS_ROOT / "scripts" / "knowledge_lifecycle.py"
    spec = importlib.util.spec_from_file_location("knowledge_lifecycle_for_foundation", script)
    if not spec or not spec.loader:
        raise FoundationError(f"无法加载生命周期模块：{script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_sources(value: Any) -> list[str]:
    text = normalize_text(value)
    if not text or text.lower() in {"[]", "{}", "null", "none"}:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return [text]
    if isinstance(parsed, list):
        return [normalize_text(item) for item in parsed if normalize_text(item)]
    return [text]


def managed_markers_valid(text: str) -> bool:
    return text.count(MARKER_START) == 1 and text.count(MARKER_END) == 1 and text.index(MARKER_START) < text.index(MARKER_END)


def foundation_config(config: dict[str, Any]) -> dict[str, Any]:
    value = config.get("foundation_learning")
    if not isinstance(value, dict) or value.get("enabled") is not True:
        raise FoundationError("基础学习自动流转未启用")
    required = ("track_id", "display_name", "auto_root", "default_topic")
    missing = [name for name in required if not normalize_text(value.get(name))]
    if missing:
        raise FoundationError(f"基础学习配置缺少字段：{', '.join(missing)}")
    topics = value.get("topics")
    if not isinstance(topics, list) or not topics:
        raise FoundationError("基础学习配置至少需要一个主题")
    ids: set[str] = set()
    for topic in topics:
        if not isinstance(topic, dict):
            raise FoundationError("基础学习主题必须是对象")
        topic_id = normalize_text(topic.get("id"))
        if not topic_id or topic_id in ids:
            raise FoundationError("基础学习主题 ID 为空或重复")
        if not normalize_text(topic.get("title")) or not isinstance(topic.get("keywords"), list):
            raise FoundationError(f"基础学习主题无效：{topic_id}")
        ids.add(topic_id)
    return value


def foundation_paths(root: Path, config: dict[str, Any], lifecycle: Any) -> dict[str, Path]:
    paths = lifecycle.lifecycle_paths(root, config)
    track = foundation_config(config)
    auto_root = lifecycle.resolve_rel(root, normalize_text(track["auto_root"]))
    if not lifecycle.is_within(auto_root, paths["areas_auto_root"]):
        raise FoundationError("基础学习 auto_root 必须位于 02-Areas/_Codex-Auto 内")
    state = lifecycle.resolve_rel(root, ".harness/state/foundation-learning-state.json")
    staging = lifecycle.resolve_rel(root, ".harness/staging/knowledge-lifecycle/foundation-proposals")
    return {"auto_root": auto_root, "state": state, "staging": staging, **paths}


def topic_for_text(text: str, track: dict[str, Any]) -> tuple[str, str, list[str]]:
    lowered = text.casefold()
    ranked: list[tuple[int, int, str, str, list[str]]] = []
    for position, topic in enumerate(track["topics"]):
        matches = [normalize_text(value) for value in topic["keywords"] if normalize_text(value).casefold() in lowered]
        if matches:
            ranked.append((len(matches), -position, normalize_text(topic["id"]), normalize_text(topic["title"]), matches))
    if not ranked:
        return "exploration", normalize_text(track["default_topic"]), []
    _, _, topic_id, title, matches = max(ranked)
    return topic_id, title, matches


def extract_auto_summary(text: str, limit: int = 3500) -> str:
    body = re.sub(r"\A---\s*\n.*?\n---\s*\n", "", text, count=1, flags=re.DOTALL).strip()
    match = re.search(r"## Codex 编译草稿\s*\n(.*?)(?:\n## 人工审阅\b|\Z)", body, flags=re.DOTALL)
    chosen = match.group(1).strip() if match else body
    return chosen[:limit].strip() or "该来源没有可用摘要；请通过关联 Curated 卡片回溯原文。"


def quote(value: Any) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def card_markdown(decision: dict[str, Any]) -> str:
    source_lines = decision["sources"] if decision["sources"] else ["来源字段为空，已被 hold"]
    source_items = "、".join(f"`{value}`" for value in source_lines)
    relation_lines = {
        "phase-diagrams": ["凝固", "相变"],
        "solidification": ["相图", "相变"],
        "phase-transformations": ["相图", "凝固"],
        "exploration": ["相图", "凝固", "相变"],
    }.get(decision["topic_id"], ["相图", "凝固", "相变"])
    return "\n".join([
        "---",
        f"schema: {quote(CARD_SCHEMA)}",
        'record_kind: "knowledge"',
        'knowledge_status: "auto-reusable"',
        'review_status: "pending"',
        'managed_by: "researchkb"',
        f"learning_track: {quote(decision['track_id'])}",
        f"learning_topic: {quote(decision['topic_id'])}",
        f"title: {quote(decision['title'])}",
        f"derived_from: {quote(decision['resource_id'])}",
        f"source_sha256: {quote(decision['source_sha256'])}",
        f"sources: {json.dumps(source_lines, ensure_ascii=False)}",
        f"created: {quote(decision['generated_at'])}",
        f"updated: {quote(decision['generated_at'])}",
        "---",
        "",
        f"# {decision['title']}",
        "",
        "> 这是系统自动生成的学习卡：来源可追溯且通过自动规则，但未经人工核验，不应表述为 `verified` 科学事实。",
        "",
        MARKER_START,
        "",
        "## 学习定位",
        "",
        f"- 主线：{decision['track_name']}",
        f"- 当前主题：{decision['topic_title']}",
        f"- 分类依据：{', '.join(decision['matched_keywords']) if decision['matched_keywords'] else '未匹配基础主题；保留为扩展探索'}",
        "",
        "## 来源追踪",
        "",
        f"- Curated 卡：[[{decision['curated_path']}|{decision['title']}]]",
        f"- Curated ID：`{decision['resource_id']}`",
        f"- 内容 SHA-256：`{decision['source_sha256']}`",
        f"- 来源：{source_items}",
        "",
        "## 自动摘要",
        "",
        decision["summary"],
        "",
        "## 关系链接",
        "",
        "- 关联主题：" + "、".join(relation_lines),
        "- 该卡只作为关联 Curated 来源的自动学习入口；条件、公式、单位和例外必须回溯来源确认。",
        "",
        MARKER_END,
        "",
        "## 我的判断",
        "",
    ])


def replace_managed_block(current: str, fresh: str) -> str:
    if not managed_markers_valid(current) or not managed_markers_valid(fresh):
        raise FoundationError("基础学习卡缺少唯一完整的受管区域")
    replacement = fresh[fresh.index(MARKER_START):fresh.index(MARKER_END) + len(MARKER_END)]
    return current[:current.index(MARKER_START)] + replacement + current[current.index(MARKER_END) + len(MARKER_END):]


def graph_markdown(result: dict[str, Any]) -> str:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for decision in result["decisions"]:
        if decision["action"] not in {"create", "update"}:
            continue
        grouped.setdefault(decision["topic_title"], []).append(decision)
    lines = [
        "# 相图—凝固—相变：自动关系图",
        "",
        "> 本图只汇总系统管理的自动卡；每个节点都必须回溯 Curated 与原始来源，不能替代人工核验。",
        "",
        GRAPH_MARKER_START,
        "",
        "```mermaid",
        "flowchart LR",
        '  phase["相图"] --> solid["凝固"]',
        '  solid --> transform["相变"]',
        '  phase --> transform',
        "```",
        "",
        "## 节点卡片",
        "",
    ]
    for topic, decisions in sorted(grouped.items()):
        lines.extend([f"### {topic}", ""])
        for decision in sorted(decisions, key=lambda item: (item["title"], item["resource_id"])):
            path = str(decision["area_path"]).replace("\\", "/")
            lines.append(f"- [[{path}|{decision['title']}]]")
        lines.append("")
    if not grouped:
        lines.extend(["- 暂无来源完整的自动学习卡。", ""])
    lines.extend([GRAPH_MARKER_END, ""])
    return "\n".join(lines)


def replace_graph_block(current: str, fresh: str) -> str:
    if current.count(GRAPH_MARKER_START) != 1 or current.count(GRAPH_MARKER_END) != 1:
        raise FoundationError("关系图缺少唯一完整的受管区域")
    replacement = fresh[fresh.index(GRAPH_MARKER_START):fresh.index(GRAPH_MARKER_END) + len(GRAPH_MARKER_END)]
    return current[:current.index(GRAPH_MARKER_START)] + replacement + current[current.index(GRAPH_MARKER_END) + len(GRAPH_MARKER_END):]


def evaluate(root: Path, config: dict[str, Any]) -> dict[str, Any]:
    lifecycle = load_lifecycle_module()
    paths = foundation_paths(root, config, lifecycle)
    track = foundation_config(config)
    scan = lifecycle.scan_workspace(root, config)
    duplicate_ids = set(scan["curated"].get("duplicate_id_groups", {}))
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    decisions: list[dict[str, Any]] = []
    for card in scan["curated"]["cards"]:
        resource_id = normalize_text(card.get("id"))
        source_text = normalize_text(card.get("sources"))
        decision: dict[str, Any] = {
            "resource_id": resource_id,
            "title": normalize_text(card.get("title")) or resource_id,
            "curated_path": normalize_text(card.get("path")),
            "source_sha256": normalize_text(card.get("source_sha256")),
            "sources": normalize_sources(source_text),
            "track_id": normalize_text(track["track_id"]),
            "track_name": normalize_text(track["display_name"]),
            "generated_at": generated_at,
            "topic_id": "",
            "topic_title": "",
            "matched_keywords": [],
            "summary": "",
            "action": "hold",
            "reason": "",
            "area_path": "",
        }
        if not CURATED_ID_RE.fullmatch(resource_id):
            decision["reason"] = "Curated ID 不合法，保守 hold"
        elif resource_id in duplicate_ids:
            decision["reason"] = "Curated ID 重复，保守 hold"
        elif not source_text or source_text.lower() in {"[]", "{}", "null", "none"}:
            decision["reason"] = "Curated 来源为空，保守 hold"
        elif not SHA256_RE.fullmatch(decision["source_sha256"]):
            decision["reason"] = "Curated 内容哈希缺失或格式无效，保守 hold"
        else:
            curated_path = root / Path(decision["curated_path"].replace("/", "\\"))
            try:
                source_markdown = curated_path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as exc:
                decision["reason"] = f"无法读取 Curated 卡：{exc}"
            else:
                topic_id, topic_title, matches = topic_for_text(source_markdown, track)
                decision.update({
                    "topic_id": topic_id,
                    "topic_title": topic_title,
                    "matched_keywords": matches,
                    "summary": extract_auto_summary(source_markdown),
                })
                if topic_id == "exploration" and track.get("all_curated_as_candidates") is not True:
                    decision["reason"] = "未映射内容不在当前自动候选范围内"
                    decisions.append(decision)
                    continue
                target = paths["auto_root"] / topic_id / f"{resource_id}.md"
                decision["area_path"] = lifecycle.rel_path(target, root)
                if target.exists():
                    try:
                        existing = target.read_text(encoding="utf-8")
                        frontmatter = lifecycle.parse_frontmatter(target)
                    except (OSError, UnicodeDecodeError) as exc:
                        decision["reason"] = f"无法读取已有自动卡：{exc}"
                    else:
                        if frontmatter.get("managed_by") != "researchkb" or frontmatter.get("derived_from") != resource_id:
                            decision["reason"] = "目标卡不属于同一受管来源，禁止覆盖"
                        elif not managed_markers_valid(existing):
                            decision["reason"] = "目标卡缺少完整受管区域，禁止覆盖"
                        else:
                            decision["action"] = "update"
                            decision["reason"] = "更新同源自动卡的受管区域，保留人工补充"
                else:
                    decision["action"] = "create"
                    decision["reason"] = "创建隔离的基础学习自动卡"
        decisions.append(decision)
    candidates = [item for item in decisions if item["action"] in {"create", "update"}]
    return {
        "schema": SCHEMA,
        "generated_at": generated_at,
        "status": "FOUNDATION_CANDIDATES_READY" if candidates else ("OK_EMPTY" if not decisions else "FOUNDATION_HOLDS_ONLY"),
        "track_id": track["track_id"],
        "track_name": track["display_name"],
        "curated_count": len(scan["curated"]["cards"]),
        "candidate_count": len(candidates),
        "hold_count": sum(1 for item in decisions if item["action"] == "hold"),
        "decisions": decisions,
        "areas_writes": 0,
        "deletions": 0,
    }


def write_outputs(root: Path, config: dict[str, Any], result: dict[str, Any], *, apply: bool) -> None:
    lifecycle = load_lifecycle_module()
    paths = foundation_paths(root, config, lifecycle)
    if apply and foundation_config(config).get("auto_apply") is not True:
        raise FoundationError("基础学习配置未允许自动应用")
    stamp = datetime.now().astimezone().strftime("foundation-%Y%m%d-%H%M%S")
    proposal_root = paths["staging"] / stamp
    for decision in result["decisions"]:
        if decision["action"] not in {"create", "update"}:
            continue
        preview = card_markdown(decision)
        proposal = proposal_root / decision["topic_id"] / f"{decision['resource_id']}.md"
        lifecycle.atomic_write(proposal, preview)
        decision["proposal_path"] = lifecycle.rel_path(proposal, root)
        if not apply:
            continue
        target = root / Path(decision["area_path"].replace("/", "\\"))
        if not lifecycle.is_within(target, paths["auto_root"]):
            decision["action"] = "hold"
            decision["reason"] = "目标越出基础学习受管根，拒绝写入"
            continue
        if decision["action"] == "create":
            if target.exists():
                decision["action"] = "hold"
                decision["reason"] = "扫描后目标已存在，拒绝覆盖"
                continue
            lifecycle.atomic_write(target, preview)
            result["areas_writes"] += 1
            continue
        current = target.read_text(encoding="utf-8")
        updated = replace_managed_block(current, preview)
        if updated != current:
            lifecycle.atomic_write(target, updated)
            result["areas_writes"] += 1
    if apply:
        graph_path = paths["auto_root"] / "关系图.md"
        graph = graph_markdown(result)
        if graph_path.exists():
            current_graph = graph_path.read_text(encoding="utf-8")
            lifecycle.atomic_write(graph_path, replace_graph_block(current_graph, graph))
        else:
            lifecycle.atomic_write(graph_path, graph)
        result["graph_path"] = lifecycle.rel_path(graph_path, root)
    result["formal_apply"] = apply
    if apply and result["areas_writes"]:
        result["status"] = "FOUNDATION_APPLIED"
    paths["state"].parent.mkdir(parents=True, exist_ok=True)
    lifecycle.atomic_write(paths["state"], json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    result["state_path"] = lifecycle.rel_path(paths["state"], root)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ResearchKB managed foundation-learning sync")
    parser.add_argument("command", choices=("sync",), nargs="?", default="sync")
    parser.add_argument("--root", type=Path, default=WORKSPACE_ROOT)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--apply", action="store_true", help="写入 02-Areas/_Codex-Auto 内的基础学习受管卡")
    parser.add_argument("--no-write", action="store_true", help="只评估，不写 staging、state 或 Areas")
    args = parser.parse_args(argv)
    if args.apply and args.no_write:
        parser.error("--apply 与 --no-write 不能同时使用")
    try:
        lifecycle = load_lifecycle_module()
        config = lifecycle.load_config(args.config.resolve())
        root = lifecycle.validate_root(args.root, config)
        result = evaluate(root, config)
        if args.no_write:
            result["written"] = False
        else:
            write_outputs(root, config, result, apply=args.apply)
            result["written"] = True
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (FoundationError, OSError, json.JSONDecodeError, lifecycle.LifecycleError if "lifecycle" in locals() else FoundationError) as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
