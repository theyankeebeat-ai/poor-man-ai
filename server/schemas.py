from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: str
    text: str = ""


class IntelligenceParams(BaseModel):
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    top_k: Optional[int] = Field(default=None, ge=1, le=200)
    max_new_tokens: Optional[int] = Field(default=None, ge=64, le=8192)
    verify_claims: Optional[bool] = None
    self_critique: Optional[bool] = None
    require_citations: Optional[bool] = None
    consensus_search: Optional[bool] = None
    coverage_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    max_plan_tools: Optional[int] = Field(default=None, ge=1, le=8)
    memory_snippets: Optional[int] = Field(default=None, ge=0, le=24)
    use_crew: Optional[bool] = None
    planner_temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    writer_temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)


class ChatRequest(BaseModel):
    message: str
    max_steps: int = Field(default=5, ge=0, le=32)
    history: list[ChatTurn] = Field(default_factory=list)
    workspace: Optional[str] = None
    mode: Optional[str] = None
    thinking_level: Optional[str] = Field(default="medium", description="Thinking effort: low, medium, or high. Default medium (Standard) for better tool use.")
    intelligence: Optional[IntelligenceParams] = None

class TTSRequest(BaseModel):
    text: str
    voice: str = "en-US-AriaNeural"
    rate: str = "+0%"
    pitch: str = "+0Hz"


class ImageGenJson(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = None
    width: int = 1024
    height: int = 1024
    style: Optional[str] = None
    n: int = 1


class MemoryFact(BaseModel):
    ts: str
    fact: str
    source_url: Optional[str] = None


class AgentEvent(BaseModel):
    type: Literal["plan", "tool", "observation", "token", "done", "error"]
    text: Optional[str] = None
    name: Optional[str] = None
    args: Optional[dict[str, Any]] = None


class ReadUrlRequest(BaseModel):
    url: str
    render_js: bool = False
    max_chars: int = 15000
    force_refresh: bool = False

