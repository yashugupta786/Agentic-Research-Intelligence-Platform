"""Topic discovery, normalisation and momentum scoring.

The hard part of demand sensing is not fetching news, it is agreeing on what a
topic *is*. Ten articles will say "AI agents", "agentic AI", "autonomous AI
agents" and "agent-based automation" - four labels, one market movement. Count
them separately and you report four weak topics instead of one strong one, and
the whole gap analysis becomes noise.

So normalisation runs in three passes:

1. **Lexical** - lowercase, strip filler, collapse obvious variants.
2. **Semantic** - embed every surface form and greedily cluster by cosine
   similarity. This is what catches "AI agents" ~ "autonomous agents", which no
   amount of string matching would.
3. **Canonical naming** - one LLM call names each cluster and assigns a
   category, so the label a director reads is clean.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Iterable, Sequence
from urllib.parse import urlparse

import numpy as np
from pydantic import BaseModel, Field

from ..core.llm import embed_texts, extract_structured
from .external_signals import Article

logger = logging.getLogger(__name__)

ENTITY_TYPES = ("COMPANY", "GEO", "TECHNOLOGY", "REGULATION", "INDUSTRY", "ORGANISATION", "PERSON")

STOP_PREFIXES = ("the ", "a ", "an ", "rise of ", "future of ", "impact of ", "role of ", "growth of ")
FILLER_WORDS = {"trends", "trend", "market", "industry", "solutions", "landscape", "overview", "update", "news"}


# ---------------------------------------------------------------------------
# LLM schemas
# ---------------------------------------------------------------------------
class ExtractedEntity(BaseModel):
    name: str = Field(description="Proper name of the entity")
    type: str = Field(description=f"One of: {', '.join(ENTITY_TYPES)}")


class ArticleExtraction(BaseModel):
    index: int = Field(description="0-based index of the article in the input list")
    topics: list[str] = Field(description="1-3 specific business/technology topics discussed")
    entities: list[ExtractedEntity] = Field(description="Up to 5 named entities")
    driver: str = Field(description="One short clause: why this is being discussed now")


class ExtractionBatch(BaseModel):
    items: list[ArticleExtraction]


class CanonicalTopic(BaseModel):
    label: str = Field(description="Canonical 3-6 word topic name, Title Case, no filler words")
    category: str = Field(description="Technology, Risk & Regulation, Operations, Security, Infrastructure, Healthcare, Human Capital, Financial Services or Cross-Industry")
    description: str = Field(description="One sentence on what this topic covers")
    member_groups: list[int] = Field(description="Indices of the input groups that belong to this topic")


class Canonicalisation(BaseModel):
    topics: list[CanonicalTopic] = Field(description="The final set of distinct topics")


# ---------------------------------------------------------------------------
# Data holders
# ---------------------------------------------------------------------------
@dataclass
class TopicCandidate:
    """A canonical topic assembled from many surface forms."""

    label: str
    slug: str
    category: str = "Cross-Industry"
    description: str = ""
    aliases: list[str] = field(default_factory=list)
    mention_count: int = 0
    article_urls: list[str] = field(default_factory=list)
    entities: list[dict[str, str]] = field(default_factory=list)
    drivers: list[str] = field(default_factory=list)
    first_seen: str | None = None
    last_seen: str | None = None

    @property
    def source_count(self) -> int:
        return len({urlparse(url).netloc.lower().removeprefix("www.")
                    for url in self.article_urls if urlparse(url).netloc})


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:64] or "topic"


def lexical_normalise(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip().lower())
    cleaned = re.sub(r"[\"'`]", "", cleaned)
    for prefix in STOP_PREFIXES:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix) :]
    words = [w for w in cleaned.split() if w not in FILLER_WORDS] or cleaned.split()
    return " ".join(words)[:80]


# ---------------------------------------------------------------------------
# Pass 1: extraction
# ---------------------------------------------------------------------------
EXTRACT_SYSTEM = (
    "You are a research analyst extracting structured signals from news for an IT "
    "research and advisory firm. Topics must be business-relevant themes a CIO would "
    "track (not headlines, not company names). Be consistent: use the same wording for "
    "the same concept across articles."
)


def extract_signals(articles: Sequence[Article], *, batch_size: int = 6) -> list[ArticleExtraction]:
    """Read articles with the LLM and pull out topics + entities."""
    results: list[ArticleExtraction] = []

    for start in range(0, len(articles), batch_size):
        batch = articles[start : start + batch_size]
        listing = "\n\n".join(
            f"[{i}] TITLE: {a.title}\nDATE: {a.published_date or 'unknown'}\nSOURCE: {a.domain}\nEXCERPT: {a.snippet[:520]}"
            for i, a in enumerate(batch)
        )
        prompt = (
            "Extract signals from each article below. Return one item per article, "
            "using the given index.\n\n"
            "Rules:\n"
            "- topics: 1-3 durable themes (e.g. 'AI agent governance', 'data centre power constraints'). "
            "Not headlines. Not company names.\n"
            "- entities: named companies, countries/regions, technologies, regulations, industries.\n"
            "- driver: why this is in the news right now, in one clause.\n\n"
            f"ARTICLES:\n{listing}"
        )
        try:
            batch_result = extract_structured(
                prompt, ExtractionBatch, fast=True, system=EXTRACT_SYSTEM, label="extract-signals"
            )
        except Exception as exc:  # noqa: BLE001 - one bad batch shouldn't kill the sweep
            logger.warning("Extraction batch failed at %d: %s", start, exc)
            continue

        for item in batch_result.items:
            if 0 <= item.index < len(batch):
                item.index += start  # make the index global
                results.append(item)

    return results


# ---------------------------------------------------------------------------
# Pass 2 + 3: normalisation and canonical naming
# ---------------------------------------------------------------------------
def _greedy_cluster(labels: list[str], vectors: np.ndarray, threshold: float) -> list[list[int]]:
    """Greedy cosine clustering, most frequent surface form first.

    Chosen over KMeans/HDBSCAN on purpose: no need to guess *k*, it is
    deterministic, and at a few dozen labels the O(n*k) cost is irrelevant.
    """
    clusters: list[list[int]] = []
    centroids: list[np.ndarray] = []

    for idx in range(len(labels)):
        vector = vectors[idx]
        best, best_score = -1, 0.0
        for cluster_id, centroid in enumerate(centroids):
            score = float(np.dot(vector, centroid))
            if score > best_score:
                best, best_score = cluster_id, score

        if best >= 0 and best_score >= threshold:
            clusters[best].append(idx)
            members = vectors[clusters[best]]
            centroid = members.mean(axis=0)
            norm = np.linalg.norm(centroid) or 1.0
            centroids[best] = centroid / norm
        else:
            clusters.append([idx])
            centroids.append(vector)

    return clusters


CANONICALISE_SYSTEM = (
    "You consolidate market topics for a research and advisory firm. You decide when two "
    "phrasings are the same topic and when they are genuinely different sub-topics. "
    "Distinct sub-topics must stay separate even when they share vocabulary: "
    "'Clinical AI Governance', 'Ambient Clinical AI' and 'AI Drug Discovery' are three "
    "different topics, not one. Merge only true synonyms and rewordings."
)


def _canonicalise_with_llm(
    groups: list[list[str]],
    area_hint: str = "",
) -> list[CanonicalTopic] | None:
    """Let the LLM decide the final topic set.

    Necessary because embedding similarity provably cannot separate these cases:
    measured on this corpus, synonym pairs score 0.871-0.947 while genuinely
    distinct sub-topic pairs score 0.852-0.891. The ranges overlap, so any single
    threshold either merges distinct topics or splits synonyms. The LLM resolves
    exactly the band where vectors are ambiguous.
    """
    listing = "\n".join(
        f"[{i}] {', '.join(sorted(set(group))[:8])}" for i, group in enumerate(groups)
    )
    prompt = (
        "Below are groups of topic phrases extracted from recent news"
        + (f" about {area_hint}" if area_hint else "")
        + ". Consolidate them into the final set of DISTINCT market topics.\n\n"
        "Rules:\n"
        "- Merge groups only when they describe the same underlying topic.\n"
        "- Keep genuinely different sub-topics separate, even in the same domain.\n"
        "- Every group index must appear in exactly one output topic.\n"
        "- Aim for 5-10 distinct topics; do not collapse everything into one.\n\n"
        f"GROUPS:\n{listing}"
    )
    try:
        result = extract_structured(
            prompt, Canonicalisation, fast=False, system=CANONICALISE_SYSTEM, label="canonicalise"
        )
        return result.topics or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM canonicalisation failed: %s", exc)
        return None


def normalise_topics(
    extractions: Iterable[ArticleExtraction],
    articles: Sequence[Article],
    *,
    similarity_threshold: float = 0.93,
    min_mentions: int = 1,
    max_topics: int = 28,
    area_hint: str = "",
) -> list[TopicCandidate]:
    """Collapse raw extracted topics into canonical, de-duplicated topics.

    ``similarity_threshold`` is deliberately high: this pass only removes
    near-identical strings. The semantic judgement happens in the LLM pass,
    because a lower threshold demonstrably merges distinct sub-topics.
    """
    extractions = list(extractions)
    surface_counter: Counter[str] = Counter()
    surface_articles: dict[str, list[int]] = {}
    surface_original: dict[str, str] = {}

    for extraction in extractions:
        for raw in extraction.topics:
            key = lexical_normalise(raw)
            if len(key) < 4:
                continue
            surface_counter[key] += 1
            surface_articles.setdefault(key, []).append(extraction.index)
            surface_original.setdefault(key, raw.strip())

    if not surface_counter:
        return []

    ordered = [k for k, _ in surface_counter.most_common()]
    vectors = np.asarray(embed_texts(ordered, task_type="SEMANTIC_SIMILARITY"), dtype="float32")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    vectors = vectors / norms

    # Pass 2: high-precision lexical/near-duplicate merge.
    groups = _greedy_cluster(ordered, vectors, similarity_threshold)

    # Pass 3: the LLM decides which of those groups are really the same topic.
    group_labels = [[surface_original.get(ordered[i], ordered[i]) for i in g] for g in groups]
    canonical = _canonicalise_with_llm(group_labels, area_hint=area_hint)

    if canonical:
        merged_groups: list[list[int]] = []
        naming: list[CanonicalTopic] = []
        claimed: set[int] = set()
        for topic in canonical:
            indices = [i for i in topic.member_groups if 0 <= i < len(groups) and i not in claimed]
            if not indices:
                continue
            claimed.update(indices)
            merged_groups.append([member for i in indices for member in groups[i]])
            naming.append(topic)
        # Any group the model forgot stays as its own topic rather than vanishing.
        for i, group in enumerate(groups):
            if i not in claimed:
                merged_groups.append(group)
                naming.append(None)  # type: ignore[arg-type]
        clusters, names = merged_groups, naming
    else:
        clusters, names = groups, [None] * len(groups)  # type: ignore[list-item]

    # Build candidates, biggest first.
    candidates: list[TopicCandidate] = []
    naming_by_cluster: dict[int, Any] = {}
    for cluster_position, member_ids in enumerate(clusters):
        members = [ordered[i] for i in member_ids]
        article_ids: list[int] = []
        for m in members:
            article_ids.extend(surface_articles.get(m, []))
        mentions = len({articles[i].url for i in article_ids if 0 <= i < len(articles)})
        if mentions < min_mentions:
            continue

        entities: list[dict[str, str]] = []
        drivers: list[str] = []
        dates: list[str] = []
        urls: list[str] = []
        for article_id in set(article_ids):
            if 0 <= article_id < len(articles):
                article = articles[article_id]
                urls.append(article.url)
                if article.published_date:
                    dates.append(article.published_date)

        for extraction in extractions:
            if extraction.index in set(article_ids):
                drivers.append(extraction.driver)
                for entity in extraction.entities:
                    etype = entity.type.upper().strip()
                    entities.append(
                        {
                            "name": entity.name.strip(),
                            "type": etype if etype in ENTITY_TYPES else "ORGANISATION",
                        }
                    )

        naming = names[cluster_position] if cluster_position < len(names) else None
        if naming is not None:
            label = naming.label.strip() or surface_original.get(members[0], members[0]).title()
            category = naming.category.strip() or "Cross-Industry"
            description = naming.description.strip()
        else:
            label = surface_original.get(members[0], members[0]).title()
            category = "Cross-Industry"
            description = ""

        candidates.append(
            TopicCandidate(
                label=label,
                slug=slugify(label),
                category=category,
                description=description,
                aliases=[surface_original.get(m, m) for m in members],
                mention_count=mentions,
                article_urls=urls,
                entities=entities,
                drivers=drivers[:6],
                first_seen=min(dates) if dates else None,
                last_seen=max(dates) if dates else None,
            )
        )

    candidates.sort(key=lambda c: (c.mention_count, c.source_count), reverse=True)
    candidates = candidates[:max_topics]

    # Slugs must stay unique after renaming.
    seen: set[str] = set()
    for candidate in candidates:
        base = candidate.slug
        suffix = 2
        while candidate.slug in seen:
            candidate.slug = f"{base}-{suffix}"
            suffix += 1
        seen.add(candidate.slug)

    return candidates


# ---------------------------------------------------------------------------
# Momentum
# ---------------------------------------------------------------------------
@dataclass
class Momentum:
    momentum: float          # 0..1 composite
    growth_pct: float | None # None when no measured baseline exists
    velocity: float          # normalised slope of the curve
    recency_days: float
    volume_recent: float
    volume_baseline: float
    series_points: int
    source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "momentum": round(self.momentum, 4),
            "growth_pct": round(self.growth_pct, 2) if self.growth_pct is not None else None,
            "velocity": round(self.velocity, 4),
            "recency_days": round(self.recency_days, 1),
            "volume_recent": round(self.volume_recent, 3),
            "volume_baseline": round(self.volume_baseline, 3),
            "series_points": self.series_points,
            "source": self.source,
        }


def compute_momentum(
    series: Sequence[dict[str, Any]],
    *,
    mention_count: int = 0,
    source_count: int = 0,
    last_seen: str | None = None,
    recent_days: int = 7,
    source: str = "gdelt",
) -> Momentum:
    """Blend four independent signals into one 0-1 surge score.

    * **acceleration** - recent volume vs the earlier baseline (the real signal)
    * **velocity** - slope of the whole curve, so steady climbers still register
    * **breadth** - how many distinct outlets are talking (kills single-source spikes)
    * **recency** - decays topics that were hot last month but have gone quiet

    Weighted rather than multiplied so one weak dimension dampens the score
    instead of zeroing it.
    """
    values = [float(p.get("value") or 0) for p in series]
    points = len(values)

    if points >= 8:
        recent = values[-recent_days:] or values[-1:]
        baseline = values[:-recent_days] or values[:1]
        volume_recent = sum(recent) / len(recent)
        volume_baseline = sum(baseline) / len(baseline)
        growth_pct = ((volume_recent - volume_baseline) / volume_baseline * 100) if volume_baseline > 0 else (100.0 if volume_recent > 0 else 0.0)

        x = np.arange(points, dtype="float64")
        y = np.asarray(values, dtype="float64")
        slope = float(np.polyfit(x, y, 1)[0]) if points > 2 else 0.0
        scale = (y.mean() or 1.0)
        velocity = slope / scale
    else:
        volume_recent = float(mention_count)
        volume_baseline = 0.0
        growth_pct = None
        velocity = 0.0
        source = "derived"

    # --- normalise each component to 0..1 --------------------------------
    breadth_score = min(1.0, (source_count / 6.0) * 0.7 + min(mention_count, 12) / 12.0 * 0.3)

    recency_days = 999.0
    if last_seen:
        try:
            recency_days = max(0.0, (date.today() - datetime.fromisoformat(last_seen[:10]).date()).days)
        except ValueError:
            recency_days = 999.0
    recency_score = float(np.exp(-recency_days / 30.0)) if recency_days < 999 else 0.0

    if source == "derived" or points < 8:
        # No daily volume series. Score from how many Tavily articles landed
        # on this merged topic (all aliases count) and how recently they appeared.
        momentum = 0.70 * breadth_score + 0.30 * recency_score
    else:
        acceleration_score = _squash(growth_pct / 100.0)
        velocity_score = _squash(velocity * 4)
        momentum = (
            0.40 * acceleration_score
            + 0.20 * velocity_score
            + 0.25 * breadth_score
            + 0.15 * recency_score
        )

    return Momentum(
        momentum=float(min(1.0, max(0.0, momentum))),
        growth_pct=growth_pct,
        velocity=velocity,
        recency_days=recency_days,
        volume_recent=volume_recent,
        volume_baseline=volume_baseline,
        series_points=points,
        source=source,
    )


def _squash(value: float) -> float:
    """Map an unbounded signed ratio onto 0..1 with 0 -> 0.5."""
    return float(1.0 / (1.0 + np.exp(-2.5 * value)))
