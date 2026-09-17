"""Central configuration, loaded from backend/.env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"


class Settings(BaseSettings):
    """Runtime settings. Everything has a safe default except the API keys."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- credentials -------------------------------------------------------
    google_api_key: str = ""
    tavily_api_key: str = ""

    # --- models ------------------------------------------------------------
    # Free tier serves the Gemini 3.x flash family. 2.x is retired for new keys
    # and Pro models require billing (verified: HTTP 429).
    #
    # Model choice here is driven by measured daily quotas, not by which model
    # sounds best: gemini-3.6-flash allows only 20 requests per DAY on the free
    # tier (quota id GenerateRequestsPerDayPerProjectPerModel-FreeTier), which a
    # single demo session would exhaust. The lite models are both faster and far
    # more generous, so they carry the workload and the chain below fails over
    # automatically when any model is exhausted.
    gemini_chat_model: str = "gemini-3.5-flash-lite"
    gemini_fast_model: str = "gemini-3.1-flash-lite"
    model_fallbacks: str = (
        "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3-flash-preview,gemini-3.5-flash"
    )
    gemini_embed_model: str = "models/gemini-embedding-001"
    embed_dim: int = 768

    # Gemini 3.x thinking is uncapped by default and dominates latency on long
    # prompts: the same grounded answer took 52s with default thinking and 2.4s
    # at "low", with no quality difference we could detect. Demo speed matters,
    # so "low" is the default and callers can raise it per call.
    thinking_level: str = "low"

    # --- behaviour ---------------------------------------------------------
    offline_mode: bool = False
    cache_ttl_hours: int = 12
    library_size: int = 400

    # Free-tier batchEmbedContents rejects 96 items with 429; 32 plus pacing is
    # reliable end to end.
    embed_batch_size: int = 32
    max_agent_steps: int = 12
    rag_top_k: int = 6

    # GDELT is unused in the live path (exact-phrase volume fights alias merge).
    gdelt_topic_limit: int = 0
    sweep_results_per_query: int = 8

    # --- paths -------------------------------------------------------------
    @property
    def db_path(self) -> Path:
        return DATA_DIR / "intelligence.db"

    @property
    def index_path(self) -> Path:
        return DATA_DIR / "library.faiss"

    @property
    def index_ids_path(self) -> Path:
        return DATA_DIR / "library_ids.json"

    @property
    def graph_path(self) -> Path:
        return DATA_DIR / "knowledge_graph.json"

    @property
    def fallback_chain(self) -> list[str]:
        return [m.strip() for m in self.model_fallbacks.split(",") if m.strip()]

    @property
    def has_llm(self) -> bool:
        return bool(self.google_api_key)

    @property
    def has_search(self) -> bool:
        return bool(self.tavily_api_key) and not self.offline_mode


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()


settings = get_settings()
