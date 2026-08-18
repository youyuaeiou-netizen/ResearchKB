import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path


LIFECYCLE_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "knowledge_lifecycle.py"
LIFECYCLE_SPEC = importlib.util.spec_from_file_location("knowledge_lifecycle_for_usage_tests", LIFECYCLE_SCRIPT)
LIFECYCLE = importlib.util.module_from_spec(LIFECYCLE_SPEC)
assert LIFECYCLE_SPEC and LIFECYCLE_SPEC.loader
LIFECYCLE_SPEC.loader.exec_module(LIFECYCLE)

USAGE_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "knowledge_usage.py"
USAGE_SPEC = importlib.util.spec_from_file_location("knowledge_usage", USAGE_SCRIPT)
MODULE = importlib.util.module_from_spec(USAGE_SPEC)
assert USAGE_SPEC and USAGE_SPEC.loader
USAGE_SPEC.loader.exec_module(MODULE)


def config_for(root: Path) -> dict:
    config = json.loads(
        (Path(__file__).resolve().parents[1] / "config" / "knowledge-lifecycle.json").read_text(
            encoding="utf-8"
        )
    )
    config["workspace_root"] = str(root)
    return config


class KnowledgeUsageTests(unittest.TestCase):
    def initialize(self, root: Path):
        config = config_for(root)
        (root / ".harness").mkdir()
        LIFECYCLE.initialize(root, config, apply=True)
        return config

    def test_record_is_real_use_only_and_task_resource_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)

            first = MODULE.record_usage(root, config, "task-1", "curated-abc", "codex")
            second = MODULE.record_usage(root, config, "task-1", "curated-abc", "project")
            paths = LIFECYCLE.lifecycle_paths(root, config)
            events = [line for line in paths["usage_events"].read_text(encoding="utf-8").splitlines() if line.strip()]

            self.assertEqual(first["status"], "RECORDED")
            self.assertEqual(second["status"], "DUPLICATE_IGNORED")
            self.assertEqual(len(events), 1)

    def test_aggregate_counts_unique_events_in_30_and_90_day_windows(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            paths = LIFECYCLE.lifecycle_paths(root, config)
            now = datetime.now().astimezone()

            def event(task: str, resource: str, age_days: int) -> dict:
                event_type = config["usage"]["event_type"]
                timestamp = (now - timedelta(days=age_days)).isoformat(timespec="seconds")
                return {
                    "schema": MODULE.USAGE_SCHEMA,
                    "event_id": MODULE.expected_event_id(task, resource, event_type),
                    "task_id": task,
                    "resource_id": resource,
                    "event": event_type,
                    "time": timestamp,
                    "context": "codex",
                    "source": "test",
                }

            values = [
                event("task-a", "curated-one", 1),
                event("task-a", "curated-one", 2),  # duplicate task/resource, ignored
                event("task-b", "curated-one", 31),
                event("task-c", "curated-two", 100),
            ]
            paths["usage_events"].write_text(
                "".join(json.dumps(value, ensure_ascii=False) + "\n" for value in values),
                encoding="utf-8",
            )

            aggregate = MODULE.aggregate_usage(root, config, write=True)
            self.assertEqual(aggregate["total_uses"], 3)
            self.assertEqual(aggregate["uses_30d"], 1)
            self.assertEqual(aggregate["uses_90d"], 2)
            self.assertEqual(aggregate["distinct_tasks"], 2)
            self.assertEqual(aggregate["resources"]["curated-one"]["distinct_tasks"], 2)
            self.assertEqual(aggregate["duplicate_events_ignored"], 1)
            self.assertTrue(paths["usage_aggregate"].is_file())

    def test_invalid_ledger_blocks_new_real_use(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            paths = LIFECYCLE.lifecycle_paths(root, config)
            paths["usage_events"].write_text("not-json\n", encoding="utf-8")

            result = MODULE.record_usage(root, config, "task-1", "curated-abc", "codex")
            self.assertEqual(result["status"], "ERROR_LEDGER_INVALID")
            self.assertEqual(paths["usage_events"].read_text(encoding="utf-8"), "not-json\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)
