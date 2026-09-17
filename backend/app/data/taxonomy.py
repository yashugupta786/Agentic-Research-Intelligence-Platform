"""The simulated research organisation: what we sweep for, and what we own.

Two separate things live here and it matters that they stay separate:

``DOMAIN_SWEEPS``
    Broad queries fired at the outside world. They are deliberately *not* the
    topic names we want to end up with - topics are discovered by the LLM from
    whatever articles come back, then normalised. Hard-coding the answer would
    defeat the purpose of demand sensing.

``LIBRARY_PLAN``
    The shape of the internal library. Coverage is engineered on purpose: some
    subjects are deep and fresh, some are stale, some are missing entirely, and
    some are over-served relative to a market that has moved on. Without that
    spread the gap analysis has nothing to say - every topic would look like a
    gap and the output would be noise.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# External sweeps
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class DomainSweep:
    key: str
    label: str
    query: str
    category: str


DOMAIN_SWEEPS: tuple[DomainSweep, ...] = (
    DomainSweep("enterprise_ai", "Enterprise AI adoption", "enterprise AI adoption strategy CIO", "Technology"),
    DomainSweep("ai_risk", "AI risk & regulation", "AI regulation compliance governance enterprise", "Risk & Regulation"),
    DomainSweep("supply_chain", "Supply chain & manufacturing", "supply chain disruption manufacturing resilience", "Operations"),
    DomainSweep("cyber", "Cybersecurity", "enterprise cybersecurity threat board oversight", "Security"),
    DomainSweep("semis", "Semiconductors & infrastructure", "semiconductor chips data center capacity investment", "Infrastructure"),
    DomainSweep("healthcare_tech", "Healthcare technology", "healthcare AI clinical technology adoption", "Healthcare"),
    DomainSweep("workforce", "Workforce & talent", "AI workforce skills talent reskilling enterprise", "Human Capital"),
    DomainSweep("finance_tech", "Financial services technology", "banking financial services technology AI risk", "Financial Services"),
)


# ---------------------------------------------------------------------------
# Internal library plan
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class LibrarySubject:
    """One subject area of the internal library.

    ``doc_count`` / ``age_days`` encode the coverage story:
      * deep + fresh   -> we are on top of it
      * thin + old     -> refresh candidate
      * absent (0)     -> white space
      * deep + ignored -> over-invested legacy
    """

    subject: str
    practice_area: str
    doc_count: int
    age_days: tuple[int, int]
    intent: str  # covered | stale | thin | legacy | filler
    focus: str = ""
    doc_types: tuple[str, ...] = ("Research Note", "Market Guide", "Analyst Brief")
    keywords: tuple[str, ...] = field(default_factory=tuple)


LIBRARY_PLAN: tuple[LibrarySubject, ...] = (
    # --- Deep and current: the market is hot and so are we -----------------
    LibrarySubject(
        "AI-assisted clinical diagnostics and medical imaging",
        "Healthcare & Life Sciences", 12, (10, 130), "covered",
        focus="diagnostic accuracy, radiology workflow integration, FDA clearance pathways, clinician trust",
        keywords=("clinical AI", "medical imaging", "radiology", "diagnostic accuracy"),
    ),
    LibrarySubject(
        "Supply chain resilience and supplier diversification",
        "Supply Chain", 11, (15, 160), "covered",
        focus="multi-sourcing, nearshoring economics, supplier risk scoring, inventory buffers",
        keywords=("supply chain", "supplier risk", "nearshoring", "logistics"),
    ),
    LibrarySubject(
        "Generative AI in customer service and contact centres",
        "Customer Experience", 10, (20, 150), "covered",
        focus="deflection rates, agent assist, containment metrics, escalation design",
        keywords=("customer service AI", "contact centre", "agent assist", "chatbot"),
    ),
    LibrarySubject(
        "Board-level cyber risk oversight and incident disclosure",
        "Security & Risk", 9, (25, 170), "covered",
        focus="SEC disclosure timelines, board reporting cadence, materiality judgement, CISO reporting lines",
        keywords=("cyber disclosure", "board oversight", "CISO", "incident response"),
    ),
    LibrarySubject(
        "Cloud cost optimisation and FinOps operating models",
        "Infrastructure & Operations", 8, (30, 180), "covered",
        focus="unit economics, commitment planning, showback/chargeback, waste elimination",
        keywords=("cloud cost", "FinOps", "unit economics"),
    ),

    # --- Real but ageing: refresh candidates -------------------------------
    LibrarySubject(
        "Autonomous AI agents: accountability and governance",
        "AI & Data Science", 2, (250, 400), "stale",
        focus="delegation boundaries, human-in-the-loop checkpoints, audit trails for autonomous action",
        keywords=("AI agents", "autonomous agents", "agent governance"),
    ),
    LibrarySubject(
        "EU AI Act readiness and conformity assessment",
        "Risk & Compliance", 3, (300, 430), "stale",
        focus="risk tiering, technical documentation, conformity assessment, timelines",
        keywords=("EU AI Act", "AI regulation", "conformity assessment"),
    ),
    LibrarySubject(
        "Digital twins in discrete manufacturing",
        "Manufacturing", 4, (360, 520), "stale",
        focus="simulation fidelity, sensor integration, ROI benchmarks, PLM linkage",
        keywords=("digital twin", "simulation", "manufacturing"),
    ),
    LibrarySubject(
        "Semiconductor supply and export control exposure",
        "Supply Chain", 2, (260, 390), "stale",
        focus="allocation risk, dual-sourcing constraints, export licence exposure",
        keywords=("semiconductor", "export controls", "chip supply"),
    ),
    LibrarySubject(
        "Post-quantum cryptography migration planning",
        "Security & Risk", 1, (400, 470), "stale",
        focus="crypto inventory, algorithm migration sequencing, vendor readiness",
        keywords=("post-quantum", "cryptography", "PQC"),
    ),

    # --- Thin: barely a foothold ------------------------------------------
    LibrarySubject(
        "Data centre energy demand and power constraints",
        "Infrastructure & Operations", 1, (290, 340), "thin",
        focus="grid interconnect queues, power purchase agreements, cooling economics",
        keywords=("data centre energy", "power", "grid"),
    ),
    LibrarySubject(
        "Sovereign AI and data residency strategy",
        "AI & Data Science", 1, (330, 380), "thin",
        focus="in-country model hosting, residency obligations, national AI programmes",
        keywords=("sovereign AI", "data residency", "national AI"),
    ),

    # --- Over-invested: heavy shelf, cooling market ------------------------
    LibrarySubject(
        "ERP modernisation and S/4HANA migration",
        "Enterprise Applications", 9, (120, 620), "legacy",
        focus="migration sequencing, clean-core discipline, integration debt",
        keywords=("ERP", "S/4HANA", "migration"),
    ),
    LibrarySubject(
        "Robotic process automation programme scaling",
        "Automation", 8, (200, 700), "legacy",
        focus="bot sprawl, maintenance cost, centre-of-excellence models",
        keywords=("RPA", "process automation", "bots"),
    ),
    LibrarySubject(
        "Hybrid work policy and workplace technology",
        "Human Capital", 7, (180, 680), "legacy",
        focus="attendance mandates, collaboration tooling, real-estate rationalisation",
        keywords=("hybrid work", "workplace", "collaboration"),
    ),
    LibrarySubject(
        "Virtual desktop infrastructure and endpoint estates",
        "Infrastructure & Operations", 6, (240, 720), "legacy",
        focus="VDI licensing, thin-client refresh, endpoint management consolidation",
        keywords=("VDI", "virtual desktop", "endpoint"),
    ),
    LibrarySubject(
        "Low-code application platforms for citizen developers",
        "Enterprise Applications", 6, (210, 660), "legacy",
        focus="governance guardrails, shadow IT risk, platform consolidation",
        keywords=("low-code", "citizen developer"),
    ),

    # --- Filler: realistic breadth so retrieval has to discriminate -------
    LibrarySubject(
        "Enterprise data governance and stewardship operating models",
        "AI & Data Science", 5, (60, 400), "filler",
        focus="ownership models, data contracts, quality SLAs, catalogue adoption",
        keywords=("data governance", "stewardship", "data quality"),
    ),
    LibrarySubject(
        "IT service management and AIOps maturity",
        "Infrastructure & Operations", 4, (90, 430), "filler",
        focus="incident automation, observability consolidation, change risk scoring",
        keywords=("ITSM", "AIOps", "observability"),
    ),
    LibrarySubject(
        "Procurement transformation and category strategy",
        "Supply Chain", 4, (110, 470), "filler",
        focus="spend analytics, supplier consolidation, contract lifecycle automation",
        keywords=("procurement", "sourcing", "contracts"),
    ),
    LibrarySubject(
        "ESG and sustainability reporting technology",
        "Risk & Compliance", 4, (100, 450), "filler",
        focus="emissions data lineage, assurance readiness, disclosure tooling",
        keywords=("ESG", "sustainability reporting", "emissions"),
    ),
    LibrarySubject(
        "Payments modernisation and real-time rails",
        "Financial Services", 4, (80, 420), "filler",
        focus="ISO 20022 migration, fraud controls, real-time settlement",
        keywords=("payments", "real-time payments", "ISO 20022"),
    ),
    LibrarySubject(
        "Customer data platforms and identity resolution",
        "Customer Experience", 4, (70, 410), "filler",
        focus="consent management, identity graphs, activation use cases",
        keywords=("CDP", "identity resolution", "consent"),
    ),
)


PRACTICE_AREAS: tuple[str, ...] = tuple(sorted({s.practice_area for s in LIBRARY_PLAN}))

ANALYSTS: tuple[str, ...] = (
    "R. Venkatesan", "M. Okonjo", "S. Lindqvist", "D. Whitfield", "A. Haddad",
    "J. Moreau", "P. Ramanathan", "K. Bergström", "L. Castellanos", "T. Nakamura",
)

# Questions used by the evaluation suite and the UI's suggestion chips.
EXAMPLE_QUESTIONS: tuple[str, ...] = (
    "What topics related to AI in healthcare have surged recently?",
    "Which topics are under-covered versus market interest?",
    "Summarise recent signals around supply-chain resilience.",
    "What are the key issues APAC manufacturers faced this quarter?",
    "How well does our library cover autonomous AI agent governance?",
    "Where are we over-invested relative to market demand?",
)
