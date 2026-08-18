"""CLI entry point for testing webhook connectivity."""

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel

from .._cli import add_data_dir_arguments, add_log_level_argument
from ..logging_config import configure_logging

from ..ai.summarizer import DailySummarizer
from ..console_icons import IconStyle, get_icons
from ..models import (
    ClassificationResult,
    ContentAnalysis,
    ContentArtifact,
    ContentBlock,
    ContentItem,
    ProcessingResult,
    SourceType,
)
from ..storage.manager import ConfigError, StorageManager
from .webhook import WebhookNotifier

console = Console(stderr=True)


def _make_test_items() -> list[ContentItem]:
    """Create sample ContentItems for the test notification."""
    return [
        ContentItem(
            id="github:test:1",
            source_type=SourceType.GITHUB,
            title="GPT-5 Released with Multimodal Capabilities",
            url="https://example.com/gpt5",
            content="OpenAI announced GPT-5 with major improvements.",
            author="openai",
            published_at=datetime(2026, 4, 24, 10, 0, tzinfo=timezone.utc),
            fetched_at=datetime(2026, 4, 24, 12, 0, tzinfo=timezone.utc),
            profile="tech-news",
            processing=_sample_processing(
                score=9.0,
                summary="OpenAI released GPT-5 featuring multimodal capabilities and improved reasoning.",
                tags=["ai", "llm", "openai"],
                title_zh="GPT-5 发布：多模态能力大幅提升",
                summary_zh="OpenAI 发布了 GPT-5，具备多模态能力和更强的推理能力。",
            ),
        ),
        ContentItem(
            id="hackernews:test:2",
            source_type=SourceType.HACKERNEWS,
            title="New Linux Kernel 7.0 Released",
            url="https://example.com/linux7",
            content="Linux kernel 7.0 brings significant performance improvements.",
            author="torvalds",
            published_at=datetime(2026, 4, 24, 8, 0, tzinfo=timezone.utc),
            fetched_at=datetime(2026, 4, 24, 12, 0, tzinfo=timezone.utc),
            profile="tech-news",
            processing=_sample_processing(
                score=7.5,
                summary="Linux kernel 7.0 released with performance gains and new hardware support.",
                tags=["linux", "kernel", "performance"],
                title_zh="Linux 内核 7.0 发布",
                summary_zh="Linux 内核 7.0 发布，带来显著性能提升和新硬件支持。",
            ),
        ),
    ]


def _sample_processing(
    score: float,
    summary: str,
    tags: list[str],
    title_zh: str,
    summary_zh: str,
) -> ProcessingResult:
    return ProcessingResult(
        classification=ClassificationResult(
            profile="tech-news", method="source_override"
        ),
        analysis=ContentAnalysis(
            score=score, reason="Sample item", summary=summary, tags=tags
        ),
        artifacts={
            "zh": ContentArtifact(
                language="zh",
                title=title_zh,
                blocks=[
                    ContentBlock(
                        id="summary",
                        title="摘要",
                        content=summary_zh,
                        primary=True,
                    )
                ],
            )
        },
    )


def _preview_message(
    notifier: WebhookNotifier, title: str, body: str, variables: dict, border_style: str
) -> None:
    """Render one dry-run preview using the same logic as the real sender."""
    display_body = body if len(body) <= 3000 else body[:3000] + "\n... (truncated)"
    console.print(Panel(display_body, title=title, border_style=border_style))
    preview = notifier.build_preview(variables)
    console.print("\n[bold]── Variable Rendering Preview ──[/bold]")
    console.print(f"  [cyan]URL:[/cyan] {preview['url']}")
    if preview["body"] is not None:
        rendered_body = preview["body"]
        if len(rendered_body) > 3000:
            rendered_body = rendered_body[:3000] + "\n... (truncated)"
        panel_title = (
            "Request Body (JSON)"
            if preview["headers"]["Content-Type"] == "application/json"
            else "Request Body"
        )
        console.print(Panel(rendered_body, title=panel_title, border_style="green"))
    if preview["headers"]:
        console.print(
            f"  [cyan]Headers:[/cyan] {json.dumps(preview['headers'], ensure_ascii=False)}"
        )


async def _run_test(
    webhook_config,
    lang: str,
    dry_run: bool,
    delivery_override: str | None = None,
    icon_style: IconStyle = "emoji",
) -> None:
    """Execute the webhook test."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    items = _make_test_items()
    summarizer = DailySummarizer()
    summary = await summarizer.generate_summary(items, today, len(items), language=lang)

    effective_config = webhook_config
    if delivery_override:
        effective_config = webhook_config.model_copy(
            update={"delivery": delivery_override}
        )

    notifier = WebhookNotifier(
        effective_config,
        console=console,
        icons=get_icons(icon_style),
    )

    if dry_run:
        console.print(f"\n[bold yellow]── Dry Run (lang={lang}) ──[/bold yellow]")
        console.print(f"  [cyan]Webhook enabled:[/cyan] {effective_config.enabled}")
        console.print(f"  [cyan]URL env var:[/cyan] {effective_config.url_env}")
        console.print(f"  [cyan]Delivery mode:[/cyan] {effective_config.delivery}")
        console.print(f"  [cyan]Platform:[/cyan] {effective_config.platform}")
        console.print(f"  [cyan]Layout:[/cyan] {effective_config.layout}")

        messages = notifier.build_daily_summary_messages(
            summary=summary,
            important_items=items,
            all_items_count=len(items),
            date=today,
            lang=lang,
            summarizer=summarizer,
        )
        if not messages:
            console.print(
                f"  [yellow]Language '{lang}' is filtered out by "
                f"webhook.languages={effective_config.languages}. "
                f"Notification would be skipped.[/yellow]"
            )
            return

        for index, message in enumerate(messages, start=1):
            label = (
                "Message"
                if message["message_kind"] == "summary"
                else f"Message {index}"
            )
            console.print(f"\n[bold]── {label}: {message['message_kind']} ──[/bold]")
            _preview_message(
                notifier=notifier,
                title=message["message_title"],
                body=message["summary"],
                variables=message,
                border_style="blue" if message["message_kind"] != "item" else "green",
            )

        console.print("\n[green]Dry run complete. No notification was sent.[/green]")
        return

    console.print(f"\n[bold]── Sending Test Notification (lang={lang}) ──[/bold]")
    await notifier.send_daily_summary(
        summary=summary,
        important_items=items,
        all_items_count=len(items),
        date=today,
        lang=lang,
        summarizer=summarizer,
    )


def main() -> None:
    """CLI entry point for horizon-webhook."""
    parser = argparse.ArgumentParser(
        description="Test webhook connectivity and preview rendered content",
    )
    parser.add_argument(
        "--lang",
        default=None,
        help="Language to test (en or zh). Defaults to the first language in config.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview the rendered content without actually sending the notification.",
    )
    parser.add_argument(
        "--delivery",
        default=None,
        choices=["summary", "summary_and_items"],
        help="Override the delivery mode from config for this test.",
    )
    add_data_dir_arguments(parser)
    add_log_level_argument(parser)
    args = parser.parse_args()

    configure_logging(console, level=args.log_level)

    try:
        load_dotenv()

        storage = StorageManager(data_dir=args.data_dir, config_path=args.config)
        try:
            config = storage.load_config()
        except FileNotFoundError:
            console.print("[bold red]Configuration file not found![/bold red]")
            console.print(
                "Run [bold cyan]uv run horizon-wizard[/bold cyan] to set up your configuration."
            )
            sys.exit(1)
        except ConfigError as e:
            console.print(f"[bold red]Error loading configuration: {e}[/bold red]")
            sys.exit(1)

        if not config.webhook or not config.webhook.enabled:
            console.print("[yellow]Webhook is not enabled in config.json.[/yellow]")
            console.print(
                "Set [cyan]webhook.enabled = true[/cyan] in data/config.json to enable it."
            )
            sys.exit(1)

        lang = args.lang or (config.ai.languages[0] if config.ai.languages else "en")
        asyncio.run(
            _run_test(
                config.webhook,
                lang,
                args.dry_run,
                args.delivery,
                config.display.icon_style,
            )
        )

    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted by user[/yellow]")
        sys.exit(0)
    except Exception as e:
        console.print(f"\n[bold red]Error: {e}[/bold red]")
        console.print_exception()
        sys.exit(1)


if __name__ == "__main__":
    main()
