"""Twitter scraper using Apify altimis/scweet actor."""

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from html import unescape
from typing import List, Optional

from dateutil.parser import isoparse
import httpx

from .base import BaseScraper
from ..models import ContentItem, SourceType, TwitterConfig

logger = logging.getLogger(__name__)

_APIFY_BASE = "https://api.apify.com/v2"
_POLL_INTERVAL = 3.0
_MAX_WAIT = 180


def _scweet_utc_timestamp(value: datetime) -> str:
    """Format timestamps exactly as the Scweet Actor input schema requires."""
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d_%H:%M:%S_UTC")


def _normalize_tweet_id(value: object) -> str:
    """Return the numeric tweet id when Scweet prefixes it with ``tweet-``."""
    text = str(value or "").strip()
    return text[6:] if text.lower().startswith("tweet-") else text


def _canonical_tweet_url(url: object, screen_name: str, tweet_id: str) -> str:
    """Build a clickable X permalink and repair Scweet's ``tweet-`` URL form."""
    candidate = str(url or "").strip()
    handle = str(screen_name or "").strip().lstrip("@")
    direct_match = re.search(
        r"https?://(?:www\.)?(?:twitter\.com|x\.com)/([^/?#]+)/status/(?:tweet-)?(\d+)",
        candidate,
        flags=re.IGNORECASE,
    )
    if direct_match:
        handle = direct_match.group(1)
        tweet_id = direct_match.group(2)
    if tweet_id and tweet_id.isdigit():
        if handle and handle.lower() != "unknown":
            return f"https://x.com/{handle}/status/{tweet_id}"
        return f"https://x.com/i/status/{tweet_id}"
    if candidate:
        return re.sub(r"(/status/)tweet-(\d+)(?=$|[/?#])", r"\1\2", candidate, flags=re.IGNORECASE)
    return candidate


class TwitterScraper(BaseScraper):
    """Fetch tweets via the Apify altimis/scweet actor."""

    def __init__(self, config: TwitterConfig, http_client: httpx.AsyncClient):
        super().__init__(config, http_client)
        self.config = config
        self.last_dataset_item_count = 0
        self.last_dataset_fetch_succeeded = False
        self.last_run_charge_usd: Optional[float] = None
        self.last_run_succeeded = False
        self.last_run_started = False
        self.last_start_error: Optional[str] = None
        self.last_run_id: Optional[str] = None
        self.last_run_validation_error: Optional[str] = None
        self.last_dataset_source_handles: set[str] = set()

    @staticmethod
    def _auth_headers(token: str) -> dict[str, str]:
        """Keep the Apify token out of URLs, which may be logged by clients."""
        return {"Authorization": f"Bearer {token}"}

    def _source_payload(self, users: List[str]) -> dict:
        """Build the reviewed profile or fixed-user search source request."""
        if self.config.source_mode == "fixed_users_search":
            clauses = [f"from:{handle}" for handle in users]
            return {
                "source_mode": "search",
                "search_query": f"({' OR '.join(clauses)})",
            }
        if self.config.source_mode == "profiles":
            return {
                "source_mode": "profiles",
                "profile_urls": users,
            }
        raise ValueError(f"Unsupported Twitter source mode: {self.config.source_mode}")

    async def fetch(
        self, since: datetime, until: Optional[datetime] = None
    ) -> List[ContentItem]:
        self.last_dataset_item_count = 0
        self.last_dataset_fetch_succeeded = False
        self.last_run_charge_usd = None
        self.last_run_succeeded = False
        self.last_run_started = False
        self.last_start_error = None
        self.last_run_id = None
        self.last_run_validation_error = None
        self.last_dataset_source_handles = set()
        if not self.config.enabled:
            return []

        users = [u.strip().lstrip("@") for u in self.config.users if u.strip()]
        if not users:
            logger.debug("No Twitter users configured, skipping.")
            return []

        token = os.environ.get(self.config.apify_token_env)
        if not token:
            logger.warning(
                f"Apify token not found in env var '{self.config.apify_token_env}'. Skipping Twitter."
            )
            return []

        logger.info(f"Fetching Twitter (Apify) for users: {users}")

        until_utc = (until or datetime.now(timezone.utc)).astimezone(timezone.utc)
        run_id, dataset_id = await self._start_run(token, users, since, until_utc)
        if not run_id:
            return []

        succeeded = await self._wait_for_run(token, run_id)
        if not succeeded:
            return []
        self.last_run_succeeded = True

        validation_error = await self._completed_run_input_validation_error(token, run_id)
        if validation_error:
            self.last_run_validation_error = validation_error
            logger.error("Apify run %s rejected its input: %s", run_id, validation_error)
            return []

        raw_items = await self._fetch_dataset(token, dataset_id)
        self.last_dataset_source_handles = {
            handle
            for handle in (self._dataset_source_handle(raw) for raw in raw_items)
            if handle
        }
        items = []
        for raw in raw_items:
            if isinstance(raw, dict) and raw.get("noResults"):
                continue
            parsed = self._parse_item(raw, since, until_utc)
            if parsed:
                items.append(parsed)

        logger.info(f"Fetched {len(items)} tweets via Apify.")
        return items

    @staticmethod
    def _dataset_source_handle(item: object) -> str:
        """Return a normalized handle from one raw Scweet dataset row."""
        if not isinstance(item, dict):
            return ""
        user = item.get("user") if isinstance(item.get("user"), dict) else {}
        value = (
            user.get("screen_name")
            or user.get("username")
            or user.get("handle")
            or item.get("handle")
            or item.get("username")
            or ""
        )
        return str(value).strip().lstrip("@").lower()

    async def _start_run(
        self, token: str, users: List[str], since: datetime, until: datetime
    ) -> tuple[Optional[str], Optional[str]]:
        payload = {
            **self._source_payload(users),
            "search_sort": "Latest",
            "max_items": max(100, self.config.fetch_limit),
            "since": _scweet_utc_timestamp(since),
            "until": _scweet_utc_timestamp(until),
            "tweet_type": "exclude_replies",
        }
        params = {
            "maxItems": max(100, self.config.fetch_limit),
            "restartOnError": str(bool(self.config.restart_on_error)).lower(),
        }
        if self.config.max_total_charge_usd is not None:
            params["maxTotalChargeUsd"] = self.config.max_total_charge_usd
        url = f"{_APIFY_BASE}/acts/{self.config.actor_id}/runs"
        try:
            resp = await self.client.post(
                url,
                params=params,
                json=payload,
                headers=self._auth_headers(token),
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            run_id = data["id"]
            dataset_id = data["defaultDatasetId"]
            self.last_run_started = True
            self.last_run_id = run_id
            logger.debug(f"Started Apify run {run_id}, dataset {dataset_id}")
            return run_id, dataset_id
        except Exception as exc:
            if isinstance(exc, httpx.HTTPStatusError):
                detail = None
                try:
                    error = exc.response.json().get("error") or {}
                    detail = error.get("message") or error.get("type")
                except (ValueError, AttributeError):
                    pass
                self.last_start_error = f"Apify HTTP {exc.response.status_code}" + (
                    f": {detail}" if detail else ""
                )
            else:
                self.last_start_error = f"Apify start error: {exc.__class__.__name__}"
            logger.error(f"Failed to start Apify run: {self.last_start_error}")
            return None, None

    async def _wait_for_run(self, token: str, run_id: str) -> bool:
        url = f"{_APIFY_BASE}/actor-runs/{run_id}"
        elapsed = 0.0
        while elapsed < _MAX_WAIT:
            try:
                resp = await self.client.get(url, headers=self._auth_headers(token), timeout=10.0)
                resp.raise_for_status()
                data = resp.json()["data"]
                status = data["status"]
                if status == "SUCCEEDED":
                    charge = data.get("usageTotalUsd")
                    if isinstance(charge, (int, float)):
                        self.last_run_charge_usd = float(charge)
                    return True
                if status in ("FAILED", "ABORTED", "TIMED-OUT"):
                    logger.error(f"Apify run {run_id} ended with status: {status}")
                    return False
            except Exception as exc:
                logger.warning(f"Error polling Apify run {run_id}: {exc}")
            await asyncio.sleep(_POLL_INTERVAL)
            elapsed += _POLL_INTERVAL
        logger.warning(f"Apify run {run_id} timed out after {_MAX_WAIT}s.")
        return False

    async def _completed_run_input_validation_error(
        self, token: str, run_id: str
    ) -> Optional[str]:
        """Detect Actor input rejection masked as a successful zero-item run."""
        url = f"{_APIFY_BASE}/actor-runs/{run_id}/log"
        try:
            resp = await self.client.get(url, headers=self._auth_headers(token), timeout=15.0)
            resp.raise_for_status()
        except Exception as exc:
            logger.warning("Unable to inspect Apify run %s log: %s", run_id, exc)
            return None
        if re.search(r"\binput validation error\s*:", resp.text, flags=re.IGNORECASE):
            return "Scweet Actor reported an input validation error"
        return None

    async def _fetch_dataset(self, token: str, dataset_id: str) -> list:
        url = f"{_APIFY_BASE}/datasets/{dataset_id}/items"
        try:
            resp = await self.client.get(url, headers=self._auth_headers(token), timeout=30.0)
            resp.raise_for_status()
            rows = resp.json()
            self.last_dataset_fetch_succeeded = isinstance(rows, list)
            if not self.last_dataset_fetch_succeeded:
                logger.error(f"Apify dataset {dataset_id} did not return a JSON list.")
                return []
            self.last_dataset_item_count = sum(
                1 for row in rows if isinstance(row, dict) and not row.get("noResults")
            )
            return rows
        except Exception as exc:
            logger.error(f"Failed to fetch Apify dataset {dataset_id}: {exc}")
            return []

    async def fetch_replies_for_item(self, item: ContentItem) -> List[str]:
        """Fetch reply texts for one tweet using scweet search mode."""
        if not self.config.fetch_reply_text:
            return []

        token = os.environ.get(self.config.apify_token_env)
        if not token:
            return []

        conversation_id = str(item.metadata.get("conversation_id") or "")
        if not conversation_id:
            return []

        max_replies = max(self.config.max_replies_per_tweet, 0)
        if max_replies == 0:
            return []

        max_items = max(100, max_replies * 5)
        payload = {
            "source_mode": "search",
            "search_query": f"conversation_id:{conversation_id}",
            "search_sort": "Latest",
            "max_items": max_items,
        }

        url = f"{_APIFY_BASE}/acts/{self.config.actor_id}/runs"
        try:
            resp = await self.client.post(
                url,
                json=payload,
                headers=self._auth_headers(token),
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            run_id = data["id"]
            dataset_id = data["defaultDatasetId"]
        except Exception as exc:
            logger.warning(f"Failed to start replies run for {item.id}: {exc}")
            return []

        if not await self._wait_for_run(token, run_id):
            return []

        rows = await self._fetch_dataset(token, dataset_id)
        return self._extract_reply_lines(item, rows, max_replies)

    def _extract_reply_lines(self, item: ContentItem, rows: list, max_replies: int) -> List[str]:
        """Convert scweet rows into compact reply lines."""
        min_likes = max(self.config.reply_min_likes, 0)
        tweet_id = str(item.metadata.get("tweet_id") or "")
        own_author = (item.author or "").lstrip("@")
        candidates = []

        for row in rows:
            if not isinstance(row, dict) or row.get("noResults"):
                continue

            row_id = str(row.get("id") or "")
            if row_id.startswith("tweet-"):
                row_id = row_id[6:]
            if tweet_id and row_id == tweet_id:
                continue

            user = row.get("user") or {}
            handle = (
                user.get("handle")
                or row.get("handle")
                or user.get("username")
                or "unknown"
            )
            if handle and own_author and handle.lower() == own_author.lower():
                continue

            text = unescape((row.get("text") or "").strip())
            if not text:
                continue

            likes = int(row.get("favorite_count") or 0)
            replies = int(row.get("reply_count") or 0)
            if likes < min_likes:
                continue

            score = likes * 2 + replies
            line = f"[@{handle} | ❤️ {likes} | 💬 {replies}] {text[:280]}"
            candidates.append((score, line))

        candidates.sort(key=lambda x: x[0], reverse=True)
        return [line for _, line in candidates[:max_replies]]

    @staticmethod
    def append_discussion_content(item: ContentItem, reply_lines: List[str]) -> bool:
        """Append reply lines under Top Comments marker."""
        if not reply_lines:
            return False

        existing = item.content or ""
        marker = "--- Top Comments ---"
        block = "\n".join(reply_lines)

        if marker in existing:
            if block in existing:
                return False
            item.content = existing + "\n" + block
            return True

        if existing:
            item.content = existing + f"\n\n{marker}\n" + block
        else:
            item.content = f"{marker}\n" + block
        return True

    def _parse_item(
        self, item: dict, since: datetime, until: Optional[datetime] = None
    ) -> Optional[ContentItem]:
        try:
            if (
                item.get("is_reply")
                or item.get("in_reply_to_status_id")
                or item.get("in_reply_to_screen_name")
                or item.get("in_reply_to_user_id")
            ):
                return None
            created_at_str = item.get("created_at")
            if not created_at_str:
                return None

            try:
                published_at = datetime.strptime(
                    created_at_str, "%a %b %d %H:%M:%S %z %Y"
                )
            except ValueError:
                published_at = isoparse(created_at_str)

            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)

            lower_bound = since.astimezone(timezone.utc)
            upper_bound = until.astimezone(timezone.utc) if until else None
            if published_at < lower_bound or (upper_bound and published_at > upper_bound):
                return None

            tweet_id = _normalize_tweet_id(item.get("id_str") or item.get("id") or "")
            if not tweet_id:
                return None

            # Normalize tweet_id: scweet prefixes with "tweet-"
            numeric_id = _normalize_tweet_id(item.get("id") or tweet_id)
            conversation_id = str(
                item.get("conversation_id")
                or item.get("tweet", {}).get("conversation_id")
                or numeric_id
            )

            user = item.get("user") or {}
            screen_name = (
                user.get("screen_name")
                or user.get("username")
                or user.get("handle")
                or item.get("handle")
                or item.get("username")
                or "unknown"
            )
            author = user.get("name") or screen_name

            text = item.get("full_text") or item.get("text") or ""
            if not text:
                return None
            text = unescape(text)

            url = item.get("url")
            if not url:
                permalink = item.get("permalink")
                if permalink and screen_name != "unknown":
                    url = f"https://x.com/{screen_name}{permalink}"
            url = _canonical_tweet_url(url, screen_name, numeric_id)

            title_body = text[:50].replace("\n", " ").strip()
            if len(text) > 50:
                title_body += "..."

            return ContentItem(
                id=self._generate_id(SourceType.TWITTER.value, "tweet", numeric_id),
                source_type=SourceType.TWITTER,
                title=f"@{screen_name}: {title_body}",
                url=url,
                content=text,
                author=author,
                published_at=published_at,
                profile=self.config.profile,
                metadata={
                    "tweet_id": numeric_id,
                    "conversation_id": conversation_id,
                    "favorite_count": item.get("favorite_count", 0),
                    "retweet_count": item.get("retweet_count", 0),
                    "reply_count": item.get("reply_count", 0),
                    "view_count": item.get("view_count"),
                    "is_retweet": bool(
                        item.get("is_retweet")
                        or item.get("retweeted_status")
                        or item.get("retweeted_status_id_str")
                        or item.get("retweeted_status_result")
                    ),
                    "is_reply": item.get("is_reply", False),
                    "in_reply_to_status_id": item.get("in_reply_to_status_id"),
                    "in_reply_to_screen_name": item.get("in_reply_to_screen_name"),
                    "category": self.config.category,
                },
            )
        except Exception as exc:
            logger.debug(f"Failed to parse tweet: {exc}")
            return None
