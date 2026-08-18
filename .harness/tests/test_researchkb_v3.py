import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / ".harness" / "scripts" / "researchkb_v3.py"
SPEC = importlib.util.spec_from_file_location("researchkb_v3", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def source_item(**overrides):
    value = {
        "source_id": "test",
        "adapter": "test",
        "title": "Laser powder bed fusion defect mapping",
        "authors": ["Test Author"],
        "year": "2026",
        "doi": "10.1000/test-doi",
        "url": "https://doi.org/10.1000/test-doi",
        "source_path": "",
        "source_identity": "doi:10.1000/test-doi",
        "source_identity_kind": "doi",
        "source_sha256": "a" * 64,
        "excerpt": "A controlled metadata excerpt.",
        "evidence_anchor": "Test anchor",
        "evidence_kind": "metadata",
        "tags": [],
        "raw": {},
        "retrieved_at": "2026-08-12T00:00:00+08:00",
    }
    value.update(overrides)
    return value


class ResearchKBV3Tests(unittest.TestCase):
    def test_registry_separates_workspace_and_harness_roots(self):
        registry = MODULE.load_registry(MODULE.DEFAULT_CONFIG)
        self.assertEqual(Path(registry["paths"]["workspace_root"]).resolve(), MODULE.WORKSPACE_ROOT)
        self.assertEqual(Path(registry["paths"]["harness_root"]).resolve(), MODULE.HARNESS_ROOT)

    def test_dedupe_uses_doi_and_content_identity(self):
        first = source_item()
        second = source_item(title="Different title", source_identity="doi:10.1000/test-doi")
        unique, duplicates = MODULE.dedupe_items([first, second])
        self.assertEqual(len(unique), 1)
        self.assertEqual(len(duplicates), 1)

    def test_candidate_content_preserves_pending_boundary(self):
        content = MODULE.make_candidate_content(source_item(), "run-test")
        self.assertIn("review_status: \"pending\"", content)
        self.assertIn("CODEX MANAGED: V3 CANDIDATE", content)
        self.assertNotIn("knowledge_status: \"verified\"", content)

    def test_apply_only_creates_candidate_roots_and_preserves_protected_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            vault = Path(directory)
            for root in ("00-Ideas", "03-Resources", "02-Areas"):
                (vault / root).mkdir()
            (vault / "02-Areas" / "manual.md").write_text("manual judgement", encoding="utf-8")
            before = MODULE.protected_digest(vault)
            resource = vault / "03-Resources" / "v3-auto" / "source.md"
            candidate = vault / "00-Ideas" / "v3-auto" / "candidate.md"
            operations = [
                {"path": str(resource), "content": MODULE.make_resource_content(source_item(), "run-test")},
                {"path": str(candidate), "content": MODULE.make_candidate_content(source_item(), "run-test")},
            ]
            result = MODULE.apply_operations(operations, vault, before)
            self.assertEqual(result["status"], "APPLIED")
            self.assertEqual(before["sha256"], result["protected_after"]["sha256"])
            self.assertEqual((vault / "02-Areas" / "manual.md").read_text(encoding="utf-8"), "manual judgement")

    def test_lint_rejects_verified_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            vault = Path(directory)
            path = vault / "00-Ideas" / "v3-auto" / "bad.md"
            path.parent.mkdir(parents=True)
            path.write_text(
                "---\n"
                "source_id: test\n"
                "source_identity: test:1\n"
                f"source_sha256: {'b' * 64}\n"
                "evidence_anchor: anchor\n"
                "run_id: run\n"
                "review_status: pending\n"
                "knowledge_status: verified\n"
                "---\n"
                "<!-- CODEX MANAGED: V3 -->\n",
                encoding="utf-8",
            )
            result = MODULE.lint_result(vault)
            self.assertEqual(result["status"], "FAIL")
            self.assertTrue(any(error["code"] == "FORBIDDEN_AUTO_STATUS" for error in result["errors"]))

    def test_query_priority_returns_formal_and_source_results(self):
        with tempfile.TemporaryDirectory() as directory:
            vault = Path(directory)
            formal = vault / "02-Areas" / "formal.md"
            source = vault / "03-Resources" / "source.md"
            formal.parent.mkdir(parents=True)
            source.parent.mkdir(parents=True)
            formal.write_text("# Formal\nlaser powder bed fusion defect", encoding="utf-8")
            source.write_text("# Source\nlaser powder bed fusion defect", encoding="utf-8")
            results = MODULE.query_pages(vault, "laser powder bed fusion defect", 10)
            self.assertEqual(results[0]["classification"], "正式知识")

    def test_horizon_item_has_stable_identity_and_pending_boundary(self):
        item = MODULE.make_source_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="materialsproject/pymatgen released v2026.1",
            url="https://github.com/materialsproject/pymatgen/releases/tag/v2026.1",
            source_identity="horizon:github:release:12345",
            source_identity_kind="horizon-content-id",
            source_sha256="c" * 64,
            excerpt="Release notes from a public GitHub repository.",
            evidence_anchor="Horizon raw packet staging/horizon/run/raw.jsonl; line 1",
            evidence_kind="horizon-raw-signal",
        )
        self.assertIn("horizon:github:release:12345", MODULE.item_identities(item))
        content = MODULE.make_candidate_content(item, "run-test")
        self.assertIn('review_status: "pending"', content)
        self.assertIn("Horizon raw packet", content)

    def test_horizon_x_item_is_accepted_as_raw_signal(self):
        item = MODULE.make_source_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@researcher: materials signal",
            url="https://x.com/researcher/status/123",
            source_identity="horizon:twitter:tweet:123",
            source_identity_kind="horizon-content-id",
            source_sha256="d" * 64,
            excerpt="A public X post supplied as an unverified raw signal.",
            evidence_anchor="Horizon raw packet staging/horizon/run/raw.jsonl; line 1",
            evidence_kind="horizon-raw-signal",
        )
        self.assertIn("horizon:twitter:tweet:123", MODULE.item_identities(item))
        self.assertIn('review_status: "pending"', MODULE.make_candidate_content(item, "run-test"))

    def test_horizon_twitter_url_repairs_scweet_tweet_prefix(self):
        raw = {
            "source_type": "twitter",
            "title": "@ORNL: materials signal",
            "id": "twitter:tweet:123456",
            "url": "https://twitter.com/ORNL/status/tweet-123456",
            "metadata": {"tweet_id": "123456"},
        }
        self.assertEqual(
            MODULE.normalize_horizon_twitter_url(raw, raw["url"]),
            "https://x.com/ORNL/status/123456",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
