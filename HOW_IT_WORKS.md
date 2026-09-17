# How the Gartner case study works

## Start here

We are building a research assistant with two main jobs:

1. **Find research opportunities:** what is the market discussing, and can our existing research answer those topics?
2. **Answer a client question:** what does our existing research say, and which documents support the answer?

Job 1 produces a ranked gap analysis. Job 2 produces a cited answer. They share a prepared internal library but follow different paths.

This document describes the current code. The articles, document contents and results below are **invented teaching data**, not a recorded live run unless explicitly labelled as a verification result. Example objects show the important fields, with routine metadata omitted. Coverage uses the implemented top-50 retrieval, archive filtering, per-topic judge and deterministic scoring path described in Section 5.

Read Sections 1–5 in order for the main flow. Sections 6–8 explain the other paths and your coverage question. Sections 9–10 assess correctness and point to the code.

### Using the redesigned workspace

Start in **Research studio**. Choose **Market scan**, enter a subject such as `AI in healthcare`, and select **Start research**. The selected mode is sent to the backend: when you choose Market scan explicitly, the Planner follows that route rather than asking an LLM to guess the intent.

While the run executes, the progress strip and **Agent activity** cards update from server-sent events. The active card opens automatically. Select a completed card to see its steps, expand **Step evidence** to inspect the details reported by the code, and expand the records under **Actual agent output** to see what that agent returned. **Raw JSON** exposes the same output without presentation formatting. These cards display real backend events; their animations do not simulate agent work. Internal Python `topic_objects` are excluded from JSON, while the serialisable topic records remain visible. An output event captures a deep copy so later agents cannot rewrite an earlier agent's displayed output.

| Screen/control | What it shows | Scope |
|---|---|---|
| Research studio | Current answer, recommendations, evidence and expandable agent outputs | Last completed run in this browser tab |
| Knowledge map | Entities → topics → accepted internal research connections | Last completed **market scan** in this tab |
| Opportunities | Saved scores and research actions | Stored portfolio, which can contain multiple scans |
| Research library | Browse internal documents and inspect research | Prepared library |
| Market signals | Saved external articles | Stored evidence, potentially from multiple scans |
| Operations | Saved runs and provider telemetry | Backend history |
| Sidebar collapse button | Compact icons or full navigation | Preference remembered in this browser |
| Theme button | Light or dark palette | Preference remembered; initially follows the system |

**Read the map in three steps:** (1) check the question above it, (2) choose a topic using **Focus topic**, (3) select a node to highlight and inspect its connections. The initial view shows the first topic, up to five of its most connected entities, and its accepted documents. Enable **Show all entities** to reveal the rest; it does not open the entire portfolio. **All topics in this scan** expands only this query's snapshot. Entity/document checkboxes, zoom and fit controls help inspect it. Shared entities and documents can connect multiple topics. `covered_by` means an accepted coverage candidate, which may be partial or old; it is not a guarantee of full coverage.

The last completed run and scan snapshot use `sessionStorage`, so ordinary navigation and reload preserve them within the same tab. A new browser session may start without a map; run a scan first. SQLite still stores the latest graph for backend/topic-detail endpoints. The main Knowledge map uses the snapshot returned directly by that scan, preventing a later global graph from silently replacing the evidence for the displayed question. The snapshot is bounded to 300 nodes. Practice-area nodes are omitted from the main map for clarity.

**Pause updates** closes the browser stream; it does not cancel the backend computation. Inspect Operations afterward for any completed saved run. Wait for completion before leaving a running scan if you want its result and map retained in this tab. Reduced-motion system preferences disable decorative motion. Supporting page explanations are collapsed under **About this view**; the former Case Study Guide is no longer part of the UI navigation.

### One-page handoff reference

Every row below is an update to the same shared state. Existing fields are retained; a topic list does not replace the original article list. For example, 12 articles can lead to 3 topics, with a many-to-many mapping from topics back to article URLs. That does **not** mean the 12 articles have become three new articles.

| Step | Reads | Adds or updates | Uses a generative LLM? |
|---|---|---|---|
| 1. Planner | Original question and selected mode | Intent, research area, search queries and plan | Auto routing; forced UI routes use code |
| 2. Scout | Research area, queries, refresh flag | Deduplicated articles and per-query search counts | No; calls search/cache |
| 3. Topic Analyst | Articles with title, snippet and metadata | Canonical topics, aliases, article URLs, dates, counts, entities, drivers; internal topic objects | Yes: batched extraction and canonical naming; embeddings between them |
| 4. Attention Analyst | Topics, mapped article/domain counts and dates | Attention/momentum fields on each topic | No; arithmetic |
| 5. Librarian / Coverage | Each topic's label and description, internal index | Coverage map keyed by slug; topic coverage fields | Yes: judges retrieved candidates; scores then use code |
| 6. Graph Curator | Internal topic objects and accepted coverage matches | Graph summary, current question and node/edge snapshot; saves graph | No generative call; embeddings for adjacency |
| 7. Gap Analyst | Topic attention and coverage | Ranked gaps, rule-based action categories, portfolio summary | No; formulas and rules |
| 8. Synthesizer | Question and assembled analysis | Executive answer and recommendations | Yes; deterministic fallback on failure |
| 9. Critic | Answer and available evidence | Groundedness/verdict/issues | Yes when available; does not prove factual correctness |

The detailed sections below show the intermediate structures, prompts, formulas and caveats behind each row. See [UI verification](UI_VERIFICATION.md) for recorded checks and demo queries; the teaching examples in this document are not test results.

## 1. What Gartner actually asked for

I checked `Case_Study_Lead DS.docx`. It asks for an MVP combining these capabilities:

| Requirement | Meaning | Our implementation |
|---|---|---|
| A. Detect emerging topics | Discover themes from public news/search signals | Market scan |
| B. RAG with citations | Retrieve internal research before answering | Ask the library |
| C. Coverage gaps | Compare topic momentum with internal research coverage | Gap analysis within market scan |
| D. Knowledge graph | Organise topics, entities and relationships | Graph exploration |
| E. Agentic orchestration | Plan and coordinate retrieval, analysis and synthesis | Planner, LangGraph and activity trace |

The brief permits a simulated library and flexible technology choices. The listed sources and tools, such as GDELT and Neo4j, are suggestions. We do not have to use all of them or build a particular number of agents.

**Assessment:** the architecture is aligned with the problem. However, current news attention is not a measured historical trend. We discover candidate topics but cannot yet prove they have “surged recently.” That is the principal remaining gap in A and the momentum part of C. We should present a coherent MVP with this limit, not claim a validated demand-forecasting system.

## 2. Setup time versus inference time

Think of a librarian preparing a shelf before a client arrives.

| | Setup time | Inference time |
|---|---|---|
| Trigger | Developer runs the seed script | User submits a question |
| Input | Simulated internal documents, optional archive clippings | Question plus the prepared library |
| Work | Store, split into passages, embed, index | Route, search/retrieve, analyse, answer |
| Output | SQLite text/metadata and FAISS vector files | Gap analysis or cited answer |
| Frequency | Initially and when corpus changes | Every request; cached results may be reused |
| Nine scan agents run? | No | Only on the market-scan path |
| Train Gemini? | No | No |
| Market knowledge graph built? | No | During a market scan |

Embedding converts text into a numerical representation for similarity search. It does not train a new model. Inference embeds a query; it does not rebuild the entire library index for each question.

### S1. Prepare the simulated documents

**Input:** topic profiles/seed content. The seed process reuses cached notes or generates missing simulated notes. It can also load public archive clippings.

**Output to S2:** documents with stable IDs, title, abstract, full body and metadata. Example:

```json
{
  "doc_id": "RN-9001",
  "title": "Clinical AI Governance Playbook",
  "abstract": "A framework for hospital AI oversight, model review and accountability.",
  "body": "Longer research content explaining committees, review processes and responsibilities...",
  "published_date": "2025-05-04",
  "practice_area": "Healthcare & Life Sciences",
  "doc_type": "Research Note"
}
```

This ID/content is fictional. Abstracts already exist in the seed documents. There is **no separate setup stage that summarises every report specifically for the coverage judge**.

### S2. Store and split documents

**Input:** documents from S1.

**Work:** save complete documents to SQLite. Combine abstract and body, split into approximately 130-word sliding windows with 25-word overlap, and prepend the title to each window. These are word windows, not necessarily complete paragraphs.

**Output to S3:** passage text with its parent document ID and chunk number.

```json
[
  {"doc_id": "RN-9001", "chunk_index": 0, "text": "Clinical AI Governance Playbook — A framework for hospital AI oversight..."},
  {"doc_id": "RN-9001", "chunk_index": 1, "text": "Clinical AI Governance Playbook — Model review committees should..."}
]
```

### S3. Embed passages

**Input:** passage texts from S2.

**Work:** call the embedding model; the configured default dimension is 768.

**Output to S4:** vectors and passage identifiers.

```text
(RN-9001, chunk 0) → [0.12, -0.08, 0.31, ... 768 numbers]
(RN-9001, chunk 1) → [0.09, -0.11, 0.28, ... 768 numbers]
```

One document can produce multiple vectors.

### S4. Build and save the index

**Input:** vectors and passage identifiers from S3.

**Work:** build a normalised FAISS index and save its identifier mapping.

| Stored output | Contents | Inference use |
|---|---|---|
| SQLite `documents` | Full text, abstract, title, date, ID | Display text and inspect metadata |
| SQLite `chunks` | Passage text and parent ID | Provide actual evidence to models |
| `library.faiss` | Passage vectors | Find similar passages |
| `library_ids.json` | Vector position → document/chunk ID | Recover text after vector search |

**Setup ends here. There is no user question, news scan, attention score or gap score yet.** Archive clippings can be indexed and browsed but are excluded from internal coverage and internal QA retrieval.

## 3. How one agent gives data to another

The agents share one state object, like a case folder to which each specialist adds findings.

```text
Planner:       question + intent + queries
Scout:         previous fields + articles + scout_stats (per-query counts)
Topic Analyst: previous fields + topics + topic_objects
Attention:     existing topics now also have momentum
Coverage:      previous fields + coverage; topics gain coverage fields
Graph:         previous fields + graph summary and query-scoped snapshot; also saved to SQLite
Gap Analyst:   previous fields + gaps + portfolio
Synthesizer:   previous fields + answer + recommendations
Critic:        previous fields + verdict + critique_issues
```

A node returns updates. LangGraph retains the other fields. The next node can read results from **any earlier node**, not just its immediate predecessor.

For example, Gap Analyst runs after Graph Curator but reads `topics` from Attention and `coverage` from Librarian. It does not calculate a gap from graph node/edge counts.

### Execution order for a market scan

```text
Planner → Scout → Topic Analyst → Attention Analyst
        → Librarian / Coverage → Graph Curator → Gap Analyst
        → Synthesizer → Critic → UI
```

This is sequential. “Agent” means a named responsibility in the workflow. Some agents use an LLM; others only calculate or store data. There is no parallel supervisor coordinating nine autonomous LLMs.

## 4. The single example used throughout

The user selects **Market scan** and enters **What topics related to AI in healthcare have surged recently?** Assume the scan date is **16 September 2026**. The Planner preserves that exact question and separately derives `AI in healthcare` as the web-search subject.

Our invented results contain six distinct articles about clinical AI governance, across four source domains. The latest article is dated 12 September, four days earlier. For clarity, these resolve to one canonical topic.

The internal candidates are:

| Document | Subject | Age | Expected relevance verdict |
|---|---|---:|---|
| RN-9001 | Clinical AI governance playbook | 500 days | Directly covers the topic, but old |
| RN-9002 | AI diagnostic accuracy | 30 days | Tangential: same domain, different question |
| RN-9003 | Ambient clinical documentation | 20 days | Tangential: same domain, different question |

Expected teaching result: **refresh the old governance note**. The two fresh but tangential reports must not make governance look well covered.

## 5. Inference time — the market-scan agents

### Agent 1 — Planner

**Purpose:** choose a workflow.

**Input from UI:**

```json
{
  "question": "What topics related to AI in healthcare have surged recently?",
  "forced_intent": "market_scan"
}
```

**Important distinction about the wording:** the Planner keeps the original question and creates a separate search subject. If the UI mode is explicitly **Market scan**, the current code applies a small deterministic pattern matcher for common question wording:

```text
Question: "What topics related to AI in healthcare have surged recently?"
research_area: "AI in healthcare"
queries:
  - "AI in healthcare"
  - "AI in healthcare emerging trends"
  - "AI in healthcare regulation governance"
```

This is not replacing the user's question. `question` remains available for the final answer and audit trail; `research_area` is only used to focus web search. If the wording does not match a safe pattern, the complete question is used as the fallback subject rather than guessed. In automatic mode, Gemini returns `research_area` and `search_queries`; the backend accepts those values. The activity trace distinguishes the cases: explicit mode says `Intent locked by UI`; automatic mode says `Intent: ...` and reports the model's queries.

**Work:** explicit Market scan mode bypasses LLM classification. The backend keeps the original question unchanged and derives the search subject only for Scout. This is why a trace can show both the user's longer question and the shorter `research_area`.

**Output added to state:**

```json
{
  "question": "What topics related to AI in healthcare have surged recently?",
  "intent": "market_scan",
  "research_area": "AI in healthcare",
  "queries": [
    "AI in healthcare",
    "AI in healthcare emerging trends",
    "AI in healthcare regulation governance"
  ],
  "reasoning": "Path chosen in the UI; search subject extracted from the original question."
}
```

The trace additionally labels the derived value as `query_subject` so the distinction is visible while the run is live. The final API result also returns `queries`, so the exact Planner → Scout handoff is visible without opening the trace. **Next handoff:** Scout reads `queries`, `research_area` and the refresh option; every later agent reads the shared state fields it needs.

In **Let planner decide** mode, Gemini classifies the request and proposes both `research_area` and `search_queries`. The planner prompt explicitly requires those values to be grounded in the current Request and forbids copying a subject from its examples. Its plan is descriptive; the selected LangGraph route determines the fixed task sequence. Use automatic mode to demonstrate model-based routing. Explicit mode does not demonstrate that capability.

### Agent 2 — Signal Scout

**Purpose:** collect recent external evidence.

**Input:** the three focused search queries from Agent 1. The original question is still in shared state, but Scout does not use it when `queries` is present.

**Work:** Tavily news search, up to eight results per query over 45 days. Remove duplicate URLs. Reuse cache when allowed. Scout does not identify topics.

There are three separate counts to read:

```text
per-query count = number Tavily returned for that one query (0–8)
raw total       = sum of the three per-query counts before de-duplication
final articles  = unique URLs after de-duplication across all queries
```

For example, query counts of `8 + 6 + 7 = 21` can become `17 final articles` if four URLs appeared in more than one query. Each progress event in the UI contains `query`, `count` and `cached`; the final Scout event contains `articles` (the de-duplicated count), `raw_articles` and `outlets` (distinct domains). The final API result also exposes this handoff as `scout_stats`:

```json
{
  "scout_stats": {
    "queries": [
      {"query": "AI in healthcare", "count": 8, "cached": false},
      {"query": "AI in healthcare emerging trends", "count": 6, "cached": false},
      {"query": "AI in healthcare regulation governance", "count": 7, "cached": true}
    ],
    "raw_total": 21,
    "unique_articles": 17,
    "outlets": 9
  },
  "signal_source": "live"
}
```

The final `signal_source` is `cache` only when every query came from cache; otherwise it is `live`. If four results are the same URL across queries, they count four times in `raw_total` but once in `unique_articles`.

**Teaching output:**

| Article | Domain | Date | Excerpt meaning |
|---|---|---|---|
| A1 | outlet-a.example | Sep 12 | Clinical AI oversight committees |
| A2 | outlet-a.example | Sep 10 | Accountability for clinical AI decisions |
| A3 | outlet-b.example | Sep 9 | Hospital AI governance processes |
| A4 | outlet-c.example | Sep 8 | Review before clinical deployment |
| A5 | outlet-c.example | Sep 7 | Governance of deployed AI systems |
| A6 | outlet-d.example | Sep 5 | Hospital AI oversight responsibilities |

A1–A6 are shorthand for six different URLs. The `.example` domains are placeholders, not sources.

**One output article object:**

```json
{
  "title": "Hospitals establish clinical AI oversight committees",
  "url": "https://outlet-a.example/a1",
  "domain": "outlet-a.example",
  "snippet": "Hospitals establish committees to review clinical AI models and assign oversight responsibilities.",
  "published_date": "2026-09-12",
  "source": "tavily"
}
```

**State update:** `articles = [six objects]`, plus `scout_stats` (the per-query counts) and `signal_source` describing live/cache use.

**Next handoff:** Topic Analyst receives titles, dates, domains and excerpts. It does not download complete articles. The extraction prompt uses up to 520 excerpt characters per article.

### Agent 3 — Topic Analyst

**Purpose:** identify themes and merge equivalent names.

**Input:** the complete shared state, principally Scout's `articles` list and `research_area`. Each article is a dictionary with `title`, `url`, `domain`, `snippet`, `published_date` and `source`. The node converts those dictionaries into internal `Article` objects. It does not download full articles.

The scoring example in Section 4 uses six articles. This subsection intentionally switches to a 12-article teaching example so batching and flattening are visible. A1–A12 are shorthand for complete article objects; they are not returned as literal strings by the API.

#### 3A. Extract topics from article batches

The implementation uses `batch_size=6`, so 12 articles create two extraction calls:

```text
LLM call 1: A1, A2, A3, A4, A5, A6
LLM call 2: A7, A8, A9, A10, A11, A12
```

For each batch, the prompt contains the title, date, source domain and the first 520 characters of the snippet:

```text
Extract signals from each article below. Return one item per article,
using the given index.

Rules:
- topics: 1-3 durable themes (not headlines or company names)
- entities: named companies, regions, technologies, regulations or industries
- driver: why this is in the news right now, in one clause

ARTICLES:

[0] TITLE: Hospitals establish clinical AI oversight committees
DATE: 2026-09-12
SOURCE: outlet-a.example
EXCERPT: Hospitals are creating committees to review clinical AI models...

[1] TITLE: Healthcare organizations define AI accountability
DATE: 2026-09-11
SOURCE: outlet-b.example
EXCERPT: Healthcare organizations are creating accountability processes...

...four more articles in this batch...
```

The LLM returns one extraction item per article, and each item can contain 1–3 topic phrases:

```json
{
  "items": [
    {
      "index": 0,
      "topics": ["clinical AI governance", "hospital AI oversight"],
      "entities": [{"name": "Example Hospital", "type": "ORGANISATION"}],
      "driver": "Creation of an AI review committee"
    },
    {
      "index": 1,
      "topics": ["clinical AI governance", "AI accountability"],
      "entities": [],
      "driver": "Healthcare organizations formalizing AI responsibility"
    }
  ]
}
```

For the second batch, the model initially returns indexes 0–5 for that batch. The code adds the batch offset, so they become global indexes 6–11. The two call results are combined into one `extractions` list. A failed batch is skipped; the other batch can still be used.

#### 3B. Flatten each article's topic phrases and keep the mapping

If every one of the 12 articles produces two phrases, there are 24 raw phrase records. Conceptually:

```text
article 0 → AI accountability
article 0 → AI agent governance
article 1 → Agentic AI
article 1 → Healthcare agentic AI
article 2 → AI accountability
article 2 → Clinical AI governance
...through article 11...
```

The code walks that nested list and builds three Python dictionaries while it flattens it:

```python
surface_counter: dict[str, int]
surface_articles: dict[str, list[int]]
surface_original: dict[str, str]
```

Example after processing some of the 24 records:

```python
surface_counter = {
    "ai accountability": 3,
    "ai governance": 3,
    "agentic ai": 2,
    "healthcare agentic ai": 1,
}

surface_articles = {
    "ai accountability": [0, 2, 8],
    "ai governance": [0, 1, 8],
    "agentic ai": [2, 9],
    "healthcare agentic ai": [2],
}

surface_original = {
    "ai accountability": "AI Accountability",
    "ai governance": "AI governance trends",
    "agentic ai": "Agentic AI",
    "healthcare agentic ai": "Healthcare agentic AI",
}
```

`surface_counter` counts appearances, `surface_articles` records article indexes, and `surface_original` preserves the first original wording. The article-index mapping is retained even when phrases are cleaned or deduplicated.

#### 3C. Lexically clean the phrases

The function `lexical_normalise` only cleans text. It does not decide semantic similarity. It lowercases, removes quotes, collapses whitespace, removes prefixes such as `future of` and `impact of`, removes filler words such as `trend`, `market` and `news`, and truncates the result to 80 characters.

```text
"AI Accountability"             → "ai accountability"
"AI governance trends"          → "ai governance"
"Future of AI governance"       → "ai governance"
"AI   governance   news"         → "ai governance"
```

The 24 raw records remain represented by their article indexes, but repeated cleaned keys share one entry in `surface_counter` and `surface_articles`. If 24 raw phrases produce 16 unique cleaned keys, the next stage embeds 16 labels, not 24.

```python
ordered = [
    "ai accountability",
    "ai governance",
    "agentic ai",
    "healthcare agentic ai",
    "ai diagnostic accuracy",
    "ambient clinical documentation",
    # ...remaining unique cleaned keys...
]
```

`ordered` is sorted by phrase frequency. Its position is a phrase index used by clustering; it is not an article index.

#### 3D. Embed and cluster the unique cleaned labels

The code embeds every label in `ordered`, normalises the vectors, and calls `_greedy_cluster` with the default similarity threshold `0.93`:

```python
vectors = embed_texts(ordered, task_type="SEMANTIC_SIMILARITY")
groups = _greedy_cluster(ordered, vectors, threshold=0.93)
```

The clustering is greedy. The first vector starts Group 0. Each later vector is compared with the current centroid of every existing group using:

```python
score = float(np.dot(vector, centroid))
```

Because the vectors and centroids are normalised, this dot product is cosine similarity. The vector joins the group with the highest score when that score is at least 0.93. Otherwise it starts a new group. When a vector joins, the group centroid is recalculated as the normalised mean of its member vectors.

For example:

```text
phrase 0: ai accountability
    no groups exist → create Group 0

phrase 1: ai governance
    score against Group 0 = 0.95 → join Group 0

phrase 2: agentic ai
    score against Group 0 = 0.81 → create Group 1

phrase 3: healthcare agentic ai
    score against Group 0 = 0.70
    score against Group 1 = 0.96 → join Group 1

phrase 4: ai diagnostic accuracy
    best score against existing groups = 0.64 → create Group 2
```

The example scores illustrate the algorithm; live values come from the configured embedding model. The resulting groups are lists of indexes into `ordered`:

```python
groups = [
    [0, 1],  # ai accountability, ai governance
    [2, 3],  # agentic ai, healthcare agentic ai
    [4],     # ai diagnostic accuracy
]
```

The number of groups is not predetermined. With 16 unique cleaned labels there can be between 1 and 16 groups. The final topic list is capped at 14 candidates in the live Topic Analyst node.

#### 3E. Canonicalize the groups with a second LLM call

The second LLM does not receive the vectors or the original articles. Python converts the group indexes into phrase text:

```text
GROUPS:

[0] ai accountability, ai governance
[1] agentic ai, healthcare agentic ai
[2] ai diagnostic accuracy
```

The second LLM names distinct topics and specifies which phrase groups belong to each topic. Its structured output is:

```json
{
  "topics": [
    {
      "label": "AI Governance",
      "category": "Risk & Regulation",
      "description": "Oversight and accountability for AI systems.",
      "member_groups": [0]
    },
    {
      "label": "Healthcare Agentic AI",
      "category": "Healthcare",
      "description": "Autonomous AI systems used in healthcare.",
      "member_groups": [1]
    },
    {
      "label": "AI Diagnostic Accuracy",
      "category": "Healthcare",
      "description": "Accuracy and performance evaluation of AI diagnostics.",
      "member_groups": [2]
    }
  ]
}
```

The LLM can merge groups by returning multiple group IDs:

```json
{
  "label": "Healthcare AI Governance",
  "category": "Healthcare",
  "description": "Governance and accountability for healthcare AI systems.",
  "member_groups": [0, 1]
}
```

`member_groups` contains embedding-group IDs, not article IDs. If the LLM fails or omits a valid group, the code keeps unclaimed groups as fallback topics rather than silently dropping them.

#### 3F. Map the canonical topics back to articles

For `AI Governance` with `member_groups: [0]`, the code expands Group 0 to its phrase indexes `[0, 1]`, then to its phrases:

```text
ordered[0] → ai accountability
ordered[1] → ai governance
```

It then looks up article indexes:

```text
ai accountability → articles [0, 2, 8]
ai governance     → articles [0, 1, 8]
```

The combined indexes are `[0, 2, 8, 0, 1, 8]`. The code uses the actual article URLs and removes duplicates, leaving articles A1, A2, A3 and A9. It also collects their dates, entities and drivers.

#### 3G. Final output of Agent 3

Agent 3 returns canonical topic records, not replacement article records:

```json
{
  "topics": [
    {
      "slug": "ai-governance",
      "label": "AI Governance",
      "category": "Risk & Regulation",
      "description": "Oversight and accountability for AI systems.",
      "aliases": ["AI accountability", "AI governance"],
      "entities": [
        {"name": "Example Hospital", "type": "ORGANISATION"},
        {"name": "EU AI Act", "type": "REGULATION"}
      ],
      "drivers": ["Hospitals are creating AI oversight committees."],
      "mention_count": 3,
      "source_count": 3,
      "first_seen": "2026-09-04",
      "last_seen": "2026-09-12",
      "article_urls": [
        "https://outlet-a.example/a1",
        "https://outlet-b.example/a2",
        "https://outlet-c.example/a3"
      ]
    },
    {
      "slug": "healthcare-agentic-ai",
      "label": "Healthcare Agentic AI",
      "category": "Healthcare",
      "description": "Autonomous AI systems used in healthcare.",
      "aliases": ["Agentic AI", "Healthcare agentic AI"],
      "entities": [{"name": "Example Hospital", "type": "ORGANISATION"}],
      "drivers": ["Hospitals are piloting autonomous clinical agents."],
      "mention_count": 4,
      "source_count": 3,
      "first_seen": "2026-09-03",
      "last_seen": "2026-09-11",
      "article_urls": ["https://outlet-d.example/a4"]
    },
    {
      "slug": "ai-diagnostic-accuracy",
      "label": "AI Diagnostic Accuracy",
      "category": "Healthcare",
      "description": "Accuracy and performance evaluation of AI diagnostics.",
      "aliases": ["AI diagnostic accuracy", "Diagnostic model performance"],
      "entities": [{"name": "Diagnostic AI", "type": "TECHNOLOGY"}],
      "drivers": ["Providers are measuring diagnostic model performance."],
      "mention_count": 3,
      "source_count": 2,
      "first_seen": "2026-09-02",
      "last_seen": "2026-09-10",
      "article_urls": ["https://outlet-e.example/a8"]
    }
  ],
  "topic_objects": [
    "internal TopicCandidate objects; these also contain the same entities, drivers and full article mapping"
  ],
  "normalisation": {
    "raw_mentions": 24,
    "canonical": 3,
    "merged": 5
  }
}
```

The original 12 article objects remain in shared state. If the second LLM keeps three groups separate, the output contains three topic records. If it merges all three groups, the output contains one topic record. An article can support more than one topic; topic records hold article references, while the global `articles` list remains available for evidence and display.

**Where entities come from and where they go:** the first Topic Analyst LLM call returns entities for each article inside `ArticleExtraction.entities`. During normalisation, the code follows each canonical topic back to its article indexes and aggregates those entities into the internal `TopicCandidate.entities` list (and aggregates the article drivers into `TopicCandidate.drivers`). The serialisable `topics` records now expose up to 12 entities and 6 drivers per topic, while `topic_objects` retains the internal objects for downstream agents. Graph Curator reads `topic_objects` and persists the entities as graph nodes plus `mentions` edges in SQLite; they are also available through the graph API. Entities are not stored as a separate column in the `topics` table.

**Next handoffs:** Attention reads counts and dates from `topic_objects`; Coverage uses each topic's label and description; Graph Curator uses entities and matched documents. The live Topic Analyst keeps at most 14 final topic candidates.

### Agent 4 — Attention Analyst

**Purpose:** turn the canonical topic evidence into a 0–1 recent-news attention score. This node does not search, extract topics, read the internal library or call an LLM in the current live path.

**Input:** the complete shared state, principally `topic_objects` from Agent 3 and the serialisable `topics` dictionaries already in state. For each candidate it reads:

```json
{
  "slug": "ai-governance",
  "label": "AI Governance",
  "mention_count": 5,
  "source_count": 4,
  "last_seen": "2026-09-12"
}
```

It does not use the raw article text directly. The article count, distinct-domain count and latest date were already computed by Topic Analyst.

#### What the counts mean

These counts come from Agent 3's mapping from canonical topic → article indexes → article URLs. They are not new counts obtained by Attention Analyst:

- `mention_count` is the number of **unique article URLs** mapped to the topic. It is the implementation's article count. If the same URL is attached twice, it is counted once.
- `source_count` is the number of **distinct website domains** in those URLs. The domain is taken from the URL, with `www.` removed.
- `raw_mentions` in Agent 3's `normalisation` object is different: it counts extracted topic phrases (for example, 24 phrases from 12 articles), before grouping. It is not the value used as `mention_count`.

For example:

| URLs mapped to one topic | `mention_count` | `source_count` |
|---|---:|---:|
| `a.com/1`, `a.com/2`, `a.com/3` | 3 | 1 |
| `a.com/1`, `b.com/1`, `c.com/1` | 3 | 3 |
| `a.com/1`, `a.com/2`, `b.com/1` | 3 | 2 |

Thus, three articles from one website mean three articles but only one independent outlet. Three articles from three websites mean three articles and three outlets.

**Work:** for every `TopicCandidate`, call `compute_momentum` with an empty historical series and `source="derived"`. With no time series, the current formula is:

```text
breadth = min(1, 0.7 × source_count/6 + 0.3 × min(mention_count, 12)/12)
recency = exp(−recency_days/30)
momentum = 0.7 × breadth + 0.3 × recency
```

There are two separate weight pairs in this calculation:

1. In `breadth`, `0.7` gives more weight to distinct-outlet diversity and `0.3` gives weight to article volume. Six outlets is the domain reference value, not a separate cap: `source_count/6` can exceed one. Article volume is capped at 12; the combined breadth is capped at 1. For example, 8 domains and 8 articles yield `min(1, 0.7×8/6 + 0.3×8/12) = 1`.
2. In `momentum`, `0.7` gives more weight to breadth and `0.3` gives weight to recency.

For one concrete topic with three articles from two websites and a latest publication date of 12 September 2026:

```text
mention_count = 3
source_count = 2

breadth = 0.7 × (2/6) + 0.3 × (3/12)
        = 0.2333 + 0.0750
        = 0.3083

recency_days = 16 September − 12 September = 4
recency = exp(−4/30) = 0.8752

momentum = 0.7 × 0.3083 + 0.3 × 0.8752
         = 0.4784
```

This is an attention score for the current Tavily sample. It is not a claim that the topic is growing over time. Because the live path passes an empty historical series, `volume_recent` is set to `mention_count`, `volume_baseline` is `0`, `growth_pct` is `null`, and `velocity` is `0`.

Using the teaching scan date 16 September 2026:

```text
AI Governance:
  breadth = 0.7 × 4/6 + 0.3 × 5/12 = 0.5917
  recency = exp(−4/30) = 0.8752
  momentum = 0.7 × 0.5917 + 0.3 × 0.8752 = 0.6767

Healthcare Agentic AI:
  breadth = 0.7 × 3/6 + 0.3 × 4/12 = 0.4500
  recency = exp(−5/30) = 0.8465
  momentum = 0.5689

AI Diagnostic Accuracy:
  breadth = 0.7 × 2/6 + 0.3 × 3/12 = 0.3083
  recency = exp(−6/30) = 0.8187
  momentum = 0.4615
```

These calculations use the dates in the teaching example. A missing or invalid date receives no recency credit. Since the live path has no historical series, `growth_pct` is `null`, `velocity` is zero and `volume_baseline` is zero.

**Output:** the node returns `{"topics": topics_out}`. It starts each existing topic dictionary and adds the fields returned by `Momentum.to_dict`, then sorts topics by descending momentum:

```json
{
  "topics": [
    {
      "slug": "ai-governance",
      "label": "AI Governance",
      "category": "Risk & Regulation",
      "description": "Oversight and accountability for AI systems.",
      "aliases": ["AI accountability", "AI governance"],
      "mention_count": 5,
      "source_count": 4,
      "momentum": 0.6767,
      "growth_pct": null,
      "velocity": 0.0,
      "recency_days": 4.0,
      "volume_recent": 5.0,
      "volume_baseline": 0.0,
      "series_points": 0,
      "source": "derived",
      "series": []
    },
    {
      "slug": "healthcare-agentic-ai",
      "label": "Healthcare Agentic AI",
      "momentum": 0.5689,
      "growth_pct": null,
      "recency_days": 5.0,
      "volume_recent": 4.0,
      "volume_baseline": 0.0,
      "source": "derived",
      "series": []
    },
    {
      "slug": "ai-diagnostic-accuracy",
      "label": "AI Diagnostic Accuracy",
      "momentum": 0.4615,
      "growth_pct": null,
      "recency_days": 6.0,
      "volume_recent": 3.0,
      "volume_baseline": 0.0,
      "source": "derived",
      "series": []
    }
  ]
}
```

The category, description, aliases and article URLs from Agent 3 remain on each topic; the example abbreviates them for the second and third topics. The node also stores the scores and signal links in SQLite.

**Next handoff:** Coverage/Librarian reads each topic's `slug`, `label` and `description` to search the internal library. It does not use `momentum` to decide whether a document is relevant. Gap Analyst later reads both `momentum` and the coverage result to calculate the research gap.

### Agent 5 — Librarian acting as Coverage Analyst

**Purpose:** determine whether our research addresses each topic and how usable that coverage is today.

This agent contains three operations: **retrieve candidates → judge relevance → calculate coverage**. The judge is inside this agent, not a separate agent after it.

#### 5A. Retrieve candidate evidence

**Input:**

```json
{
  "topic_slug": "clinical-ai-governance",
  "topic_label": "Clinical AI Governance",
  "description": "Oversight, review and accountability for clinical AI systems.",
  "top_k": 5
}
```

Construct and embed this query:

```text
Clinical AI Governance. Oversight, review and accountability for clinical AI systems.
```

Search the FAISS index built at setup. With `top_k=5`, request 50 passage neighbours, or fewer if the index has fewer vectors. Recover text and metadata using the vector-to-passage mapping.

The 50 is an **over-retrieval pool**, not the number of passages sent to the LLM. The current code performs this sequence:

```text
up to 50 raw passage hits
  → remove passages whose parent document is `Syndicated Archive`
  → keep only the highest-scoring passage for each document
  → remove documents below similarity 0.62
  → keep at most 10 unique candidate documents
  → send those candidates to the LLM judge
  → keep at most 5 accepted documents for the final coverage result
```

The reason for starting with 50 is that one document can produce many chunks. A five-passage search could be five chunks from one long report; the larger pool gives the code enough recall to find several distinct documents after archive filtering and de-duplication. The value 50 and the thresholds are prototype heuristics and should be calibrated against a labelled retrieval set for production.

**Teaching retrieval output:**

| Document | Chunk | Similarity | Passage subject |
|---|---:|---:|---|
| RN-9001 | 0 | 0.81 | Clinical AI governance |
| RN-9001 | 1 | 0.78 | More governance detail |
| RN-9002 | 0 | 0.77 | AI diagnostic accuracy |
| RN-9003 | 0 | 0.75 | Ambient documentation |
| AR-7001 | 0 | 0.79 | Syndicated archive clipping (removed) |

The vector search returns `Hit` records (document ID, chunk index, score, text and metadata), not final answers. The archive row is removed first. RN-9001's two chunks are then collapsed to one record, retaining score 0.81. Any record below 0.62 is removed. The remaining records are sorted by score and capped at ten unique candidate documents.

**Output to the judge:** three unique candidates in this example. The original 50 passages are not passed to the LLM. Similarity has not yet established coverage; a high score can mean the same broad domain rather than the same specific topic.

#### 5B. Ask the LLM to judge relevance

This is **one Gemini call per topic**, not one call per chunk and not one call for all three topics together. The model does not compute the 0–1 coverage number. It only labels each candidate document.

**Exact system prompt** (`JUDGE_SYSTEM` in `backend/app/services/coverage.py`):

```text
You audit research coverage for an IT research and advisory firm. Given a market topic
and a set of internal research documents that a vector search returned, you decide for
each document whether it actually answers the topic.

Be strict. Vector search returns anything in the same broad domain, and 'about healthcare
AI' is not the same as 'about clinical AI governance'. Use:
- covers      : squarely addresses this topic; a client asking about it would be satisfied
- partial     : touches the topic as a section or adjacent angle, but is not about it
- tangential  : same domain, different subject
- unrelated   : does not belong in this result set at all

Most same-domain documents are tangential. Reserve 'covers' for genuine matches.
```

**Exact user prompt** (built in `judge_candidates`):

```text
TOPIC: {topic_label}
WHAT THE TOPIC COVERS: {description or 'n/a'}

Rule on all {N} documents below. Return exactly one verdict per document id.

DOCUMENTS
[{doc_id}] {title}
(practice area: {practice_area}; type: {doc_type}; similarity: {score})
{first 420 characters of the best retrieved passage}

...one block per candidate, up to 10...
```

Filled teaching example for **one** of the three topics:

```text
TOPIC: Clinical AI Governance
WHAT THE TOPIC COVERS: Oversight, review and accountability for clinical AI systems.

Rule on all 3 documents below. Return exactly one verdict per document id.

DOCUMENTS
[RN-9001] Clinical AI Governance Playbook
(practice area: Healthcare & Life Sciences; type: Research Note; similarity: 0.81)
<first 420 characters of the governance passage>

[RN-9002] AI Diagnostic Accuracy
(practice area: Healthcare & Life Sciences; type: Research Note; similarity: 0.77)
<first 420 characters of the diagnostic-accuracy passage>

[RN-9003] Ambient Clinical Documentation
(practice area: Healthcare & Life Sciences; type: Research Note; similarity: 0.75)
<first 420 characters of the documentation passage>
```

The coverage judge also does not receive the external Scout article bodies in the current implementation. Agent 3's canonical label and description define the topic boundary; the retrieved internal passages are the documents being judged. Scout currently stores article metadata and snippets rather than downloaded full article bodies, so passing a full external article would require an additional retrieval step. Representative external snippets could be added later to strengthen topic disambiguation, but that is not a hidden step in the current path.

**It does not currently explicitly pass the full abstract as a separate summary field or the publication date to the judge.** A retrieved passage can include abstract text because abstracts were included during chunking. Abstracts are loaded separately for the final coverage output/UI. Python handles age afterwards.

**LLM output:**

```json
{
  "verdicts": [
    {"doc_id": "RN-9001", "verdict": "covers", "reason": "Directly addresses clinical AI oversight and accountability."},
    {"doc_id": "RN-9002", "verdict": "tangential", "reason": "Evaluates diagnostic performance, not governance."},
    {"doc_id": "RN-9003", "verdict": "tangential", "reason": "Addresses documentation workflows, not governance."}
  ]
}
```

Normally this is one judge call per topic, assessing its candidate documents together. Fourteen topics can require up to fourteen judge calls, subject to candidates and failure cooldown. It is not one call for every passage in the library.

**Output to the calculator:** verdicts and reasons keyed by document ID. The LLM does not calculate the final numeric coverage score in the current design.

#### 5B.1 Repeat for every topic

Agent 5 runs the same retrieval → judge → calculation sequence independently for every canonical topic. It does not concatenate three topics into one query and it does not make one verdict for the whole list:

```text
AI Governance
  label + description → search → candidate documents → one judge call → one Coverage result

Healthcare Agentic AI
  label + description → search → candidate documents → one judge call → one Coverage result

AI Diagnostic Accuracy
  label + description → search → candidate documents → one judge call → one Coverage result
```

With three topics there are up to three query embeddings, three searches and three judge calls (a topic with no qualifying candidates has no judge call). A document may appear in more than one topic's candidate list; the judge evaluates it against each topic's own definition.

#### 5C. Calculate usable coverage in Python

The LLM never returns `coverage_score`. Python maps each verdict to a number, ages it, then mixes “how many usable notes” with “how good is the best one.”

**Step 1 — verdict → relevance weight**

| Judge said | Meaning | Weight | Kept as coverage? |
|---|---|---:|---|
| `covers` | This note *is* about the topic | 1.0 | Yes |
| `partial` | Touches it, not the main subject | 0.5 | Yes |
| `tangential` | Same domain, different question | 0.0 | No |
| `unrelated` | Should not have been retrieved | 0.0 | No |

Why: FAISS only knows “healthcare AI lives near healthcare AI.” A radiology-accuracy note can score 0.77 against “Clinical AI Governance.” Without this mapping, every healthcare topic would look fully covered.

**Step 2 — age the remaining notes (`usable_weight`)**

```text
freshness = 1.0  if age ≤ 120 days
            0.0  if age ≥ 450 days
            linear between those two dates

usable_weight = relevance_weight × (0.25 + 0.75 × freshness)
```

Why `0.25 + 0.75 × freshness`: a perfect current `covers` note is worth 1.0. The same note at 500 days still keeps a **0.25 floor** (background value) so old research is not treated as nothing, but it **cannot** look like we are currently covered. Tests: five fresh `covers` notes → 1.00; five 500-day `covers` notes → 0.25.

**Step 3 — turn the list of usable weights into one 0–1 score**

```text
coverage = 0.6 × min(1, sum(usable_weights) / 5)
         + 0.4 × max(usable_weights)
```

Why these two parts:

- **60% depth.** Five current, direct notes is a full shelf (`DEPTH_SATURATION = 5`). One current `covers` note is only `1/5` of that shelf.
- **40% best note.** If we have one excellent current note, that still counts for something even though depth is thin. One fresh `covers` note: `0.6×0.20 + 0.4×1.0 = 0.52`.

Why not use FAISS 0.81 as coverage: similarity is “nearby in embedding space,” not “answers this topic today.”

Only RN-9001 is accepted in our example. It is 500 days old:

```text
relevance = 1.0
freshness = 0.0
usable_weight = 1.0 × (0.25 + 0.75 × 0) = 0.25
coverage = 0.6 × (0.25/5) + 0.4 × 0.25
         = 0.03 + 0.10
         = 0.13
```

The two fresh tangential notes contribute zero. They cannot hide the stale governance gap.

**Final output added to shared state:**

```json
{
  "coverage": {
    "clinical-ai-governance": {
      "topic_slug": "clinical-ai-governance",
      "doc_count": 1,
      "strong_matches": 1,
      "best_score": 0.81,
      "mean_score": 0.81,
      "newest_doc_date": "2025-05-04",
      "staleness_days": 500,
      "coverage_score": 0.13,
      "judged_by": "llm",
      "candidates_judged": 3,
      "rejected": 2,
      "matched_docs": [{
        "doc_id": "RN-9001",
        "title": "Clinical AI Governance Playbook",
        "score": 0.81,
        "age_days": 500,
        "verdict": "covers",
        "reason": "Directly addresses clinical AI oversight and accountability.",
        "judged_by": "llm"
      }]
    }
  }
}
```

`judged_by: llm` describes the relevance assessment, not who calculated the number. Matched documents also include abstracts and other metadata, omitted above for readability.

**Stored:** coverage and accepted matches in SQLite. The topic dictionary also gains `coverage_score`, `doc_count`, `staleness_days`, `matched_docs` and `coverage_method`.

For three topics, the state therefore contains three independent coverage entries:

```json
{
  "coverage": {
    "ai-governance": {"coverage_score": 0.42, "doc_count": 2, "matched_docs": ["RN-1001", "RN-1002"], "judged_by": "llm"},
    "healthcare-agentic-ai": {"coverage_score": 0.38, "doc_count": 1, "matched_docs": ["RN-1004"], "judged_by": "llm"},
    "ai-diagnostic-accuracy": {"coverage_score": 0.55, "doc_count": 2, "matched_docs": ["RN-1003", "RN-1002"], "judged_by": "llm"}
  }
}
```

The corresponding three dictionaries in `topics` keep all Agent 3 and Agent 4 fields and gain `coverage_score`, `doc_count`, `staleness_days`, `matched_docs` and `coverage_method`. The raw 50 passage hits and the rejected documents are not copied into the final topic list; accepted document evidence and judge reasons are retained in `matched_docs`.

**Next handoffs:** Graph Curator uses accepted documents to create relationships. Gap Analyst later uses coverage/staleness. Synthesizer later reads document IDs/ages. They do not repeat retrieval.

**Failures:** an unavailable index is unknown coverage; that topic is omitted from the current gap ranking. Missing judge verdicts currently use a labelled conservative proxy: similarity ≥ 0.74 receives partial weight, otherwise zero. Five fresh proxy matches cannot exceed 0.50 coverage. This is not a confirmed semantic judgement. No accepted matches is not proof that the entire library has no relevant research.

### Agent 6 — Graph Curator

**Purpose:** organise the relationships between topics, entities and matched research.

Graph Curator is a Python graph-building step. It does not call an LLM and it does not retrieve documents again. It combines two outputs already present in shared state:

```text
Agent 3 `topic_objects` → canonical topics, entities and topic metadata
Agent 5 `coverage`      → accepted internal documents for each topic
```

**Input from shared state:**

```text
topic_objects from Agent 3:
  Clinical AI Governance → entity Example Hospital
  Healthcare Agentic AI  → entity Example Hospital

coverage from Agent 5:
  Clinical AI Governance → matched document RN-9001
  Healthcare Agentic AI  → matched document RN-1004
```

The node uses `topic_objects` as its source of truth for graph construction because the graph code consumes the internal `TopicCandidate` objects. The serialisable `topics` list now exposes a bounded copy of each topic's entities and drivers for the API, while `topic_objects` retains the complete internal lists. It reads the `coverage` map by topic slug and reconstructs a small `Coverage` object for each entry. The raw external article list, raw passages and rejected coverage candidates are not inputs to this node.

#### 6A. Create topic, entity, document and practice-area nodes

For every topic, Python creates one `TOPIC` node with properties including:

```text
slug, category, momentum, coverage score, mention count, description
```

For every extracted entity on that topic, it creates an entity node and a directed `mentions` edge:

```text
[TOPIC:clinical_ai_governance]
    --mentions--> [ORGANISATION:example_hospital]
```

Entity names are de-duplicated within a topic. Very generic names such as `AI`, `company`, `technology` and `industry` are ignored by the entity stoplist. A document from Agent 5 creates a `DOCUMENT` node and a `covered_by` edge whose weight is that document's vector similarity:

```text
[TOPIC:clinical_ai_governance]
    --covered_by (weight 0.81)--> [DOCUMENT:rn_9001]
```

The document's practice area creates a `PRACTICE_AREA` node and a `published_in` edge:

```text
[DOCUMENT:rn_9001]
    --published_in--> [PRACTICE_AREA:healthcare_life_sciences]
```

These are separate relationship types. The current implementation creates `topic → entity`, `topic → accepted internal document` and `document → practice area` edges. It does **not** create a direct `entity → document` edge; an entity and a document are connected through their shared topic node. Only Agent 5's accepted matches (up to four per topic) become `covered_by` edges. Rejected or merely retrieved candidates do not enter the graph.

At most four accepted documents from Agent 5 are attached to each topic for the graph. A document can be attached to several topics when coverage accepted it for each topic.

#### 6B. Add topic-to-topic adjacency

When there is more than one topic, the node makes one batched embedding call using exactly:

```text
"<topic label>. <topic description>"
```

For three topics this produces three vectors and three pair comparisons: topic 1–2, topic 1–3 and topic 2–3. Vectors are L2-normalised and compared with a dot product, which is cosine similarity after normalisation. If the score is at least `0.62`, Graph Curator adds an `adjacent_to` edge in both directions:

```text
[TOPIC:ai_governance]
    --adjacent_to (weight 0.68)--> [TOPIC:healthcare_agentic_ai]
[TOPIC:healthcare_agentic_ai]
    --adjacent_to (weight 0.68)--> [TOPIC:ai_governance]
```

Scores below `0.62` create no adjacency edge. This step does not merge topics or create new topic names; it only records that two already-canonical topics are semantically near each other. If the embedding call fails, the topic/entity/document graph is still built without adjacency edges.

#### 6C. Worked three-topic example

Suppose Agent 3 supplies three topics and Agent 5 supplies these accepted documents:

```text
AI Governance             → RN-1001, RN-1002
Healthcare Agentic AI     → RN-1004
AI Diagnostic Accuracy    → RN-1003, RN-1002
```

The graph may contain:

```text
TOPIC nodes:         AI Governance, Healthcare Agentic AI, AI Diagnostic Accuracy
ENTITY nodes:        Example Hospital, EU AI Act, Clinical Agent Platform, Diagnostic AI
DOCUMENT nodes:      RN-1001, RN-1002, RN-1003, RN-1004
PRACTICE_AREA nodes: Healthcare & Life Sciences, Healthcare
```

Example relationships:

```text
AI Governance          --mentions----> Example Hospital
AI Governance          --mentions----> EU AI Act
AI Governance          --covered_by--> RN-1001
AI Governance          --covered_by--> RN-1002
Healthcare Agentic AI  --covered_by--> RN-1004
AI Diagnostic Accuracy --covered_by--> RN-1003
AI Diagnostic Accuracy --covered_by--> RN-1002
RN-1001                --published_in-> Healthcare & Life Sciences
AI Governance          --adjacent_to-> Healthcare Agentic AI   (if cosine ≥ 0.62)
```

The exact node and edge counts depend on the entities, accepted documents and topic similarities in the run. Shared entities or documents are represented by one graph node and can have edges from several topics.

**Work:** Python builds this `networkx.MultiDiGraph`. It uses no generative entity-extraction call. A batched embedding call is only for topic adjacency.

**Teaching graph output:**

```text
[Clinical AI Governance] --mentions----> [Example Hospital]
[Clinical AI Governance] --covered_by--> [RN-9001]
[RN-9001] ---------------published_in--> [Healthcare & Life Sciences]
```

`covered_by` records an accepted match. It does not guarantee current or complete coverage: partial/proxy matches can also appear. Inspect the coverage record for verdict and age.

**Stored/output:** nodes and edges go to SQLite. A `graph` object with counts, central entities, the original `question`, and a `snapshot` of this run's nodes/links is added to shared state. The main Knowledge map uses that snapshot. Backend graph endpoints still retrieve the latest saved graph for other views.

The state carries the following summary plus `question` and `snapshot`. This abbreviated teaching object omits the snapshot array for readability:

```json
{
  "graph": {
    "nodes": 13,
    "edges": 16,
    "by_type": {
      "TOPIC": 3,
      "ORGANISATION": 1,
      "REGULATION": 1,
      "TECHNOLOGY": 2,
      "DOCUMENT": 4,
      "PRACTICE_AREA": 2
    },
    "density": 0.10256,
    "components": 1,
    "central_entities": [
      {"label": "Example Hospital", "type": "ORGANISATION", "degree": 2, "centrality": 0.17}
    ]
  }
}
```

The counts above are teaching values. In the real output, `graph.question` contains the submitted question and `graph.snapshot` has the shape `{ "nodes": [...], "links": [...], "stats": {...} }`. Each node includes `id`, `label`, `type` and properties; each link includes `source`, `target`, `relation` and `weight`. Source and target are node IDs. The snapshot contains at most 300 nodes; if trimmed, only links whose two endpoints survive are included. The SQLite graph can be larger, so summary statistics and displayed node counts may differ. Topic subgraph endpoints read the separately persisted graph.

**Next handoff:** Gap Analyst executes next, but it reads topic attention and coverage already in shared state. It does not need graph statistics to calculate gaps. The graph supports exploration and adjacent-topic features. Current persistence replaces it with the latest scan rather than accumulating every past scan.

### Agent 7 — Gap Analyst

**Purpose:** rank the mismatch between attention and usable internal research, then assign an action category.

**Input:**

```json
{
  "topic": "Clinical AI Governance",
  "momentum": 0.6942,
  "coverage_score": 0.13,
  "doc_count": 1,
  "staleness_days": 500
}
```

**Work, entirely Python:**

This formula is a design choice in `build_gap` / `classify`, not an LLM output. It is the product’s definition of a research opportunity: how hot the topic is in the current news sample, times how empty or unusable the shelf still is.

```text
gap = attention × (1 − coverage)
```

`1 − coverage` is the missing share of the shelf:

- coverage 0 → missing 100%
- coverage 0.13 → missing 87%
- coverage 1 → missing 0%

The two terms are multiplied so both must be true. Adding them would let a quiet empty topic look as urgent as a hot well-covered one.

| News attention | Our shelf | Gap | Meaning |
|---|---|---|---|
| Hot (0.8) | Empty (0) | 0.8 × 1.0 = 0.80 | Commission new research |
| Hot (0.8) | Full (1) | 0.8 × 0.0 = 0.00 | Already covered |
| Quiet (0.1) | Empty (0) | 0.1 × 1.0 = 0.10 | Empty, but not first priority |
| Hot (0.6942) | Old note (0.13) | 0.6942 × 0.87 ≈ 0.6040 | Teaching example below |

Teaching numbers:

```text
gap = 0.6942 × (1 − 0.13)
    ≈ 0.6040
```

That `gap` number only ranks topics. The action word (`refresh` vs `publish_now`) comes from the if/else rules after this, which also use document age.

Apply action rules in order. Here attention ≥ 0.50, an accepted document exists, newest document > 300 days, and coverage < 0.70. Therefore **refresh** takes precedence over commissioning new work. Gap ≥ 0.45 gives **CRITICAL** ranking priority.

**Output added to state:**

```json
{
  "gaps": [{
    "topic_slug": "clinical-ai-governance",
    "label": "Clinical AI Governance",
    "momentum": 0.6942,
    "coverage_score": 0.13,
    "gap_score": 0.604,
    "priority": "CRITICAL",
    "quadrant": "refresh",
    "rationale": "Existing research is dated: newest relevant document is 500 days old. Validate and update it before commissioning new work."
  }]
}
```

For multiple topics, sort by descending gap. The node also adds a portfolio aggregate from stored records, which may include earlier scans.

**Stored:** gap records in SQLite.

**Next handoff:** Synthesizer reads gaps, document IDs/ages, question and article/outlet counts. Priority is a heuristic urgency label, not a confidence probability or an automatic business decision.

### Agent 8 — Synthesizer

**Purpose:** explain the computed findings to a research director.

**Input to model, condensed:**

```text
Request: AI in healthcare
External evidence: 6 articles across 4 outlets

Clinical AI Governance:
  attention 0.69; coverage 0.13; gap 0.60
  CRITICAL; refresh
  existing RN-9001, 500 days old
  rationale: validate and update old research
```

The current prompt contains IDs and ages, not full document text or every relevance reason. It does not receive the graph as reasoning context.

**Work:** Gemini writes an executive summary. Example:

> Clinical AI Governance receives an attention score of 0.69 in this news sample, while usable internal coverage is 0.13. The resulting gap is 0.60. The matched governance note is 500 days old, so validate and refresh it. This reflects sampled news attention and a simulated library, not measured client-demand growth.

**Output:** `answer`, `executive_summary`, `top_opportunities` and `recommendations` added to state.

Recommendation cards are constructed by Python from gap categories:

```json
{
  "topic": "Clinical AI Governance",
  "action": "refresh",
  "rationale": "Existing research is dated: newest relevant document is 500 days old. Validate and update it before commissioning new work."
}
```

The model schema also asks for recommendations, but the returned cards use the deterministic mapping. If generation fails, a template summary and the same computed actions are returned.

**Next handoff:** Critic receives the summary and numeric gap analytics. It does not automatically receive all original source text.

### Agent 9 — Critic

**Purpose:** check whether the summary agrees with the supplied analytics.

**Input:** summary from Agent 8 and topic/attention/coverage/gap/priority/category facts from Agent 7.

**Work:** a separate LLM call checks inconsistent or invented claims. This is not necessarily a different model or an independent human review.

**Illustrative model output:**

```json
{"consistent": true, "issues": [], "confidence": 0.92}
```

**State output:**

```json
{"groundedness": 0.92, "verdict": "consistent", "critique_issues": []}
```

0.92 here is an invented example of a model estimate, not measured 92% correctness. On the market path, `groundedness` means consistency with analytics. On the RAG path, it means estimated support from retrieved passages.

**Next handoff:** the UI receives topics, gaps, coverage details, summary, recommendations, article evidence and trace. Issues are displayed. The Critic does not automatically send work back for revision, and nothing is automatically commissioned or published.

### Entire example in one chain

```text
6 articles / 4 domains / latest 4 days ago
→ Clinical AI Governance
→ attention 0.6942
→ 3 candidate internal documents
→ LLM: 1 direct, 2 tangential
→ direct note is 500 days old
→ usable coverage 0.13
→ gap 0.6040
→ refresh, CRITICAL ranking priority
→ summary + consistency check
→ analyst decides
```

## 6. Library QA is a separate inference path

User question:

> What governance practices does our internal research recommend for clinical AI?

| Step | Input | Work | Output → next recipient |
|---|---|---|---|
| Planner | Question + optional `library_qa` mode | Choose internal QA route | Intent → Librarian RAG |
| Retrieval inside Librarian | Original question | Embed query; search index; exclude archive; cap two passages per document | Up to six passages by default → answer generator |
| Generation inside Librarian | Question + retrieved text + document IDs | Answer from extracts with citations | Cited answer → validation/support check |
| Validation inside Librarian | Answer + allowed IDs + extracts | Remove unknown IDs; model checks claim support | Answer, citations, hits, support estimate and unsupported claims → shared state |
| Synthesizer | Existing RAG answer | Normally skips; answer already exists | No second answer generation |
| Critic | Library QA intent | Skips; Librarian requested support check | Final result → UI |

The operations inside Librarian are not three additional graph agents. Market Scout, Topic Analyst, Attention, Coverage, Graph Curator and Gap Analyst do not run on this route.

**Example retrieved passage:**

```json
{
  "doc_id": "RN-9001",
  "chunk_index": 0,
  "score": 0.82,
  "text": "The governance framework assigns clinical and technical owners and documents the model review process."
}
```

**Example output, showing selected fields:**

```json
{
  "answer": "The retrieved governance framework recommends assigning clinical and technical owners and documenting model review responsibilities. [RN-9001]",
  "citations": [{"doc_id": "RN-9001", "title": "Clinical AI Governance Playbook"}],
  "retrieved": 1,
  "verdict": "grounded"
}
```

The real result includes passage details and, when the support call succeeds, a support estimate. Empty retrieval produces an abstention with no support score.

Citation-ID validity alone does not prove that a claim is supported. Removing an invented ID does not repair its sentence. The model support check is diagnostic; stronger claim-level release checks remain an improvement.

## 7. Saved gap review is a third path

```text
Request to review saved gaps
→ Planner selects gap_review
→ read stored gaps joined with topics
→ Synthesizer explains stored analytics
→ Critic checks consistency
→ UI
```

Input is the question plus existing database records. There is no new news search, document judgement or score refresh. Records can have different scan dates. Distinguish saved portfolio review from fresh market analysis.

`topic_deep_dive` also exists as an intent, but currently routes through the market-scan chain. It is not a separate sophisticated graph investigation.

## 8. Can coverage use an LLM judge only and pass summaries?

**Yes, document summaries can be the evidence supplied to the coverage judge.** There are three different design choices inside this question.

### A. Can the LLM decide relevance instead of similarity?

Yes. That is the primary role of the current judge: retrieval proposes candidates, then the LLM assesses whether the content addresses the topic. With complete valid verdicts, cosine does not decide direct versus partial coverage.

The current implementation still uses a conservative similarity fallback for missing verdicts. It is therefore not strictly LLM-only in every circumstance.

### B. Can we pass document summaries instead of chunk excerpts?

Yes. A proposed flow is:

```text
SETUP
  document → store title, date, document ID and faithful summary

INFERENCE, FOR EACH TOPIC
  topic → shortlist candidate documents
        → load title + date + summary for each candidate
        → LLM relevance judge
        → structured document-level verdicts
        → coverage calculation
        → Gap Analyst
```

Our library already has abstracts, so we can reuse those without creating a separate summary pipeline. For longer real documents, summaries need source references and updating when the source changes.

**Proposed judge input — not the current prompt:**

```json
{
  "topic": "Clinical AI Governance",
  "topic_description": "Oversight, review and accountability for clinical AI systems.",
  "documents": [
    {
      "doc_id": "RN-9001",
      "title": "Clinical AI Governance Playbook",
      "published_date": "2025-05-04",
      "summary": "Addresses AI oversight committees, ownership, model review and escalation responsibilities."
    },
    {
      "doc_id": "RN-9002",
      "title": "AI Diagnostic Accuracy",
      "published_date": "2026-08-17",
      "summary": "Compares diagnostic model accuracy and clinical performance metrics."
    }
  ]
}
```

**Proposed judge output:**

```json
{
  "verdicts": [
    {"doc_id": "RN-9001", "verdict": "covers", "reason": "Summary explicitly addresses oversight and accountability."},
    {"doc_id": "RN-9002", "verdict": "tangential", "reason": "Summary discusses performance rather than oversight."}
  ]
}
```

A summary is easier to explain, but can omit a relevant section. For an unclear summary, use an `insufficient_evidence` result and inspect supporting passages before concluding absence of coverage. That additional verdict/review path is proposed, not currently implemented.

**My recommendation:** title + existing abstract + one relevant passage, with document ID and date retained. The abstract provides scope; the passage provides specific evidence. Avoid collapsing all documents into one combined summary, which loses document-level provenance.

### C. Can we remove retrieval and the numeric formula too?

For a very small corpus, all eligible summaries can be sent to the model. This avoids a shortlist retrieval miss, but repeats more text per topic and can increase cost, latency and model omissions. The current app shortlists candidates with FAISS; it does not send the entire library to the judge.

The LLM could also return an overall coverage score. That would require an explicit rubric and validation of consistency. Our current design leaves **semantic judgement to the LLM** and **arithmetic to Python**, making the number easier to reproduce and explain.

For a strictly LLM-only relevance policy, failed or missing judgements should mean **unknown coverage**, not a hidden replacement with similarity. Gaps should be provisional or unranked until coverage is known. This needs code, tests and UI changes; this documentation update does not implement that policy.

### What gets passed onwards if we use summaries?

The next agents still need structured evidence, not just a paragraph:

```text
LLM judge → {document ID, verdict, reason}
Calculator → {topic ID, coverage score, matched documents, dates, assessment status}
Graph Curator → reads matched document IDs to create edges
Gap Analyst → reads coverage score and dates plus attention from Agent 4
Synthesizer → reads computed gaps and supporting metadata
```

Changing the judge's evidence from passage excerpts to summaries does not require changing the overall market-scan flow.

## 9. Are we building it correctly?

**The components are coherently connected for an MVP. The strongest defensible description is topic discovery plus research-coverage decision support and cited library QA.**

| Area | Implemented | Do not claim |
|---|---|---|
| Discovery | News search, extraction, alias merging | Exhaustive market coverage |
| Attention | Unique articles, source domains, recency | Proven emergence/growth against a baseline |
| Coverage | Retrieval, excerpt judgement, freshness-aware scoring | Complete library understanding or calibrated probability |
| Gaps | Explicit formula and rule-based actions | Validated research ROI or automatic commissioning |
| RAG | Excerpts, citations, support check | Every claim guaranteed correct |
| Graph | Topic/entity/document organisation and exploration | Graph-driven QA or a complete historical enterprise graph |
| Orchestration | Model routing in automatic mode, bounded task execution | Nine autonomous agents or arbitrary dynamic tool planning |

The brief explicitly allows an MVP. These limits do not invalidate the work, but must be explained honestly. The clearest next requirement improvement is a comparable historical baseline so “surged recently” has an evidence-based answer.

### Scoring rules outside the worked example

Evaluate in this order:

1. Attention ≥ 0.50, accepted documents exist, newest > 300 days, coverage < 0.70 → refresh.
2. Attention ≥ 0.55, coverage < 0.35 → commission review.
3. Attention ≥ 0.50, coverage ≥ 0.60 → maintain.
4. Attention < 0.45, coverage ≥ 0.55 → review allocation.
5. Otherwise → monitor.

Gap ≥ 0.45 is critical, ≥ 0.30 high, ≥ 0.16 medium, otherwise low. Critical is capped at high for monitor, maintain and allocation review. These thresholds require analyst calibration.

A fresh direct note can yield partial shelf coverage and a monitor action despite high attention. Five fresh direct notes saturate coverage at 1.0 under the heuristic; that is not proof every possible client question is answered.

### Other limits that affect interpretation

- Results depend on search queries and a small retrieved sample.
- Different domains can republish the same story; cross-domain syndication is not deduplicated.
- Coverage sees a bounded candidate set, not every document.
- Missing coverage is omitted from the current scan's gaps, but older stored portfolio records can still exist.
- The graph represents the latest scan; portfolio rows can accumulate across scans.
- The market Critic checks the summary against analytics, not every original source or every recommendation card.
- A model-generated narrative or top-opportunity list can still disagree with computed actions. The Critic flags rather than repairs discrepancies.
- Some provider/integration failures can stop a run. Read the trace to inspect what actually executed.
- Configured credentials do not guarantee quota or model access.
- New scoring applies to new scans. Old stored results are not automatically recalculated.

### What testing establishes

The current implementation has 21 passing offline regression tests, including a workflow with mocked providers, Planner subject extraction and visible Scout query counts. These protect counts, relevance weights, freshness, action mapping, missing-index handling and the question-to-search-subject handoff. They do not establish model quality or today's live provider availability.

For model/business evaluation, use held-out analyst labels for topic merges, retrieval relevance, coverage, supported QA claims and top-ranked opportunity usefulness. Measure failures, latency and cost alongside quality.

The folder also needs Git initialisation/publication if submitting a GitHub repository. Documentation and a local demo do not themselves satisfy the repository publication deliverable.

## 10. Code map

| Responsibility | Location |
|---|---|
| Setup execution | `backend/scripts/seed.py` |
| Simulated library and chunking | `backend/app/data/library_builder.py` |
| SQLite schema | `backend/app/data/db.py` |
| Passage retrieval | `backend/app/services/vectorstore.py` |
| Shared state and agent names | `backend/app/agents/state.py` |
| Routing/execution order | `backend/app/agents/graph.py` |
| Agent input/output updates | `backend/app/agents/nodes.py` |
| News search | `backend/app/services/external_signals.py` |
| Topics and attention | `backend/app/services/topics.py` |
| Coverage judgement/scoring and gap rules | `backend/app/services/coverage.py` |
| Graph construction | `backend/app/services/knowledge_graph.py` |
| Cited library QA | `backend/app/services/rag.py` |
| Regression checks | `backend/tests/test_decision_logic.py` |

Present the single example before showing the agent trace. Once the audience understands the evidence and decision, the agent responsibilities become easier to follow. The agent count is an implementation detail; the key is that each output supports the next decision.

