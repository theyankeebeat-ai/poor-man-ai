from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ChatTurn(BaseModel):
    role: str
    text: str = ""


class ChatRequest(BaseModel):
    message: str
    max_steps: int = Field(default=8, ge=0, le=32)
    history: list[ChatTurn] = Field(default_factory=list)
    workspace: Optional[str] = None
    mode: Optional[str] = None
    thinking_level: Optional[str] = Field(default="medium", description="Thinking effort: low, medium, or high")

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

