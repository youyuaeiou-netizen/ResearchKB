import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "knowledge_lifecycle.py"
SPEC = importlib.util.spec_from_file_location("knowledge_lifecycle", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def config_for(root: Path) -> dict:
    config = json.loads(
        (Path(__file__).resolve().parents[1] / "config" / "knowledge-lifecycle.json").read_text(
            encoding="utf-8"
        )
    )
    config["workspace_root"] = str(root)
    return config


class KnowledgeLifecycleTests(unittest.TestCase):
    def test_initialize_dry_run_does_not_create_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            result = MODULE.initialize(root, config_for(root), apply=False)

            self.assertEqual(result["status"], "DRY_RUN_READY")
            self.assertEqual(result["formal_card_writes"], 0)
            self.assertFalse((root / "03-Resources" / "RAW").exists())

    def test_initialize_apply_creates_skeleton_and_state_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            result = MODULE.initialize(root, config_for(root), apply=True)

            self.assertEqual(result["status"], "INITIALIZED")
            self.assertTrue((root / "03-Resources" / "RAW").is_dir())
            self.assertTrue((root / "03-Resources" / "Curated" / "Materials").is_dir())
            self.assertTrue((root / "03-Resources" / "_Reports" / "Knowledge-Iteration").is_dir())
            self.assertTrue((root / ".harness" / "state" / "knowledge-lifecycle-state.json").is_file())
            self.assertEqual(list((root / "03-Resources" / "Curated").rglob("*.md")), [])

    def test_weekly_scan_reports_raw_duplicates_and_curated_schema_issues(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            config = config_for(root)
            MODULE.initialize(root, config, apply=True)
            write(root / "03-Resources" / "RAW" / "a.txt", "same")
            write(root / "03-Resources" / "RAW" / "b.txt", "same")
            write(
                root / "03-Resources" / "Curated" / "Materials" / "one.md",
                "---\nid: curated-1\ntitle: One\n---\n",
            )
            write(
                root / "03-Resources" / "Curated" / "AI" / "two.md",
                "---\nid: curated-1\ntitle: Two\n---\n",
            )
            scan = MODULE.scan_workspace(root, config)

            self.assertEqual(scan["status"], "OK_WITH_WARNINGS")
            self.assertEqual(scan["raw"]["count"], 2)
            self.assertEqual(len(scan["raw"]["duplicate_hash_groups"]), 1)
            self.assertEqual(len(scan["curated"]["duplicate_id_groups"]), 1)
            self.assertEqual(len(scan["curated"]["missing_required_fields"]), 2)

    def test_weekly_no_write_does_not_update_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            config = config_for(root)
            MODULE.initialize(root, config, apply=True)
            state_path = root / ".harness" / "state" / "knowledge-lifecycle-state.json"
            before = state_path.read_text(encoding="utf-8")
            scan = MODULE.scan_workspace(root, config)
            self.assertEqual(scan["status"], "OK_EMPTY")
            self.assertEqual(state_path.read_text(encoding="utf-8"), before)

    def test_compile_stages_stable_proposal_without_formal_curated_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            config = config_for(root)
            MODULE.initialize(root, config, apply=True)
            raw_path = root / "03-Resources" / "RAW" / "laser_notes.txt"
            write(raw_path, "process, structure, property\n")

            scan = MODULE.scan_workspace(root, config)
            result = MODULE.compile_candidates(root, config, scan, use_codex=False)
            self.assertEqual(result["status"], "STAGING_HOLDS_ONLY")
            self.assertEqual(result["proposed_count"], 0)
            self.assertEqual(result["hold_count"], 1)
            proposal = result["proposals"][0]
            self.assertEqual(proposal["curated_id"], f"curated-{MODULE.sha256_file(raw_path)[:16]}")

            outputs = MODULE.write_compile_outputs(root, config, result)
            staged = Path(outputs["staging"]) / "curated" / "Others" / f"{proposal['curated_id']}.md"
            self.assertTrue(staged.is_file())
            self.assertFalse(list((root / "03-Resources" / "Curated").rglob("*.md")))
            self.assertIn("source_items", staged.read_text(encoding="utf-8"))

    def test_compile_collapses_duplicate_raw_content_and_holds_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            config = config_for(root)
            MODULE.initialize(root, config, apply=True)
            write(root / "03-Resources" / "RAW" / "a.txt", "same")
            write(root / "03-Resources" / "RAW" / "b.txt", "same")

            result = MODULE.compile_candidates(root, config, MODULE.scan_workspace(root, config))
            self.assertEqual(result["unique_source_count"], 1)
            self.assertEqual(result["hold_count"], 1)
            self.assertEqual(result["proposals"][0]["action"], "hold")
            self.assertEqual(len(result["proposals"][0]["source_items"]), 2)

    def test_compile_no_write_does_not_create_staging_or_update_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            config = config_for(root)
            MODULE.initialize(root, config, apply=True)
            write(root / "03-Resources" / "RAW" / "source.txt", "source")
            state_path = root / ".harness" / "state" / "knowledge-lifecycle-state.json"
            before = state_path.read_text(encoding="utf-8")

            result = MODULE.compile_candidates(
                root,
                config,
                MODULE.scan_workspace(root, config),
                allow_write=False,
            )
            self.assertEqual(result["status"], "STAGING_HOLDS_ONLY")
            self.assertFalse((root / ".harness" / "staging" / "knowledge-lifecycle" / "curated-proposals").exists())
            self.assertEqual(state_path.read_text(encoding="utf-8"), before)

    def test_apply_writes_only_successful_codex_proposal_and_keeps_raw(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            config = config_for(root)
            MODULE.initialize(root, config, apply=True)
            raw_path = root / "03-Resources" / "RAW" / "validated-note.txt"
            write(raw_path, "supported evidence")

            with mock.patch.object(
                MODULE,
                "run_reused_codex_summary",
                return_value=("compiled draft", {"status": "OK"}),
            ):
                result = MODULE.compile_candidates(
                    root,
                    config,
                    MODULE.scan_workspace(root, config),
                    use_codex=True,
                )
            self.assertEqual(result["proposed_count"], 1)
            MODULE.write_compile_outputs(root, config, result)
            MODULE.apply_formal_proposals(root, config, result)

            formal = root / "03-Resources" / "Curated" / "Others" / f"{result['proposals'][0]['curated_id']}.md"
            self.assertTrue(formal.is_file())
            self.assertEqual(result["formal_card_writes"], 1)
            self.assertEqual(result["proposals"][0]["action"], "applied")
            self.assertTrue(raw_path.is_file())
            self.assertIn("record_kind: \"curated\"", formal.read_text(encoding="utf-8"))

    def test_maintenance_builds_required_report_package_without_formal_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            config = config_for(root)
            MODULE.initialize(root, config, apply=True)

            result = MODULE.build_iteration_result(root, config, MODULE.scan_workspace(root, config))
            MODULE.persist_iteration_outputs(root, config, result)
            package = root / ".harness" / "reports" / "Knowledge-Iteration" / result["report_period"]
            expected = {
                "00-Run-Summary.md",
                "01-Input-Report.md",
                "02-Curated-Changes.md",
                "03-Promotion-Actions.md",
                "04-Exceptions.md",
                "run-manifest.json",
            }
            self.assertEqual({path.name for path in package.iterdir()}, expected)
            self.assertEqual(result["formal_report_writes"], 0)
            self.assertFalse((root / "03-Resources" / "_Reports" / "Knowledge-Iteration" / result["report_period"]).exists())

    def test_raw_retention_holds_expired_file_without_explicit_value_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".harness").mkdir()
            config = config_for(root)
            MODULE.initialize(root, config, apply=True)
            raw_path = root / "03-Resources" / "RAW" / "old.txt"
            write(raw_path, "old source")
            old_timestamp = raw_path.stat().st_mtime - (181 * 24 * 60 * 60)
            os.utime(raw_path, (old_timestamp, old_timestamp))

            result = MODULE.build_iteration_result(root, config, MODULE.scan_workspace(root, config))
            evaluation = result["input"]["raw_retention"]["evaluations"][0]
            self.assertEqual(evaluation["action"], "hold")
            self.assertEqual(result["input"]["raw_retention"]["archive_candidate_count"], 0)
            self.assertTrue(raw_path.is_file())


if __name__ == "__main__":
    unittest.main(verbosity=2)
