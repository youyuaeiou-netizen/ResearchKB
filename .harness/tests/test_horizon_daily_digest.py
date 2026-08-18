import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / ".harness" / "scripts" / "horizon_daily_digest.py"
SPEC = importlib.util.spec_from_file_location("horizon_daily_digest", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def sample_item(**overrides):
    item = {
        "source_id": "openalex",
        "adapter": "openalex_metadata",
        "title": "Laser powder bed fusion defect monitoring with machine learning",
        "authors": ["Test Author"],
        "year": "2026",
        "doi": "10.1000/lpbf-test",
        "url": "https://doi.org/10.1000/lpbf-test",
        "source_path": "",
        "source_identity": "doi:10.1000/lpbf-test",
        "source_identity_kind": "doi",
        "source_sha256": "a" * 64,
        "excerpt": "LPBF melt pool monitoring and defect detection.",
        "evidence_anchor": "OpenAlex test record",
        "evidence_kind": "public-metadata",
        "tags": [],
        "raw": {},
        "retrieved_at": "2026-08-13T00:00:00+08:00",
    }
    item.update(overrides)
    return item


class HorizonDailyDigestTests(unittest.TestCase):
    def setUp(self):
        self.config = MODULE.load_config(MODULE.DEFAULT_CONFIG)

    def test_config_locks_the_requested_output_directory(self):
        expected = (MODULE.WORKSPACE_ROOT / "03-Resources" / "RAW" / "horizon" / "Weekly").resolve()
        self.assertEqual(Path(self.config["output_dir"]).resolve(), expected)
        self.assertEqual(MODULE.EXPECTED_OUTPUT_DIR, expected)
        self.assertFalse(self.config["output_policy"]["allow_overwrite"])
        self.assertFalse(self.config["output_policy"]["formal_knowledge_promotion"])

    def test_weekly_config_declares_canonical_entrypoint_and_legacy_alias(self):
        self.assertEqual(self.config["config_id"], "horizon-weekly-digest")
        self.assertEqual(self.config["schedule_owner"], "horizon_weekly_digest")
        self.assertTrue(self.config["canonical_task"].endswith("run-horizon-weekly-digest.ps1"))
        self.assertEqual(len(self.config["legacy_task_aliases"]), 1)
        self.assertTrue(self.config["legacy_task_aliases"][0].endswith("run-horizon-daily-digest.ps1"))

    def test_openalex_and_crossref_are_not_active_registry_sources(self):
        registry = MODULE.v3.load_registry(MODULE.HARNESS_ROOT / "config" / "source-registry.yaml")
        active_ids = {
            str(source.get("source_id"))
            for source in registry.get("sources", [])
            if source.get("enabled")
        }
        self.assertNotIn("openalex", active_ids)
        self.assertNotIn("crossref", active_ids)

    def test_weekly_source_scope_excludes_zotero(self):
        registry = MODULE.v3.load_registry(MODULE.HARNESS_ROOT / "config" / "source-registry.yaml")
        scoped = MODULE.scoped_weekly_registry(registry, self.config)
        source_ids = [str(source["source_id"]) for source in scoped["sources"]]
        self.assertEqual(source_ids, ["local-inbox", "horizon-signal-staging"])
        self.assertNotIn("zotero-local", source_ids)

    def test_partial_x_coverage_is_reportable_but_systemic_x_failure_is_blocking(self):
        self.assertFalse(
            MODULE.is_systemic_x_failure(
                {"status": "OK_PARTIAL_ACTOR_COVERAGE"},
                {"status": "OK_WITH_WARNINGS"},
            )
        )
        self.assertTrue(
            MODULE.is_systemic_x_failure(
                {"status": "ERROR_EMPTY_ACTOR_RESULT"},
                {"status": "OK_WITH_ERRORS"},
            )
        )

    def test_digest_renders_partial_x_coverage_as_a_warning(self):
        report = {
            "run_id": "partial-coverage",
            "date": "2026-08-23",
            "finished_at": "2026-08-23T12:30:00+08:00",
            "selection_sha256": "test",
            "status": "OK_WITH_WARNINGS",
            "horizon_status": "OK_PARTIAL_ACTOR_COVERAGE",
            "collected": 1,
            "unique": 1,
            "screened": 1,
            "excluded": 0,
            "priority": [],
            "supporting": [],
            "x_entries": [],
            "source_status": [{"source_id": "horizon-x", "status": "OK_PARTIAL_ACTOR_COVERAGE", "count": 1, "reason": "缺失 @ornl"}],
            "x_coverage": {
                "actor_requested_source_handles": ["americamakes", "ornl"],
                "actor_dataset_source_handles": ["americamakes"],
                "actor_missing_source_handles": ["ornl"],
            },
            "x_budget": {},
            "selection_path": "selection.json",
            "horizon_raw_packet": "raw.jsonl",
        }
        content = MODULE.render_digest(report)
        self.assertIn("运行状态：OK_WITH_WARNINGS", content)
        self.assertIn("X 覆盖核验：请求 2 个；数据集观察到 1 个；缺失：@ornl", content)

    def test_lpbf_item_is_ranked_as_materials_candidate(self):
        score, terms = MODULE.relevance_score(sample_item())
        self.assertGreaterEqual(score, 20)
        self.assertIn("laser powder bed fusion", terms)

    def test_generic_x_signal_is_excluded_but_materials_x_signal_is_kept(self):
        generic = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="General AI model announcement",
            excerpt="A product update.",
            source_identity="horizon:twitter:generic",
        )
        materials = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            source_identity="horizon:twitter:lpbf",
        )
        kept, excluded = MODULE.screen_items([generic, materials], set(), self.config)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["item"]["source_identity"], "horizon:twitter:lpbf")
        self.assertEqual(len(excluded), 1)

    def test_x_signal_threshold_is_seven_out_of_ten(self):
        below = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ORNL: melt pool",
            excerpt="",
            tags=[],
            raw={"content": ""},
            source_identity="horizon:twitter:score-6",
        )
        at_threshold = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ORNL: additive manufacturing",
            excerpt="",
            tags=[],
            raw={"content": ""},
            source_identity="horizon:twitter:score-7",
        )
        kept, excluded = MODULE.screen_items([below, at_threshold], set(), self.config)
        self.assertEqual([entry["item"]["source_identity"] for entry in kept], ["horizon:twitter:score-7"])
        self.assertEqual(excluded[0]["score"], 6)

    def test_ai_accounts_keep_technical_or_science_related_content(self):
        generic = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@PyTorch: New general model release",
            excerpt="A general AI framework update.",
            source_identity="horizon:twitter:pytorch-generic",
        )
        relevant = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@PyTorch: machine learning for materials research",
            excerpt="Machine learning supports materials research and scientific computing.",
            source_identity="horizon:twitter:pytorch-materials",
        )
        kept, excluded = MODULE.screen_items([generic, relevant], set(), self.config)
        self.assertEqual([entry["item"]["source_identity"] for entry in kept], ["horizon:twitter:pytorch-materials"])
        self.assertEqual(excluded[0]["reason"], "AI 工程内容缺少技术细节或触发广告、融资、招聘、币圈等排除规则")

    def test_ai_engineering_product_update_is_kept_but_promotion_is_excluded(self):
        technical = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ChatGPTapp: New developer feature for building web apps",
            excerpt="The API and documentation explain how developers can build and deploy web apps.",
            source_identity="horizon:twitter:chatgpt-technical",
            raw={"content": "The API and documentation explain how developers can build and deploy web apps."},
        )
        promotion = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ChatGPTapp: Join our giveaway",
            excerpt="Use this referral code to get a discount.",
            source_identity="horizon:twitter:chatgpt-promotion",
            raw={"content": "Use this referral code to get a discount."},
        )
        kept, excluded = MODULE.screen_items([technical, promotion], set(), self.config)
        self.assertEqual([entry["item"]["source_identity"] for entry in kept], ["horizon:twitter:chatgpt-technical"])
        self.assertEqual(excluded[0]["reason"], "AI 工程内容缺少技术细节或触发广告、融资、招聘、币圈等排除规则")

    def test_explicit_pure_retweet_is_excluded(self):
        item = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ChatGPTapp: API documentation update",
            excerpt="The API documentation explains a new developer feature.",
            source_identity="horizon:twitter:retweet",
            raw={
                "content": "The API documentation explains a new developer feature.",
                "metadata": {"is_retweet": True},
            },
        )
        kept, excluded = MODULE.screen_items([item], set(), self.config)
        self.assertEqual(kept, [])
        self.assertEqual(excluded[0]["reason"], "X 内容为纯转发，周报不重复推荐")

    def test_scientific_ai_generic_content_is_excluded(self):
        generic = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@SciML_Org: Community update",
            excerpt="Join the community and follow our latest news.",
            source_identity="horizon:twitter:sciml-generic",
        )
        kept, excluded = MODULE.screen_items([generic], set(), self.config)
        self.assertEqual(kept, [])
        self.assertEqual(excluded[0]["reason"], "科研 AI 内容未涉及材料、物理/化学、科学计算、模拟或自动化实验")

    def test_autonomous_materials_research_x_signal_is_kept(self):
        item = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ORNL: AI guided materials research",
            excerpt="Researchers used AI for autonomous science and improving materials research.",
            source_identity="horizon:twitter:autonomous-materials",
        )
        kept, excluded = MODULE.screen_items([item], set(), self.config)
        self.assertEqual(len(kept), 1)
        self.assertEqual(excluded, [])
        self.assertTrue(MODULE.is_x_signal(item))

    def test_non_twitter_horizon_item_is_not_an_x_signal(self):
        item = sample_item(source_identity="horizon:github:release:1")
        self.assertFalse(MODULE.is_x_signal(item))

    def test_render_item_repairs_legacy_x_url(self):
        item = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ORNL: materials signal",
            url="https://twitter.com/ORNL/status/tweet-123456",
            source_identity="horizon:twitter:tweet:123456",
            raw={
                "source_type": "twitter",
                "title": "@ORNL: materials signal",
                "id": "twitter:tweet:123456",
                "url": "https://twitter.com/ORNL/status/tweet-123456",
                "metadata": {"tweet_id": "123456"},
            },
        )
        entry = {"item": item, "score": 10, "matched_terms": ["materials research"], "kind": "热点线索", "source_label": "X"}
        self.assertIn("https://x.com/ORNL/status/123456", "\n".join(MODULE.render_item(entry, 1)))
        self.assertNotIn("status/tweet-", "\n".join(MODULE.render_item(entry, 1)))

    def test_existing_identity_is_not_recommended_again(self):
        item = sample_item()
        kept, excluded = MODULE.screen_items([item], {"doi:10.1000/lpbf-test"}, self.config)
        self.assertEqual(kept, [])
        self.assertEqual(excluded[0]["reason"], "已存在相同来源身份，周报不重复推荐")

    def test_same_day_state_does_not_skip_when_saved_output_is_legacy_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "Weekly" / "2026-08-14-Horizon-材料科研周报.md"
            legacy = root / "horizon" / "2026-08-14-Horizon-材料科研周报.md"
            state = {
                "last_attempt_date": "2026-08-14",
                "last_completed_date": "2026-08-14",
                "last_output_path": str(legacy),
            }
            self.assertFalse(MODULE.has_reported_week(state, "2026-08-10/2026-08-16", target))

    def test_digest_explicitly_preserves_review_boundary(self):
        entry = {"item": sample_item(), "score": 30, "matched_terms": ["lpbf"], "kind": "学术记录候选", "source_label": "OpenAlex 公开学术元数据"}
        report = {
            "run_id": "test-run",
            "date": "2026-08-13",
            "finished_at": "2026-08-13T00:00:00+08:00",
            "selection_sha256": "test",
            "status": "OK",
            "horizon_status": "OK",
            "collected": 1,
            "unique": 1,
            "screened": 1,
            "excluded": 0,
            "priority": [entry],
            "supporting": [],
            "source_status": [],
            "x_budget": {},
            "selection_path": "selection.json",
            "horizon_raw_packet": "raw.jsonl",
        }
        content = MODULE.render_digest(report)
        self.assertIn("不是已验证科学结论", content)
        self.assertIn("requires_human_review: true", content)
        self.assertIn("不得自动", content)
        self.assertNotIn("Zotero", content)

    def test_digest_keeps_x_inside_the_single_weekly_file(self):
        academic = {"item": sample_item(), "score": 30, "matched_terms": ["lpbf"], "kind": "学术记录候选", "source_label": "OpenAlex 公开学术元数据"}
        x_item = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ORNL: AI guided materials research",
            excerpt="AI for autonomous science and materials research.",
            url="https://x.com/ORNL/status/123456",
            source_identity="horizon:twitter:123456",
            raw={"source_type": "twitter", "id": "twitter:123456", "url": "https://x.com/ORNL/status/123456", "metadata": {"tweet_id": "123456"}},
        )
        x_entry = {"item": x_item, "score": 10, "matched_terms": ["materials research"], "kind": "热点线索", "source_label": "Horizon 原始信号（X/GitHub，仅作线索）"}
        report = {
            "run_id": "test-single-daily",
            "date": "2026-08-13",
            "finished_at": "2026-08-13T00:00:00+08:00",
            "selection_sha256": "test",
            "status": "OK",
            "horizon_status": "OK",
            "collected": 2,
            "unique": 2,
            "screened": 2,
            "excluded": 0,
            "priority": [academic],
            "supporting": [],
            "x_entries": [x_entry],
            "source_status": [],
            "x_budget": {},
            "selection_path": "selection.json",
            "horizon_raw_packet": "raw.jsonl",
        }
        content = MODULE.render_digest(report)
        self.assertEqual(content.count("## X/社交平台热点线索（本周）"), 1)
        self.assertIn("https://x.com/ORNL/status/123456", content)
        self.assertNotIn("X补充.md", content)

    def test_x_localized_output_has_score_author_separate_title_and_hash(self):
        x_item = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ORNL: AI guided materials research",
            excerpt="Researchers used AI for autonomous science and improving materials research.",
            url="https://x.com/ORNL/status/123456",
            source_identity="horizon:twitter:123456",
            raw={
                "source_type": "twitter",
                "id": "twitter:123456",
                "url": "https://x.com/ORNL/status/123456",
                "author": "ORNL",
                "content": "Researchers used AI for autonomous science and improving materials research.",
                "metadata": {"tweet_id": "123456"},
            },
        )
        entry = {
            "item": x_item,
            "score": 8,
            "score_10": 8,
            "matched_terms": ["materials research"],
            "kind": "热点线索",
            "source_label": "X",
            "domain": "additive_manufacturing_and_manufacturing_engineering",
        }
        title_zh = "AI 驱动的材料自主科研"
        body_zh = "研究人员利用人工智能推进自主科学，并改善材料研究流程。"
        localization = {
            "source_identity": x_item["source_identity"],
            "source_sha256": x_item["source_sha256"],
            "source_text_sha256": MODULE.sha256_text(MODULE.x_raw_content(x_item)),
            "title_zh": title_zh,
            "body_zh": body_zh,
            "translation_sha256": MODULE.x_translation_sha256(x_item["source_identity"], x_item["source_sha256"], title_zh, body_zh),
        }
        entry["x_localization"] = MODULE.validate_x_localization(entry, localization)
        content = "\n".join(MODULE.render_item(entry, 1))
        self.assertIn("### 1. AI 驱动的材料自主科研", content)
        self.assertIn("- 评分：8/10", content)
        self.assertIn("- 作者：ORNL", content)
        self.assertIn("#### 正文（简体中文）", content)
        self.assertIn("翻译校验：OK", content)
        self.assertNotIn("### 1. @ORNL:", content)

    def test_x_section_renders_all_four_domains_without_a_count_cap(self):
        entries = []
        domains = [
            "additive_manufacturing_and_manufacturing_engineering",
            "materials_metallurgy",
            "materials_informatics_science_ai",
            "ai_engineering_and_practical_workflows",
        ]
        for index, domain in enumerate(domains, 1):
            item = sample_item(
                source_id="horizon-signal-staging",
                adapter="horizon_staging",
                title=f"Signal {index}",
                source_identity=f"horizon:twitter:domain-{index}",
                raw={"author": f"account-{index}", "content": f"Technical signal {index}"},
            )
            entries.append(
                {
                    "item": item,
                    "score": 7 + index,
                    "score_10": 7 + index,
                    "matched_terms": ["technical"],
                    "kind": "热点线索",
                    "source_label": "X",
                    "domain": domain,
                }
            )
        content = "\n".join(MODULE.render_x_section(entries))
        self.assertEqual(content.count("Technical signal"), 4)
        self.assertIn("### 增材制造与制造工程", content)
        self.assertIn("### 材料冶金", content)
        self.assertIn("### 材料信息学/科学 AI", content)
        self.assertIn("### AI 工程与实用工作流", content)
        self.assertIn("#### 1. Signal", content)
        self.assertIn("评分：8/10", content)

    def test_late_x_merge_replaces_the_same_section(self):
        original = """# 日报\n\n## X/社交平台热点线索\n\n- 旧内容\n\n## 来源运行状态\n\n- horizon-signal-staging：SKIPPED（0）\n"""
        x_item = sample_item(
            source_id="horizon-signal-staging",
            adapter="horizon_staging",
            title="@ORNL: autonomous materials research",
            excerpt="AI for autonomous science and materials research.",
            url="https://x.com/ORNL/status/123456",
            source_identity="horizon:twitter:123456",
            raw={"source_type": "twitter", "id": "twitter:123456", "url": "https://x.com/ORNL/status/123456", "metadata": {"tweet_id": "123456"}},
        )
        entry = {"item": x_item, "score": 10, "matched_terms": ["materials research"], "kind": "热点线索", "source_label": "X"}
        content = MODULE.merge_x_section_into_digest(original, [entry])
        self.assertEqual(content.count("## X/社交平台热点线索（本周）"), 1)
        self.assertIn("https://x.com/ORNL/status/123456", content)
        self.assertNotIn("旧内容", content)
        self.assertNotIn("X补充.md", content)


if __name__ == "__main__":
    unittest.main(verbosity=2)
