#!/usr/bin/env python3
"""Create one traceable research and AI-engineering weekly digest from reviewed sources.

The digest is an auditable screening report, not a mechanism for promoting
unverified signals into formal scientific knowledge.  X data remains collected
only through the separately budget-gated Horizon bridge.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
if str(SCRIPT_PATH.parent) not in sys.path:
    sys.path.insert(0, str(SCRIPT_PATH.parent))

import horizon_fetch_only
import researchkb_v3 as v3


DEFAULT_CONFIG = HARNESS_ROOT / "config" / "horizon-daily-digest.json"
EXPECTED_OUTPUT_DIR = (WORKSPACE_ROOT / "03-Resources" / "RAW" / "horizon" / "Weekly").resolve()
WEEKLY_DIGEST_SCHEMA = "researchkb-horizon-weekly-digest/v1"
WEEKLY_STATE_SCHEMA = "researchkb-horizon-weekly-digest-state/v1"
WEEKLY_REPORT_SCHEMA = "researchkb-horizon-weekly-digest-report/v1"
LOCALIZATION_SCHEMA = "researchkb-horizon-x-localization/v1"
WEEKLY_FORBIDDEN_SOURCE_IDS = frozenset({"zotero-local", "openalex", "crossref"})
SYSTEMIC_X_FAILURE_STATUSES = frozenset({"SKIPPED_NO_TOKEN"})

PRIORITY_TERMS: tuple[tuple[str, int], ...] = (
    ("laser powder bed fusion", 10),
    ("lpbf", 10),
    ("selective laser melting", 9),
    ("slm", 8),
    ("metal additive manufacturing", 8),
    ("additive manufacturing", 7),
    ("powder bed fusion", 7),
    ("melt pool", 6),
    ("defect", 6),
    ("microstructure", 5),
    ("in situ", 5),
    ("monitoring", 4),
    ("quality control", 4),
    ("materials characterization", 4),
    ("phase transformation", 4),
    ("welding metallurgy", 4),
    ("corrosion", 3),
    ("alloy", 3),
    ("solidification", 3),
    ("materials informatics", 4),
    ("materials research", 4),
    ("autonomous science", 6),
    ("machine learning", 3),
    ("deep learning", 2),
    ("ai for science", 2),
    ("energy materials", 3),
    ("open source", 4),
    ("github", 3),
    ("large language model", 4),
    ("llm", 3),
    ("agent", 3),
    ("benchmark", 3),
    ("evaluation", 3),
    ("tool calling", 3),
    ("function calling", 3),
    ("api", 2),
    ("sdk", 2),
    ("documentation", 2),
    ("coding", 3),
    ("workflow", 2),
    ("automation", 2),
    ("developer", 2),
    ("inference", 2),
    ("fine-tuning", 2),
    ("feature", 2),
    ("capability", 2),
    ("build", 2),
    ("deploy", 2),
    ("开源", 4),
    ("智能体", 3),
    ("工具调用", 3),
    ("编程", 3),
    ("工作流", 2),
    ("开发", 2),
    ("推理", 2),
    ("微调", 2),
    ("功能", 2),
    ("能力", 2),
    ("构建", 2),
    ("部署", 2),
    ("评测", 3),
)

SOURCE_LABELS = {
    "openalex_metadata": "OpenAlex 公开学术元数据",
    "crossref_metadata": "Crossref 公开学术元数据",
    "horizon_staging": "Horizon 原始信号（X/GitHub，仅作线索）",
    "local_files": "用户本地导入资料",
}

X_DOMAIN_LABELS = {
    "additive_manufacturing_and_manufacturing_engineering": "增材制造与制造工程",
    "materials_metallurgy": "材料冶金",
    "materials_informatics_science_ai": "材料信息学/科学 AI",
    "ai_engineering_and_practical_workflows": "AI 工程与实用工作流",
    "unclassified": "未分类",
}


class DigestError(RuntimeError):
    pass


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DigestError(f"无法读取 JSON 配置：{path}: {exc}") from exc
    if not isinstance(value, dict):
        raise DigestError(f"配置必须是对象：{path}")
    return value


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


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def iso_now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def local_today() -> str:
    return dt.datetime.now().astimezone().date().isoformat()


def week_bounds(value: dt.date) -> tuple[str, str]:
    """Return the Monday-Sunday local week containing *value*."""
    monday = value - dt.timedelta(days=value.weekday())
    sunday = monday + dt.timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


def resolve_workspace_path(value: str | Path) -> Path:
    """Resolve a configured path relative to this checkout, never to the caller cwd."""
    path = Path(str(value))
    return (path if path.is_absolute() else WORKSPACE_ROOT / path).resolve()


def load_config(path: Path) -> dict[str, Any]:
    config = read_json(path)
    if config.get("schema") != WEEKLY_DIGEST_SCHEMA:
        raise DigestError("周报配置 schema 不匹配。")
    for name in ("canonical_task", "output_dir", "state_path", "staging_root", "horizon_config_path", "source_registry_path"):
        config[name] = str(resolve_workspace_path(config.get(name, "")))
    output_dir = Path(config["output_dir"]).resolve()
    if output_dir != EXPECTED_OUTPUT_DIR:
        raise DigestError(f"周报输出路径必须固定为：{EXPECTED_OUTPUT_DIR}")
    for name in ("state_path", "staging_root", "horizon_config_path", "source_registry_path"):
        configured = Path(config[name]).resolve()
        if HARNESS_ROOT.resolve() not in configured.parents and configured != HARNESS_ROOT.resolve():
            raise DigestError(f"{name} 必须位于执行工作区：{configured}")
    if config.get("output_policy", {}).get("allow_overwrite"):
        raise DigestError("周报禁止覆盖既有文件。")
    if config.get("output_policy", {}).get("formal_knowledge_promotion"):
        raise DigestError("周报不得自动晋级为正式知识。")
    source_ids = config.get("source_ids")
    if not isinstance(source_ids, list) or not source_ids or not all(isinstance(value, str) and value.strip() for value in source_ids):
        raise DigestError("周报 source_ids 必须是非空字符串列表。")
    normalized_source_ids = [value.strip() for value in source_ids]
    if len(normalized_source_ids) != len(set(normalized_source_ids)):
        raise DigestError("周报 source_ids 不能重复。")
    forbidden = sorted(set(normalized_source_ids) & WEEKLY_FORBIDDEN_SOURCE_IDS)
    if forbidden:
        raise DigestError(f"周报禁止采集来源：{', '.join(forbidden)}")
    return config


def scoped_weekly_registry(registry: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Return only the explicitly approved non-Zotero sources for the weekly digest."""
    source_ids = [str(value).strip() for value in config["source_ids"]]
    sources = registry.get("sources", [])
    if not isinstance(sources, list):
        raise DigestError("来源注册表的 sources 格式无效。")
    available = {
        str(source.get("source_id"))
        for source in sources
        if isinstance(source, dict) and source.get("source_id")
    }
    missing = sorted(set(source_ids) - available)
    if missing:
        raise DigestError(f"周报 source_ids 未在来源注册表中找到：{', '.join(missing)}")
    scoped = dict(registry)
    approved = set(source_ids)
    scoped["sources"] = [
        source for source in sources
        if isinstance(source, dict) and str(source.get("source_id")) in approved
    ]
    return scoped


def relevance_score(item: dict[str, Any]) -> tuple[int, list[str]]:
    raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            item.get("title"),
            item.get("excerpt"),
            item.get("tags"),
            raw.get("content"),
        )
    ).lower()
    score = 0
    matched: list[str] = []
    for term, points in PRIORITY_TERMS:
        if term in text:
            score += points
            matched.append(term)
    if "machine learning" in matched and any(term in matched for term in ("materials informatics", "alloy", "microstructure", "additive manufacturing", "lpbf")):
        score += 3
    return score, matched


def source_quality(item: dict[str, Any]) -> tuple[str, str]:
    adapter = str(item.get("adapter", ""))
    if adapter in {"zotero_local_api", "openalex_metadata", "crossref_metadata"}:
        return "学术记录候选", SOURCE_LABELS.get(adapter, adapter)
    if adapter == "horizon_staging":
        return "热点线索", SOURCE_LABELS[adapter]
    return "来源候选", SOURCE_LABELS.get(adapter, adapter or "未标注来源")


def screen_items(items: list[dict[str, Any]], existing: set[str], config: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selection = config["selection"]
    screened: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for item in items:
        identities = v3.item_identities(item)
        score, terms = relevance_score(item)
        reason = ""
        if any(identity in existing for identity in identities):
            reason = "已存在相同来源身份，周报不重复推荐"
        elif is_x_signal(item) and x_is_pure_retweet(item):
            reason = "X 内容为纯转发，周报不重复推荐"
        elif is_x_signal(item) and not x_content_filter_decision(item, config)[0]:
            reason = x_content_filter_decision(item, config)[1]
        elif item.get("adapter") == "horizon_staging" and score < int(selection["minimum_x_signal_score"]):
            reason = "X/GitHub 原始信号与研究主题匹配度不足"
        elif score < int(selection["minimum_relevance_score"]):
            reason = "材料研究主题匹配度不足"
        if reason:
            excluded.append({"title": item.get("title", "Untitled"), "source_id": item.get("source_id", ""), "reason": reason, "score": score})
            continue
        kind, source_label = source_quality(item)
        entry = {
            "item": item,
            "score": score,
            "matched_terms": terms,
            "kind": kind,
            "source_label": source_label,
        }
        if is_x_signal(item):
            entry["score_10"] = max(0, min(10, int(score)))
            entry["domain"] = x_domain(item, config)
        screened.append(entry)
    screened.sort(key=lambda value: (-int(value["score"]), str(value["item"].get("retrieved_at", "")), str(value["item"].get("title", ""))))
    return screened, excluded


def is_x_signal(item: dict[str, Any]) -> bool:
    """Identify an X item after the read-only Horizon staging conversion."""
    return str(item.get("source_identity", "")).startswith("horizon:twitter:")


def is_systemic_x_failure(source_status: dict[str, Any], horizon_status: dict[str, Any]) -> bool:
    """Return whether X collection failed so completely that no weekly report is emitted."""
    status = str(source_status.get("status") or horizon_status.get("status") or "").strip()
    return status in SYSTEMIC_X_FAILURE_STATUSES or status.startswith("ERROR")


def x_handle(item: dict[str, Any]) -> str:
    """Extract the stable X handle from URL, title, or raw packet."""
    raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
    metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
    for value in (
        metadata.get("screen_name"),
        metadata.get("username"),
        metadata.get("handle"),
    ):
        if value:
            return str(value).lstrip("@").strip().lower()
    match = re.search(r"(?:x\.com|twitter\.com)/([A-Za-z0-9_]+)/status/", str(item.get("url", "")))
    if match:
        return match.group(1).lower()
    match = re.match(r"@([A-Za-z0-9_]+):", str(item.get("title", "")))
    return match.group(1).lower() if match else ""


def x_runtime_config(config: dict[str, Any]) -> dict[str, Any]:
    configured = config.get("sources", {}).get("x") if isinstance(config.get("sources"), dict) else None
    if isinstance(configured, dict):
        return configured
    cached = config.get("_horizon_x_config")
    if isinstance(cached, dict):
        return cached
    horizon_path = config.get("horizon_config_path")
    if horizon_path:
        try:
            horizon_config = horizon_fetch_only.load_config(Path(str(horizon_path)))
            value = horizon_config.get("sources", {}).get("x", {})
            if isinstance(value, dict):
                config["_horizon_x_config"] = value
                return value
        except Exception:
            pass
    return {}


def x_domain(item: dict[str, Any], config: dict[str, Any]) -> str:
    handle = x_handle(item)
    groups = x_runtime_config(config).get("account_groups", {})
    for domain, values in (groups.items() if isinstance(groups, dict) else []):
        if isinstance(values, list) and handle in {str(value).lstrip("@").lower() for value in values}:
            return str(domain)
    return "unclassified"


def is_auxiliary_x_item(item: dict[str, Any], config: dict[str, Any]) -> bool:
    auxiliary = x_runtime_config(config).get("auxiliary_accounts", [])
    if not isinstance(auxiliary, list):
        return False
    return x_handle(item) in {str(value).lstrip("@").lower() for value in auxiliary}


def x_content_text(item: dict[str, Any]) -> str:
    raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
    title = re.sub(r"^@[A-Za-z0-9_]+:\s*", "", str(item.get("title") or ""))
    return " ".join(
        str(value or "")
        for value in (
            title,
            item.get("excerpt"),
            item.get("tags"),
            raw.get("content"),
        )
    ).lower()


def x_is_pure_retweet(item: dict[str, Any]) -> bool:
    """Reject an explicit retweet marker when the raw adapter preserves it."""
    raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
    metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
    return any(
        bool(metadata.get(key))
        for key in ("is_retweet", "retweeted_status_id", "retweeted_status_id_str", "retweeted_status_result")
    )


def x_content_filter_decision(item: dict[str, Any], config: dict[str, Any]) -> tuple[bool, str]:
    """Apply the configured per-domain content policy to an X signal."""
    runtime = x_runtime_config(config)
    policies = runtime.get("content_filters", {})
    domain = x_domain(item, config)
    policy = policies.get(domain) if isinstance(policies, dict) else None
    if not isinstance(policy, dict):
        if is_auxiliary_x_item(item, config):
            legacy_terms = [
                str(term).lower().strip()
                for term in runtime.get("auxiliary_content_terms", [])
                if str(term).strip()
            ]
            if legacy_terms and not any(term in x_content_text(item) for term in legacy_terms):
                return False, "辅助 AI 账号内容未涉及材料、科学计算或自动化实验"
        return True, ""
    text = x_content_text(item)
    blocked_terms = [str(term).lower().strip() for term in policy.get("blocked_terms", []) if str(term).strip()]
    if any(term in text for term in blocked_terms):
        return False, str(policy.get("reject_reason") or "X 内容触发配置的排除规则")
    include_terms = [str(term).lower().strip() for term in policy.get("include_terms", []) if str(term).strip()]
    if not any(term in text for term in include_terms):
        return False, str(policy.get("reject_reason") or "X 内容未达到该领域的主题相关性门槛")
    technical_terms = [str(term).lower().strip() for term in policy.get("technical_terms", []) if str(term).strip()]
    if technical_terms and not any(term in text for term in technical_terms):
        return False, str(policy.get("reject_reason") or "X 内容缺少可核验的技术细节")
    return True, ""


def auxiliary_x_content_is_relevant(item: dict[str, Any], config: dict[str, Any]) -> bool:
    """Backward-compatible wrapper for callers using the former auxiliary filter."""
    return x_content_filter_decision(item, config)[0]


def trim_excerpt(value: Any, limit: int = 520) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def x_raw_content(item: dict[str, Any]) -> str:
    raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
    return str(raw.get("content") or item.get("excerpt") or "").strip()


def x_author(item: dict[str, Any]) -> str:
    raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
    if str(raw.get("author") or "").strip():
        return str(raw["author"]).strip()
    authors = item.get("authors") if isinstance(item.get("authors"), list) else []
    if authors and str(authors[0]).strip():
        return str(authors[0]).strip()
    handle = x_handle(item)
    return f"@{handle}" if handle else "未提供"


def x_title_without_author(item: dict[str, Any]) -> str:
    title = str(item.get("title") or "").strip()
    return re.sub(r"^@[A-Za-z0-9_]+:\s*", "", title).strip() or "未提供标题"


def x_translation_sha256(source_identity: str, source_sha256: str, title_zh: str, body_zh: str) -> str:
    payload = {
        "source_identity": source_identity,
        "source_sha256": source_sha256,
        "title_zh": title_zh.strip(),
        "body_zh": body_zh.strip(),
    }
    return sha256_text(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def localization_entries(manifest: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not isinstance(manifest, dict):
        return {}
    values = manifest.get("entries", [])
    if isinstance(values, dict):
        return {str(key): value for key, value in values.items() if isinstance(value, dict)}
    if not isinstance(values, list):
        return {}
    return {
        str(value.get("source_identity")): value
        for value in values
        if isinstance(value, dict) and value.get("source_identity")
    }


def validate_x_localization(entry: dict[str, Any], localization: dict[str, Any] | None) -> dict[str, Any]:
    """Validate a Codex-produced zh-CN translation against the raw item hash."""
    item = entry["item"]
    if not isinstance(localization, dict):
        return {"status": "PENDING", "reason": "未提供 X 中文本地化清单"}
    identity = str(item.get("source_identity") or "")
    source_sha256 = str(item.get("source_sha256") or "")
    title_zh = str(localization.get("title_zh") or "").strip()
    body_zh = str(localization.get("body_zh") or "").strip()
    if not title_zh or not body_zh:
        return {"status": "INVALID", "reason": "title_zh 或 body_zh 为空"}
    if localization.get("source_sha256") != source_sha256:
        return {"status": "INVALID", "reason": "源内容 SHA-256 不匹配"}
    raw_text_hash = sha256_text(x_raw_content(item))
    supplied_text_hash = localization.get("source_text_sha256")
    if supplied_text_hash and supplied_text_hash != raw_text_hash:
        return {"status": "INVALID", "reason": "原文文本哈希不匹配"}
    expected_hash = x_translation_sha256(identity, source_sha256, title_zh, body_zh)
    if localization.get("translation_sha256") != expected_hash:
        return {"status": "INVALID", "reason": "翻译哈希不匹配", "expected_hash": expected_hash}
    if not re.search(r"[\u3400-\u9fff]", title_zh + body_zh):
        return {"status": "INVALID", "reason": "翻译未检测到简体中文字符"}
    return {
        "status": "OK",
        "title_zh": title_zh,
        "body_zh": body_zh,
        "author": str(localization.get("author") or x_author(item)).strip(),
        "translation_sha256": expected_hash,
    }


def attach_x_localization(entries: list[dict[str, Any]], manifest: dict[str, Any] | None) -> list[dict[str, Any]]:
    values = localization_entries(manifest)
    output: list[dict[str, Any]] = []
    for entry in entries:
        copied = dict(entry)
        if is_x_signal(entry["item"]):
            copied["x_localization"] = validate_x_localization(entry, values.get(str(entry["item"].get("source_identity"))))
        output.append(copied)
    return output


def x_localization_summary(entries: list[dict[str, Any]]) -> dict[str, int | str]:
    statuses = [str(entry.get("x_localization", {}).get("status", "PENDING")) for entry in entries]
    return {
        "total": len(statuses),
        "ok": statuses.count("OK"),
        "invalid": statuses.count("INVALID"),
        "pending": statuses.count("PENDING"),
        "status": "N/A" if not statuses else ("OK" if all(value == "OK" for value in statuses) else ("PENDING" if "PENDING" in statuses else "INVALID")),
    }


def build_x_localization_template(entries: list[dict[str, Any]], run_id: str) -> dict[str, Any]:
    return {
        "schema": LOCALIZATION_SCHEMA,
        "run_id": run_id,
        "language": "zh-CN",
        "instructions": "逐条将 source_text 翻译为简体中文；title_zh 是不含作者的准确概括，body_zh 使用清晰的小段落或项目符号，不添加原文没有的事实。完成后按脚本定义填写 translation_sha256。",
        "entries": [
            {
                "source_identity": str(entry["item"].get("source_identity") or ""),
                "source_sha256": str(entry["item"].get("source_sha256") or ""),
                "source_text_sha256": sha256_text(x_raw_content(entry["item"])),
                "author": x_author(entry["item"]),
                "source_title": x_title_without_author(entry["item"]),
                "source_text": x_raw_content(entry["item"]),
                "title_zh": "",
                "body_zh": "",
                "translation_sha256": "",
            }
            for entry in entries
            if is_x_signal(entry["item"])
        ],
    }


def render_url(item: dict[str, Any]) -> str:
    """Render a safe, canonical source URL, including legacy X packets."""
    url = item.get("url") or ""
    raw = item.get("raw")
    if item.get("adapter") == "horizon_staging" and isinstance(raw, dict):
        url = v3.normalize_horizon_twitter_url(raw, url)
    return str(url).strip()


def render_item(entry: dict[str, Any], index: int, heading_level: int = 3) -> list[str]:
    item = entry["item"]
    if is_x_signal(item):
        localization = entry.get("x_localization", {})
        status = str(localization.get("status", "PENDING"))
        title = str(localization.get("title_zh") or x_title_without_author(item)).strip()
        body = str(localization.get("body_zh") or "中文正文待 Codex 本地化；当前不将英文原文冒充为中文正文。\n\n原文摘录：" + trim_excerpt(x_raw_content(item))).strip()
        author = str(localization.get("author") or x_author(item)).strip()
        domain = X_DOMAIN_LABELS.get(str(entry.get("domain", "unclassified")), "未分类")
        score_10 = max(0, min(10, int(entry.get("score_10", entry.get("score", 0)))))
        heading = "#" * max(3, int(heading_level))
        return [
            f"{heading} {index}. {title}",
            "",
            f"- 评分：{score_10}/10",
            f"- 作者：{author}",
            f"- 领域：{domain}",
            f"- 来源：{entry['source_label']}（{item['source_id']}）",
            f"- 链接：{render_url(item) or '未提供'}",
            f"- 原文内容 SHA-256：{item.get('source_sha256') or '未提供'}",
            "",
            "#### 正文（简体中文）",
            "",
            body,
            "",
            f"- 翻译校验：{status}" + (f"（{localization.get('translation_sha256')}）" if status == "OK" else ""),
            "- 审阅提示：该条目尚未核验原始上下文、引用数据与结论适用范围。",
            "",
        ]
    lines = [
        f"### {index}. {item['title']}",
        "",
        f"- 类型：{entry['kind']}；相关性评分：{entry['score']}；匹配主题：{', '.join(entry['matched_terms']) or '无明确关键词'}",
        f"- 来源：{entry['source_label']}（{item['source_id']}）",
        f"- 链接：{render_url(item) or '未提供'}",
        f"- 证据锚点：{item['evidence_anchor']}",
        f"- 原始摘录：{trim_excerpt(item.get('excerpt')) or '未取得正文或摘要；仅保留来源定位。'}",
        "- 审阅提示：该条目尚未核验全文、实验条件、数据与结论适用范围。",
        "",
    ]
    return lines


def render_x_section(entries: list[dict[str, Any]]) -> list[str]:
    """Render all accepted X signals in four domain sections."""
    lines = ["## X/社交平台热点线索（本周）", ""]
    if not entries:
        lines.extend(["- 本周未筛出达到研究相关阈值的 X 线索。", ""])
        return lines
    grouped: dict[str, list[dict[str, Any]]] = {key: [] for key in X_DOMAIN_LABELS if key != "unclassified"}
    grouped["unclassified"] = []
    for entry in entries:
        grouped.setdefault(str(entry.get("domain", "unclassified")), []).append(entry)
    index = 1
    for domain, label in X_DOMAIN_LABELS.items():
        if domain == "unclassified":
            continue
        values = sorted(
            grouped.get(domain, []),
            key=lambda value: (
                -int(value.get("score_10", value.get("score", 0))),
                str(value["item"].get("retrieved_at", "")),
                str(value["item"].get("title", "")),
            ),
        )
        if not values:
            continue
        lines.extend([f"### {label}", ""])
        for entry in values:
            lines.extend(render_item(entry, index, heading_level=4))
            index += 1
    if grouped.get("unclassified"):
        lines.extend(["### 未分类", ""])
        for entry in grouped["unclassified"]:
            lines.extend(render_item(entry, index, heading_level=4))
            index += 1
    return lines


def render_digest(report: dict[str, Any]) -> str:
    priority = report["priority"]
    supporting = report["supporting"]
    x_entries = attach_x_localization(report.get("x_entries", []), report.get("x_localization_manifest"))
    localization = x_localization_summary(x_entries)
    domain_counts = {label: 0 for key, label in X_DOMAIN_LABELS.items() if key != "unclassified"}
    domain_counts["未分类"] = 0
    for entry in x_entries:
        domain_counts[X_DOMAIN_LABELS.get(str(entry.get("domain", "unclassified")), "未分类")] += 1
    x_budget = report.get("x_budget") or {}
    x_limits = x_budget.get("limits", {}) if isinstance(x_budget, dict) else {}
    x_coverage = report.get("x_coverage") or {}
    requested_handles = [str(value) for value in x_coverage.get("actor_requested_source_handles", [])]
    returned_handles = [str(value) for value in x_coverage.get("actor_dataset_source_handles", [])]
    missing_handles = [str(value) for value in x_coverage.get("actor_missing_source_handles", [])]
    week_start = report.get("week_start", report.get("date", ""))
    week_end = report.get("week_end", report.get("date", ""))
    lines = [
        "---",
        'type: "horizon-weekly-research-digest"',
        'record_kind: "weekly-screening-report"',
        'knowledge_status: "screened-candidates"',
        'review_status: "pending"',
        "requires_human_review: true",
        f'run_id: "{report["run_id"]}"',
        f'generated_at: "{report["finished_at"]}"',
        f'selection_sha256: "{report["selection_sha256"]}"',
        "---",
        "",
        f"# Horizon 科研与 AI 工程周报｜{week_end}",
        "",
        f"> 本周范围：{week_start} 至 {week_end}。本周报是自动筛选的科研候选与热点线索，不是已验证科学结论。请回到原文、DOI 或数据集核验实验条件、方法和适用范围后再引用或沉淀。",
        "",
        "## 覆盖范围与运行状态",
        "",
        f"- 运行状态：{report['status']}",
        f"- X/Apify：{report['horizon_status']}；本周所有审核账号同批抓取，不轮换。",
        f"- 已采集：{report['collected']} 条；批内去重后：{report['unique']} 条；研究相关候选：{report['screened']} 条。",
        f"- 排除：{report['excluded']} 条（已存在来源或主题相关性不足）。",
        "",
        "## 优先审阅",
        "",
    ]
    if priority:
        for index, entry in enumerate(priority, 1):
            lines.extend(render_item(entry, index))
    else:
        lines.extend(["- 今天未筛出达到优先阈值的新候选。", ""])
    lines.extend(["## 其他相关候选", ""])
    if supporting:
        for index, entry in enumerate(supporting, 1):
            lines.extend(render_item(entry, index))
    else:
        lines.extend(["- 无。", ""])
    lines.extend(render_x_section(x_entries))
    lines.extend([
        "## X 内容统计",
        "",
        f"- 账号覆盖：{report.get('x_user_count', 0)} 个；待确认账号：{', '.join('@' + value for value in report.get('x_pending_accounts', [])) or '无'}；本周筛选：{len(x_entries)} 条。",
        f"- X 覆盖核验：请求 {len(requested_handles)} 个；数据集观察到 {len(returned_handles)} 个；缺失：{', '.join('@' + value for value in missing_handles) if missing_handles else '无'}。",
        f"- 领域分布：增材制造与制造工程 {domain_counts['增材制造与制造工程']} 条；材料冶金 {domain_counts['材料冶金']} 条；材料信息学/科学 AI {domain_counts['材料信息学/科学 AI']} 条；AI 工程与实用工作流 {domain_counts['AI 工程与实用工作流']} 条；未分类 {domain_counts['未分类']} 条。",
        f"- 中文本地化：{localization['ok']}/{localization['total']} 条通过翻译哈希校验；状态：{localization['status']}。",
        "",
    ])
    lines.extend([
        "## 来源运行状态",
        "",
    ])
    for status in report["source_status"]:
        detail = status.get("reason") or status.get("error") or ""
        lines.append(f"- {status.get('source_id', 'unknown')}：{status.get('status', 'UNKNOWN')}（{status.get('count', 0)}）{detail}")
    lines.extend([
        "",
        "## X 预算与限制",
        "",
        f"- 本月本地估算：{x_budget.get('estimated_actual_cost_usd_month', 0.0)} USD / {x_limits.get('monthly_spend_cap_usd', 4.95)} USD；已运行：{x_budget.get('reserved_actor_runs_month', 0)} 次。",
        f"- 本次 X 状态：{report['horizon_status']}；本次动态请求上限：{x_limits.get('max_items_per_run', 0)} 条，远端费用上限：{x_limits.get('max_cost_per_run_usd', 0.0)} USD；不自动升级套餐或重试。",
        "- X 仅抓取审核账号时间线，使用 UTC 时间窗并排除 replies；科研 AI 按科研主题过滤，AI 工程按技术细节与产品/产业内容规则过滤。",
        "",
        "## 可追溯性与限制",
        "",
        f"- 选择记录：{report['selection_path']}",
        f"- Horizon 原始包：{report['horizon_raw_packet'] or '本次未生成或无可用包'}",
        f"- X 选择记录（与主选择记录同一文件）：{report.get('x_selection_path') or report['selection_path']}",
        "- 学术元数据仅证明记录存在，不自动证明论文的任何实验结论；需人工阅读原始来源。",
        "- 本周报不修改既有笔记；不得自动生成或晋级正式知识卡。",
        "",
    ])
    return "\n".join(lines)


def merge_x_section_into_digest(content: str, entries: list[dict[str, Any]]) -> str:
    """Replace or insert the single in-file X section without creating an addendum."""
    next_marker = "\n## 来源运行状态"
    section = "\n".join(render_x_section(entries)).rstrip() + "\n\n"
    for marker in ("## X/社交平台热点线索（本周）", "## X/社交平台热点线索"):
        if marker in content:
            start = content.index(marker)
            end = content.find(next_marker, start + len(marker))
            if end < 0:
                return content[:start] + section
            return content[:start] + section + content[end + 1:]
    insert_at = content.find("## 来源运行状态")
    if insert_at < 0:
        return content.rstrip() + "\n\n" + section
    return content[:insert_at].rstrip() + "\n\n" + section + content[insert_at:]


def update_digest_after_late_x_merge(
    content: str,
    *,
    x_collected: int,
    x_screened: int,
    x_excluded: int,
    x_status: str,
    selection_sha256: str,
    selection_path: str,
    merged_at: str,
) -> str:
    """Update traceable summary fields after merging local late X data in place."""
    counts = re.search(
        r"- 已采集：(\d+) 条；批内去重后：(\d+) 条；研究相关候选：(\d+) 条。",
        content,
    )
    if counts:
        collected, unique, screened = (int(value) for value in counts.groups())
        replacement = (
            f"- 已采集：{collected + x_collected} 条；批内去重后：{unique + x_collected} 条；"
            f"研究相关候选：{screened + x_screened} 条。"
        )
        content = content[:counts.start()] + replacement + content[counts.end():]
    excluded = re.search(r"- 排除：(\d+) 条（已存在来源或主题相关性不足）。", content)
    if excluded:
        replacement = f"- 排除：{int(excluded.group(1)) + x_excluded} 条（已存在来源或主题相关性不足）。"
        content = content[:excluded.start()] + replacement + content[excluded.end():]

    content = re.sub(
        r"^- 运行状态：.*$",
        "- 运行状态：OK_WITH_ERRORS（后到 X 内容已合并入同一份周报）",
        content,
        count=1,
        flags=re.MULTILINE,
    )
    content = re.sub(
        r"^- X/Apify：.*$",
        f"- X/Apify：{x_status}（后到本地 X 原始 {x_collected} 条；本次合并筛选 {x_screened} 条）；本周预算状态见下方。",
        content,
        count=1,
        flags=re.MULTILINE,
    )
    content = re.sub(
        r"^- horizon-signal-staging：.*$",
        f"- horizon-signal-staging：{x_status}（{x_collected}）后到 X 数据已合并入本周报",
        content,
        count=1,
        flags=re.MULTILINE,
    )
    content = re.sub(
        r'^selection_sha256: ".*"$',
        f'selection_sha256: "{selection_sha256}"',
        content,
        count=1,
        flags=re.MULTILINE,
    )
    if re.search(r"^merged_at:", content, flags=re.MULTILINE):
        content = re.sub(
            r'^merged_at: ".*"$',
            f'merged_at: "{merged_at}"',
            content,
            count=1,
            flags=re.MULTILINE,
        )
    else:
        content = re.sub(
            r'^(generated_at: ".*"$)',
            f'\\1\nmerged_at: "{merged_at}"',
            content,
            count=1,
            flags=re.MULTILINE,
        )
    trace_line = f"- X 后到原始包与选择记录：{selection_path}"
    if trace_line not in content:
        anchor = re.search(r"^- Horizon 原始包：.*$", content, flags=re.MULTILINE)
        if anchor:
            content = content[:anchor.end()] + "\n" + trace_line + content[anchor.end():]
        else:
            content = content.rstrip() + "\n" + trace_line + "\n"
    return content


def state_path(config: dict[str, Any]) -> Path:
    return Path(config["state_path"])


def load_state(config: dict[str, Any]) -> dict[str, Any]:
    path = state_path(config)
    if not path.exists():
        return {"schema": WEEKLY_STATE_SCHEMA}
    try:
        value = read_json(path)
    except DigestError:
        return {"schema": WEEKLY_STATE_SCHEMA}
    return value if value.get("schema") == WEEKLY_STATE_SCHEMA else {"schema": WEEKLY_STATE_SCHEMA}


def already_reported_identities(state: dict[str, Any]) -> set[str]:
    values = state.get("reported_source_identities", [])
    return {str(value) for value in values if isinstance(value, str) and value}


def has_reported_today(state: dict[str, Any], date: str, target: Path) -> bool:
    """Skip only when today's report is present at the current canonical path."""
    if target.exists():
        return True
    if state.get("last_completed_date") != date:
        return False
    saved_path = state.get("last_output_path")
    if not saved_path:
        return False
    try:
        return Path(str(saved_path)).resolve() == target.resolve()
    except OSError:
        return False


def has_reported_week(state: dict[str, Any], week_key: str, target: Path) -> bool:
    """Skip only when the current week's report is present at its canonical path."""
    if target.exists():
        return True
    if state.get("last_completed_week") != week_key:
        return False
    saved_path = state.get("last_output_path")
    if not saved_path:
        return False
    try:
        return Path(str(saved_path)).resolve() == target.resolve()
    except OSError:
        return False


def save_workspace_report(report: dict[str, Any]) -> None:
    v3.atomic_write(HARNESS_ROOT / "runs" / f"{report['run_id']}.json", json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    summary = "\n".join([
        f"# Horizon 周报运行 {report['run_id']}",
        "",
        f"- 状态：{report['status']}",
        f"- 周期：{report.get('week_start', report['date'])} 至 {report.get('week_end', report['date'])}",
        f"- 输出：{report.get('output_path', '无')}",
        f"- 采集：{report.get('collected', 0)}；筛选：{report.get('screened', 0)}",
        "",
    ])
    v3.atomic_write(HARNESS_ROOT / "reports" / f"{report['run_id']}.md", summary)
    v3.append_event({"event": "horizon_weekly_digest", "run_id": report["run_id"], "status": report["status"], "at": report["finished_at"]})


def run_x_supplement(config: dict[str, Any], base: dict[str, Any], target: Path, state: dict[str, Any]) -> dict[str, Any]:
    """Merge late local X signals into the existing weekly file in place.

    The argument name is retained only for backwards compatibility with the
    one-time 2026-08-13 procedure. It never creates a separate report file.
    """
    registry = scoped_weekly_registry(
        v3.load_registry(Path(config["source_registry_path"])),
        config,
    )
    source = next((value for value in registry.get("sources", []) if value.get("source_id") == "horizon-signal-staging"), None)
    if not isinstance(source, dict):
        raise DigestError("来源注册表缺少 horizon-signal-staging。")
    items, source_status = v3.fetch_horizon_staging(source, registry, no_network=True)
    x_items, x_batch_duplicates = v3.dedupe_items([item for item in items if is_x_signal(item)])
    existing = v3.existing_identities(WORKSPACE_ROOT) | already_reported_identities(state)
    screened, excluded = screen_items(x_items, existing, config)
    staging_dir = Path(config["staging_root"]) / base["run_id"]
    selection_path = staging_dir / "x-merge-selection.json"
    selection_payload = {
        "schema": "researchkb-horizon-weekly-x-merge-selection/v1",
        "run_id": base["run_id"],
        "created_at": iso_now(),
        "source_status": source_status,
        "entries": screened,
        "excluded": excluded,
        "batch_duplicates": x_batch_duplicates,
    }
    v3.write_json(selection_path, selection_payload)
    report = {
        **base,
        "output_path": str(target),
        "status": "OK_MERGED_X_INTO_WEEKLY" if screened else "OK_NO_NEW_X_TO_MERGE",
        "finished_at": iso_now(),
        "base_digest": str(target),
        "x_entries": screened,
        "x_collected": len(x_items),
        "x_excluded": len(excluded),
        "selection_path": str(selection_path),
        "collected": len(x_items),
        "unique": len(x_items),
        "screened": len(screened),
    }
    content = target.read_text(encoding="utf-8")
    if screened:
        merged_at = iso_now()
        selection_sha256 = sha256_text(json.dumps(selection_payload, ensure_ascii=False, sort_keys=True))
        content = merge_x_section_into_digest(content, screened)
        content = update_digest_after_late_x_merge(
            content,
            x_collected=len(x_items),
            x_screened=len(screened),
            x_excluded=len(excluded),
            x_status=str(source_status.get("status", "OK")),
            selection_sha256=selection_sha256,
            selection_path=str(selection_path),
            merged_at=merged_at,
        )
        atomic_write(target, content)
    report["content_sha256"] = sha256_text(content)
    report["selection_sha256"] = sha256_text(json.dumps(selection_payload, ensure_ascii=False, sort_keys=True))
    v3.write_json(staging_dir / "x-merge-manifest.json", report)
    newly_reported = {
        identity
        for entry in screened
        for identity in v3.item_identities(entry["item"])
    }
    state.update({
        "reported_source_identities": sorted((already_reported_identities(state) | newly_reported))[-5000:],
        "updated_at": iso_now(),
    })
    v3.write_json(state_path(config), state)
    save_workspace_report(report)
    return report


def run(config_path: Path, network: bool, force: bool = False, x_supplement: bool = False) -> dict[str, Any]:
    config = load_config(config_path)
    now = dt.datetime.now().astimezone()
    date = now.date().isoformat()
    week_start, week_end = week_bounds(now.date())
    run_id = f"horizon-weekly-{now.strftime('%Y%m%d-%H%M%S')}"
    target = EXPECTED_OUTPUT_DIR / f"{week_end}-Horizon-材料科研周报.md"
    base = {
        "schema": WEEKLY_REPORT_SCHEMA,
        "run_id": run_id,
        "date": date,
        "week_start": week_start,
        "week_end": week_end,
        "started_at": iso_now(),
        "finished_at": iso_now(),
        "network_enabled": network,
        "output_path": str(target),
    }
    if not network:
        report = {**base, "status": "DRY_RUN_READY", "reason": "configuration validated; no collection or report write", "collected": 0, "unique": 0, "screened": 0}
        save_workspace_report(report)
        return report
    state = load_state(config)
    if x_supplement:
        if not target.exists():
            report = {**base, "status": "SKIPPED_NO_BASE_DIGEST", "reason": "本周主周报不存在，无法进行原地 X 合并", "collected": 0, "unique": 0, "screened": 0}
            save_workspace_report(report)
            return report
        return run_x_supplement(config, base, target, state)
    if not force and has_reported_week(state, f"{week_start}/{week_end}", target):
        report = {**base, "status": "SKIPPED_ALREADY_REPORTED_THIS_WEEK", "reason": "weekly digest state or output file already exists", "collected": 0, "unique": 0, "screened": 0}
        save_workspace_report(report)
        return report
    state.update({"schema": WEEKLY_STATE_SCHEMA, "last_attempt_date": date, "last_attempt_week": f"{week_start}/{week_end}", "last_attempt_run_id": run_id, "updated_at": iso_now()})
    v3.write_json(state_path(config), state)
    horizon_status: dict[str, Any]
    try:
        horizon_status = horizon_fetch_only.run(Path(config["horizon_config_path"]), dry_run=False, network=True)
    except Exception as exc:  # Keep the academic-metadata digest available if X fails.
        horizon_status = {"status": "ERROR", "error": f"Horizon X 采集失败：{exc}", "source_status": []}
    registry = v3.load_registry(Path(config["source_registry_path"]))
    items, source_status = v3.collect_sources(registry, no_network=False)
    horizon_source_status = next(
        (value for value in horizon_status.get("source_status", []) if value.get("source_id") == "x"),
        {},
    )
    if is_systemic_x_failure(horizon_source_status, horizon_status):
        failure_status = horizon_source_status.get("status") or horizon_status.get("status", "ERROR")
        failure_report = {
            **base,
            "status": "ERROR_SYSTEMIC_X_FAILURE",
            "output_path": "",
            "intended_output_path": str(target),
            "horizon_status": failure_status,
            "horizon_raw_packet": horizon_status.get("raw_packet", ""),
            "source_status": horizon_status.get("source_status", []),
            "collected": 0,
            "unique": 0,
            "screened": 0,
            "excluded": 0,
            "reason": "X 采集未取得可用于本周周报的有效数据；仅记录系统性失败，不生成空周报。",
        }
        save_workspace_report(failure_report)
        raise DigestError(
            f"本周周报未生成：X 系统性采集失败（{failure_status}）；"
            "部分账号覆盖不完整不属于此分支，会生成带警告的周报。"
        )
    source_status.append({
        "source_id": "horizon-x",
        "adapter": "horizon_fetch_only",
        "status": horizon_source_status.get("status") or horizon_status.get("status", "UNKNOWN"),
        "count": horizon_source_status.get("count", 0),
        "reason": horizon_source_status.get("reason", ""),
        "error": horizon_source_status.get("error", ""),
        "actor_requested_source_handles": horizon_source_status.get("actor_requested_source_handles", []),
        "actor_dataset_source_handles": horizon_source_status.get("actor_dataset_source_handles", []),
        "actor_missing_source_handles": horizon_source_status.get("actor_missing_source_handles", []),
        "actor_dataset_item_count": horizon_source_status.get("actor_dataset_item_count", 0),
        "actor_reported_charge_usd": horizon_source_status.get("actor_reported_charge_usd"),
    })
    unique, batch_duplicates = v3.dedupe_items(items)
    existing = v3.existing_identities(WORKSPACE_ROOT) | already_reported_identities(state)
    x_unique = [item for item in unique if is_x_signal(item)]
    academic_unique = [item for item in unique if not is_x_signal(item)]
    screened, excluded = screen_items(academic_unique, existing, config)
    x_screened, x_excluded = screen_items(x_unique, existing, config)
    selection = config["selection"]
    priority = screened[: int(selection["priority_limit"])]
    supporting = screened[int(selection["priority_limit"]): int(selection["priority_limit"]) + int(selection["supporting_limit"])]
    staging_dir = Path(config["staging_root"]) / run_id
    selection_path = staging_dir / "selection.json"
    selection_payload = {
        "schema": "researchkb-horizon-weekly-selection/v1",
        "run_id": run_id,
        "created_at": iso_now(),
        "priority": [{key: value for key, value in entry.items() if key != "item"} | {"item": entry["item"]} for entry in priority],
        "supporting": [{key: value for key, value in entry.items() if key != "item"} | {"item": entry["item"]} for entry in supporting],
        "x_entries": [{key: value for key, value in entry.items() if key != "item"} | {"item": entry["item"]} for entry in x_screened],
        "excluded": excluded,
        "x_excluded": x_excluded,
        "batch_duplicates": batch_duplicates,
    }
    v3.write_json(selection_path, selection_payload)
    localization_template_path = staging_dir / "x-localization-template.json"
    v3.write_json(localization_template_path, build_x_localization_template(x_screened, run_id))
    x_budget = horizon_status.get("x_budget") or horizon_source_status.get("budget") or {}
    initial_localization = x_localization_summary(attach_x_localization(x_screened, None))
    partial_coverage_warning = horizon_source_status.get("status") == "OK_PARTIAL_ACTOR_COVERAGE"
    base_status = (
        "OK_WITH_ERRORS"
        if horizon_status.get("status") in {"ERROR", "OK_WITH_ERRORS"} or any(value.get("status") == "ERROR" for value in source_status)
        else ("OK_WITH_WARNINGS" if partial_coverage_warning or horizon_status.get("status") == "OK_WITH_WARNINGS" else "OK")
    )
    if base_status == "OK" and initial_localization["pending"]:
        base_status = "OK_PENDING_LOCALIZATION"
    report = {
        **base,
        "status": base_status,
        "finished_at": iso_now(),
        "horizon_status": horizon_source_status.get("status") or horizon_status.get("status", "UNKNOWN"),
        "horizon_raw_packet": horizon_status.get("raw_packet", ""),
        "x_budget": x_budget,
        "source_status": source_status,
        "collected": len(items),
        "unique": len(unique),
        "screened": len(screened) + len(x_screened),
        "excluded": len(excluded) + len(x_excluded),
        "priority": priority,
        "supporting": supporting,
        "x_entries": x_screened,
        "x_collected": len(x_unique),
        "x_screened": len(x_screened),
        "x_excluded": len(x_excluded),
        "x_user_count": int(horizon_status.get("x_user_count", 0)) if isinstance(horizon_status, dict) else 0,
        "x_pending_accounts": list(horizon_status.get("x_pending_accounts", [])) if isinstance(horizon_status, dict) else [],
        "x_coverage": {
            "actor_requested_source_handles": list(horizon_source_status.get("actor_requested_source_handles", [])),
            "actor_dataset_source_handles": list(horizon_source_status.get("actor_dataset_source_handles", [])),
            "actor_missing_source_handles": list(horizon_source_status.get("actor_missing_source_handles", [])),
            "actor_dataset_item_count": horizon_source_status.get("actor_dataset_item_count", 0),
            "actor_reported_charge_usd": horizon_source_status.get("actor_reported_charge_usd"),
        },
        "x_localization_template_path": str(localization_template_path),
        "x_localization_status": initial_localization,
        "x_localization_manifest": None,
        "selection_path": str(selection_path),
        "x_selection_path": str(selection_path),
    }
    report["selection_sha256"] = sha256_text(
        json.dumps(selection_payload, ensure_ascii=False, sort_keys=True)
    )
    content = render_digest(report)
    if target.exists():
        raise DigestError(f"拒绝覆盖既有日报：{target}")
    atomic_write(target, content)
    report["content_sha256"] = sha256_text(content)
    v3.write_json(staging_dir / "manifest.json", report)
    newly_reported = {
        identity
        for entry in [*priority, *supporting, *x_screened]
        for identity in v3.item_identities(entry["item"])
    }
    state.update({
        "last_completed_date": date,
        "last_completed_week": f"{week_start}/{week_end}",
        "last_completed_run_id": run_id,
        "last_output_path": str(target),
        "reported_source_identities": sorted(
            (already_reported_identities(state) | newly_reported)
        )[-5000:],
        "updated_at": iso_now(),
    })
    v3.write_json(state_path(config), state)
    save_workspace_report(report)
    return report


def apply_localization(
    config_path: Path,
    manifest_path: Path,
    run_manifest_path: Path | None = None,
) -> dict[str, Any]:
    """Apply a validated Codex zh-CN X manifest to the same weekly report file."""
    config = load_config(config_path)
    manifest = read_json(manifest_path)
    if manifest.get("schema") != LOCALIZATION_SCHEMA:
        raise DigestError("X 本地化清单 schema 不匹配。")
    run_id = str(manifest.get("run_id") or "")
    if not run_id:
        raise DigestError("X 本地化清单缺少 run_id。")
    staging_root = Path(config["staging_root"]).resolve()
    resolved_manifest = manifest_path.resolve()
    if staging_root not in resolved_manifest.parents:
        raise DigestError("X 本地化清单必须位于本周报 staging 目录。")
    staging_dir = staging_root / run_id
    source_manifest = (run_manifest_path or (staging_dir / "manifest.json")).resolve()
    if staging_root not in source_manifest.parents:
        raise DigestError("周报运行清单必须位于本周报 staging 目录。")
    report = read_json(source_manifest)
    if report.get("run_id") != run_id:
        raise DigestError("本地化清单与周报运行清单的 run_id 不一致。")
    target = Path(str(report.get("output_path", ""))).resolve()
    if target.parent != EXPECTED_OUTPUT_DIR or not target.exists():
        raise DigestError("只能对当前周报标准输出路径执行原地本地化。")
    x_entries = report.get("x_entries", [])
    if not isinstance(x_entries, list):
        raise DigestError("周报运行清单的 x_entries 格式无效。")
    localized_entries = attach_x_localization(x_entries, manifest)
    localization_status = x_localization_summary(localized_entries)
    if localization_status["invalid"] or localization_status["pending"]:
        raise DigestError(
            f"X 本地化清单未通过校验：通过 {localization_status['ok']}，"
            f"无效 {localization_status['invalid']}，待处理 {localization_status['pending']}。"
        )
    report["x_localization_manifest"] = manifest
    report["x_localization_status"] = localization_status
    report["localization_path"] = str(resolved_manifest)
    report["localization_sha256"] = sha256_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True))
    if report.get("status") == "OK_PENDING_LOCALIZATION":
        report["status"] = "OK"
    content = render_digest(report)
    atomic_write(target, content)
    report["content_sha256"] = sha256_text(content)
    v3.write_json(source_manifest, report)
    v3.atomic_write(HARNESS_ROOT / "runs" / f"{run_id}.json", json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    save_workspace_report(report)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ResearchKB Horizon research and AI-engineering weekly digest")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="仅校验周报配置，不联网或写入周报")
    mode.add_argument("--network", action="store_true", help="采集审核来源并创建本周周报")
    mode.add_argument("--apply-localization", action="store_true", help="将 staging 中已验证的 X 简体中文清单原地应用到本周报")
    parser.add_argument("--force", action="store_true", help="仅用于明确人工补跑；仍禁止覆盖既有周报")
    parser.add_argument("--x-supplement", action="store_true", help="历史兼容入口：仅将本地迟到 X 合并入本周周报；不联网、不创建独立文件")
    parser.add_argument("--manifest", type=Path, help="--apply-localization 使用的 X 本地化清单路径")
    parser.add_argument("--run-manifest", type=Path, help="可选的周报 staging 运行清单路径")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    args = parser.parse_args(argv)
    try:
        if args.apply_localization:
            if not args.manifest:
                raise DigestError("--apply-localization 必须同时提供 --manifest。")
            result_value = apply_localization(args.config, args.manifest, args.run_manifest)
        else:
            result_value = run(args.config, network=bool(args.network), force=bool(args.force), x_supplement=bool(args.x_supplement))
        result = json.dumps(result_value, ensure_ascii=False, indent=2)
        sys.stdout.buffer.write((result + "\n").encode("utf-8", errors="backslashreplace"))
        return 0
    except DigestError as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
