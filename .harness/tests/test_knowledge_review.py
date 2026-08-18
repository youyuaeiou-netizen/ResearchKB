import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIFECYCLE_SPEC = importlib.util.spec_from_file_location(
    "knowledge_lifecycle_for_review_tests", ROOT / "scripts" / "knowledge_lifecycle.py"
)
LIFECYCLE = importlib.util.module_from_spec(LIFECYCLE_SPEC)
assert LIFECYCLE_SPEC and LIFECYCLE_SPEC.loader
LIFECYCLE_SPEC.loader.exec_module(LIFECYCLE)

REVIEW_SPEC = importlib.util.spec_from_file_location("knowledge_review", ROOT / "scripts" / "knowledge_review.py")
REVIEW = importlib.util.module_from_spec(REVIEW_SPEC)
assert REVIEW_SPEC and REVIEW_SPEC.loader
REVIEW_SPEC.loader.exec_module(REVIEW)


def config_for(root: Path) -> dict:
    config = json.loads((ROOT / "config" / "knowledge-lifecycle.json").read_text(encoding="utf-8"))
    config["workspace_root"] = str(root)
    return config


class KnowledgeReviewTests(unittest.TestCase):
    def initialize(self, root: Path):
        config = config_for(root)
        (root / ".harness").mkdir()
        LIFECYCLE.initialize(root, config, apply=True)
        return config

    def test_prepare_empty_state_is_harness_only_and_resumable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            quarter = "2026-Q2"

            prepared = REVIEW.prepare(root, config, quarter, LIFECYCLE, write=True)
            self.assertEqual(prepared["status"], "PREPARED")
            state_path = root / ".harness" / "state" / "quarterly-review" / f"{quarter}.json"
            self.assertTrue(state_path.is_file())
            self.assertFalse(list((root / "03-Resources" / "Curated").rglob("*.md")))
            self.assertFalse(list((root / "02-Areas").rglob("*.md")))

            resumed = REVIEW.prepare(root, config, quarter, LIFECYCLE, write=True)
            self.assertEqual(resumed["status"], "EXISTING")
            started = REVIEW.start_review(root, config, quarter, LIFECYCLE, write=True)
            self.assertEqual(started["state"]["status"], "active")

            state = json.loads(state_path.read_text(encoding="utf-8"))
            answers_root = root / ".harness" / "staging" / "knowledge-lifecycle" / "quarterly-review" / quarter
            for index, batch in enumerate(state["question_batches"]):
                answers_path = answers_root / f"answers-{index}.json"
                answers_path.write_text(
                    json.dumps({
                        "batch_id": batch["batch_id"],
                        "answers": [
                            {"question_id": question["question_id"], "answer": "保持当前规则，异常继续 hold。"}
                            for question in batch["questions"]
                        ],
                    }, ensure_ascii=False),
                    encoding="utf-8",
                )
                checkpoint = REVIEW.checkpoint(
                    root, config, quarter, batch["batch_id"], answers_path, LIFECYCLE, write=True
                )
                if index == 0:
                    with self.assertRaises(REVIEW.ReviewError):
                        REVIEW.checkpoint(root, config, quarter, batch["batch_id"], answers_path, LIFECYCLE, write=True)
            self.assertEqual(checkpoint["remaining_batches"], [])

            finalized = REVIEW.finalize(root, config, quarter, LIFECYCLE, actions_file=None, write=True)
            self.assertEqual(finalized["status"], "FINALIZED")
            self.assertEqual(finalized["proposed_action_count"], 0)
            report_root = root / ".harness" / "reports" / "Quarterly-Review" / quarter
            self.assertTrue((report_root / "00-Review-Summary.md").is_file())
            formal_report_root = root / "03-Resources" / "_Reports" / "Knowledge-Iteration"
            self.assertFalse(any(formal_report_root.rglob("*.md")))

            with self.assertRaises(REVIEW.ReviewError):
                REVIEW.apply_actions(root, ROOT / "config" / "knowledge-lifecycle.json", config, quarter, LIFECYCLE, confirmation="")
            applied = REVIEW.apply_actions(
                root,
                ROOT / "config" / "knowledge-lifecycle.json",
                config,
                quarter,
                LIFECYCLE,
                confirmation=REVIEW.CONFIRM_TEXT,
            )
            self.assertEqual(applied["applied"], 0)
            self.assertEqual(applied["deletions"], 0)
            self.assertFalse(list((root / "03-Resources" / "Curated").rglob("*.md")))

    def test_finalize_rejects_unanswered_batch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            quarter = "2026-Q2"
            REVIEW.prepare(root, config, quarter, LIFECYCLE, write=True)
            REVIEW.start_review(root, config, quarter, LIFECYCLE, write=True)
            with self.assertRaises(REVIEW.ReviewError):
                REVIEW.finalize(root, config, quarter, LIFECYCLE, actions_file=None, write=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
