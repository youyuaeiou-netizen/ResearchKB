import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "researchkb_maintenance_audit.py"
SPEC = importlib.util.spec_from_file_location("researchkb_maintenance_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def policy_for(root: Path) -> dict:
    policy = json.loads(
        (Path(__file__).resolve().parents[1] / "config" / "maintenance-policy.json").read_text(
            encoding="utf-8"
        )
    )
    policy["workspace_root"] = str(root)
    return policy


class ResearchKBMaintenanceAuditTests(unittest.TestCase):
    def test_scope_excludes_protected_directories_and_scans_declared_roots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "ok.json", "{}")
            write(root / "03-Resources" / "source.md", "# source")
            write(root / "_system" / "state.json", "{}")
            write(root / ".obsidian" / "workspace.json", "{}")
            policy = policy_for(root)

            paths = MODULE.iter_files(root, policy)
            relative = {MODULE.relative_path(path, root) for path in paths}

            self.assertIn(".harness/config/ok.json", relative)
            self.assertIn("03-Resources/source.md", relative)
            self.assertNotIn("_system/state.json", relative)
            self.assertNotIn(".obsidian/workspace.json", relative)

    def test_legacy_candidate_is_held_and_gets_archive_proposal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "placeholder.json", "{}")
            write(
                root / "03-Resources" / "literatures" / "legacy.md",
                "---\n"
                "candidate_id: candidate-1\n"
                "candidate_origin: zotero\n"
                "review_status: pending\n"
                "---\n"
                "# Legacy candidate\n",
            )
            policy = policy_for(root)
            audit = MODULE.audit_workspace(root, policy)
            record = next(item for item in audit["records"] if item["path"].endswith("legacy.md"))

            self.assertEqual(record["classification"], "legacy-candidate")
            self.assertEqual(record["action"], "hold")
            self.assertEqual(record["recommended_action"], "archive-after-source-and-link-review")
            self.assertEqual(record["archive_path"], "04-Archive/legacy/03-Resources/literatures/legacy.md")

    def test_explicitly_superseded_document_can_be_archived_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "placeholder.json", "{}")
            write(
                root / "00-Ideas" / "方案v2.md",
                "---\n"
                "superseded_by: 00-Ideas/方案v3.md\n"
                "---\n"
                "# v2\n",
            )
            policy = policy_for(root)
            audit = MODULE.audit_workspace(root, policy)
            record = next(item for item in audit["records"] if item["path"] == "00-Ideas/方案v2.md")

            self.assertEqual(record["classification"], "superseded-history")
            self.assertEqual(record["action"], "archive")
            self.assertFalse(policy["disposal"]["allow_permanent_delete"])

    def test_formal_project_with_historical_candidate_id_is_protected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "placeholder.json", "{}")
            write(
                root / "01-Projects" / "project.md",
                "---\n"
                "candidate_id: historical-project-candidate\n"
                "candidate_origin: codex-project\n"
                "review_status: approved\n"
                "---\n"
                "# Formal project\n",
            )
            policy = policy_for(root)
            audit = MODULE.audit_workspace(root, policy)
            record = next(item for item in audit["records"] if item["path"] == "01-Projects/project.md")

            self.assertEqual(record["classification"], "keep")
            self.assertEqual(record["action"], "keep")

    def test_unknown_and_active_raw_objects_are_conservative(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "placeholder.json", "{}")
            write(root / ".harness" / "staging" / "horizon" / "raw.jsonl", '{"id": 1}\n')
            write(root / "03-Resources" / "ordinary.md", "# Ordinary")
            policy = policy_for(root)
            audit = MODULE.audit_workspace(root, policy)
            raw = next(item for item in audit["records"] if item["path"].endswith("raw.jsonl"))
            ordinary = next(item for item in audit["records"] if item["path"] == "03-Resources/ordinary.md")

            self.assertEqual(raw["action"], "hold")
            self.assertEqual(ordinary["action"], "keep")

    def test_stale_state_and_duplicate_wrappers_are_reported_without_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "placeholder.json", "{}")
            write(
                root / ".harness" / "state" / "horizon-daily-digest-state.json",
                json.dumps({"last_output_path": str(root / "03-Resources" / "horizon" / "Daily" / "missing.md")}),
            )
            wrapper = "$script = 'horizon_daily_digest.py'\n"
            write(root / ".harness" / "tasks" / "run-horizon-daily-digest.ps1", wrapper)
            write(root / ".harness" / "tasks" / "run-horizon-weekly-digest.ps1", wrapper)
            write(
                root / ".harness" / "config" / "source-registry.yaml",
                json.dumps({"schedules": {"weekly_review": "Sunday 20:00"}}),
            )
            write(
                root / ".harness" / "config" / "horizon-daily-digest.json",
                json.dumps({"schedule": {"days_of_week": ["Sunday"], "local_time": "12:00"}}),
            )
            policy = policy_for(root)
            audit = MODULE.audit_workspace(root, policy)
            kinds = {finding["kind"] for finding in audit["findings"]}

            self.assertIn("stale-state-output", kinds)
            self.assertIn("duplicate-horizon-wrapper", kinds)
            self.assertIn("schedule-drift", kinds)
            self.assertFalse((root / "03-Resources" / "horizon" / "Daily").exists())

    def test_explicit_schedule_ownership_and_alias_remove_false_conflicts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "placeholder.json", "{}")
            write(
                root / ".harness" / "tasks" / "run-horizon-daily-digest.ps1",
                "& (Join-Path $PSScriptRoot 'run-horizon-weekly-digest.ps1')\n",
            )
            write(
                root / ".harness" / "tasks" / "run-horizon-weekly-digest.ps1",
                "$script = 'horizon_daily_digest.py'\n",
            )
            write(
                root / ".harness" / "config" / "source-registry.yaml",
                json.dumps(
                    {
                        "schedules": {
                            "weekly_review": "Sunday 20:00",
                            "v3_weekly_review": "Sunday 20:00",
                            "horizon_weekly_digest": "Sunday 12:00",
                        }
                    }
                ),
            )
            write(
                root / ".harness" / "config" / "horizon-daily-digest.json",
                json.dumps({"schedule": {"days_of_week": ["Sunday"], "local_time": "12:00"}}),
            )
            policy = policy_for(root)
            audit = MODULE.audit_workspace(root, policy)
            kinds = {finding["kind"] for finding in audit["findings"]}

            self.assertNotIn("duplicate-horizon-wrapper", kinds)
            self.assertNotIn("schedule-drift", kinds)

    def test_references_force_archive_candidate_to_hold(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "placeholder.json", "{}")
            target = root / "00-Ideas" / "old.md"
            write(
                target,
                "---\nsuperseded_by: 00-Ideas/new.md\n---\n# Old\n",
            )
            write(root / "01-Projects" / "index.md", "See [old](../00-Ideas/old.md).\n")
            policy = policy_for(root)
            audit = MODULE.audit_workspace(root, policy)
            record = next(item for item in audit["records"] if item["path"] == "00-Ideas/old.md")

            self.assertEqual(record["action"], "hold")
            self.assertIn("01-Projects/index.md", record["references"])
            self.assertIn("archive-after-reference-rewrite", record["recommended_action"])

    def test_report_output_stays_under_harness_reports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write(root / ".harness" / "config" / "placeholder.json", "{}")
            policy = policy_for(root)
            audit = MODULE.audit_workspace(root, policy)
            json_path, markdown_path = MODULE.write_outputs(audit, root / ".harness" / "reports")

            self.assertTrue(json_path.is_file())
            self.assertTrue(markdown_path.is_file())
            self.assertTrue(MODULE.path_is_within(json_path, root / ".harness"))
            self.assertEqual(json.loads(json_path.read_text(encoding="utf-8"))["schema"], "researchkb-maintenance-audit/v1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
