"""Offline HTTP contract tests for the Horizon Apify/Scweet X adapter."""

import asyncio
import json
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

import httpx


HORIZON_ROOT = Path(__file__).resolve().parents[2] / ".harness" / "vendor" / "Horizon"
if str(HORIZON_ROOT) not in sys.path:
    sys.path.insert(0, str(HORIZON_ROOT))

from src.models import TwitterConfig
from src.scrapers.twitter import TwitterScraper


class HorizonTwitterContractTests(unittest.TestCase):
    def test_parser_preserves_retweet_marker_for_downstream_screening(self):
        async def parse():
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200))) as client:
                scraper = TwitterScraper(TwitterConfig(users=["ORNL"]), client)
                return scraper._parse_item(
                    {
                        "id": "123456789",
                        "created_at": "Thu Aug 13 00:00:00 +0000 2026",
                        "full_text": "retweeted technical update",
                        "is_retweet": True,
                        "url": "https://x.com/ORNL/status/123456789",
                        "user": {"screen_name": "ORNL"},
                    },
                    datetime(2026, 8, 12, tzinfo=timezone.utc),
                    datetime(2026, 8, 14, tzinfo=timezone.utc),
                )

        item = asyncio.run(parse())
        self.assertIsNotNone(item)
        self.assertTrue(item.metadata["is_retweet"])

    def test_profile_request_has_server_window_cost_cap_and_no_replies(self):
        previous = os.environ.get("APIFY_TOKEN")
        os.environ["APIFY_TOKEN"] = "unit-test-token"
        since = datetime(2026, 8, 12, 16, 0, tzinfo=timezone.utc)
        until = datetime(2026, 8, 13, 16, 0, tzinfo=timezone.utc)
        captured: dict[str, object] = {"post_count": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/runs" in request.url.path:
                captured["post_count"] = int(captured["post_count"]) + 1
                captured["url"] = str(request.url)
                captured["headers"] = dict(request.headers)
                captured["payload"] = json.loads(request.content)
                return httpx.Response(
                    200,
                    json={"data": {"id": "run1", "defaultDatasetId": "dataset1"}},
                )
            if request.url.path.endswith("/log"):
                return httpx.Response(200, text="Actor completed without input validation errors")
            if "/actor-runs/" in request.url.path:
                return httpx.Response(
                    200,
                    json={"data": {"status": "SUCCEEDED", "usageTotalUsd": 0.009}},
                )
            if "/datasets/" in request.url.path:
                return httpx.Response(
                    200,
                    json=[
                        {
                            "id": "tweet-1",
                            "created_at": "Thu Aug 13 00:00:00 +0000 2026",
                            "full_text": "original",
                            "user": {"screen_name": "ORNL"},
                        },
                        {
                            "id": "tweet-2",
                            "created_at": "Thu Aug 13 01:00:00 +0000 2026",
                            "full_text": "reply",
                            "is_reply": True,
                            "user": {"screen_name": "ORNL"},
                        },
                        {
                            "id": "tweet-3",
                            "created_at": "Fri Aug 14 00:00:00 +0000 2026",
                            "full_text": "future",
                            "user": {"screen_name": "ORNL"},
                        },
                    ],
                )
            raise AssertionError(f"Unexpected request: {request.url}")

        async def fetch() -> tuple[list, TwitterScraper]:
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                scraper = TwitterScraper(
                    TwitterConfig(
                        users=["ORNL"],
                        fetch_limit=410,
                        max_total_charge_usd=1.236,
                        restart_on_error=False,
                    ),
                    client,
                )
                return await scraper.fetch(since, until), scraper

        try:
            items, scraper = asyncio.run(fetch())
        finally:
            if previous is None:
                os.environ.pop("APIFY_TOKEN", None)
            else:
                os.environ["APIFY_TOKEN"] = previous

        self.assertEqual([item.id for item in items], ["twitter:tweet:1"])
        self.assertEqual(captured["post_count"], 1)
        self.assertNotIn("token=", str(captured["url"]))
        self.assertEqual(captured["headers"]["authorization"], "Bearer unit-test-token")
        self.assertIn("maxItems=410", str(captured["url"]))
        self.assertIn("maxTotalChargeUsd=1.236", str(captured["url"]))
        self.assertIn("restartOnError=false", str(captured["url"]))
        self.assertEqual(
            captured["payload"],
            {
                "source_mode": "profiles",
                "profile_urls": ["ORNL"],
                "search_sort": "Latest",
                "max_items": 410,
                "since": "2026-08-12_16:00:00_UTC",
                "until": "2026-08-13_16:00:00_UTC",
                "tweet_type": "exclude_replies",
            },
        )
        self.assertEqual(scraper.last_dataset_item_count, 3)
        self.assertEqual(scraper.last_run_charge_usd, 0.009)

    def test_actor_input_validation_error_is_detected_even_when_run_succeeds(self):
        previous = os.environ.get("APIFY_TOKEN")
        os.environ["APIFY_TOKEN"] = "unit-test-token"

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/runs" in request.url.path:
                return httpx.Response(200, json={"data": {"id": "run1", "defaultDatasetId": "dataset1"}})
            if request.url.path.endswith("/log"):
                return httpx.Response(200, text="Input validation error: Invalid 'since' format")
            if "/actor-runs/" in request.url.path:
                return httpx.Response(200, json={"data": {"status": "SUCCEEDED", "usageTotalUsd": 0.0}})
            raise AssertionError(f"Dataset fetch must not occur after validation error: {request.url}")

        async def fetch() -> TwitterScraper:
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                scraper = TwitterScraper(TwitterConfig(users=["ORNL"]), client)
                items = await scraper.fetch(datetime(2026, 8, 13, tzinfo=timezone.utc))
                self.assertEqual(items, [])
                return scraper

        try:
            scraper = asyncio.run(fetch())
        finally:
            if previous is None:
                os.environ.pop("APIFY_TOKEN", None)
            else:
                os.environ["APIFY_TOKEN"] = previous

        self.assertTrue(scraper.last_run_succeeded)
        self.assertEqual(scraper.last_run_charge_usd, 0.0)
        self.assertEqual(scraper.last_run_validation_error, "Scweet Actor reported an input validation error")

    def test_fixed_user_search_uses_only_explicit_from_clauses_and_preserves_server_window(self):
        previous = os.environ.get("APIFY_TOKEN")
        os.environ["APIFY_TOKEN"] = "unit-test-token"
        captured: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and "/runs" in request.url.path:
                captured["payload"] = json.loads(request.content)
                return httpx.Response(200, json={"data": {"id": "run1", "defaultDatasetId": "dataset1"}})
            if request.url.path.endswith("/log"):
                return httpx.Response(200, text="Actor completed normally")
            if "/actor-runs/" in request.url.path:
                return httpx.Response(200, json={"data": {"status": "SUCCEEDED", "usageTotalUsd": 0.0}})
            if "/datasets/" in request.url.path:
                return httpx.Response(200, json=[])
            raise AssertionError(f"Unexpected request: {request.url}")

        async def fetch() -> None:
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                scraper = TwitterScraper(TwitterConfig(users=["ORNL", "NIST"], source_mode="fixed_users_search"), client)
                await scraper.fetch(datetime(2026, 8, 12, 16, tzinfo=timezone.utc), datetime(2026, 8, 13, 16, tzinfo=timezone.utc))

        try:
            asyncio.run(fetch())
        finally:
            if previous is None:
                os.environ.pop("APIFY_TOKEN", None)
            else:
                os.environ["APIFY_TOKEN"] = previous

        self.assertEqual(captured["payload"]["source_mode"], "search")
        self.assertEqual(captured["payload"]["search_query"], "(from:ORNL OR from:NIST)")
        self.assertNotIn("from_users", captured["payload"])
        self.assertNotIn("profile_urls", captured["payload"])
        self.assertEqual(captured["payload"]["tweet_type"], "exclude_replies")

    def test_rejected_start_retains_no_run_state_and_keeps_safe_error(self):
        previous = os.environ.get("APIFY_TOKEN")
        os.environ["APIFY_TOKEN"] = "unit-test-token"

        async def fetch() -> TwitterScraper:
            async with httpx.AsyncClient(
                transport=httpx.MockTransport(lambda request: httpx.Response(403, json={"error": {"message": "approval required"}}))
            ) as client:
                scraper = TwitterScraper(TwitterConfig(users=["ORNL"]), client)
                items = await scraper.fetch(datetime.now(timezone.utc))
                self.assertEqual(items, [])
                return scraper

        try:
            scraper = asyncio.run(fetch())
        finally:
            if previous is None:
                os.environ.pop("APIFY_TOKEN", None)
            else:
                os.environ["APIFY_TOKEN"] = previous

        self.assertFalse(scraper.last_run_started)
        self.assertEqual(scraper.last_start_error, "Apify HTTP 403: approval required")


if __name__ == "__main__":
    unittest.main(verbosity=2)
