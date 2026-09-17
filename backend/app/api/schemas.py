"""Request models for the HTTP layer."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    force_refresh: bool = False
    intent: str | None = Field(
        default=None,
        description="Optional UI override: market_scan, library_qa or gap_review. None = planner decides.",
    )


class LibraryQuestion(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    top_k: int = Field(default=6, ge=1, le=20)
