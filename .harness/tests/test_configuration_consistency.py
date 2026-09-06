import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ConfigurationConsistencyTests(unittest.TestCase):
    def test_research_profile_delegates_live_horizon_limits_to_canonical_config(self):
        profile = (ROOT / "config" / "research-profile.md").read_text(encoding="utf-8")
        self.assertIn("horizon-fetch-only.json", profile)
        self.assertNotIn("$4.50", profile)
        self.assertNotIn("每日最多一次", profile)
        self.assertNotIn("profile 时间线", profile)

    def test_foundation_track_has_three_requested_topics_and_safe_root(self):
        config = json.loads((ROOT / "config" / "knowledge-lifecycle.json").read_text(encoding="utf-8"))
        track = config["foundation_learning"]
        self.assertTrue(track["enabled"])
        self.assertTrue(track["auto_apply"])
        self.assertTrue(track["auto_root"].startswith("02-Areas/_Codex-Auto/"))
        self.assertEqual(
            [topic["id"] for topic in track["topics"]],
            ["phase-diagrams", "solidification", "phase-transformations"],
        )
        self.assertTrue(config["policy"]["usage_recording_enabled"])
        self.assertTrue(config["policy"]["auto_curated_promotion"])

    def test_weekly_orchestrator_includes_foundation_stage_without_creating_a_new_schedule(self):
        task = (ROOT / "tasks" / "run-researchkb-weekly.ps1").read_text(encoding="utf-8")
        self.assertIn("run-knowledge-foundation-weekly.ps1", task)
        self.assertIn("foundation learning (apply)", task)
        self.assertNotIn("Register-ScheduledTask", task)
        self.assertNotIn("New-ScheduledTask", task)


if __name__ == "__main__":
    unittest.main(verbosity=2)
