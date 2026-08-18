import copy
import datetime as dt
import importlib.util
import json
import os
import asyncio
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / ".harness" / "scripts" / "horizon_fetch_only.py"
SPEC = importlib.util.spec_from_file_location("horizon_fetch_only", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class HorizonFetchOnlyTests(unittest.TestCase):
    def test_current_config_has_twenty_seven_reviewed_users_in_10_5_6_6_groups(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        self.assertEqual(config["schema"], "researchkb-horizon-fetch-only/v5")
        users = MODULE.x_users(config)
        self.assertEqual(len(users), 27)
        self.assertEqual(len(set(users)), 27)
        groups = MODULE.x_account_groups(config)
        self.assertEqual([len(groups[key]) for key in MODULE.X_ACCOUNT_GROUP_KEYS], [10, 5, 6, 6])
        self.assertEqual(set(users), {handle for values in groups.values() for handle in values})
        self.assertEqual(
            MODULE.x_pending_accounts(config),
            ["twiglobal", "mfgusa", "astmamcoe", "mooseframework", "opencatalyst", "naturematerials"],
        )
        self.assertEqual(
            config["sources"]["x"]["account_verification"]["retained_out_of_pool"],
            ["TWIglobal", "MFGUSA", "ASTMAMCOE", "MOOSEFramework"],
        )
        self.assertEqual(
            set(groups["ai_engineering_and_practical_workflows"]),
            {"pytorch", "karpathy", "huggingface", "chatgptapp", "gkxspace", "khazix0918"},
        )
        self.assertNotIn("googledeepmind", users)
        self.assertNotIn("@ChatGPT", [str(value) for value in config["sources"]["x"]["users"]])
        self.assertEqual(config["sources"]["x"]["source_mode"], "fixed_users_search")
        self.assertFalse(config["sources"]["x"]["search_enabled"])
        self.assertFalse(config["sources"]["x"]["fetch_reply_text"])
        self.assertEqual(config["sources"]["x"]["max_items_per_month"], 1640)
        self.assertEqual(config["sources"]["x"]["users_per_run"], 27)
        self.assertFalse(config["sources"]["x"]["rotation_enabled"])
        self.assertEqual(config["sources"]["x"]["max_cost_per_run_usd"], 1.236)
        self.assertEqual(
            MODULE.x_schedule(config)["days_of_week"],
            ["Sunday"],
        )
        self.assertFalse(config["external_ai"]["enabled"])
        self.assertFalse(config["delivery"]["enabled"])

    def test_production_config_rejects_profile_fallback(self):
        config = json.loads(MODULE.DEFAULT_CONFIG.read_text(encoding="utf-8"))
        config["sources"]["x"]["source_mode"] = "profiles"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "profiles.json"
            path.write_text(json.dumps(config), encoding="utf-8")
            with self.assertRaises(MODULE.HorizonBridgeError):
                MODULE.load_config(path)

    def test_production_x_query_contains_only_all_twenty_seven_fixed_handles(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        horizon_root = Path(config["horizon_root"])
        if str(horizon_root) not in os.sys.path:
            os.sys.path.insert(0, str(horizon_root))
        from src.models import TwitterConfig
        from src.scrapers.twitter import TwitterScraper

        users = MODULE.x_users(config)
        scraper = TwitterScraper(
            TwitterConfig(
                users=users,
                source_mode=config["sources"]["x"]["source_mode"],
            ),
            None,
        )
        payload = scraper._source_payload(users)
        self.assertEqual(payload["source_mode"], "search")
        self.assertNotIn("from_users", payload)
        self.assertEqual(payload["search_query"].count("from:"), 27)
        self.assertTrue(payload["search_query"].startswith("("))
        self.assertTrue(payload["search_query"].endswith(")"))
        for handle in users:
            self.assertIn(f"from:{handle}", payload["search_query"])

    def test_dry_run_does_not_create_or_reserve_budget_state(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        state_path = Path(config["budget_state_path"])
        before = state_path.read_bytes() if state_path.exists() else None
        result = MODULE.run(MODULE.DEFAULT_CONFIG, dry_run=True, network=False)
        self.assertEqual(result["status"], "DRY_RUN_READY")
        after = state_path.read_bytes() if state_path.exists() else None
        self.assertEqual(after, before)

    def test_budget_reservation_is_conservative_and_bounded(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            config["budget_state_path"] = str(Path(directory) / "budget.json")
            config["sources"]["x"]["users"] = ["AmericaMakes"]
            first = MODULE.reserve_x_budget(config, ["AmericaMakes"])
            second = MODULE.reserve_x_budget(config, ["AmericaMakes"])
            self.assertEqual(first["status"], "RESERVED")
            self.assertEqual(second["status"], "SKIPPED_BUDGET_DAILY")
            state = json.loads(Path(config["budget_state_path"]).read_text(encoding="utf-8"))
            self.assertEqual(state["reserved_actor_runs"], 1)
            self.assertEqual(state["reserved_items"], 410)
            self.assertEqual(state["reserved_cost_usd"], 1.236)

    def test_rejected_pre_run_reservation_is_released(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            config["budget_state_path"] = str(Path(directory) / "budget.json")
            reservation = MODULE.reserve_x_budget(config, ["AmericaMakes"])
            MODULE.release_x_start_reservation(config, reservation)
            state = json.loads(Path(config["budget_state_path"]).read_text(encoding="utf-8"))
        self.assertEqual(state["reserved_actor_runs"], 0)
        self.assertEqual(state["reserved_items"], 0)
        self.assertEqual(state["reserved_cost_usd"], 0.0)

    def test_confirmed_zero_cost_invalid_run_can_release_reservation(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            config["budget_state_path"] = str(Path(directory) / "budget.json")
            reservation = MODULE.reserve_x_budget(config, ["AmericaMakes"])
            path = Path(config["budget_state_path"])
            state = json.loads(path.read_text(encoding="utf-8"))
            state["estimated_actual_cost_usd"] = 0.006
            state["days"][next(iter(state["days"]))]["estimated_actual_cost_usd"] = 0.006
            state["last_successful_until_utc"] = "2026-08-13T16:00:00Z"
            MODULE.atomic_write(path, json.dumps(state))
            MODULE.release_zero_cost_invalid_run(
                config,
                reservation,
                "Actor rejected invalid since/until format",
                invalid_until_utc="2026-08-13T16:00:00Z",
                recorded_estimated_charge_usd=0.006,
            )
            state = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(state["reserved_actor_runs"], 0)
        self.assertEqual(state["reserved_cost_usd"], 0.0)
        self.assertEqual(state["estimated_actual_cost_usd"], 0.0)
        self.assertNotIn("last_successful_until_utc", state)
        self.assertIn("invalid since/until", state["last_released_zero_cost_invalid_run_reason"])

    def test_monthly_reservation_uses_remaining_sunday_slots_not_history(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            config["budget_state_path"] = str(Path(directory) / "budget.json")
            config["sources"]["x"]["max_actor_runs_per_day"] = 32
            config["sources"]["x"]["schedule"]["days_of_week"] = ["Sunday"]
            config["sources"]["x"]["max_items_per_month"] = 520
            now = dt.datetime(2026, 8, 17, 12, tzinfo=dt.timezone(dt.timedelta(hours=8)))
            with patch.object(MODULE, "x_budget_now", return_value=now):
                first = MODULE.reserve_x_budget(config, ["AmericaMakes"])
                second = MODULE.reserve_x_budget(config, ["AmericaMakes"])
                third = MODULE.reserve_x_budget(config, ["AmericaMakes"])
        self.assertEqual(first["status"], "RESERVED")
        self.assertEqual(first["limits"]["remaining_budget_runs"], 2)
        self.assertEqual(first["limits"]["max_items_per_run"], 410)
        self.assertEqual(second["status"], "RESERVED")
        self.assertEqual(second["limits"]["max_items_per_run"], 110)
        self.assertEqual(third["status"], "SKIPPED_BUDGET_MONTHLY_ITEMS")

    def test_time_window_uses_last_successful_utc_endpoint(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            config["sources"]["x"]["users_per_run"] = 1
            state = MODULE._x_budget_state(path, __import__("datetime").datetime(2026, 8, 13, tzinfo=__import__("datetime").timezone.utc))
            state["last_successful_until_utc"] = "2026-08-12T16:00:00Z"
            MODULE.atomic_write(path, json.dumps(state))
            window = MODULE.x_time_window(
                config,
                __import__("datetime").datetime(2026, 8, 13, 16, tzinfo=__import__("datetime").timezone.utc),
            )
        self.assertEqual(window["since"], "2026-08-12T16:00:00Z")
        self.assertEqual(window["until"], "2026-08-13T16:00:00Z")
        self.assertEqual(window["origin"], "last_successful_until_utc")

    def test_budget_calendar_uses_configured_shanghai_timezone(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        timezone = MODULE.x_budget_timezone(config)
        instant = __import__("datetime").datetime(2026, 1, 1, tzinfo=timezone)
        self.assertEqual(instant.utcoffset().total_seconds(), 8 * 3600)

    def test_seen_tweet_filter_and_cost_accounting(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
            state = MODULE._x_budget_state(path, now)
            state["seen_tweet_ids"] = ["twitter:tweet:old"]
            MODULE.atomic_write(path, json.dumps(state))
            output, duplicates = MODULE.filter_seen_x_items(
                config,
                [{"id": "twitter:tweet:old"}, {"id": "twitter:tweet:new"}],
            )
            accounting = MODULE.record_x_result(
                config,
                len(output),
                2,
                {"since": "2026-08-12T16:00:00Z", "until": "2026-08-13T16:00:00Z", "origin": "test"},
                ["twitter:tweet:new"],
                None,
            )
            updated = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(duplicates, 1)
        self.assertEqual(output, [{"id": "twitter:tweet:new"}])
        self.assertEqual(accounting["estimated_charge_usd"], 0.012)
        self.assertEqual(updated["last_successful_until_utc"], "2026-08-13T16:00:00Z")
        self.assertIn("twitter:tweet:new", updated["seen_tweet_ids"])

    def test_successful_run_settles_worst_case_cost_to_observed_dataset_count(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            reservation = MODULE.reserve_x_budget(config, ["AmericaMakes"])
            MODULE.record_x_result(
                config,
                4,
                4,
                {"since": "2026-08-12T16:00:00Z", "until": "2026-08-13T16:00:00Z", "origin": "test"},
                ["twitter:tweet:1"],
                0.0,
            )
            MODULE.settle_x_cost_reservation(config, reservation)
            state = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(state["reserved_actor_runs"], 1)
        self.assertEqual(state["reserved_cost_usd"], 0.0)
        self.assertEqual(state["estimated_actual_cost_usd"], 0.018)

    def test_monthly_cost_gate_uses_actual_cost_plus_pending_reservations(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            now = MODULE.x_budget_now(config)
            state = MODULE._x_budget_state(path, now)
            state["estimated_actual_cost_usd"] = 4.9
            MODULE.atomic_write(path, json.dumps(state))
            skipped = MODULE.reserve_x_budget(config, ["AmericaMakes"])
        self.assertEqual(skipped["status"], "SKIPPED_BUDGET_MONTHLY_COST")

    def test_pre_start_exception_releases_reservation(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            config["sources"]["x"]["users_per_run"] = 1
            horizon_root = Path(config["horizon_root"])
            if str(horizon_root) not in os.sys.path:
                os.sys.path.insert(0, str(horizon_root))
            from src.scrapers.twitter import TwitterScraper

            previous = os.environ.get("APIFY_TOKEN")
            os.environ["APIFY_TOKEN"] = "unit-test-token"
            try:
                with patch.object(
                    TwitterScraper,
                    "fetch",
                    new=AsyncMock(side_effect=RuntimeError("network client failed before Actor start")),
                ):
                    result = asyncio.run(MODULE.collect_x(config, ["AmericaMakes"]))
            finally:
                if previous is None:
                    os.environ.pop("APIFY_TOKEN", None)
                else:
                    os.environ["APIFY_TOKEN"] = previous
            state = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(result[1]["status"], "ERROR")
        self.assertTrue(result[1]["reservation_released"])
        self.assertEqual(state["reserved_actor_runs"], 0)
        self.assertEqual(state["reserved_cost_usd"], 0.0)

    def test_weekly_run_uses_all_supplied_accounts_without_rotation(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            config["budget_state_path"] = str(Path(directory) / "budget.json")
            users = ["AmericaMakes", "ORNL", "NIST", "TMSSociety"]
            first = MODULE.x_users_for_run(config, users)
            MODULE.advance_x_user_rotation(config, len(users), len(first))
            second = MODULE.x_users_for_run(config, users)
        self.assertEqual(first, users)
        self.assertEqual(second, users)

    def test_dynamic_budget_is_328_for_five_sundays_and_410_for_four(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        with tempfile.TemporaryDirectory() as directory:
            config = copy.deepcopy(config)
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            tz = MODULE.x_budget_timezone(config)
            five_sunday_now = __import__("datetime").datetime(2026, 8, 2, 12, tzinfo=tz)
            state = MODULE._x_budget_state(path, five_sunday_now)
            five = MODULE._x_dynamic_limits(config, state, five_sunday_now)
            four_sunday_now = __import__("datetime").datetime(2026, 8, 9, 12, tzinfo=tz)
            state = MODULE._x_budget_state(path, four_sunday_now)
            four = MODULE._x_dynamic_limits(config, state, four_sunday_now)
        self.assertEqual(five["max_items_per_run"], 328)
        self.assertEqual(four["max_items_per_run"], 410)

    def test_x_without_local_token_skips_without_network(self):
        config = MODULE.load_config(MODULE.DEFAULT_CONFIG)
        config = copy.deepcopy(config)
        config["sources"]["x"]["users"] = ["AmericaMakes"]
        previous = os.environ.pop("APIFY_TOKEN", None)
        try:
            _, status = asyncio.run(MODULE.collect_x(config, ["AmericaMakes"]))
        finally:
            if previous is not None:
                os.environ["APIFY_TOKEN"] = previous
        self.assertEqual(status["status"], "SKIPPED_NO_TOKEN")

    def test_empty_actor_dataset_is_an_error_and_does_not_advance_cursor(self):
        config = copy.deepcopy(MODULE.load_config(MODULE.DEFAULT_CONFIG))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            config["sources"]["x"]["users_per_run"] = 1
            horizon_root = Path(config["horizon_root"])
            if str(horizon_root) not in os.sys.path:
                os.sys.path.insert(0, str(horizon_root))
            from src.scrapers.twitter import TwitterScraper

            async def empty_fetch(self, since, until):
                self.last_run_started = True
                self.last_run_succeeded = True
                self.last_dataset_fetch_succeeded = True
                self.last_dataset_item_count = 0
                self.last_run_charge_usd = 0.0
                self.last_run_id = "empty-run"
                return []

            previous = os.environ.get("APIFY_TOKEN")
            os.environ["APIFY_TOKEN"] = "unit-test-token"
            try:
                with patch.object(TwitterScraper, "fetch", new=empty_fetch):
                    _, status = asyncio.run(MODULE.collect_x(config, ["AmericaMakes"]))
            finally:
                if previous is None:
                    os.environ.pop("APIFY_TOKEN", None)
                else:
                    os.environ["APIFY_TOKEN"] = previous
            state = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(status["status"], "ERROR_EMPTY_ACTOR_RESULT")
        self.assertEqual(status["actor_run_id"], "empty-run")
        self.assertEqual(status["accounting"]["cursor_advanced"], False)
        self.assertNotIn("last_successful_until_utc", state)
        self.assertEqual(state["reserved_actor_runs"], 1)

    def test_full_profile_dataset_without_all_requested_accounts_is_a_reportable_warning(self):
        config = copy.deepcopy(MODULE.load_config(MODULE.DEFAULT_CONFIG))
        config["sources"]["x"]["source_mode"] = "profiles"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            config["sources"]["x"]["users_per_run"] = 2
            horizon_root = Path(config["horizon_root"])
            if str(horizon_root) not in os.sys.path:
                os.sys.path.insert(0, str(horizon_root))
            from src.scrapers.twitter import TwitterScraper

            async def partial_fetch(self, since, until):
                self.last_run_started = True
                self.last_run_succeeded = True
                self.last_dataset_fetch_succeeded = True
                self.last_dataset_item_count = 410
                self.last_dataset_source_handles = {"americamakes"}
                self.last_run_charge_usd = 1.23
                self.last_run_id = "partial-run"
                class FakeTweet:
                    def model_dump(self, mode="json"):
                        return {"id": "partial-tweet", "source_type": "twitter", "title": "partial", "url": "https://x.com/AmericaMakes/status/partial-tweet"}
                return [FakeTweet()]

            previous = os.environ.get("APIFY_TOKEN")
            os.environ["APIFY_TOKEN"] = "unit-test-token"
            try:
                with patch.object(TwitterScraper, "fetch", new=partial_fetch):
                    _, status = asyncio.run(MODULE.collect_x(config, ["AmericaMakes", "ORNL"]))
            finally:
                if previous is None:
                    os.environ.pop("APIFY_TOKEN", None)
                else:
                    os.environ["APIFY_TOKEN"] = previous
            state = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(status["status"], "OK_PARTIAL_ACTOR_COVERAGE")
        self.assertEqual(status["count"], 1)
        self.assertEqual(status["actor_dataset_source_handles"], ["americamakes"])
        self.assertEqual(status["actor_missing_source_handles"], ["ornl"])
        self.assertEqual(status["accounting"]["cursor_advanced"], True)
        self.assertIn("last_successful_until_utc", state)

    def test_full_search_dataset_without_all_observed_accounts_is_a_reportable_warning(self):
        config = copy.deepcopy(MODULE.load_config(MODULE.DEFAULT_CONFIG))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "budget.json"
            config["budget_state_path"] = str(path)
            config["sources"]["x"]["users_per_run"] = 2
            horizon_root = Path(config["horizon_root"])
            if str(horizon_root) not in os.sys.path:
                os.sys.path.insert(0, str(horizon_root))
            from src.scrapers.twitter import TwitterScraper

            async def partial_search(self, since, until):
                self.last_run_started = True
                self.last_run_succeeded = True
                self.last_dataset_fetch_succeeded = True
                self.last_dataset_item_count = 410
                self.last_dataset_source_handles = {"americamakes"}
                self.last_run_charge_usd = 1.23
                self.last_run_id = "partial-search-run"
                class FakeTweet:
                    def model_dump(self, mode="json"):
                        return {"id": "partial-search-tweet", "source_type": "twitter", "title": "partial", "url": "https://x.com/AmericaMakes/status/partial-search-tweet"}
                return [FakeTweet()]

            previous = os.environ.get("APIFY_TOKEN")
            os.environ["APIFY_TOKEN"] = "unit-test-token"
            try:
                with patch.object(TwitterScraper, "fetch", new=partial_search):
                    _, status = asyncio.run(MODULE.collect_x(config, ["AmericaMakes", "ORNL"]))
            finally:
                if previous is None:
                    os.environ.pop("APIFY_TOKEN", None)
                else:
                    os.environ["APIFY_TOKEN"] = previous
            state = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(status["status"], "OK_PARTIAL_ACTOR_COVERAGE")
        self.assertEqual(status["actor_source_mode"], "fixed_users_search")
        self.assertEqual(status["actor_missing_source_handles"], ["ornl"])
        self.assertEqual(status["count"], 1)
        self.assertEqual(status["accounting"]["cursor_advanced"], True)
        self.assertIn("last_successful_until_utc", state)


if __name__ == "__main__":
    unittest.main(verbosity=2)
