"""Base extractor interface."""

from abc import ABC, abstractmethod
from typing import Optional

import httpx


class BaseExtractor(ABC):
    @abstractmethod
    async def extract(self, url: str, client: httpx.AsyncClient) -> Optional[str]:
        """Fetch and extract article text from url. Returns None on failure."""
