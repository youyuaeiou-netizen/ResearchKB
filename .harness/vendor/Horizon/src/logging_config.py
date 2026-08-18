"""Shared logging configuration for Horizon entry points."""

import logging

from rich.console import Console
from rich.logging import RichHandler


def configure_logging(console: Console, level: int | str = logging.WARNING) -> None:
    """Route application logging through the entry point's Rich console."""
    logging.basicConfig(
        level=level,
        format="%(message)s",
        handlers=[RichHandler(console=console, show_path=False)],
        force=True,
    )
