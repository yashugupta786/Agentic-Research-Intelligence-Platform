"""Knowledge graph over topics, entities and internal documents.

Why a graph rather than a table of keywords: adjacency. When a brand-new topic
surges, the useful question is not only "do we cover it?" but "what do we cover
that sits next to it?". A graph answers that in one hop - so the recommendation
can be *extend research note RN-1042* instead of *start from nothing*, which is
a far more actionable thing to put in front of a research director.

NetworkX runs in-process and the graph is persisted to SQLite, so there is no
graph server to install. The schema (typed nodes, typed edges, edge evidence)
maps 1:1 onto Neo4j if this ever needed to scale.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

import networkx as nx
import numpy as np

from ..data import db

NODE_TYPES = (
    "TOPIC", "COMPANY", "GEO", "TECHNOLOGY", "REGULATION",
    "INDUSTRY", "ORGANISATION", "PERSON", "DOCUMENT", "PRACTICE_AREA",
)

RELATIONS = ("mentions", "covered_by", "published_in", "adjacent_to", "operates_in")

# Entity surface forms that add noise rather than signal.
ENTITY_STOPLIST = {
    "ai", "artificial intelligence", "the company", "company", "government",
    "customers", "enterprise", "technology", "industry", "business", "it",
}


def node_key(node_type: str, name: str) -> str:
    normalised = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return f"{node_type.upper()}:{normalised[:60]}"


@dataclass
class GraphStats:
    nodes: int
    edges: int
    by_type: dict[str, int]
    density: float
    components: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "by_type": self.by_type,
            "density": round(self.density, 5),
            "components": self.components,
        }


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------
def build_graph(
    topics: Sequence[Any],
    coverage_by_slug: dict[str, Any],
    *,
    topic_vectors: dict[str, list[float]] | None = None,
    adjacency_threshold: float = 0.62,
    max_docs_per_topic: int = 4,
) -> nx.MultiDiGraph:
    """Assemble the graph from sensed topics, their entities and matched docs."""
    graph = nx.MultiDiGraph()

    def add_node(node_type: str, label: str, **properties: Any) -> str:
        key = node_key(node_type, label)
        if graph.has_node(key):
            graph.nodes[key]["weight"] = graph.nodes[key].get("weight", 1) + 1
            graph.nodes[key].update({k: v for k, v in properties.items() if v is not None})
        else:
            graph.add_node(key, label=label, type=node_type.upper(), weight=1, **properties)
        return key

    # --- topics and their entities ---------------------------------------
    for topic in topics:
        coverage = coverage_by_slug.get(topic.slug)
        topic_key = add_node(
            "TOPIC",
            topic.label,
            slug=topic.slug,
            category=getattr(topic, "category", None),
            momentum=getattr(topic, "momentum", None),
            coverage=getattr(coverage, "coverage_score", None) if coverage else None,
            mentions=topic.mention_count,
            description=getattr(topic, "description", ""),
        )

        seen_entities: set[str] = set()
        for entity in topic.entities:
            name = (entity.get("name") or "").strip()
            if len(name) < 2 or name.lower() in ENTITY_STOPLIST:
                continue
            key = node_key(entity["type"], name)
            if key in seen_entities:
                continue
            seen_entities.add(key)
            add_node(entity["type"], name)
            _bump_edge(graph, topic_key, key, "mentions")

        # --- documents that cover this topic ------------------------------
        if coverage:
            for doc in (coverage.matched_docs or [])[:max_docs_per_topic]:
                doc_key = add_node(
                    "DOCUMENT",
                    doc["doc_id"],
                    title=doc.get("title"),
                    published_date=doc.get("published_date"),
                    age_days=doc.get("age_days"),
                    doc_type=doc.get("doc_type"),
                )
                _bump_edge(graph, topic_key, doc_key, "covered_by", weight=float(doc.get("score") or 0))

                area = doc.get("practice_area")
                if area:
                    area_key = add_node("PRACTICE_AREA", area)
                    _bump_edge(graph, doc_key, area_key, "published_in")

    # --- topic-to-topic adjacency ---------------------------------------
    if topic_vectors:
        slugs = [t.slug for t in topics if t.slug in topic_vectors]
        if len(slugs) > 1:
            matrix = np.asarray([topic_vectors[s] for s in slugs], dtype="float32")
            norms = np.linalg.norm(matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            matrix = matrix / norms
            similarity = matrix @ matrix.T
            label_by_slug = {t.slug: t.label for t in topics}

            for i in range(len(slugs)):
                for j in range(i + 1, len(slugs)):
                    score = float(similarity[i, j])
                    if score < adjacency_threshold:
                        continue
                    a = node_key("TOPIC", label_by_slug[slugs[i]])
                    b = node_key("TOPIC", label_by_slug[slugs[j]])
                    if graph.has_node(a) and graph.has_node(b):
                        _bump_edge(graph, a, b, "adjacent_to", weight=score)
                        _bump_edge(graph, b, a, "adjacent_to", weight=score)

    return graph


def _bump_edge(graph: nx.MultiDiGraph, src: str, dst: str, relation: str, *, weight: float = 1.0) -> None:
    if graph.has_edge(src, dst, key=relation):
        data = graph.edges[src, dst, relation]
        data["weight"] = max(float(data.get("weight", 0)), weight)
        data["count"] = data.get("count", 1) + 1
    else:
        graph.add_edge(src, dst, key=relation, relation=relation, weight=weight, count=1)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def save_graph(graph: nx.MultiDiGraph) -> None:
    db.execute("DELETE FROM kg_edges")
    db.execute("DELETE FROM kg_nodes")

    db.execute_many(
        "INSERT INTO kg_nodes (key, label, type, weight, properties) VALUES (?,?,?,?,?)",
        [
            (
                key,
                data.get("label", key),
                data.get("type", "TOPIC"),
                float(data.get("weight", 1)),
                db.as_json({k: v for k, v in data.items() if k not in ("label", "type", "weight")}),
            )
            for key, data in graph.nodes(data=True)
        ],
    )
    db.execute_many(
        "INSERT OR IGNORE INTO kg_edges (src, dst, relation, weight, evidence) VALUES (?,?,?,?,?)",
        [
            (src, dst, data.get("relation", key or "related"), float(data.get("weight", 1)), db.as_json({"count": data.get("count", 1)}))
            for src, dst, key, data in graph.edges(keys=True, data=True)
        ],
    )


def load_graph() -> nx.MultiDiGraph:
    graph = nx.MultiDiGraph()
    for row in db.query("SELECT key, label, type, weight, properties FROM kg_nodes"):
        properties = db.from_json(row["properties"], {}) or {}
        graph.add_node(row["key"], label=row["label"], type=row["type"], weight=row["weight"], **properties)
    for row in db.query("SELECT src, dst, relation, weight FROM kg_edges"):
        if graph.has_node(row["src"]) and graph.has_node(row["dst"]):
            graph.add_edge(row["src"], row["dst"], key=row["relation"], relation=row["relation"], weight=row["weight"])
    return graph


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------
def stats(graph: nx.MultiDiGraph | None = None) -> GraphStats:
    graph = graph if graph is not None else load_graph()
    by_type: dict[str, int] = {}
    for _, data in graph.nodes(data=True):
        node_type = data.get("type", "UNKNOWN")
        by_type[node_type] = by_type.get(node_type, 0) + 1

    undirected = graph.to_undirected(as_view=False)
    return GraphStats(
        nodes=graph.number_of_nodes(),
        edges=graph.number_of_edges(),
        by_type=by_type,
        density=nx.density(graph) if graph.number_of_nodes() > 1 else 0.0,
        components=nx.number_connected_components(undirected) if graph.number_of_nodes() else 0,
    )


def to_cytoscape(
    graph: nx.MultiDiGraph | None = None,
    *,
    node_types: Iterable[str] | None = None,
    max_nodes: int = 260,
) -> dict[str, Any]:
    """Serialise for the frontend force-directed view.

    When the graph exceeds ``max_nodes`` the least connected nodes are dropped -
    a hairball communicates nothing, and topics/entities with real connectivity
    are the ones worth showing.
    """
    graph = graph if graph is not None else load_graph()
    wanted = set(t.upper() for t in node_types) if node_types else None

    candidates = [
        (key, data) for key, data in graph.nodes(data=True)
        if wanted is None or data.get("type") in wanted
    ]
    if len(candidates) > max_nodes:
        candidates.sort(key=lambda item: graph.degree(item[0]), reverse=True)
        candidates = candidates[:max_nodes]

    keep = {key for key, _ in candidates}
    nodes = [
        {
            "id": key,
            "label": data.get("label", key),
            "type": data.get("type", "TOPIC"),
            "weight": data.get("weight", 1),
            "degree": graph.degree(key),
            "momentum": data.get("momentum"),
            "coverage": data.get("coverage"),
            "slug": data.get("slug"),
            "category": data.get("category"),
        }
        for key, data in candidates
    ]
    links = [
        {"source": src, "target": dst, "relation": data.get("relation", "related"), "weight": data.get("weight", 1)}
        for src, dst, data in graph.edges(data=True)
        if src in keep and dst in keep
    ]
    return {"nodes": nodes, "links": links, "stats": stats(graph).to_dict()}


def topic_subgraph(slug: str, *, depth: int = 1, graph: nx.MultiDiGraph | None = None) -> dict[str, Any]:
    """Neighbourhood around one topic - what the UI shows when you click a topic."""
    graph = graph if graph is not None else load_graph()
    target = next(
        (key for key, data in graph.nodes(data=True) if data.get("slug") == slug or key == slug),
        None,
    )
    if target is None:
        return {"nodes": [], "links": [], "stats": {}}

    undirected = graph.to_undirected(as_view=False)
    reachable = nx.single_source_shortest_path_length(undirected, target, cutoff=depth)
    sub = graph.subgraph(reachable.keys()).copy()
    payload = to_cytoscape(sub, max_nodes=120)
    payload["center"] = target
    return payload


def central_entities(graph: nx.MultiDiGraph | None = None, *, limit: int = 12) -> list[dict[str, Any]]:
    """Most connected non-topic entities - the actors driving the conversation."""
    graph = graph if graph is not None else load_graph()
    if graph.number_of_nodes() == 0:
        return []

    scores = nx.degree_centrality(graph.to_undirected(as_view=False))
    rows = [
        {
            "key": key,
            "label": data.get("label", key),
            "type": data.get("type"),
            "degree": graph.degree(key),
            "centrality": round(scores.get(key, 0), 4),
        }
        for key, data in graph.nodes(data=True)
        if data.get("type") not in ("TOPIC", "DOCUMENT", "PRACTICE_AREA")
    ]
    rows.sort(key=lambda r: (r["degree"], r["centrality"]), reverse=True)
    return rows[:limit]


def adjacent_covered_topics(slug: str, *, limit: int = 4) -> list[dict[str, Any]]:
    """Topics next to this one that we *do* cover well.

    This is the graph earning its keep: it turns "we have a gap" into "we have
    a gap, and here is the adjacent asset to build on".
    """
    graph = load_graph()
    target = next((k for k, d in graph.nodes(data=True) if d.get("slug") == slug), None)
    if target is None:
        return []

    neighbours: list[dict[str, Any]] = []
    for _, dst, data in graph.out_edges(target, data=True):
        if data.get("relation") != "adjacent_to":
            continue
        node = graph.nodes[dst]
        coverage = node.get("coverage")
        if coverage is None or coverage < 0.4:
            continue

        docs = [
            {"doc_id": graph.nodes[d].get("label"), "title": graph.nodes[d].get("title")}
            for _, d, ed in graph.out_edges(dst, data=True)
            if ed.get("relation") == "covered_by"
        ]
        neighbours.append(
            {
                "label": node.get("label"),
                "slug": node.get("slug"),
                "coverage_score": coverage,
                "similarity": round(float(data.get("weight", 0)), 4),
                "documents": docs[:3],
            }
        )

    neighbours.sort(key=lambda n: n["similarity"], reverse=True)
    return neighbours[:limit]
