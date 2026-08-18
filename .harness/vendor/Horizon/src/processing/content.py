"""Select bounded source content for profile-driven AI stages."""

from dataclasses import dataclass
from typing import Literal


COMMENTS_MARKER = "--- Top Comments ---"


@dataclass(frozen=True)
class ContentParts:
    main: str
    comments: str


def split_content(content: str | None) -> ContentParts:
    """Separate source content from appended community comments."""
    if not content:
        return ContentParts(main="", comments="")
    if COMMENTS_MARKER not in content:
        return ContentParts(main=content.strip(), comments="")
    main, comments = content.split(COMMENTS_MARKER, 1)
    return ContentParts(main=main.strip(), comments=comments.strip())


def select_content(
    content: str,
    max_chars: int,
    sampling: Literal["prefix", "head-middle-tail"],
) -> str:
    """Return a bounded excerpt while preserving a long article's conclusion."""
    text = content.strip()
    if len(text) <= max_chars:
        return text
    if sampling == "prefix":
        return text[:max_chars].rstrip()

    markers = (
        "[Opening excerpt]\n",
        "\n\n[Middle excerpt]\n",
        "\n\n[Closing excerpt]\n",
    )
    available = max_chars - sum(len(marker) for marker in markers)
    opening_size = int(available * 0.4)
    middle_size = int(available * 0.3)
    closing_size = available - opening_size - middle_size
    midpoint = len(text) // 2
    middle_start = max(0, midpoint - middle_size // 2)

    opening = text[:opening_size].rstrip()
    middle = text[middle_start : middle_start + middle_size].strip()
    closing = text[-closing_size:].lstrip()
    return (
        markers[0]
        + opening
        + markers[1]
        + middle
        + markers[2]
        + closing
    )
