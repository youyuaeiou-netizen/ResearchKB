import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIFECYCLE_SPEC = importlib.util.spec_from_file_location(
    "knowledge_lifecycle_for_areas_tests", ROOT / "scripts" / "knowledge_lifecycle.py"
)
LIFECYCLE = importlib.util.module_from_spec(LIFECYCLE_SPEC)
assert LIFECYCLE_SPEC and LIFECYCLE_SPEC.loader
LIFECYCLE_SPEC.loader.exec_module(LIFECYCLE)

AREAS_SPEC = importlib.util.spec_from_file_location("knowledge_areas", ROOT / "scripts" / "knowledge_areas.py")
MODULE = importlib.util.module_from_spec(AREAS_SPEC)
assert AREAS_SPEC and AREAS_SPEC.loader
AREAS_SPEC.loader.exec_module(MODULE)


def config_for(root: Path) -> dict:
    config = json.loads((ROOT / "config" / "knowledge-lifecycle.json").read_text(encoding="utf-8"))
    config["workspace_root"] = str(root)
    return config


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def curated_card(root: Path) -> None:
    write(
        root / "03-Resources" / "Curated" / "Materials" / "one.md",
        "---\n"
        "id: curated-one\n"
        "title: One\n"
        "sources: [03-Resources/RAW/one.md]\n"
        "source_items: [one.md]\n"
        "created: 2026-08-17\n"
        "updated: 2026-08-17\n"
        "---\n\nA reviewed Curated candidate.\n",
    )


def upgrade_state(root: Path, config: dict, *, derived_from: str = "curated-one") -> None:
    paths = LIFECYCLE.lifecycle_paths(root, config)
    state = {
        "schema": "researchkb-upgrade-decision/v1",
        "generated_at": "2026-08-17T16:00:00+08:00",
        "status": "UPGRADE_CANDIDATES_READY",
        "source_aggregate_generated_at": "2026-08-17T15:00:00+08:00",
        "window_days": 90,
        "distinct_tasks_threshold": 5,
        "eligible_resources": ["curated-one"],
        "decisions": [
            {
                "resource_id": "curated-one",
                "derived_from": derived_from,
                "window_days": 90,
                "distinct_tasks": 5,
                "threshold": 5,
                "uses_90d": 5,
                "last_used": "2026-08-17T15:00:00+08:00",
                "eligible": True,
                "action": "propose-area-upgrade",
                "reason": "满足阈值",
            }
        ],
        "auto_areas_apply": False,
        "areas_writes": 0,
        "curated_writes": 0,
        "deletions": 0,
    }
    write(paths["upgrade_state"], json.dumps(state, ensure_ascii=False))


class KnowledgeAreasTests(unittest.TestCase):
    def initialize(self, root: Path):
        config = config_for(root)
        (root / ".harness").mkdir()
        LIFECYCLE.initialize(root, config, apply=True)
        return config

    def test_candidate_is_staged_without_formal_area_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            curated_card(root)
            upgrade_state(root, config)

            result = MODULE.run_sync(root, config)

            self.assertEqual(result["status"], "AREA_CANDIDATES_READY")
            self.assertEqual(result["areas_writes"], 0)
            self.assertFalse((root / "02-Areas" / "_Codex-Auto").exists())
            proposal_files = list((root / ".harness" / "staging" / "knowledge-lifecycle" / "areas-proposals").rglob("curated-one.md"))
            self.assertEqual(len(proposal_files), 1)
            self.assertIn("derived_from", proposal_files[0].read_text(encoding="utf-8"))

    def test_explicit_apply_isolated_and_preserves_manual_area(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            manual = root / "02-Areas" / "Manual.md"
            write(manual, "# 人工 Area\n\n人工内容不得被自动阶段覆盖。\n")
            before = manual.read_text(encoding="utf-8")
            curated_card(root)
            upgrade_state(root, config)

            result = MODULE.run_sync(root, config, apply=True)

            target = root / "02-Areas" / "_Codex-Auto" / "Materials" / "curated-one.md"
            self.assertEqual(result["status"], "AREAS_APPLIED")
            self.assertEqual(result["areas_writes"], 1)
            self.assertTrue(target.is_file())
            text = target.read_text(encoding="utf-8")
            self.assertIn("derived_from: \"curated-one\"", text)
            self.assertIn(MODULE.AREA_START, text)
            self.assertEqual(manual.read_text(encoding="utf-8"), before)

    def test_mismatched_derived_from_is_held(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            curated_card(root)
            upgrade_state(root, config, derived_from="curated-other")

            result = MODULE.run_sync(root, config, write=False)

            self.assertEqual(result["status"], "NO_ELIGIBLE_RESOURCES")
            self.assertEqual(result["decisions"][0]["action"], "hold")
            self.assertIn("不一致", result["decisions"][0]["reason"])
            self.assertFalse((root / "02-Areas" / "_Codex-Auto").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
