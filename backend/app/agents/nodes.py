"""Agent nodes.

Each function is one specialist in the crew. They share a single rule: never
raise. A node that fails records the failure in the trace and returns partial
state, because a demo that degrades gracefully is worth more than one that
throws when a free-tier API blinks.
"""

import logging
import re
import time
from typing import Any

from pydantic import BaseModel, Field
from langchain_core.runnables import RunnableConfig

from ..config import settings
from ..core.llm import embed_texts, extract_structured, generate_text
from ..data import db
from ..data.taxonomy import EXAMPLE_QUESTIONS
from ..services import coverage as coverage_service
from ..services import external_signals, knowledge_graph, rag, topics as topic_service
from .state import AgentState, Tracer

logger = logging.getLogger(__name__)


def normalise_market_area(question: str) -> str:
    """Extract a search subject from a natural-language market question.

    The original question remains in state for auditability and answer writing;
    this field is only used to make web queries focused. If no safe pattern is
    found, preserve the question rather than guessing a subject.
    """
    text = re.sub(r"\s+", " ", question.strip()).rstrip("?.!")
    patterns = (
        r"^(?:what|which)\s+(?:topics?|trends?|signals?)\s+(?:related to|about|around)\s+(.+?)\s+(?:have|has|are|is|were|was)\b",
        r"^summari[sz]e\s+(?:the\s+)?(?:recent\s+)?signals?\s+(?:around|about|for)\s+(.+)$",
        r"^what\s+are\s+(?:the\s+)?(?:key\s+)?issues?\s+(.+?)\s+(?:faced|face|are facing)\b",
    )
    for pattern in patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            area = match.group(1).strip(" ,:;?.!")
            if len(area) >= 4:
                return area
    return text


def _tracer(config: RunnableConfig | None) -> Tracer:
    if config and isinstance(config.get("configurable"), dict):
        tracer = config["configurable"].get("tracer")
        if isinstance(tracer, Tracer):
            return tracer
    return Tracer()


# ---------------------------------------------------------------------------
# 1. Planner
# ---------------------------------------------------------------------------
class PlanStep(BaseModel):
    agent: str = Field(description="One of: scout, topic_analyst, momentum_analyst, librarian, graph_curator, gap_analyst, synthesizer")
    action: str = Field(description="What this specialist will do for this request, one short line")


class Plan(BaseModel):
    intent: str = Field(description="market_scan, library_qa, gap_review or topic_deep_dive")
    research_area: str = Field(description="The market/domain to research, normalised (e.g. 'AI in healthcare')")
    search_queries: list[str] = Field(description="2-4 diverse web search queries that would surface emerging sub-topics in this area. Empty list for library_qa.")
    reasoning: str = Field(description="One or two sentences explaining the routing decision")
    steps: list[PlanStep] = Field(description="The specialists to run, in order")


PLANNER_SYSTEM = f"""You are the planning agent of a research intelligence platform for an IT
research and advisory firm. You decide which specialists must run for a request.

Route to:
- market_scan     : the user names a market/domain and wants to know what is emerging,
                    or wants demand-vs-coverage analysis for that area.
- library_qa      : the user asks a substantive question that should be answered from
                    existing internal research (no external sensing needed).
- gap_review      : the user asks about coverage gaps / over-investment across the whole
                    portfolio without naming a new domain to sense.
- topic_deep_dive : the user names one specific topic already sensed and wants detail.

Examples of requests this system serves: {" | ".join(EXAMPLE_QUESTIONS[:4])}

Search queries must be diverse and aimed at discovering sub-topics - not one query
reworded four times. Ground research_area and every query in the user's Request;
never copy a subject from the examples above. Preserve named domains, industries
and entities from the Request. If the subject is unclear, use the Request itself
as the research_area rather than inventing a different market."""


def planner_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    question = state["question"]
    tracer.start("planner", "Classifying request and selecting specialists")

    forced = state.get("forced_intent")
    if forced in ("market_scan", "library_qa", "gap_review", "topic_deep_dive"):
        area = normalise_market_area(question) if forced == "market_scan" else question
        queries = (
            [area, f"{area} emerging trends", f"{area} regulation governance"]
            if forced == "market_scan"
            else []
        )
        tracer.done(
            "planner",
            f"Intent locked by UI: {forced.replace('_', ' ')}",
            question=question,
            intent=forced,
            research_area=area,
            query_subject=area,
            queries=queries,
            reasoning="The user chose this path in the UI, so the planner did not classify the question.",
        )
        return {
            "intent": forced,
            # Keep the user's exact wording in ``question``.  Downstream web
            # search must receive the normalized subject used to build the
            # queries, otherwise the trace and the Scout handoff disagree.
            "research_area": area,
            "queries": queries,
            "plan": [{"agent": "ui", "action": f"Path locked to {forced}"}],
            "reasoning": "Path chosen in the UI; search subject extracted from the original question.",
        }

    try:
        plan = extract_structured(
            f"Request: {question!r}\n\nProduce the routing plan.",
            Plan,
            fast=False,
            system=PLANNER_SYSTEM,
            label="planner",
        )
        intent = plan.intent.strip().lower()
        if intent not in ("market_scan", "library_qa", "gap_review", "topic_deep_dive"):
            intent = "market_scan"

        steps = [{"agent": s.agent, "action": s.action} for s in plan.steps]
        tracer.done(
            "planner",
            f"Intent: {intent.replace('_', ' ')} - {len(steps)} specialists queued",
            question=question,
            intent=intent,
            research_area=plan.research_area,
            query_subject=plan.research_area,
            queries=plan.search_queries,
            reasoning=plan.reasoning,
            steps=steps,
        )
        return {
            "intent": intent,
            "research_area": plan.research_area.strip() or question,
            "queries": [q for q in plan.search_queries if q.strip()][:4],
            "plan": steps,
            "reasoning": plan.reasoning.strip(),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Planner failed, defaulting to library_qa: %s", exc)
        tracer.error("planner", f"Planning failed ({type(exc).__name__}); defaulting to library lookup")
        return {
            "intent": "library_qa",
            "research_area": question,
            "queries": [],
            "plan": [{"agent": "librarian", "action": "Retrieve and answer from internal research"}],
            "reasoning": "Planner unavailable; fell back to grounded library retrieval.",
            "errors": [*state.get("errors", []), f"planner: {exc}"],
        }


# ---------------------------------------------------------------------------
# 2. Signal Scout
# ---------------------------------------------------------------------------
def scout_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    area = state.get("research_area") or state["question"]
    queries = state.get("queries") or [area, f"{area} emerging trends"]
    force = bool(state.get("force_refresh"))

    tracer.start("scout", f"Sensing external signals for '{area}'", queries=queries)

    if not settings.tavily_api_key:
        tracer.skip("scout", "No search key configured - external sensing unavailable")
        return {
            "articles": [],
            "signal_source": "unavailable",
            "scout_stats": {"queries": [], "raw_total": 0, "unique_articles": 0, "outlets": 0},
        }

    pool: dict[str, dict[str, Any]] = {}
    cached_count = 0
    raw_total = 0
    query_stats: list[dict[str, Any]] = []
    for query in queries:
        articles, from_cache = external_signals.search_news(
            query, max_results=8, days=45, force=force
        )
        cached_count += int(from_cache)
        raw_total += len(articles)
        query_stats.append({"query": query, "count": len(articles), "cached": from_cache})
        for article in articles:
            pool.setdefault(article.url, article.to_dict())
        tracer.progress(
            "scout",
            f"'{query[:52]}' returned {len(articles)} articles" + (" (cached)" if from_cache else " (live)"),
            query=query,
            count=len(articles),
            cached=from_cache,
        )

    articles = list(pool.values())
    domains = sorted({a["domain"] for a in articles if a.get("domain")})
    tracer.done(
        "scout",
        f"{len(articles)} unique articles from {len(domains)} outlets",
        articles=len(articles),
        raw_articles=raw_total,
        outlets=len(domains),
        query_stats=query_stats,
        top_domains=domains[:8],
        source="cache" if cached_count == len(queries) else "live",
    )
    return {
        "articles": articles,
        "signal_source": "cache" if cached_count == len(queries) else "live",
        "scout_stats": {
            "queries": query_stats,
            "raw_total": raw_total,
            "unique_articles": len(articles),
            "outlets": len(domains),
        },
    }


# ---------------------------------------------------------------------------
# 3. Topic Analyst - extraction + normalisation
# ---------------------------------------------------------------------------
def topic_analyst_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    raw_articles = state.get("articles") or []
    tracer.start("topic_analyst", f"Reading {len(raw_articles)} articles to extract topics and entities")

    if not raw_articles:
        tracer.skip("topic_analyst", "No articles to analyse")
        return {"topics": [], "topic_objects": []}

    articles = [
        external_signals.Article(
            title=a.get("title", ""),
            url=a.get("url", ""),
            domain=a.get("domain", ""),
            snippet=a.get("snippet", ""),
            published_date=a.get("published_date"),
            relevance=float(a.get("relevance") or 0),
            source=a.get("source", "tavily"),
            sweep=a.get("sweep"),
        )
        for a in raw_articles
    ]

    try:
        extractions = topic_service.extract_signals(articles)
        raw_topic_count = sum(len(e.topics) for e in extractions)
        tracer.progress(
            "topic_analyst",
            f"Extracted {raw_topic_count} raw topic mentions from {len(extractions)} articles",
            raw_mentions=raw_topic_count,
        )

        candidates = topic_service.normalise_topics(
            extractions,
            articles,
            max_topics=14,
            area_hint=state.get("research_area") or "",
        )
        merged = sum(max(0, len(c.aliases) - 1) for c in candidates)
        tracer.done(
            "topic_analyst",
            f"Normalised into {len(candidates)} canonical topics ({merged} duplicate surface forms merged)",
            topics=[c.label for c in candidates],
            merged_aliases=merged,
            examples=[
                {"canonical": c.label, "merged_from": sorted(set(c.aliases))[:5]}
                for c in candidates[:5]
                if len(set(c.aliases)) > 1
            ],
        )
        return {
            "topics": [
                {
                    "slug": c.slug,
                    "label": c.label,
                    "category": c.category,
                    "description": c.description,
                    "aliases": sorted(set(c.aliases)),
                    "entities": c.entities[:12],
                    "drivers": c.drivers[:6],
                    "mention_count": c.mention_count,
                    "source_count": c.source_count,
                    "first_seen": c.first_seen,
                    "last_seen": c.last_seen,
                    "article_urls": c.article_urls[:8],
                }
                for c in candidates
            ],
            "topic_objects": candidates,
            "normalisation": {"raw_mentions": raw_topic_count, "canonical": len(candidates), "merged": merged},
        }
    except Exception as exc:  # noqa: BLE001
        tracer.error("topic_analyst", f"Topic extraction failed: {type(exc).__name__}")
        return {"topics": [], "topic_objects": [], "errors": [*state.get("errors", []), f"topics: {exc}"]}


# ---------------------------------------------------------------------------
# 4. Momentum Analyst
# ---------------------------------------------------------------------------
def momentum_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    candidates = state.get("topic_objects") or []
    tracer.start("momentum_analyst", f"Measuring market momentum for {len(candidates)} topics")

    if not candidates:
        tracer.skip("momentum_analyst", "No topics to score")
        return {}

    topics_out: list[dict[str, Any]] = []
    existing = {t["slug"]: t for t in state.get("topics", [])}

    # Momentum comes from Tavily mention counts already attached to the
    # canonical topic (all merged aliases). GDELT exact-phrase volume is not
    # used: the cleaned label often does not appear verbatim in news.
    for position, candidate in enumerate(candidates):
        tracer.progress(
            "momentum_analyst",
            f"Scoring '{candidate.label}' from Tavily mentions ({candidate.mention_count} mentions, {candidate.source_count} outlets)",
            topic=candidate.label,
        )
        momentum = topic_service.compute_momentum(
            [],
            mention_count=candidate.mention_count,
            source_count=candidate.source_count,
            last_seen=candidate.last_seen,
            source="derived",
        )
        setattr(candidate, "momentum", momentum.momentum)

        payload = dict(existing.get(candidate.slug, {}))
        payload.update(
            {
                "slug": candidate.slug,
                "label": candidate.label,
                **momentum.to_dict(),
                "series": [],
            }
        )
        topics_out.append(payload)

        if position < 4:
            tracer.progress(
                "momentum_analyst",
                f"{candidate.label}: attention {momentum.momentum:.2f}; growth not measured (news sample)",
                topic=candidate.label,
                momentum=round(momentum.momentum, 3),
            )

    topics_out.sort(key=lambda t: t.get("momentum", 0), reverse=True)
    _persist_topics(topics_out, state.get("articles") or [])

    tracer.done(
        "momentum_analyst",
        f"Scored {len(topics_out)} topics from Tavily mention breadth and recency",
        derived=len(topics_out),
        top=[{"label": t["label"], "momentum": round(t.get("momentum", 0), 3)} for t in topics_out[:5]],
    )
    return {"topics": topics_out}


def _persist_topics(topics: list[dict[str, Any]], articles: list[dict[str, Any]]) -> None:
    """Write topics, their signals and volume series to SQLite."""
    by_url = {a.get("url"): a for a in articles}

    for topic in topics:
        db.execute(
            """INSERT INTO topics
               (slug, label, aliases, category, description, mention_count, source_count,
                momentum, growth_pct, velocity, recency_days, first_seen, last_seen, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
               ON CONFLICT(slug) DO UPDATE SET
                 label=excluded.label, aliases=excluded.aliases, category=excluded.category,
                 description=excluded.description, mention_count=excluded.mention_count,
                 source_count=excluded.source_count, momentum=excluded.momentum,
                 growth_pct=excluded.growth_pct, velocity=excluded.velocity,
                 recency_days=excluded.recency_days, last_seen=excluded.last_seen,
                 updated_at=CURRENT_TIMESTAMP""",
            (
                topic["slug"], topic["label"], db.as_json(topic.get("aliases", [])),
                topic.get("category"), topic.get("description"),
                topic.get("mention_count", 0), topic.get("source_count", 0),
                topic.get("momentum", 0), topic.get("growth_pct", 0),
                topic.get("velocity", 0), topic.get("recency_days", 0),
                topic.get("first_seen"), topic.get("last_seen"),
            ),
        )

        for url in topic.get("article_urls", [])[:8]:
            article = by_url.get(url)
            if not article:
                continue
            db.execute(
                """INSERT OR IGNORE INTO signals
                   (topic_slug, source, title, url, domain, snippet, published_date, relevance)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    topic["slug"], article.get("source", "tavily"), article.get("title", ""),
                    url, article.get("domain"), (article.get("snippet") or "")[:600],
                    article.get("published_date"), article.get("relevance", 0),
                ),
            )

        if topic.get("series"):
            db.execute_many(
                """INSERT OR IGNORE INTO topic_timeseries (topic_slug, date, value, source)
                   VALUES (?,?,?,?)""",
                [
                    (topic["slug"], point["date"], point["value"], topic.get("source", "gdelt"))
                    for point in topic["series"]
                    if point.get("date")
                ],
            )


# ---------------------------------------------------------------------------
# 5. Librarian - internal coverage assessment
# ---------------------------------------------------------------------------
def librarian_coverage_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    topics = state.get("topics") or []
    tracer.start("librarian", f"Assessing internal coverage for {len(topics)} topics")

    if not topics:
        tracer.skip("librarian", "No topics to assess")
        return {"coverage": {}}

    results: dict[str, Any] = {}
    errors = list(state.get("errors", []))
    for topic in topics:
        tracer.progress("librarian", f"Checking the shelf for '{topic['label']}'", topic=topic["label"])
        query_text = f"{topic['label']}. {topic.get('description') or ''}".strip()
        try:
            assessment = coverage_service.assess_coverage(
                topic["slug"], query_text, top_k=5, judge=True,
                topic_label=topic["label"], description=topic.get("description") or "",
            )
        except Exception as exc:
            tracer.error("librarian", f"Coverage unavailable for {topic['label']}: {type(exc).__name__}")
            topic["coverage_score"] = None
            topic["coverage_method"] = "unavailable"
            errors.append(f"coverage unavailable: {topic['slug']}")
            continue
        coverage_service.save_coverage(assessment)
        results[topic["slug"]] = assessment.to_dict()
        topic["coverage_score"] = assessment.coverage_score
        topic["doc_count"] = assessment.doc_count
        topic["staleness_days"] = assessment.staleness_days
        topic["matched_docs"] = assessment.matched_docs[:5]
        topic["coverage_method"] = assessment.judged_by

    uncovered = [t["label"] for t in topics if t["slug"] in results and results[t["slug"]]["doc_count"] == 0]
    well_covered = [t["label"] for t in topics if t["slug"] in results and results[t["slug"]]["coverage_score"] >= 0.6]

    tracer.done(
        "librarian",
        f"{len(well_covered)} topics well covered, {len(uncovered)} with no relevant research",
        well_covered=well_covered[:5],
        uncovered=uncovered[:5],
        searched_documents=rag.library_stats().get("documents", 0),
    )
    return {"coverage": results, "topics": topics, "errors": errors}


# ---------------------------------------------------------------------------
# 6. Graph Curator
# ---------------------------------------------------------------------------
def graph_curator_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    candidates = state.get("topic_objects") or []
    tracer.start("graph_curator", "Organising topics, entities and documents into the knowledge graph")

    if not candidates:
        tracer.skip("graph_curator", "Nothing to add to the graph")
        return {"graph": {}}

    try:
        coverage_map = state.get("coverage") or {}
        coverage_objects = {
            slug: coverage_service.Coverage(
                topic_slug=slug,
                doc_count=data["doc_count"],
                strong_matches=data["strong_matches"],
                best_score=data["best_score"],
                mean_score=data["mean_score"],
                newest_doc_date=data["newest_doc_date"],
                staleness_days=data["staleness_days"],
                coverage_score=data["coverage_score"],
                matched_docs=data["matched_docs"],
            )
            for slug, data in coverage_map.items()
        }

        # Topic-to-topic adjacency needs vectors; label + description is enough
        # signal and it is one cheap batched call.
        vectors: dict[str, list[float]] = {}
        try:
            texts = [f"{c.label}. {c.description}".strip() for c in candidates]
            embedded = embed_texts(texts, task_type="SEMANTIC_SIMILARITY")
            vectors = {c.slug: v for c, v in zip(candidates, embedded)}
        except Exception as exc:  # noqa: BLE001 - adjacency is an enhancement
            tracer.progress("graph_curator", f"Adjacency embedding unavailable ({type(exc).__name__})")

        graph = knowledge_graph.build_graph(candidates, coverage_objects, topic_vectors=vectors)
        knowledge_graph.save_graph(graph)
        stats = knowledge_graph.stats(graph)
        central = knowledge_graph.central_entities(graph, limit=8)

        tracer.done(
            "graph_curator",
            f"Graph now holds {stats.nodes} nodes and {stats.edges} relationships",
            **stats.to_dict(),
            central_entities=[c["label"] for c in central[:6]],
        )
        return {"graph": {**stats.to_dict(), "central_entities": central,
                          "question": state.get("question", ""),
                          "snapshot": knowledge_graph.to_cytoscape(graph, max_nodes=300)}}
    except Exception as exc:  # noqa: BLE001
        tracer.error("graph_curator", f"Graph build failed: {type(exc).__name__}")
        return {"graph": {}, "errors": [*state.get("errors", []), f"graph: {exc}"]}


# ---------------------------------------------------------------------------
# 7. Gap Analyst
# ---------------------------------------------------------------------------
def gap_analyst_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    topics = state.get("topics") or []
    coverage_map = state.get("coverage") or {}
    tracer.start("gap_analyst", "Comparing market momentum against internal coverage")

    if not topics:
        tracer.skip("gap_analyst", "No topics to compare")
        return {"gaps": []}

    gaps: list[dict[str, Any]] = []
    for topic in topics:
        data = coverage_map.get(topic["slug"])
        if not data:
            continue
        assessment = coverage_service.Coverage(
            topic_slug=topic["slug"],
            doc_count=data["doc_count"],
            strong_matches=data["strong_matches"],
            best_score=data["best_score"],
            mean_score=data["mean_score"],
            newest_doc_date=data["newest_doc_date"],
            staleness_days=data["staleness_days"],
            coverage_score=data["coverage_score"],
            matched_docs=data["matched_docs"],
        )
        gap = coverage_service.build_gap(
            topic["slug"], topic["label"], float(topic.get("momentum") or 0), assessment
        )
        coverage_service.save_gap(gap)
        gaps.append({**gap.to_dict(), "category": topic.get("category"), "growth_pct": topic.get("growth_pct")})

    gaps.sort(key=lambda g: g["gap_score"], reverse=True)
    portfolio = coverage_service.portfolio_summary()

    by_quadrant: dict[str, int] = {}
    for gap in gaps:
        by_quadrant[gap["quadrant"]] = by_quadrant.get(gap["quadrant"], 0) + 1

    tracer.done(
        "gap_analyst",
        f"{by_quadrant.get('publish_now', 0)} publish-now gaps, "
        f"{by_quadrant.get('refresh', 0)} refresh candidates, "
        f"{by_quadrant.get('over_invested', 0)} over-invested areas",
        quadrants=by_quadrant,
        top_gaps=[{"label": g["label"], "gap_score": g["gap_score"], "priority": g["priority"]} for g in gaps[:5]],
    )
    return {"gaps": gaps, "portfolio": portfolio}


# ---------------------------------------------------------------------------
# 8. Librarian (RAG path)
# ---------------------------------------------------------------------------
def librarian_rag_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    question = state["question"]
    tracer.start("librarian", "Retrieving relevant internal research")

    try:
        hits = rag.retrieve(question, top_k=settings.rag_top_k)
        tracer.progress(
            "librarian",
            f"Retrieved {len(hits)} passages from {len({h.doc_id for h in hits})} documents",
            documents=sorted({h.doc_id for h in hits}),
            top_score=round(hits[0].score, 3) if hits else 0,
        )
        result = rag.answer_question(question, hits=hits, check_groundedness=True, persist=False)
        tracer.done(
            "librarian",
            f"Answer grounded in {len(result.citations)} cited documents",
            citations=[c["doc_id"] for c in result.citations],
            groundedness=result.groundedness,
        )
        return {
            "rag": result.to_dict(),
            "answer": result.answer,
            "citations": result.citations,
            "groundedness": result.groundedness,
            "verdict": result.verdict,
        }
    except Exception as exc:  # noqa: BLE001
        tracer.error("librarian", f"Retrieval failed: {type(exc).__name__}")
        return {
            "answer": "Internal retrieval failed for this question.",
            "errors": [*state.get("errors", []), f"rag: {exc}"],
        }


# ---------------------------------------------------------------------------
# 9. Gap review (portfolio-wide, uses stored analysis - no external calls)
# ---------------------------------------------------------------------------
def gap_review_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    tracer.start("gap_analyst", "Reviewing the stored demand-vs-coverage portfolio")

    rows = db.query(
        """SELECT g.*, t.label, t.category, t.growth_pct, t.momentum AS topic_momentum
           FROM gaps g JOIN topics t ON t.slug = g.topic_slug
           ORDER BY g.gap_score DESC"""
    )
    if not rows:
        tracer.skip("gap_analyst", "No prior analysis stored - run a market scan first")
        return {"gaps": [], "portfolio": coverage_service.portfolio_summary()}

    gaps = [
        {
            "topic_slug": r["topic_slug"], "label": r["label"], "momentum": r["momentum"],
            "coverage_score": r["coverage_score"], "gap_score": r["gap_score"],
            "priority": r["priority"], "quadrant": r["quadrant"], "rationale": r["rationale"],
            "category": r["category"], "growth_pct": r["growth_pct"],
        }
        for r in rows
    ]
    portfolio = coverage_service.portfolio_summary()
    tracer.done(
        "gap_analyst",
        f"Reviewed {len(gaps)} tracked topics; {portfolio['critical']} critical, {portfolio['high']} high priority",
        **{k: v for k, v in portfolio.items() if k != "quadrants"},
    )
    return {"gaps": gaps, "portfolio": portfolio}


# ---------------------------------------------------------------------------
# 10. Synthesizer
# ---------------------------------------------------------------------------
class Recommendation(BaseModel):
    topic: str = Field(description="Topic label, exactly as supplied")
    action: str = Field(description="commission, refresh, maintain, review or monitor")
    rationale: str = Field(description="One sentence citing the momentum and coverage evidence")


class ExecutiveOutput(BaseModel):
    executive_summary: str = Field(description="3-5 sentences a research director could read aloud in a leadership meeting")
    top_opportunities: list[str] = Field(description="Topic labels ranked by research opportunity, highest first")
    well_covered: list[str] = Field(description="Topic labels where coverage is already adequate")
    recommendations: list[Recommendation] = Field(description="3-5 concrete actions")


SYNTH_SYSTEM = (
    "You are the head of research planning at an IT research and advisory firm. You turn "
    "demand-sensing analytics into decisions. You cite the numbers you were given, never "
    "invent new ones, and you write for executives who have 60 seconds. "
    "Momentum here is a sampled news-attention proxy, not measured growth or client demand. "
    "Never describe a surge, decline or cooling without a measured baseline. "
    "Coverage is an estimate over a simulated library. Actions require analyst review."
)


def computed_recommendations(gaps: list[dict[str, Any]]) -> list[dict[str, str]]:
    actions = {"publish_now": "commission", "refresh": "refresh", "maintain": "maintain",
               "over_invested": "review", "watch": "monitor"}
    return [{"topic": g["label"], "action": actions.get(g["quadrant"], "monitor"),
             "rationale": g["rationale"]} for g in gaps[:5]]


def synthesizer_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    tracer = _tracer(config)
    intent = state.get("intent", "market_scan")

    # The library-QA path already produced its answer; nothing to synthesise.
    if intent == "library_qa" and state.get("answer"):
        tracer.skip("synthesizer", "Grounded answer already produced by the Librarian")
        return {}

    gaps = state.get("gaps") or []
    tracer.start("synthesizer", "Writing the executive recommendation")

    if not gaps:
        tracer.skip("synthesizer", "No analysis available to summarise")
        return {"answer": state.get("answer") or "No market analysis is available yet for this request."}

    lines = []
    for gap in gaps[:12]:
        docs = ""
        coverage_data = (state.get("coverage") or {}).get(gap["topic_slug"], {})
        matched = coverage_data.get("matched_docs") or []
        if matched:
            docs = "; existing: " + ", ".join(f"{d['doc_id']} ({d['age_days']}d old)" for d in matched[:3])
        lines.append(
            f"- {gap['label']}: momentum {gap['momentum']:.2f}, coverage {gap['coverage_score']:.2f}, "
            f"gap {gap['gap_score']:.2f} [{gap['priority']}, {gap['quadrant']}]{docs}. {gap['rationale']}"
        )

    area = state.get("research_area") or state["question"]
    articles = state.get("articles") or []
    prompt = f"""The request was: {state['question']!r}
Research area analysed: {area}
External evidence base: {len(articles)} recent articles across {len({a.get('domain') for a in articles})} outlets.

DEMAND VS COVERAGE (momentum and coverage are 0-1 scales)
{chr(10).join(lines)}

Write the executive output. Rules:
- Name topics exactly as given above.
- Quote the momentum/coverage/gap numbers you rely on.
- 'commission' for high momentum + low coverage; 'refresh' for stale coverage;
  'maintain' where coverage is adequate; 'review' for heavy coverage with low observed attention;
  'monitor' for inconclusive evidence. Never recommend retirement from news attention alone.
- State the evidence limits: attention is sampled news, coverage is an estimate over simulated research.
"""

    try:
        output = extract_structured(prompt, ExecutiveOutput, fast=False, system=SYNTH_SYSTEM, label="synthesis")
        answer = output.executive_summary.strip()
        recommendations = computed_recommendations(gaps)
        tracer.done(
            "synthesizer",
            f"Recommendation ready: {len(recommendations)} actions, top opportunity '{(output.top_opportunities or ['n/a'])[0]}'",
            top_opportunities=output.top_opportunities[:5],
            well_covered=output.well_covered[:5],
        )
        return {
            "answer": answer,
            "executive_summary": answer,
            "recommendations": recommendations,
            "top_opportunities": output.top_opportunities,
        }
    except Exception as exc:  # noqa: BLE001 - fall back to a deterministic summary
        tracer.error("synthesizer", f"Synthesis failed ({type(exc).__name__}); using computed summary")
        top = gaps[0]
        fallback = (
            f"{top['label']} is the strongest research opportunity: market momentum "
            f"{top['momentum']:.2f} against internal coverage {top['coverage_score']:.2f} "
            f"(gap {top['gap_score']:.2f}, {top['priority']}). {top['rationale']}"
        )
        return {
            "answer": fallback,
            "executive_summary": fallback,
            "recommendations": computed_recommendations(gaps),
            "errors": [*state.get("errors", []), f"synthesis: {exc}"],
        }


# ---------------------------------------------------------------------------
# 11. Critic
# ---------------------------------------------------------------------------
class CritiqueVerdict(BaseModel):
    consistent: bool = Field(description="True if every claim matches the supplied analytics")
    issues: list[str] = Field(description="Any claims that contradict or are unsupported by the analytics (max 3)")
    confidence: float = Field(description="0-1 confidence that the output is faithful to the analytics")


def critic_node(state: AgentState, config: RunnableConfig | None = None) -> dict[str, Any]:
    """Independent check that the narrative matches the computed numbers.

    The synthesis step is the one place where an LLM could quietly overstate a
    finding, so it gets audited by a separate call before it reaches a user.
    """
    tracer = _tracer(config)

    if state.get("intent") == "library_qa":
        tracer.skip("critic", f"Groundedness already scored at {state.get('groundedness')}")
        return {}

    answer = state.get("answer") or ""
    gaps = state.get("gaps") or []
    if not answer or not gaps:
        tracer.skip("critic", "Nothing to verify")
        return {}

    tracer.start("critic", "Verifying the recommendation against the computed analytics")
    facts = "\n".join(
        f"- {g['label']}: momentum {g['momentum']:.2f}, coverage {g['coverage_score']:.2f}, "
        f"gap {g['gap_score']:.2f}, priority {g['priority']}, quadrant {g['quadrant']}"
        for g in gaps[:12]
    )

    try:
        verdict = extract_structured(
            "Verify the SUMMARY against the ANALYTICS. Flag any claim that overstates, "
            "understates or invents a number, or that ranks topics differently from the data.\n\n"
            f"SUMMARY:\n{answer}\n\nANALYTICS:\n{facts}",
            CritiqueVerdict,
            fast=True,
            label="critic",
        )
        score = round(max(0.0, min(1.0, verdict.confidence)), 3)
        if verdict.consistent and not verdict.issues:
            tracer.done("critic", f"Verified consistent with the analytics (confidence {score:.2f})", confidence=score)
        else:
            tracer.done(
                "critic",
                f"{len(verdict.issues)} discrepancy(ies) flagged (confidence {score:.2f})",
                confidence=score,
                issues=verdict.issues[:3],
            )
        return {"groundedness": score, "verdict": "consistent" if verdict.consistent else "flagged", "critique_issues": verdict.issues[:3]}
    except Exception as exc:  # noqa: BLE001
        tracer.error("critic", f"Verification unavailable: {type(exc).__name__}")
        return {}
