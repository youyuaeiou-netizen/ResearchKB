import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


LIFECYCLE_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "knowledge_lifecycle.py"
LIFECYCLE_SPEC = importlib.util.spec_from_file_location("knowledge_lifecycle_for_upgrade_tests", LIFECYCLE_SCRIPT)
LIFECYCLE = importlib.util.module_from_spec(LIFECYCLE_SPEC)
assert LIFECYCLE_SPEC and LIFECYCLE_SPEC.loader
LIFECYCLE_SPEC.loader.exec_module(LIFECYCLE)

UPGRADE_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "knowledge_upgrade.py"
UPGRADE_SPEC = importlib.util.spec_from_file_location("knowledge_upgrade", UPGRADE_SCRIPT)
MODULE = importlib.util.module_from_spec(UPGRADE_SPEC)
assert UPGRADE_SPEC and UPGRADE_SPEC.loader
UPGRADE_SPEC.loader.exec_module(MODULE)


def config_for(root: Path) -> dict:
    config = json.loads(
        (Path(__file__).resolve().parents[1] / "config" / "knowledge-lifecycle.json").read_text(
            encoding="utf-8"
        )
    )
    config["workspace_root"] = str(root)
    return config


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class KnowledgeUpgradeTests(unittest.TestCase):
    def initialize(self, root: Path):
        config = config_for(root)
        (root / ".harness").mkdir()
        LIFECYCLE.initialize(root, config, apply=True)
        return config

    def write_aggregate(self, root: Path, config: dict, resources: dict):
        paths = LIFECYCLE.lifecycle_paths(root, config)
        aggregate = {
            "schema": "researchkb-usage-aggregate/v1",
            "generated_at": "2026-08-17T16:00:00+08:00",
            "event_type": "effective_use",
            "recent_days": 30,
            "window_days": 90,
            "status": "OK",
            "total_uses": 0,
            "uses_30d": 0,
            "uses_90d": 0,
            "distinct_tasks": 0,
            "duplicate_events_ignored": 0,
            "resources": resources,
        }
        paths["usage_aggregate"].parent.mkdir(parents=True, exist_ok=True)
        paths["usage_aggregate"].write_text(json.dumps(aggregate), encoding="utf-8")

    def test_exactly_five_distinct_tasks_is_upgrade_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            write(
                root / "03-Resources" / "Curated" / "Materials" / "one.md",
                "---\nid: curated-one\ntitle: One\nsources: [raw]\ncreated: 2026-08-17\nupdated: 2026-08-17\n---\n",
            )
            self.write_aggregate(root, config, {
                "curated-one": {
                    "total_uses": 5,
                    "uses_30d": 5,
                    "uses_90d": 5,
                    "distinct_tasks": 5,
                    "last_used": "2026-08-17T15:00:00+08:00",
                }
            })

            result = MODULE.evaluate_upgrade(root, config)
            decision = result["decisions"][0]
            self.assertEqual(result["status"], "UPGRADE_CANDIDATES_READY")
            self.assertEqual(decision["action"], "propose-area-upgrade")
            self.assertEqual(decision["derived_from"], "curated-one")
            self.assertEqual(result["areas_writes"], 0)

    def test_four_distinct_tasks_remains_hold(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            write(
                root / "03-Resources" / "Curated" / "Materials" / "one.md",
                "---\nid: curated-one\ntitle: One\nsources: [raw]\ncreated: 2026-08-17\nupdated: 2026-08-17\n---\n",
            )
            self.write_aggregate(root, config, {
                "curated-one": {
                    "total_uses": 4,
                    "uses_30d": 4,
                    "uses_90d": 4,
                    "distinct_tasks": 4,
                    "last_used": "2026-08-17T15:00:00+08:00",
                }
            })

            result = MODULE.evaluate_upgrade(root, config)
            self.assertEqual(result["status"], "NO_ELIGIBLE_RESOURCES")
            self.assertEqual(result["decisions"][0]["action"], "hold")
            self.assertFalse(result["decisions"][0]["eligible"])

    def test_usage_for_missing_curated_card_is_held(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            self.write_aggregate(root, config, {
                "curated-missing": {
                    "total_uses": 7,
                    "uses_30d": 7,
                    "uses_90d": 7,
                    "distinct_tasks": 7,
                    "last_used": "2026-08-17T15:00:00+08:00",
                }
            })

            result = MODULE.evaluate_upgrade(root, config)
            self.assertEqual(result["decisions"][0]["action"], "hold")
            self.assertIn("不存在", result["decisions"][0]["reason"])
            self.assertEqual(result["eligible_resources"], [])

    def test_ordinary_missing_fields_do_not_block_upgrade(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            write(
                root / "03-Resources" / "Curated" / "Materials" / "one.md",
                "---\nid: curated-one\nsources: [raw]\n---\n",
            )
            self.write_aggregate(root, config, {
                "curated-one": {
                    "total_uses": 5,
                    "uses_30d": 5,
                    "uses_90d": 5,
                    "distinct_tasks": 5,
                    "last_used": "2026-08-17T15:00:00+08:00",
                }
            })

            result = MODULE.evaluate_upgrade(root, config)
            self.assertEqual(result["decisions"][0]["action"], "propose-area-upgrade")

    def test_duplicate_id_and_missing_source_are_hard_holds(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            write(root / "03-Resources" / "Curated" / "Materials" / "one.md", "---\nid: curated-one\nsources: [raw]\n---\n")
            write(root / "03-Resources" / "Curated" / "AI" / "two.md", "---\nid: curated-one\nsources: [raw-2]\n---\n")
            write(root / "03-Resources" / "Curated" / "Tools" / "three.md", "---\nid: curated-two\nsources: []\n---\n")
            self.write_aggregate(root, config, {
                "curated-one": {"distinct_tasks": 5, "uses_90d": 5},
                "curated-two": {"distinct_tasks": 5, "uses_90d": 5},
            })

            result = MODULE.evaluate_upgrade(root, config)
            decisions = {item["resource_id"]: item for item in result["decisions"]}
            self.assertEqual(decisions["curated-one"]["action"], "hold")
            self.assertIn("重复", decisions["curated-one"]["reason"])
            self.assertEqual(decisions["curated-two"]["action"], "hold")
            self.assertIn("来源", decisions["curated-two"]["reason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
