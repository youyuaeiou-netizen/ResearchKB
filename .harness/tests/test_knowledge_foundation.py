import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIFECYCLE_SPEC = importlib.util.spec_from_file_location("knowledge_lifecycle_for_foundation_tests", ROOT / "scripts" / "knowledge_lifecycle.py")
LIFECYCLE = importlib.util.module_from_spec(LIFECYCLE_SPEC)
assert LIFECYCLE_SPEC and LIFECYCLE_SPEC.loader
LIFECYCLE_SPEC.loader.exec_module(LIFECYCLE)
FOUNDATION_SPEC = importlib.util.spec_from_file_location("knowledge_foundation", ROOT / "scripts" / "knowledge_foundation.py")
MODULE = importlib.util.module_from_spec(FOUNDATION_SPEC)
assert FOUNDATION_SPEC and FOUNDATION_SPEC.loader
FOUNDATION_SPEC.loader.exec_module(MODULE)


def config_for(root: Path) -> dict:
    config = json.loads((ROOT / "config" / "knowledge-lifecycle.json").read_text(encoding="utf-8"))
    config["workspace_root"] = str(root)
    return config


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def curated_card(root: Path, name: str, resource_id: str, body: str, sources: str = "[03-Resources/RAW/source.md]") -> None:
    write(
        root / "03-Resources" / "Curated" / "Materials" / name,
        "---\n"
        f"id: {resource_id}\n"
        f"title: {name.removesuffix('.md')}\n"
        f"sources: {sources}\n"
        "source_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
        "created: 2026-08-19\n"
        "updated: 2026-08-19\n"
        "---\n\n"
        "## Codex 编译草稿\n\n"
        f"{body}\n\n"
        "## 人工审阅\n",
    )


class KnowledgeFoundationTests(unittest.TestCase):
    def initialize(self, root: Path) -> dict:
        config = config_for(root)
        (root / ".harness").mkdir()
        LIFECYCLE.initialize(root, config, apply=True)
        return config

    def test_apply_maps_topic_and_keeps_unmapped_card_as_exploration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            manual = root / "02-Areas" / "Manual.md"
            write(manual, "# 人工内容\n")
            curated_card(root, "phase.md", "curated-phase", "二元相图与相平衡决定凝固路径。")
            curated_card(root, "tool.md", "curated-tool", "一个通用 AI 工具更新。")

            result = MODULE.evaluate(root, config)
            self.assertEqual(result["candidate_count"], 2)
            MODULE.write_outputs(root, config, result, apply=True)

            phase = root / "02-Areas" / "_Codex-Auto" / "基础学习" / "phase-diagrams" / "curated-phase.md"
            exploration = root / "02-Areas" / "_Codex-Auto" / "基础学习" / "exploration" / "curated-tool.md"
            self.assertTrue(phase.is_file())
            self.assertTrue(exploration.is_file())
            content = phase.read_text(encoding="utf-8")
            self.assertIn('knowledge_status: "auto-reusable"', content)
            self.assertIn('review_status: "pending"', content)
            self.assertIn(MODULE.MARKER_START, content)
            self.assertEqual(manual.read_text(encoding="utf-8"), "# 人工内容\n")
            self.assertTrue((root / "02-Areas" / "_Codex-Auto" / "基础学习" / "关系图.md").is_file())

    def test_update_preserves_content_outside_managed_block(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            curated_card(root, "solidification.md", "curated-solid", "凝固中的形核和枝晶生长。")
            first = MODULE.evaluate(root, config)
            MODULE.write_outputs(root, config, first, apply=True)
            target = root / "02-Areas" / "_Codex-Auto" / "基础学习" / "solidification" / "curated-solid.md"
            target.write_text(target.read_text(encoding="utf-8") + "\n人工补充不得被覆盖。\n", encoding="utf-8")

            second = MODULE.evaluate(root, config)
            MODULE.write_outputs(root, config, second, apply=True)
            self.assertIn("人工补充不得被覆盖。", target.read_text(encoding="utf-8"))

    def test_missing_source_is_held(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.initialize(root)
            curated_card(root, "missing.md", "curated-missing", "相图", sources="[]")

            result = MODULE.evaluate(root, config)
            self.assertEqual(result["hold_count"], 1)
            self.assertEqual(result["decisions"][0]["action"], "hold")
            self.assertIn("来源", result["decisions"][0]["reason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
