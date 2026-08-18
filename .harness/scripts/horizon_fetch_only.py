#!/usr/bin/env python3
"""Collect raw GitHub/X signals through Horizon without invoking its AI pipeline.

This bridge intentionally imports only Horizon's GitHub and Apify/Scweet X
scrapers. It writes raw JSONL packets below .harness/staging/horizon; it never
writes the formal Vault, calls an LLM provider, starts Horizon's MCP server, or
delivers content externally. X calls are protected by a local reservation
budget. The reservation is a safety gate, not an Apify billing guarantee.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


SCRIPT_PATH = Path(__file__).resolve()
HARNESS_ROOT = SCRIPT_PATH.parents[1]
WORKSPACE_ROOT = HARNESS_ROOT.parent
DEFAULT_CONFIG = HARNESS_ROOT / "config" / "horizon-fetch-only.json"
ALLOWED_SECRET_NAMES = {"RESEARCHKB_GITHUB_TOKEN", "APIFY_TOKEN"}
HORIZON_CONFIG_SCHEMA = "researchkb-horizon-fetch-only/v5"
X_BUDGET_SCHEMA = "researchkb-horizon-x-budget/v3"

X_ACCOUNT_GROUP_KEYS = (
    "additive_manufacturing_and_manufacturing_engineering",
    "materials_metallurgy",
    "materials_informatics_science_ai",
    "ai_engineering_and_practical_workflows",
)
X_ACCOUNT_GROUP_COUNTS = {
    "additive_manufacturing_and_manufacturing_engineering": 10,
    "materials_metallurgy": 5,
    "materials_informatics_science_ai": 6,
    "ai_engineering_and_practical_workflows": 6,
}


class HorizonBridgeError(RuntimeError):
    pass


def iso_now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def utc_iso(value: dt.datetime) -> str:
    """Serialize a timezone-aware boundary in the Actor's UTC format."""
    if value.tzinfo is None:
        raise HorizonBridgeError("X 时间边界必须包含时区。")
    return value.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_utc(value: object) -> dt.datetime | None:
    """Parse only persisted ISO-8601 timestamps; corrupt values fail closed upstream."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(dt.timezone.utc)


def x_budget_timezone(config: dict[str, Any]) -> dt.tzinfo:
    """Resolve the reviewed scheduler timezone used for local budget calendar days."""
    timezone_name = str(
        config.get("sources", {}).get("x", {}).get("schedule", {}).get("timezone", "Asia/Shanghai")
    )
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        # The bundled Windows Python may not ship IANA tzdata. China has no
        # daylight-saving transitions, so this explicit reviewed schedule is
        # safe without adding a third-party dependency.
        if timezone_name == "Asia/Shanghai":
            return dt.timezone(dt.timedelta(hours=8), name="Asia/Shanghai")
        raise HorizonBridgeError(f"X 调度时区无效：{timezone_name}") from exc


def x_budget_now(config: dict[str, Any]) -> dt.datetime:
    return dt.datetime.now(x_budget_timezone(config))


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def resolve_workspace_path(value: str | Path) -> Path:
    """Resolve a configured path relative to this checkout, never to the caller cwd."""
    path = Path(str(value))
    return (path if path.is_absolute() else WORKSPACE_ROOT / path).resolve()


def load_config(path: Path) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HorizonBridgeError(f"无法读取 Horizon 采集配置：{path}: {exc}") from exc
    if config.get("schema") != HORIZON_CONFIG_SCHEMA:
        raise HorizonBridgeError("Horizon 采集配置 schema 不匹配。")
    for name in ("horizon_root", "output_root", "budget_state_path", "secrets_file"):
        config[name] = str(resolve_workspace_path(config.get(name, "")))
    expected_horizon = (HARNESS_ROOT / "vendor" / "Horizon").resolve()
    expected_output = (HARNESS_ROOT / "staging" / "horizon").resolve()
    if Path(config["horizon_root"]).resolve() != expected_horizon:
        raise HorizonBridgeError("horizon_root 必须指向本工作区隔离的 vendor/Horizon。")
    if Path(config["output_root"]).resolve() != expected_output:
        raise HorizonBridgeError("output_root 必须是 .harness/staging/horizon。")
    if config.get("external_ai", {}).get("enabled"):
        raise HorizonBridgeError("拒绝启用 Horizon 外部 AI；请使用 ResearchKB v3 的已登录 Codex CLI。")
    if config.get("delivery", {}).get("enabled"):
        raise HorizonBridgeError("拒绝启用 Horizon 外部交付。")
    x_config = config.get("sources", {}).get("x", {})
    if x_config.get("enabled"):
        if x_config.get("mode", "apify") != "apify":
            raise HorizonBridgeError("ResearchKB v3 只允许 Horizon X 的 Apify/Scweet 模式。")
        source_mode = x_config.get("source_mode")
        if source_mode != "fixed_users_search" or x_config.get("search_enabled") is not False:
            raise HorizonBridgeError("X 生产采集只允许固定 27 个审核账号的服务端 search 模式；不得启用 profiles 回退、关键词或其他搜索。")
        if x_config.get("token_env", "APIFY_TOKEN") != "APIFY_TOKEN":
            raise HorizonBridgeError("X token_env 必须是 APIFY_TOKEN。")
        if x_config.get("fetch_reply_text", False) or int(x_config.get("max_tweets_to_expand", 0)) != 0:
            raise HorizonBridgeError("ResearchKB v3 暂不允许 X 回复扩展；请保持 fetch_reply_text=false 且 max_tweets_to_expand=0。")
        if x_config.get("restart_on_error", True) or x_config.get("automatic_paid_upgrade", True):
            raise HorizonBridgeError("X 禁止失败后自动重试或升级付费套餐。")
        max_items = int(x_config.get("max_items_per_run", 0))
        actor_request_max_items = int(x_config.get("actor_request_max_items", 0))
        if max_items < 100 or actor_request_max_items < 100:
            raise HorizonBridgeError("X 单次请求上限不能低于 Scweet 当前的 100 条请求下限。")
        if actor_request_max_items > max_items:
            raise HorizonBridgeError("X actor_request_max_items 不能超过 max_items_per_run。")
        configured_users = x_users(config)
        if len(configured_users) != 27:
            raise HorizonBridgeError("X 审核账号池必须固定为 27 个账号。")
        groups = x_account_groups(config)
        flattened = [handle for values in groups.values() for handle in values]
        if len(flattened) != len(set(flattened)) or set(flattened) != set(configured_users):
            raise HorizonBridgeError("X 账号分组必须覆盖 27 个不重复的审核账号。")
        if int(x_config.get("users_per_run", 0)) != len(configured_users):
            raise HorizonBridgeError("X weekly run 必须同批抓取全部 27 个账号。")
        x_pending_accounts(config)
        if bool(x_config.get("rotation_enabled", True)):
            raise HorizonBridgeError("X 账号轮换已禁用；rotation_enabled 必须为 false。")
        x_budget_timezone(config)
        expected_budget = (HARNESS_ROOT / "state" / "horizon-x-budget.json").resolve()
        configured_budget = Path(config["budget_state_path"]).resolve()
        if configured_budget != expected_budget:
            raise HorizonBridgeError("budget_state_path 必须位于 .harness/state/horizon-x-budget.json。")
    return config


def load_optional_secrets(path: Path) -> None:
    """Load only the one supported local secret without echoing it."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        if name in ALLOWED_SECRET_NAMES and value.strip():
            os.environ.setdefault(name, value.strip().strip('"').strip("'"))


def github_sources(config: dict[str, Any]) -> list[Any]:
    github = config.get("sources", {}).get("github", {})
    if not github.get("enabled", False):
        return []
    configured = github.get("sources", [])
    if not isinstance(configured, list):
        raise HorizonBridgeError("sources.github.sources 必须是列表。")
    if not configured:
        return []
    horizon_root = Path(config["horizon_root"])
    if str(horizon_root) not in sys.path:
        sys.path.insert(0, str(horizon_root))
    try:
        from src.models import GitHubSourceConfig
    except Exception as exc:
        raise HorizonBridgeError(f"无法加载 Horizon GitHub 配置模型：{exc}") from exc
    validated: list[Any] = []
    for source in configured:
        if not isinstance(source, dict):
            raise HorizonBridgeError("GitHub 来源必须为对象。")
        source_type = source.get("type")
        if source_type not in {"user_events", "repo_releases"}:
            raise HorizonBridgeError(f"不支持的 GitHub 来源类型：{source_type!r}")
        validated.append(GitHubSourceConfig(**source))
    return validated


def x_users(config: dict[str, Any]) -> list[str]:
    """Return reviewed X handles, or an empty list when X is dormant."""
    x_config = config.get("sources", {}).get("x", {})
    if not x_config.get("enabled", False):
        return []
    configured = x_config.get("users", [])
    if not isinstance(configured, list):
        raise HorizonBridgeError("sources.x.users 必须为列表。")
    users: list[str] = []
    seen: set[str] = set()
    for value in configured:
        if not isinstance(value, str):
            raise HorizonBridgeError("sources.x.users 只能包含账号名字符串。")
        handle = value.strip().lstrip("@").lower()
        if not handle or handle in seen:
            continue
        if not re.fullmatch(r"[a-z0-9_]+", handle):
            raise HorizonBridgeError(f"X 账号名格式不支持：{value!r}")
        seen.add(handle)
        users.append(handle)
    max_users = max(1, int(x_config.get("max_users_per_run", 10)))
    if len(users) > max_users:
        raise HorizonBridgeError(f"X 账号数 {len(users)} 超过本地上限 {max_users}。")
    return users


def x_account_groups(config: dict[str, Any]) -> dict[str, list[str]]:
    """Return and validate the reviewed 10/5/6/6 account allocation."""
    x_config = config.get("sources", {}).get("x", {})
    configured = x_config.get("account_groups", {})
    if not isinstance(configured, dict) or set(configured) != set(X_ACCOUNT_GROUP_KEYS):
        raise HorizonBridgeError("X account_groups 必须包含增材制造、材料冶金、科研 AI、AI 工程四组。")
    normalized: dict[str, list[str]] = {}
    for group in X_ACCOUNT_GROUP_KEYS:
        values = configured.get(group)
        if not isinstance(values, list):
            raise HorizonBridgeError(f"X 账号分组 {group} 必须为列表。")
        group_values: list[str] = []
        seen: set[str] = set()
        for value in values:
            if not isinstance(value, str):
                raise HorizonBridgeError(f"X 账号分组 {group} 只能包含账号名字符串。")
            handle = value.strip().lstrip("@").lower()
            if not re.fullmatch(r"[a-z0-9_]+", handle):
                raise HorizonBridgeError(f"X 账号名格式不支持：{value!r}")
            if handle in seen:
                raise HorizonBridgeError(f"X 账号分组 {group} 存在重复账号：{value!r}")
            seen.add(handle)
            group_values.append(handle)
        expected = X_ACCOUNT_GROUP_COUNTS[group]
        if len(group_values) != expected:
            raise HorizonBridgeError(f"X 账号分组 {group} 必须为 {expected} 个账号，当前为 {len(group_values)} 个。")
        normalized[group] = group_values
    return normalized


def x_pending_accounts(config: dict[str, Any]) -> list[str]:
    """Return candidates retained visibly for confirmation, never silently replaced."""
    verification = config.get("sources", {}).get("x", {}).get("account_verification", {})
    values = verification.get("pending", []) if isinstance(verification, dict) else []
    if not isinstance(values, list):
        raise HorizonBridgeError("X account_verification.pending 必须为列表。")
    pending = [str(value).strip().lstrip("@").lower() for value in values if str(value).strip()]
    retained_values = verification.get("retained_out_of_pool", []) if isinstance(verification, dict) else []
    if not isinstance(retained_values, list):
        raise HorizonBridgeError("X account_verification.retained_out_of_pool 必须为列表。")
    retained = [str(value).strip().lstrip("@").lower() for value in retained_values if str(value).strip()]
    configured = set(x_users(config))
    if len(retained) != len(set(retained)):
        raise HorizonBridgeError("X account_verification.retained_out_of_pool 不能包含重复账号。")
    if set(retained) & configured:
        raise HorizonBridgeError("X 待复核账号不能同时出现在 27 个活动账号中。")
    if not set(retained).issubset(set(pending)):
        raise HorizonBridgeError("X 待复核账号必须同时列在 pending 中，不能静默隐藏。")
    if not set(pending).issubset(configured | set(retained)):
        raise HorizonBridgeError("X 待确认账号必须来自活动账号或 retained_out_of_pool，不能静默扩展范围。")
    return list(dict.fromkeys(pending))


def x_users_for_run(config: dict[str, Any], users: list[str]) -> list[str]:
    """Return every supplied reviewed handle; weekly runs do not rotate accounts."""
    x_config = config.get("sources", {}).get("x", {})
    if not bool(x_config.get("rotation_enabled", False)):
        return list(users)
    per_run = int(x_config.get("users_per_run", len(users)))
    if per_run < 1 or per_run > len(users):
        raise HorizonBridgeError("X users_per_run 必须介于 1 和审核账号总数之间。")
    if per_run == len(users):
        return users
    state = _x_budget_state(Path(config["budget_state_path"]), x_budget_now(config))
    start = int(state.get("next_user_rotation_offset", 0)) % len(users)
    return [users[(start + index) % len(users)] for index in range(per_run)]


def advance_x_user_rotation(config: dict[str, Any], total_users: int, used_users: int) -> None:
    if total_users <= 0 or used_users <= 0:
        return
    if not bool(config.get("sources", {}).get("x", {}).get("rotation_enabled", False)):
        return
    path = Path(config["budget_state_path"])
    state = _x_budget_state(path, x_budget_now(config))
    current = int(state.get("next_user_rotation_offset", 0))
    state["next_user_rotation_offset"] = (current + used_users) % total_users
    atomic_write(path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def _x_budget_state(path: Path, now: dt.datetime) -> dict[str, Any]:
    """Load the current monthly budget state, failing closed if it is corrupt."""
    month = now.strftime("%Y-%m")
    if path.exists():
        try:
            state = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HorizonBridgeError(f"无法读取 X 本地预算状态，已拒绝发起采集：{path}: {exc}") from exc
        if not isinstance(state, dict):
            raise HorizonBridgeError("X 本地预算状态格式无效，已拒绝发起采集。")
    else:
        state = {}
    if state.get("schema") != X_BUDGET_SCHEMA or state.get("month") != month:
        state = {
            "schema": X_BUDGET_SCHEMA,
            "month": month,
            "reserved_actor_runs": 0,
            "reserved_items": 0,
            "reserved_cost_usd": 0.0,
            "actual_items": 0,
            "estimated_actual_cost_usd": 0.0,
            "reported_actual_cost_usd": 0.0,
            "seen_tweet_ids": [],
            "days": {},
        }
    days = state.setdefault("days", {})
    day = now.date().isoformat()
    days.setdefault(
        day,
        {
            "actor_runs": 0,
            "reserved_items": 0,
            "actual_items": 0,
            "estimated_actual_cost_usd": 0.0,
        },
    )
    return state


def _x_budget_limits(config: dict[str, Any]) -> dict[str, int | float]:
    x_config = config.get("sources", {}).get("x", {})
    max_items = int(x_config.get("max_items_per_run", 410))
    actor_request_max_items = int(x_config.get("actor_request_max_items", max_items))
    if max_items < 100 or actor_request_max_items < 100:
        raise HorizonBridgeError("X 单次请求上限不能低于 Scweet 当前的 100 条请求下限。")
    if actor_request_max_items > max_items:
        raise HorizonBridgeError("X actor_request_max_items 不能超过 max_items_per_run。")
    max_cost_per_run = round(float(x_config.get("max_cost_per_run_usd", 1.236)), 4)
    monthly_spend_cap = round(float(x_config.get("monthly_spend_cap_usd", 4.95)), 4)
    monthly_reserve = round(float(x_config.get("monthly_reserve_usd", 0.05)), 4)
    free_credit = round(float(x_config.get("monthly_free_credit_usd", 5.0)), 4)
    if max_cost_per_run <= 0 or monthly_spend_cap <= 0 or monthly_reserve < 0 or free_credit <= 0:
        raise HorizonBridgeError("X 费用上限必须为正数。")
    if monthly_spend_cap + monthly_reserve > free_credit + 0.0001:
        raise HorizonBridgeError("X 月度费用上限加预留必须不超过 Free Plan 额度。")
    return {
        "max_actor_runs_per_day": max(1, int(x_config.get("max_actor_runs_per_day", 1))),
        "max_actor_runs_per_month": max(1, int(x_config.get("max_actor_runs_per_month", 5))),
        "max_items_per_run": max_items,
        "max_items_per_month": max(100, int(x_config.get("max_items_per_month", 1640))),
        "actor_request_max_items": actor_request_max_items,
        "max_cost_per_run_usd": max_cost_per_run,
        "monthly_spend_cap_usd": monthly_spend_cap,
        "monthly_reserve_usd": monthly_reserve,
        "monthly_free_credit_usd": free_credit,
        "hard_max_items_per_run": max_items,
        "hard_actor_request_max_items": actor_request_max_items,
        "hard_max_cost_per_run_usd": max_cost_per_run,
    }


def scheduled_run_slots(config: dict[str, Any], now: dt.datetime | None = None) -> int:
    """Count configured weekly run dates from *now* through the local month end."""
    x_config = config.get("sources", {}).get("x", {})
    schedule = x_config.get("schedule", {})
    configured_days = schedule.get("days_of_week", ["Sunday"])
    if not isinstance(configured_days, list) or not configured_days:
        configured_days = ["Sunday"]
    day_numbers = {
        name: index
        for index, name in enumerate(
            ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        )
    }
    weekdays = {day_numbers[value] for value in configured_days if value in day_numbers}
    if not weekdays:
        return 1
    local_now = now or x_budget_now(config)
    cursor = local_now.date()
    if cursor.month == 12:
        next_month = dt.date(cursor.year + 1, 1, 1)
    else:
        next_month = dt.date(cursor.year, cursor.month + 1, 1)
    count = 0
    while cursor < next_month:
        if cursor.weekday() in weekdays:
            count += 1
        cursor += dt.timedelta(days=1)
    return count


def _x_dynamic_limits(
    config: dict[str, Any],
    state: dict[str, Any],
    now: dt.datetime,
) -> dict[str, int | float]:
    """Allocate the remaining monthly budget across remaining scheduled runs."""
    limits = _x_budget_limits(config)
    committed_cost = float(state.get("estimated_actual_cost_usd", 0.0)) + float(state.get("reserved_cost_usd", 0.0))
    remaining_cost = max(0.0, float(limits["monthly_spend_cap_usd"]) - committed_cost)
    calendar_slots = scheduled_run_slots(config, now)
    # The monthly run field is only a configuration ceiling.  It must not be
    # reduced by historical reservations from tests, failed/partial runs, or
    # earlier weekly runs; the active cadence is the remaining calendar slots.
    remaining_runs = min(calendar_slots, int(limits["max_actor_runs_per_month"]))
    slots = remaining_runs
    remaining_items = max(
        0,
        int(limits["max_items_per_month"]) - int(state.get("reserved_items", 0)),
    )
    start_fee = max(0.0, float(config.get("sources", {}).get("x", {}).get("estimated_run_start_fee_usd", 0.006)))
    tweet_fee = max(0.0, float(config.get("sources", {}).get("x", {}).get("estimated_tweet_fee_per_1000_usd", 3.0)))
    hard_items = min(int(limits["hard_max_items_per_run"]), int(limits["hard_actor_request_max_items"]))
    allocated_items = 0
    if slots > 0 and remaining_items >= 100:
        per_run_cost = remaining_cost / slots
        if tweet_fee <= 0:
            allocated_items = hard_items
        else:
            allocated_items = int((per_run_cost - start_fee) * 1000 / tweet_fee)
        allocated_items = min(hard_items, remaining_items, max(0, allocated_items))
        while allocated_items >= 100:
            estimated = estimate_x_charge(config, allocated_items)
            if estimated <= float(limits["hard_max_cost_per_run_usd"]) + 0.0001 and committed_cost + estimated <= float(limits["monthly_spend_cap_usd"]) + 0.0001:
                break
            allocated_items -= 1
    allocated_cost = estimate_x_charge(config, allocated_items) if allocated_items >= 100 else 0.0
    dynamic = dict(limits)
    dynamic.update(
        {
            "max_items_per_run": allocated_items,
            "actor_request_max_items": allocated_items,
            "max_cost_per_run_usd": allocated_cost,
            "allocated_items_per_run": allocated_items,
            "allocated_cost_per_run_usd": allocated_cost,
            "remaining_scheduled_runs": calendar_slots,
            "remaining_budget_runs": remaining_runs,
            "allocation_slots": slots,
            "remaining_items": remaining_items,
            "remaining_cost_usd": round(remaining_cost, 4),
        }
    )
    return dynamic


def x_budget_preview(config: dict[str, Any], users: list[str]) -> dict[str, Any]:
    """Return a no-write budget preview for dry-run and operator reports."""
    now = x_budget_now(config)
    state = _x_budget_state(Path(config["budget_state_path"]), now)
    day = state["days"][now.date().isoformat()]
    limits = _x_dynamic_limits(config, state, now)
    return {
        "status": "NO_SOURCES" if not users else ("READY" if int(limits["max_items_per_run"]) >= 100 else "INSUFFICIENT_REMAINING_BUDGET"),
        "month": state["month"],
        "users": len(users),
        "reserved_actor_runs_month": state["reserved_actor_runs"],
        "reserved_items_month": state["reserved_items"],
        "reserved_cost_usd_month": state["reserved_cost_usd"],
        "estimated_actual_cost_usd_month": state["estimated_actual_cost_usd"],
        "reported_actual_cost_usd_month": state["reported_actual_cost_usd"],
        "cost_commitment_usd_month": round(
            float(state["estimated_actual_cost_usd"]) + float(state["reserved_cost_usd"]),
            4,
        ),
        "actor_runs_today": day["actor_runs"],
        "remaining_scheduled_runs": limits["remaining_scheduled_runs"],
        "allocated_items_per_run": limits["allocated_items_per_run"],
        "allocated_cost_per_run_usd": limits["allocated_cost_per_run_usd"],
        "limits": limits,
        "billing_cap_guarantee": False,
    }


def x_time_window(config: dict[str, Any], now: dt.datetime | None = None) -> dict[str, str]:
    """Use the previous successful UTC endpoint, falling back to the configured lookback."""
    now_utc = (now or dt.datetime.now(dt.timezone.utc)).astimezone(dt.timezone.utc)
    lookback_hours = max(1, int(config.get("lookback_hours", 24)))
    state = _x_budget_state(Path(config["budget_state_path"]), now_utc.astimezone(x_budget_timezone(config)))
    last_success = parse_utc(state.get("last_successful_until_utc"))
    fallback = now_utc - dt.timedelta(hours=lookback_hours)
    if last_success is None:
        since = fallback
        origin = "lookback_hours"
    elif last_success >= now_utc:
        since = fallback
        origin = "invalid_previous_window_fallback"
    else:
        since = last_success
        origin = "last_successful_until_utc"
    return {"since": utc_iso(since), "until": utc_iso(now_utc), "origin": origin}


def reserve_x_budget(config: dict[str, Any], users: list[str]) -> dict[str, Any]:
    """Reserve one potential Apify actor run before making the network call."""
    now = x_budget_now(config)
    path = Path(config["budget_state_path"])
    state = _x_budget_state(path, now)
    day = state["days"][now.date().isoformat()]
    limits = _x_dynamic_limits(config, state, now)
    if day["actor_runs"] >= limits["max_actor_runs_per_day"]:
        return {"status": "SKIPPED_BUDGET_DAILY", "reason": "local daily X actor-run budget reached", "limits": limits}
    if int(limits["allocation_slots"]) <= 0:
        return {
            "status": "SKIPPED_BUDGET_SCHEDULED_RUNS",
            "reason": "no remaining configured weekly X run slot in the current local month",
            "limits": limits,
        }
    if state["reserved_items"] + limits["max_items_per_run"] > limits["max_items_per_month"]:
        return {"status": "SKIPPED_BUDGET_MONTHLY_ITEMS", "reason": "local monthly X item budget reached", "limits": limits}
    if int(limits["max_items_per_run"]) < 100:
        if int(limits["remaining_items"]) < 100:
            return {"status": "SKIPPED_BUDGET_MONTHLY_ITEMS", "reason": "remaining monthly item budget cannot fund the 100-item minimum request", "limits": limits}
        return {"status": "SKIPPED_BUDGET_MONTHLY_COST", "reason": "remaining monthly budget cannot fund the 100-item minimum request", "limits": limits}
    committed_cost = float(state["estimated_actual_cost_usd"]) + float(state["reserved_cost_usd"])
    if committed_cost + limits["max_cost_per_run_usd"] > limits["monthly_spend_cap_usd"] + 0.0001:
        return {"status": "SKIPPED_BUDGET_MONTHLY_COST", "reason": "local monthly X cost budget reached", "limits": limits}
    state["reserved_actor_runs"] += 1
    state["reserved_items"] += limits["max_items_per_run"]
    state["reserved_cost_usd"] = round(state["reserved_cost_usd"] + limits["max_cost_per_run_usd"], 4)
    day["actor_runs"] += 1
    day["reserved_items"] += limits["max_items_per_run"]
    state["last_reservation_at"] = now.isoformat(timespec="seconds")
    state["last_reservation_users"] = len(users)
    atomic_write(path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")
    return {
        "status": "RESERVED",
        "month": state["month"],
        "users": len(users),
        "reserved_actor_runs_month": state["reserved_actor_runs"],
        "reserved_items_month": state["reserved_items"],
        "reserved_cost_usd_month": state["reserved_cost_usd"],
        "actor_runs_today": day["actor_runs"],
        "limits": limits,
        "billing_cap_guarantee": False,
    }


def release_x_start_reservation(config: dict[str, Any], reservation: dict[str, Any]) -> None:
    """Undo only a rejected pre-run reservation; an actual Actor run remains reserved."""
    if reservation.get("status") != "RESERVED":
        return
    now = x_budget_now(config)
    path = Path(config["budget_state_path"])
    state = _x_budget_state(path, now)
    day = state["days"][now.date().isoformat()]
    limits = reservation["limits"]
    state["reserved_actor_runs"] = max(0, state["reserved_actor_runs"] - 1)
    state["reserved_items"] = max(0, state["reserved_items"] - int(limits["max_items_per_run"]))
    state["reserved_cost_usd"] = round(
        max(0.0, float(state["reserved_cost_usd"]) - float(limits["max_cost_per_run_usd"])),
        4,
    )
    day["actor_runs"] = max(0, day["actor_runs"] - 1)
    day["reserved_items"] = max(0, day["reserved_items"] - int(limits["max_items_per_run"]))
    state["last_released_start_reservation_at"] = now.isoformat(timespec="seconds")
    atomic_write(path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def settle_x_cost_reservation(config: dict[str, Any], reservation: dict[str, Any]) -> None:
    """Replace a successful run's worst-case cost reservation with actual accounting.

    Actor-run and item counters remain historical monthly guardrails.  Only the
    pending cost reservation is released after a completed dataset is accounted
    for, which lets low-volume daily monitoring continue while preserving a
    hard pre-run $4.95 commitment check.
    """
    if reservation.get("status") != "RESERVED":
        return
    path = Path(config["budget_state_path"])
    state = _x_budget_state(path, x_budget_now(config))
    amount = float(reservation["limits"]["max_cost_per_run_usd"])
    state["reserved_cost_usd"] = round(max(0.0, float(state["reserved_cost_usd"]) - amount), 4)
    state["last_cost_reservation_settled_at"] = x_budget_now(config).isoformat(timespec="seconds")
    atomic_write(path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def filter_seen_x_items(
    config: dict[str, Any], items: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], int]:
    """Remove already staged tweet IDs using a bounded local ledger."""
    state = _x_budget_state(Path(config["budget_state_path"]), x_budget_now(config))
    seen = {str(value) for value in state.get("seen_tweet_ids", []) if isinstance(value, str)}
    output: list[dict[str, Any]] = []
    duplicate_count = 0
    for item in items:
        item_id = str(item.get("id") or "")
        if not item_id or item_id in seen:
            duplicate_count += 1
            continue
        seen.add(item_id)
        output.append(item)
    return output, duplicate_count


def estimate_x_charge(config: dict[str, Any], dataset_item_count: int) -> float:
    """Estimate Scweet charge from its configured start and per-tweet prices."""
    x_config = config.get("sources", {}).get("x", {})
    start_fee = max(0.0, float(x_config.get("estimated_run_start_fee_usd", 0.006)))
    tweet_fee = max(0.0, float(x_config.get("estimated_tweet_fee_per_1000_usd", 3.0)))
    return round(start_fee + max(0, dataset_item_count) * tweet_fee / 1000.0, 4)


def record_x_result(
    config: dict[str, Any],
    item_count: int,
    dataset_item_count: int,
    window: dict[str, str],
    item_ids: list[str],
    reported_charge_usd: float | None,
    *,
    advance_cursor: bool = True,
) -> dict[str, Any]:
    """Record observed counts/costs and advance the UTC cursor for a completed result."""
    now = x_budget_now(config)
    path = Path(config["budget_state_path"])
    state = _x_budget_state(path, now)
    day = state["days"][now.date().isoformat()]
    count = max(0, int(item_count))
    dataset_count = max(0, int(dataset_item_count))
    estimated_charge = estimate_x_charge(config, dataset_count)
    state["actual_items"] += count
    day["actual_items"] += count
    state["estimated_actual_cost_usd"] = round(
        float(state.get("estimated_actual_cost_usd", 0.0)) + estimated_charge,
        4,
    )
    day["estimated_actual_cost_usd"] = round(
        float(day.get("estimated_actual_cost_usd", 0.0)) + estimated_charge,
        4,
    )
    if reported_charge_usd is not None:
        state["reported_actual_cost_usd"] = round(
            float(state.get("reported_actual_cost_usd", 0.0)) + max(0.0, reported_charge_usd),
            4,
        )
    prior_ids = [value for value in state.get("seen_tweet_ids", []) if isinstance(value, str)]
    state["seen_tweet_ids"] = (prior_ids + [value for value in item_ids if value])[-5000:]
    state["last_result_at"] = now.isoformat(timespec="seconds")
    state["last_result_items"] = count
    state["last_result_dataset_items"] = dataset_count
    state["last_result_estimated_charge_usd"] = estimated_charge
    state["last_result_reported_charge_usd"] = reported_charge_usd
    if advance_cursor:
        state["last_successful_until_utc"] = window["until"]
    atomic_write(path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")
    return {
        "dataset_items": dataset_count,
        "estimated_charge_usd": estimated_charge,
        "reported_charge_usd": reported_charge_usd,
        "estimated_actual_cost_usd_month": state["estimated_actual_cost_usd"],
        "reported_actual_cost_usd_month": state["reported_actual_cost_usd"],
        "cursor_advanced": advance_cursor,
    }


def release_zero_cost_invalid_run(
    config: dict[str, Any],
    reservation: dict[str, Any],
    reason: str,
    invalid_until_utc: str | None = None,
    recorded_estimated_charge_usd: float = 0.0,
) -> None:
    """Release a reservation only after a confirmed zero-cost invalid Actor run.

    This is deliberately narrower than a normal Actor failure: the caller must
    have independently confirmed that Apify reported zero usage.  It permits a
    corrective retry without spending the user's daily or monthly allowance.
    """
    release_x_start_reservation(config, reservation)
    path = Path(config["budget_state_path"])
    state = _x_budget_state(path, x_budget_now(config))
    refund = max(0.0, float(recorded_estimated_charge_usd))
    if refund:
        state["estimated_actual_cost_usd"] = round(
            max(0.0, float(state.get("estimated_actual_cost_usd", 0.0)) - refund), 4
        )
        day = state["days"][x_budget_now(config).date().isoformat()]
        day["estimated_actual_cost_usd"] = round(
            max(0.0, float(day.get("estimated_actual_cost_usd", 0.0)) - refund), 4
        )
    if invalid_until_utc and state.get("last_successful_until_utc") == invalid_until_utc:
        state.pop("last_successful_until_utc", None)
    state["last_released_zero_cost_invalid_run_at"] = x_budget_now(config).isoformat(timespec="seconds")
    state["last_released_zero_cost_invalid_run_reason"] = reason
    atomic_write(path, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def x_schedule(config: dict[str, Any]) -> dict[str, Any]:
    """Return the configured X cadence; activation remains an OS-task decision."""
    schedule = config.get("sources", {}).get("x", {}).get("schedule", {})
    return {
        "timezone": schedule.get("timezone", "Asia/Shanghai"),
        "days_of_week": schedule.get("days_of_week", ["Sunday"]),
        "frequency": schedule.get("frequency", "weekly"),
        "local_time": schedule.get("local_time", "12:00"),
        "automatic_task_enabled": bool(schedule.get("automatic_task_enabled", False)),
        "configured_max_runs_per_month": int(config.get("sources", {}).get("x", {}).get("max_actor_runs_per_month", 5)),
    }


async def collect_github(config: dict[str, Any], sources: list[Any]) -> list[dict[str, Any]]:
    horizon_root = Path(config["horizon_root"])
    if str(horizon_root) not in sys.path:
        sys.path.insert(0, str(horizon_root))
    try:
        import httpx
        from src.scrapers.github import GitHubScraper
    except Exception as exc:
        raise HorizonBridgeError(f"无法加载 Horizon GitHub 抓取器或其隔离依赖：{exc}") from exc
    token_env = str(config.get("sources", {}).get("github", {}).get("token_env", "RESEARCHKB_GITHUB_TOKEN"))
    if token_env not in ALLOWED_SECRET_NAMES:
        raise HorizonBridgeError("GitHub token_env 未在本桥接器白名单中。")
    os.environ.pop("GITHUB_TOKEN", None)
    if os.environ.get(token_env):
        os.environ["GITHUB_TOKEN"] = os.environ[token_env]
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=int(config.get("lookback_hours", 36)))
    timeout = httpx.Timeout(float(config.get("network_timeout_seconds", 20)))
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "ResearchKB-v3-Horizon-Bridge/1.0"}) as client:
        items = await GitHubScraper(sources, client).fetch(since)
    limit = max(1, int(config.get("max_items_per_source", 20)))
    return [item.model_dump(mode="json") for item in items[:limit]]


async def collect_x(config: dict[str, Any], users: list[str]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Collect X through Horizon's Apify/Scweet scraper under a local budget."""
    x_config = config.get("sources", {}).get("x", {})
    token_env = str(x_config.get("token_env", "APIFY_TOKEN"))
    if not os.environ.get(token_env):
        return [], {"source_id": "x", "status": "SKIPPED_NO_TOKEN", "count": 0, "reason": "APIFY_TOKEN is not configured locally"}
    run_users = x_users_for_run(config, users)
    reservation = reserve_x_budget(config, run_users)
    if reservation["status"] != "RESERVED":
        return [], {"source_id": "x", "status": reservation["status"], "count": 0, "reason": reservation.get("reason"), "budget": reservation}
    window = x_time_window(config)
    horizon_root = Path(config["horizon_root"])
    if str(horizon_root) not in sys.path:
        sys.path.insert(0, str(horizon_root))
    try:
        import httpx
        from src.models import TwitterConfig
        from src.scrapers.twitter import TwitterScraper
    except Exception as exc:
        release_x_start_reservation(config, reservation)
        return [], {
            "source_id": "x",
            "status": "ERROR",
            "count": 0,
            "error": f"无法加载 Horizon X 抓取器：{exc}",
            "reservation_released": True,
            "budget": x_budget_preview(config, users),
        }
    model = TwitterConfig(
        enabled=True,
        mode="apify",
        users=run_users,
        fetch_limit=int(reservation["limits"]["actor_request_max_items"]),
        category=x_config.get("category"),
        profile=x_config.get("profile"),
        fetch_reply_text=False,
        max_replies_per_tweet=0,
        max_tweets_to_expand=0,
        reply_min_likes=0,
        apify_token_env=token_env,
        actor_id=str(x_config.get("actor_id", "altimis~scweet")),
        max_total_charge_usd=float(reservation["limits"]["max_cost_per_run_usd"]),
        restart_on_error=False,
        source_mode=str(x_config.get("source_mode", "profiles")),
    )
    since = parse_utc(window["since"])
    if since is None:
        release_x_start_reservation(config, reservation)
        return [], {
            "source_id": "x",
            "status": "ERROR",
            "count": 0,
            "error": "X UTC 时间窗口无效",
            "reservation_released": True,
            "budget": x_budget_preview(config, users),
            "window": window,
        }
    until = parse_utc(window["until"])
    if until is None:
        release_x_start_reservation(config, reservation)
        return [], {
            "source_id": "x",
            "status": "ERROR",
            "count": 0,
            "error": "X UTC 时间窗口无效",
            "reservation_released": True,
            "budget": x_budget_preview(config, users),
            "window": window,
        }
    timeout = httpx.Timeout(float(config.get("network_timeout_seconds", 20)))
    scraper: Any | None = None
    try:
        async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "ResearchKB-v3-Horizon-Bridge/1.0"}) as client:
            scraper = TwitterScraper(model, client)
            items = await scraper.fetch(since, until)
        if not scraper.last_run_started:
            release_x_start_reservation(config, reservation)
            return [], {
                "source_id": "x",
                "status": "ERROR",
                "count": 0,
                "error": scraper.last_start_error or "X/Apify Actor 未被启动。",
                "reservation_released": True,
                "window": window,
                "budget": x_budget_preview(config, users),
            }
        if not scraper.last_run_succeeded or not scraper.last_dataset_fetch_succeeded:
            invalid_input = scraper.last_run_validation_error
            zero_cost = isinstance(scraper.last_run_charge_usd, (int, float)) and scraper.last_run_charge_usd <= 0.0
            if invalid_input and zero_cost:
                release_zero_cost_invalid_run(
                    config,
                    reservation,
                    invalid_input,
                    invalid_until_utc=window["until"],
                )
                return [], {
                    "source_id": "x",
                    "status": "ERROR_INVALID_ACTOR_INPUT",
                    "count": 0,
                    "error": invalid_input,
                    "reservation_released": True,
                    "window": window,
                    "budget": x_budget_preview(config, users),
                }
            return [], {
                "source_id": "x",
                "status": "ERROR",
                "count": 0,
                "error": "X/Apify Actor 或数据集未成功完成；保守保留本次预算预留。",
                "window": window,
                "budget": reservation,
            }
        requested_handles = {handle.strip().lstrip("@").lower() for handle in run_users if handle.strip()}
        returned_handles = sorted(scraper.last_dataset_source_handles)
        missing_handles = sorted(requested_handles - set(returned_handles))
        coverage_fields = {
            "actor_requested_source_handles": sorted(requested_handles),
            "actor_dataset_source_handles": returned_handles,
            "actor_missing_source_handles": missing_handles,
        }
        if scraper.last_dataset_item_count == 0:
            accounting = record_x_result(
                config,
                0,
                0,
                window,
                [],
                scraper.last_run_charge_usd,
                advance_cursor=False,
            )
            settle_x_cost_reservation(config, reservation)
            advance_x_user_rotation(config, len(users), len(run_users))
            return [], {
                "source_id": "x",
                "status": "ERROR_EMPTY_ACTOR_RESULT",
                "count": 0,
                "duplicate_count": 0,
                "actor_run_id": scraper.last_run_id,
                "actor_source_mode": model.source_mode,
                "actor_dataset_item_count": 0,
                "actor_reported_charge_usd": scraper.last_run_charge_usd,
                **coverage_fields,
                "window": window,
                "budget": reservation,
                "accounting": accounting,
                "reason": "Apify Actor 已成功完成却返回空数据集；这在固定审核账号池中按采集异常处理，不推进 UTC 游标，也不自动重试。",
            }
        request_target = int(reservation["limits"]["actor_request_max_items"])
        partial_coverage = scraper.last_dataset_item_count >= request_target and bool(missing_handles)
        parsed_output = [item.model_dump(mode="json") for item in items[: reservation["limits"]["max_items_per_run"]]]
        output, duplicate_count = filter_seen_x_items(config, parsed_output)
        if partial_coverage:
            accounting = record_x_result(
                config,
                len(output),
                scraper.last_dataset_item_count,
                window,
                [str(item.get("id") or "") for item in output],
                scraper.last_run_charge_usd,
            )
            settle_x_cost_reservation(config, reservation)
            advance_x_user_rotation(config, len(users), len(run_users))
            return output, {
                "source_id": "x",
                "status": "OK_PARTIAL_ACTOR_COVERAGE",
                "count": len(output),
                "duplicate_count": duplicate_count,
                "users": run_users,
                "actor_run_id": scraper.last_run_id,
                "actor_source_mode": model.source_mode,
                "actor_dataset_item_count": scraper.last_dataset_item_count,
                "actor_reported_charge_usd": scraper.last_run_charge_usd,
                **coverage_fields,
                "window": window,
                "budget": reservation,
                "accounting": accounting,
                "reason": "Scweet 单次 max_items 是全局条目上限，本次未观察到全部请求账号；仍使用已取得的 X 条目生成本周周报，记录缺失账号，不自动重试。",
            }
        accounting = record_x_result(
            config,
            len(output),
            scraper.last_dataset_item_count,
            window,
            [str(item.get("id") or "") for item in output],
            scraper.last_run_charge_usd,
        )
        settle_x_cost_reservation(config, reservation)
        advance_x_user_rotation(config, len(users), len(run_users))
        return output, {
            "source_id": "x",
            "status": "OK",
            "count": len(output),
            "duplicate_count": duplicate_count,
            "users": run_users,
            "actor_run_id": scraper.last_run_id,
            "actor_source_mode": model.source_mode,
            "actor_dataset_item_count": scraper.last_dataset_item_count,
            "actor_reported_charge_usd": scraper.last_run_charge_usd,
            **coverage_fields,
            "window": window,
            "budget": reservation,
            "accounting": accounting,
        }
    except Exception as exc:
        if scraper is None or not scraper.last_run_started:
            release_x_start_reservation(config, reservation)
            return [], {
                "source_id": "x",
                "status": "ERROR",
                "count": 0,
                "error": f"X/Apify 采集失败：{exc}",
                "reservation_released": True,
                "budget": x_budget_preview(config, users),
            }
        return [], {"source_id": "x", "status": "ERROR", "count": 0, "error": f"X/Apify 采集失败：{exc}", "budget": reservation}


def run(config_path: Path, dry_run: bool, network: bool) -> dict[str, Any]:
    config = load_config(config_path)
    sources = github_sources(config)
    users = x_users(config)
    configured_types = {source.type for source in sources}
    x_preview = x_budget_preview(config, users)
    report = {
        "schema": "researchkb-horizon-fetch-only-report/v5",
        "started_at": iso_now(),
        "mode": config["mode"],
        "dry_run": dry_run,
        "network_enabled": network,
        "github_source_count": len(sources),
        "github_source_types": sorted(configured_types),
        "x_user_count": len(users),
        "x_pending_accounts": x_pending_accounts(config),
        "x_users_per_run": len(users),
        "x_mode": config.get("sources", {}).get("x", {}).get("mode", "apify"),
        "x_budget": x_preview,
        "x_schedule": x_schedule(config),
        "x_next_window": x_time_window(config),
        "external_ai_enabled": False,
        "delivery_enabled": False,
        "formal_vault_write": False,
        "zotero_write": False,
    }
    if dry_run:
        report.update({
            "status": "DRY_RUN_READY",
            "reason": "configuration validated; no network request, budget reservation, or staging write",
            "source_status": [
                {"source_id": "github", "status": "READY", "count": len(sources)},
                {"source_id": "x", "status": "READY" if users else "SKIPPED_NO_SOURCES", "count": 0, "budget": x_preview},
            ],
        })
        report["finished_at"] = iso_now()
        return report
    if not network:
        raise HorizonBridgeError("实际采集需要显式传入 --network；默认不联网。")
    if not sources and not users:
        report.update({"status": "SKIPPED_NO_SOURCES", "reason": "no reviewed GitHub or X sources are configured", "source_status": [
            {"source_id": "github", "status": "SKIPPED_NO_SOURCES", "count": 0},
            {"source_id": "x", "status": "SKIPPED_NO_SOURCES", "count": 0, "budget": x_preview},
        ]})
        report["finished_at"] = iso_now()
        return report
    secrets_path = Path(config["secrets_file"])
    load_optional_secrets(secrets_path)
    items: list[dict[str, Any]] = []
    statuses: list[dict[str, Any]] = []
    if sources:
        try:
            github_items = asyncio.run(collect_github(config, sources))
            items.extend(github_items)
            statuses.append({"source_id": "github", "status": "OK", "count": len(github_items)})
        except Exception as exc:
            statuses.append({"source_id": "github", "status": "ERROR", "count": 0, "error": f"GitHub 采集失败：{exc}"})
    else:
        statuses.append({"source_id": "github", "status": "SKIPPED_NO_SOURCES", "count": 0})
    if users:
        x_items, x_status = asyncio.run(collect_x(config, users))
        items.extend(x_items)
        statuses.append(x_status)
    else:
        statuses.append({"source_id": "x", "status": "SKIPPED_NO_SOURCES", "count": 0, "budget": x_preview})
    run_id = f"horizon-signals-{dt.datetime.now().astimezone().strftime('%Y%m%d-%H%M%S-%f')}"
    run_dir = Path(config["output_root"]) / run_id
    raw_path = run_dir / "raw.jsonl"
    raw = "".join(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n" for item in items)
    atomic_write(raw_path, raw)
    errors = [status for status in statuses if str(status.get("status", "")).startswith("ERROR")]
    warnings = [status for status in statuses if str(status.get("status", "")) == "OK_PARTIAL_ACTOR_COVERAGE"]
    report.update({
        "status": "OK_WITH_ERRORS" if errors else ("OK_WITH_WARNINGS" if warnings else "OK"),
        "run_id": run_id,
        "item_count": len(items),
        "raw_packet": str(raw_path),
        "token_configured": bool(os.environ.get(config.get("sources", {}).get("github", {}).get("token_env", ""))),
        "x_token_configured": bool(os.environ.get(config.get("sources", {}).get("x", {}).get("token_env", ""))),
        "source_status": statuses,
        "finished_at": iso_now(),
    })
    atomic_write(run_dir / "manifest.json", json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ResearchKB Horizon fetch-only bridge")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="只校验配置，不联网、不写入 staging")
    mode.add_argument("--network", action="store_true", help="执行已配置的 GitHub/X 原始信号采集")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    args = parser.parse_args(argv)
    try:
        result = run(args.config, args.dry_run, args.network)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except HorizonBridgeError as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
