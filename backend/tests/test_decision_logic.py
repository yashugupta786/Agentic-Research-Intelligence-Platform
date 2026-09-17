"""Offline regression checks. No provider calls or changes to the demo database."""
import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from app.services import coverage, rag, topics
from app.services.external_signals import Article
from app.services.vectorstore import Hit
from app.agents.nodes import computed_recommendations, synthesizer_node, librarian_coverage_node, normalise_market_area, planner_node, scout_node
from app.agents.graph import route_after_planner
from app.agents.graph import run_agent
from contextlib import ExitStack


def hit(doc_id="RN-1", score=0.9, age=30, area="Healthcare", chunk=0):
    return Hit(doc_id, chunk, score, "Evidence about clinical AI governance", "Governance",
               area, "Research Note", (date.today() - timedelta(days=age)).isoformat())


class DecisionLogicTests(unittest.TestCase):
    def assess(self, hits, verdicts=None, **kwargs):
        index = MagicMock(ready=True)
        index.search.return_value = hits
        with patch.object(coverage, "get_index", return_value=index), \
             patch.object(coverage, "judge_candidates", return_value=verdicts or {}), \
             patch.object(coverage.db, "query", return_value=[]):
            return coverage.assess_coverage("clinical-ai", "Clinical AI", **kwargs)

    def test_sources_are_domains_not_urls(self):
        topic = topics.TopicCandidate("AI", "ai", article_urls=[
            "https://www.example.org/a", "https://example.org/b", "https://news.org/c"])
        self.assertEqual(topic.source_count, 2)

    def test_merged_aliases_count_one_article(self):
        articles = [Article(title="News", url="https://example.org/a", domain="example.org", snippet="AI",
                            published_date=None, relevance=1.0, source="test")]
        extraction = topics.ArticleExtraction(index=0, topics=["clinical AI", "healthcare AI"], entities=[], driver="test")
        naming = topics.CanonicalTopic(label="Clinical AI", category="Health", description="AI", member_groups=[0])
        with patch.object(topics, "embed_texts", return_value=[[1, 0], [1, 0]]), \
             patch.object(topics, "_canonicalise_with_llm", return_value=[naming]):
            result = topics.normalise_topics(iter([extraction]), articles)
        self.assertEqual(result[0].mention_count, 1)
        self.assertEqual(len(result[0].aliases), 2)

    def test_missing_series_has_no_growth_claim(self):
        score = topics.compute_momentum([], mention_count=3, source_count=2, last_seen=date.today().isoformat())
        self.assertIsNone(score.to_dict()["growth_pct"])
        self.assertEqual(score.volume_baseline, 0)

    def test_missing_date_does_not_add_recency_credit(self):
        score = topics.compute_momentum([], mention_count=0, source_count=0)
        self.assertEqual(score.momentum, 0)

    def test_five_fresh_direct_notes_saturate_coverage(self):
        hits = [hit(f"RN-{i}") for i in range(5)]
        verdicts = {h.doc_id: {"verdict": "covers", "reason": "Direct"} for h in hits}
        result = self.assess(hits, verdicts)
        self.assertEqual(result.coverage_score, 1)
        self.assertEqual(result.judged_by, "llm")

    def test_one_direct_note_is_partial_shelf(self):
        result = self.assess([hit()], {"RN-1": {"verdict": "covers", "reason": "Direct"}})
        self.assertAlmostEqual(result.coverage_score, 0.52)

    def test_old_notes_do_not_imply_current_coverage(self):
        hits = [hit(f"RN-{i}", age=500) for i in range(5)]
        verdicts = {h.doc_id: {"verdict": "covers", "reason": "Direct"} for h in hits}
        result = self.assess(hits, verdicts)
        self.assertAlmostEqual(result.coverage_score, 0.25)
        gap = coverage.build_gap("ai", "AI", 0.8, result)
        self.assertEqual(gap.quadrant, "refresh")
        self.assertAlmostEqual(gap.gap_score, 0.6)

    def test_tangential_high_similarity_is_not_coverage(self):
        result = self.assess([hit(score=0.99)], {"RN-1": {"verdict": "tangential", "reason": "Wrong subject"}})
        self.assertEqual(result.coverage_score, 0)
        self.assertEqual(result.rejected, 1)

    def test_proxy_is_conservative_and_explicit(self):
        result = self.assess([hit(f"RN-{i}") for i in range(5)])
        self.assertEqual(result.judged_by, "similarity_proxy")
        self.assertEqual(result.candidates_judged, 0)
        self.assertLessEqual(result.coverage_score, 0.5)
        self.assertEqual(result.strong_matches, 0)

    def test_archive_and_duplicate_chunks_do_not_inflate_depth(self):
        result = self.assess([hit(), hit(chunk=1), hit("HP-1", area="Syndicated Archive")],
                             {"RN-1": {"verdict": "covers", "reason": "Direct"}})
        self.assertEqual(result.doc_count, 1)

    def test_missing_index_is_unknown_not_zero(self):
        with patch.object(coverage, "get_index", return_value=MagicMock(ready=False)):
            with self.assertRaises(RuntimeError):
                coverage.assess_coverage("ai", "AI")

    def test_failed_coverage_does_not_create_gap(self):
        with patch.object(coverage, "assess_coverage", side_effect=RuntimeError("Unavailable")), \
             patch.object(rag, "library_stats", return_value={}):
            result = librarian_coverage_node({"topics": [{"slug": "ai", "label": "AI"}]})
        self.assertEqual(result["coverage"], {})
        self.assertIsNone(result["topics"][0]["coverage_score"])
        self.assertTrue(result["errors"])

    def test_all_recommendations_follow_rules(self):
        quadrants = ["publish_now", "refresh", "maintain", "over_invested", "watch"]
        gaps = [{"label": q, "quadrant": q, "rationale": "Evidence"} for q in quadrants]
        self.assertEqual([r["action"] for r in computed_recommendations(gaps)],
                         ["commission", "refresh", "maintain", "review", "monitor"])

    def test_synthesis_failure_preserves_maintain_action(self):
        gap = {"label": "AI", "topic_slug": "ai", "quadrant": "maintain", "rationale": "Covered",
               "momentum": 0.8, "coverage_score": 0.8, "gap_score": 0.16, "priority": "MEDIUM"}
        with patch("app.agents.nodes.extract_structured", side_effect=RuntimeError("Unavailable")):
            result = synthesizer_node({"question": "AI", "gaps": [gap]})
        self.assertEqual(result["recommendations"][0]["action"], "maintain")

    def test_rag_excludes_archive(self):
        index = MagicMock()
        index.search.return_value = [hit("HP-1", area="Syndicated Archive"), hit()]
        with patch.object(rag, "get_index", return_value=index):
            self.assertEqual([h.doc_id for h in rag.retrieve("AI")], ["RN-1"])

    def test_empty_retrieval_abstains_without_perfect_score(self):
        result = rag.answer_question("AI", hits=[])
        self.assertEqual(result.verdict, "no_coverage")
        self.assertIsNone(result.groundedness)

    def test_routes_keep_library_separate_from_web(self):
        self.assertEqual(route_after_planner({"intent": "library_qa"}), "librarian_rag")
        self.assertEqual(route_after_planner({"intent": "market_scan"}), "scout")
        self.assertEqual(route_after_planner({"intent": "gap_review"}), "gap_review")

    def test_market_question_keeps_original_and_extracts_search_area(self):
        question = "What topics related to AI in healthcare have surged recently?"
        self.assertEqual(normalise_market_area(question), "AI in healthcare")
        plan = planner_node({"question": question, "forced_intent": "market_scan"})
        self.assertEqual(plan["research_area"], "AI in healthcare")
        self.assertEqual(plan["queries"], [
            "AI in healthcare",
            "AI in healthcare emerging trends",
            "AI in healthcare regulation governance",
        ])

    def test_market_subject_is_extracted_from_other_example_question(self):
        self.assertEqual(
            normalise_market_area("Summarise recent signals around supply-chain resilience."),
            "supply-chain resilience",
        )

    def test_scout_exposes_per_query_counts_and_dedup_total(self):
        a1 = Article("A1", "https://example.org/a1", "example.org", "AI", date.today().isoformat(), 1.0, "test")
        a2 = Article("A2", "https://example.org/a2", "example.org", "AI", date.today().isoformat(), 1.0, "test")
        with patch.object(scout_node.__globals__["settings"], "tavily_api_key", "test"), \
             patch.object(scout_node.__globals__["external_signals"], "search_news",
                          side_effect=[([a1, a2], False), ([a1], True), ([], False)]):
            result = scout_node({
                "question": "AI in healthcare",
                "research_area": "AI in healthcare",
                "queries": ["q1", "q2", "q3"],
                "force_refresh": False,
            })
        self.assertEqual([item["count"] for item in result["scout_stats"]["queries"]], [2, 1, 0])
        self.assertEqual(result["scout_stats"]["raw_total"], 3)
        self.assertEqual(result["scout_stats"]["unique_articles"], 2)
        self.assertEqual(result["signal_source"], "live")

    def test_market_workflow_runs_end_to_end_without_providers(self):
        article = Article("Governance news", "https://example.org/a", "example.org", "AI governance",
                          date.today().isoformat(), 1.0, "test")
        candidate = topics.TopicCandidate("Clinical AI", "clinical-ai", mention_count=1,
                                          article_urls=[article.url], last_seen=date.today().isoformat())
        assessed = coverage.Coverage("clinical-ai", 0, 0, 0, 0, None, 999, 0, [])
        with ExitStack() as stack:
            patches = {
                "app.agents.nodes.settings.tavily_api_key": "test-not-a-key",
                "app.agents.nodes.external_signals.search_news": MagicMock(return_value=([article], True)),
                "app.agents.nodes.topic_service.extract_signals": MagicMock(return_value=[]),
                "app.agents.nodes.topic_service.normalise_topics": MagicMock(return_value=[candidate]),
                "app.agents.nodes._persist_topics": MagicMock(),
                "app.agents.nodes.coverage_service.assess_coverage": MagicMock(return_value=assessed),
                "app.agents.nodes.coverage_service.save_coverage": MagicMock(),
                "app.agents.nodes.coverage_service.save_gap": MagicMock(),
                "app.agents.nodes.coverage_service.portfolio_summary": MagicMock(return_value={}),
                "app.agents.nodes.rag.library_stats": MagicMock(return_value={}),
                "app.agents.nodes.embed_texts": MagicMock(return_value=[[1.0, 0.0]]),
                "app.agents.nodes.knowledge_graph.save_graph": MagicMock(),
                "app.agents.nodes.extract_structured": MagicMock(side_effect=RuntimeError("Offline test")),
            }
            for path, value in patches.items():
                stack.enter_context(patch(path, value))
            result = run_agent("AI in healthcare", intent="market_scan", persist=False)
        self.assertEqual(result["intent"], "market_scan")
        self.assertEqual(len(result["gaps"]), 1)
        self.assertIsNone(result["topics"][0]["growth_pct"])
        self.assertEqual(result["recommendations"][0]["action"], "monitor")
        self.assertTrue(result["answer"])
        self.assertIn("critic", {e["node"] for e in result["trace"]})
        self.assertEqual(result["graph"]["question"], "AI in healthcare")
        snapshot = result["graph"]["snapshot"]
        self.assertEqual([n["slug"] for n in snapshot["nodes"] if n["type"] == "TOPIC"], ["clinical-ai"])
        node_ids = {n["id"] for n in snapshot["nodes"]}
        self.assertTrue(all(e["source"] in node_ids and e["target"] in node_ids for e in snapshot["links"]))
        outputs = {e["node"]: e["detail"]["output"] for e in result["trace"] if "output" in e["detail"]}
        self.assertEqual(len(outputs), 9)
        self.assertNotIn("topic_objects", outputs["topic_analyst"])
        self.assertNotIn("coverage_score", outputs["topic_analyst"]["topics"][0])
        self.assertIn("coverage_score", outputs["librarian"]["topics"][0])

    def test_trace_output_is_snapshot_not_mutable_downstream_state(self):
        from app.agents.graph import with_output_trace
        from app.agents.state import Tracer
        tracer = Tracer()
        update = {"topics": [{"label": "AI", "entities": [{"name": "Hospital"}]}], "topic_objects": [object()]}
        result = with_output_trace("topic_analyst", lambda state, config: update)(
            {}, {"configurable": {"tracer": tracer}})
        result["topics"][0]["entities"][0]["name"] = "Changed later"
        saved = tracer.as_dicts()[0]["detail"]["output"]
        self.assertEqual(saved["topics"][0]["entities"][0]["name"], "Hospital")
        self.assertNotIn("topic_objects", saved)


if __name__ == "__main__":
    unittest.main()
