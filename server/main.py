from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
import edge_tts
import uuid
import shutil
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from server.agent import run_agent
from server.mcp.knowledge import load_packs
from server.mcp.skills import load_skills
from server.cache import stats as cache_stats
from server.memory import read_all, scrub_junk
from server.schemas import ChatRequest, TTSRequest, ReadUrlRequest
from server.workspace import path_from_message, set_workspace

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

app = FastAPI(title="Poor Man AI Orchestrator & Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# edge_tts.list_voices() is a slow remote call; cache it so /tts/voices cannot stampede.
_TTS_VOICES_TTL_SEC = 60 * 60
_tts_voices_cache: dict | None = None
_tts_voices_cached_at = 0.0
_tts_voices_lock = asyncio.Lock()

images_dir = Path(__file__).resolve().parent / "data" / "images"
images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/images", StaticFiles(directory=images_dir), name="images")

uploads_dir = Path(__file__).resolve().parent / "data" / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Drop Jina 401 / failed-search dumps once at boot so the Context Memory panel stays useful.
_MEMORY_SCRUB = scrub_junk()


@app.get("/health")
@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "cache": cache_stats(),
        "memory_scrub": _MEMORY_SCRUB,
        "note": "Poor Man AI running with shared cache and unified MCP/code tools.",
    }


@app.get("/memory")
def get_memory() -> dict:
    return {"facts": read_all()}


@app.get("/tools")
def get_tools() -> dict:
    from server.tools import TOOLS
    return {"tools": TOOLS}


@app.post("/read-url")
@app.post("/api/read-url")
async def read_url_endpoint(req: ReadUrlRequest) -> dict:
    from server.web_reader import read_website
    res = await read_website(
        url=req.url,
        render_js=req.render_js,
        max_chars=req.max_chars,
        force_refresh=req.force_refresh,
    )
    return res


@app.get("/api/read-url")
async def read_url_get(url: str, render_js: bool = False, force_refresh: bool = False) -> dict:
    from server.web_reader import read_website
    res = await read_website(
        url=url,
        render_js=render_js,
        force_refresh=force_refresh,
    )
    return res


@app.post("/debug/route")
def debug_route(req: ChatRequest) -> dict:
    from server.reason import Turn
    from server.router import route

    turns = [
        Turn(role=str(t.role), text=str(t.text))
        for t in (req.history or [])
        if getattr(t, "role", None) and getattr(t, "text", None)
    ]
    thought = route(req.message, turns)
    return {
        "message": req.message,
        "mode": thought.get("mode"),
        "skip_grok": thought.get("skip_grok"),
        "max_steps": thought.get("max_steps"),
        "cheap_preview": (thought.get("cheap_text") or "")[:300],
    }


@app.get("/mcp/knowledge")
def mcp_knowledge() -> dict:
    return {
        "packs": [
            {"name": p.name, "topics": p.topics, "excerpt": p.body[:400]}
            for p in load_packs()
        ]
    }


@app.get("/mcp/neurons")
def mcp_neurons() -> dict:
    from server.neurons import banks, crew_banks

    return {
        "banks": banks(),
        "crew": crew_banks(),
        "note": "Tiny 10x12x1 nets per MCP layer and per crew agent. Not a language model.",
    }


@app.get("/model/architecture")
def get_model_architectures() -> dict:
    from server.architecture import list_all_blueprints, PRESET_HYPERPARAMETERS
    from dataclasses import asdict
    return {
        "architectures": list_all_blueprints(),
        "presets": {k: asdict(v) for k, v in PRESET_HYPERPARAMETERS.items()},
    }


@app.post("/model/train")
def train_model_stub(payload: dict) -> dict:
    return {
        "status": "training_scheduled",
        "method": payload.get("method", "qlora"),
        "target": payload.get("target_model", "PoorMan-Mini-1B"),
        "epochs": payload.get("epochs", 3),
        "dataset_samples": 42,
        "message": "Fine-tuning job registered in Poor Man AI blackboard."
    }


@app.get("/mcp/skills")
def mcp_skills() -> dict:
    return {
        "skills": [
            {
                "name": s.name,
                "description": s.description,
                "hooks": s.hooks,
                "tools": s.tools,
                "phase": s.phase,
                "priority": s.priority,
            }
            for s in load_skills()
        ]
    }


@app.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    max_steps = req.max_steps or int(os.getenv("MAX_STEPS", "8"))

    # Prefer an explicit path in the user message over a stale UI workspace field.
    target_ws = path_from_message(req.message or "", create=True)
    if not target_ws and req.workspace:
        target_ws = req.workspace

    if req.mode == "code":
        max_steps = max(max_steps, 16)
        max_steps = min(max_steps, 20)

    async def gen():
        if target_ws:
            try:
                set_workspace(target_ws)
            except ValueError as e:
                err = str(e)
                yield json.dumps({"type": "error", "text": err}) + "\n"
                yield json.dumps({"type": "done", "text": err}) + "\n"
                return
        else:
            set_workspace(None)
        try:
            intel = req.intelligence.model_dump(exclude_none=True) if req.intelligence else None
            async for line in run_agent(
                req.message,
                max_steps=max_steps,
                history=[t.model_dump() for t in req.history],
                mode_override=req.mode,
                thinking_level=req.thinking_level or "medium",
                intelligence=intel,
            ):
                yield line
        except (asyncio.CancelledError, GeneratorExit):
            return

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/tts/voices")
async def tts_voices() -> dict:
    global _tts_voices_cache, _tts_voices_cached_at
    now = time.monotonic()
    if _tts_voices_cache is not None and (now - _tts_voices_cached_at) < _TTS_VOICES_TTL_SEC:
        return {**_tts_voices_cache, "cached": True}

    async with _tts_voices_lock:
        now = time.monotonic()
        if _tts_voices_cache is not None and (now - _tts_voices_cached_at) < _TTS_VOICES_TTL_SEC:
            return {**_tts_voices_cache, "cached": True}
        try:
            voices = await edge_tts.list_voices()
            target_prefixes = (
                "en", "fr", "ru", "es", "de", "it", "pt", "zh", "ja", "ko",
                "ar", "hi", "tr", "nl", "pl", "sv", "uk"
            )
            filtered = [
                {
                    "id": v["ShortName"],
                    "name": v.get("FriendlyName", v["ShortName"]),
                    "lang": v.get("Locale", "en-US"),
                    "gender": v.get("Gender", "Unknown"),
                }
                for v in voices
                if any(v.get("Locale", "").lower().startswith(p) for p in target_prefixes)
            ]
            payload = {"voices": filtered}
            _tts_voices_cache = payload
            _tts_voices_cached_at = time.monotonic()
            return {**payload, "cached": False}
        except Exception as e:
            if _tts_voices_cache is not None:
                return {**_tts_voices_cache, "cached": True}
            return {"voices": [], "error": str(e), "cached": False}


@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")
    try:
        communicate = edge_tts.Communicate(
            text=text,
            voice=req.voice or "en-US-AriaNeural",
            rate=req.rate or "+0%",
            pitch=req.pitch or "+0Hz",
        )
        audio_chunks: list[bytes] = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        
        audio_data = b"".join(audio_chunks)
        return Response(content=audio_data, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {e}")


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Accepts uploaded files/images/documents and stores them in data/uploads."""
    try:
        ext = Path(file.filename or "upload").suffix.lower()
        safe_name = f"{uuid.uuid4().hex[:12]}{ext}"
        dest_path = uploads_dir / safe_name
        with dest_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = dest_path.stat().st_size
        is_image = ext in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp"]
        url = f"/static/uploads/{safe_name}"

        text_content: Optional[str] = None
        if ext in [".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx", ".json", ".csv", ".html", ".css", ".yaml", ".yml", ".env", ".sh", ".sql"]:
            try:
                text_content = dest_path.read_text(encoding="utf-8", errors="replace")[:4000]
            except Exception:
                pass

        return {
            "status": "ok",
            "filename": file.filename,
            "saved_name": safe_name,
            "url": url,
            "size": file_size,
            "is_image": is_image,
            "preview": text_content,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
