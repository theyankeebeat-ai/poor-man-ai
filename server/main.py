from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

import shutil
import threading
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from server.cache import stats as cache_stats
from server.schemas import ChatRequest, TTSRequest, ReadUrlRequest
from server.workspace import path_from_message, set_workspace

# Render's HTTP health check gives up after 5 seconds. edge-tts and the agent
# stack stay out of this import so the process can bind inside that window.

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

# Rewriting memory.jsonl must not delay the port bind. /health reads this dict as-is.
_MEMORY_SCRUB: dict = {"pending": True}


def _scrub_memory_background() -> None:
    global _MEMORY_SCRUB
    try:
        from server.memory import scrub_junk

        _MEMORY_SCRUB = scrub_junk()
    except Exception as exc:
        _MEMORY_SCRUB = {"error": type(exc).__name__}


threading.Thread(target=_scrub_memory_background, name="memory-scrub", daemon=True).start()

images_dir = Path(__file__).resolve().parent / "data" / "images"
images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/images", StaticFiles(directory=images_dir), name="images")

hf_dir = Path(os.getenv("HF_SNAPSHOT_DIR", str(ROOT / "hf")))
if os.getenv("HF_STORAGE_PROVIDER", "local") != "local":
    hf_dir.mkdir(parents=True, exist_ok=True)
if hf_dir.is_dir():
    app.mount("/static/hf", StaticFiles(directory=hf_dir), name="hf")

uploads_dir = Path(__file__).resolve().parent / "data" / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.get("/health")
@app.get("/api/health")
def health() -> dict:
    from server.hf_tiny import runtime_status
    return {
        "status": "ok",
        "cache": cache_stats(),
        "memory_scrub": _MEMORY_SCRUB,
        "hf": runtime_status(),
        "note": "Poor Man AI running with shared cache and unified MCP/code tools.",
    }


@app.get("/api/backends")
def cloud_backends() -> dict:
    """Local ports plus Render, Appwrite, and Supabase."""
    from server.backends import status

    return status()


@app.get("/memory")
def get_memory() -> dict:
    from server.memory import read_all

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
    from server.mcp.knowledge import load_packs

    return {
        "packs": [
            {"name": p.name, "topics": p.topics, "excerpt": p.body[:400]}
            for p in load_packs()
        ]
    }


@app.get("/mcp/neurons")
def mcp_neurons() -> dict:
    from server.neurons import arch_label, banks, crew_banks, params_per_net

    return {
        "arch": arch_label(),
        "params_per_net": params_per_net(),
        "banks": banks(),
        "crew": crew_banks(),
        "note": (
            f"Tiny {arch_label()} routing nets ({params_per_net()} weights each). "
            "They pick skills/tools/crew — they are not the language model."
        ),
    }


@app.get("/model/architecture")
def get_model_architectures() -> dict:
    from server.architecture import list_all_blueprints, PRESET_HYPERPARAMETERS, runtime_profile
    from dataclasses import asdict
    return {
        "architectures": list_all_blueprints(),
        "presets": {k: asdict(v) for k, v in PRESET_HYPERPARAMETERS.items()},
        "runtime": runtime_profile(),
        "recommended": "poor_man_1b",
    }


@app.post("/model/train")
def train_model_stub(payload: dict) -> dict:
    raise HTTPException(status_code=501, detail="No training worker is configured. Model presets do not train or resize the loaded BERT checkpoint.")


@app.get("/crew/router")
def get_crew_router() -> dict:
    from server.crew.board import Blackboard
    from server.reason import Plan
    return {
        "topology": "hybrid_hub_and_spoke_broadcast_bus",
        "description": "Hub-and-spoke coordinator with shared broadcast bus for low-latency peer clarification, debate, and bounded 1-round arbitration.",
        "max_debate_rounds": 1,
        "supported_topics": ["task_init", "fill_gaps", "debate:action_plan", "verdict:action_plan", "clarification"],
        "cost_efficiency": "O(N) message complexity vs O(N^2) for full cross-mesh.",
    }


@app.post("/crew/broadcast-test")
def test_crew_broadcast(payload: dict) -> dict:
    from server.crew.board import Blackboard
    from server.reason import Plan

    board = Blackboard(
        goal=payload.get("goal", "Sample goal"),
        plan=Plan(search_queries=["test"]),
        history=[],
        observations=[]
    )
    # 1. Hub broadcast
    board.broadcast(
        sender=payload.get("sender", "coordinator"),
        topic=payload.get("topic", "task_init"),
        payload=payload.get("message", "Task initialized with hybrid broadcast bus"),
        priority=payload.get("priority", "normal")
    )
    # 2. Worker proposal if debate
    if payload.get("debate"):
        board.open_debate("test_debate", payload.get("debate_subject", "Course of action"), "skeptic")
        board.submit_proposal("test_debate", "skeptic", "Strict Safety Mode", 0.92, "Avoid unchecked side-effects.")
        board.submit_proposal("test_debate", "logic", "High Throughput Mode", 0.88, "Stream output directly.")
        verdict = board.arbitrate_debate("test_debate", coordinator="coordinator")
    else:
        verdict = None

    return {
        "status": "ok",
        "bus_log": board.bus_log(),
        "broadcast_count": len(board.broadcast_bus),
        "arbitrated_verdict": verdict,
    }


@app.get("/mcp/skills")
def mcp_skills() -> dict:
    from server.mcp.skills import load_skills

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
async def chat(request: Request, req: ChatRequest) -> StreamingResponse:
    max_steps = req.max_steps or int(os.getenv("MAX_STEPS", "8"))
    thinking = (req.thinking_level or "medium").lower()
    if thinking == "low":
        max_steps = min(max_steps, 5)
    elif thinking == "medium":
        max_steps = max(max_steps, 8)
        max_steps = min(max_steps, 12)

    # Prefer an explicit path in the user message over a stale UI workspace field.
    target_ws = path_from_message(req.message or "", create=True)
    if not target_ws and req.workspace:
        target_ws = req.workspace

    if req.mode == "code":
        max_steps = max(max_steps, 16)
        max_steps = min(max_steps, 20)

    async def gen():
        # First byte before routing, so a warm worker is not silent while the agent starts.
        yield json.dumps({"type": "status", "text": "Thinking…"}) + "\n"
        from server.agent import run_agent

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
                thinking_level=thinking,
                intelligence=intel,
            ):
                if await request.is_disconnected():
                    yield json.dumps({"type": "done", "text": "[Stopped]"}) + "\n"
                    return
                yield line
        except (asyncio.CancelledError, GeneratorExit):
            try:
                yield json.dumps({"type": "done", "text": "[Stopped]"}) + "\n"
            except Exception:
                return
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
            import edge_tts

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
        import edge_tts

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


# ===========================================================================
# Real AI Gateway, RAG Vector Search & Guardrail Endpoints
# ===========================================================================

def _real_ai():
    from server import real_ai

    return real_ai


@app.get("/api/real-ai/providers")
def get_ai_providers():
    """Lists standard and real AI providers (Gemini, Groq, Ollama, OpenAI, xAI, OpenRouter)."""
    return {
        "providers": _real_ai().get_available_providers(),
        "timestamp": time.time()
    }


@app.get("/api/real-ai/rag/documents")
def list_rag_documents():
    """Returns indexed RAG vector knowledge chunks."""
    docs = [
        {
            "id": d.id,
            "content": d.content,
            "metadata": d.metadata,
            "embedding_dims": len(d.embedding),
            "created_at": d.created_at
        }
        for d in _real_ai().vector_store.documents.values()
    ]
    return {"total": len(docs), "documents": docs}


@app.post("/api/real-ai/rag/index")
async def index_rag_document(req: Request):
    """Indexes knowledge content into vector semantic search store."""
    payload = await req.json()
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty.")
    metadata = payload.get("metadata", {})
    doc = _real_ai().vector_store.add_document(content=content, metadata=metadata)
    return {
        "status": "indexed",
        "document_id": doc.id,
        "embedding_dims": len(doc.embedding),
        "created_at": doc.created_at
    }


@app.post("/api/real-ai/rag/search")
async def search_rag(req: Request):
    """Semantic vector search across knowledge base with hybrid cosine similarity."""
    payload = await req.json()
    query = payload.get("query", "").strip()
    top_k = int(payload.get("top_k", 4))
    min_score = float(payload.get("min_score", 0.1))
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    matches = _real_ai().vector_store.search(query=query, top_k=top_k, min_score=min_score)
    return {
        "query": query,
        "matches_count": len(matches),
        "results": matches
    }


@app.get("/api/brain/hf")
def brain_hf_catalog():
    """List every file in the local hf/ snapshot."""
    from server.hf_tiny import catalog_hf

    return catalog_hf()


@app.get("/api/brain/hf/file")
def brain_hf_file(path: str):
    """Read one file under hf/. Refuses paths that leave that folder."""
    from server.hf_tiny import read_hf_file

    try:
        return read_hf_file(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/webai/hf")
async def run_webai_hf(req: Request):
    """Load BERT weights and rerank WikiText training passages on a worker thread."""
    from server.hf_tiny import run_query

    payload = await req.json()
    query = str(payload.get("query", "")).strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    try:
        return await asyncio.to_thread(run_query, query, int(payload.get("top_k", 3)))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ImportError, RuntimeError) as exc:
        import logging
        logging.getLogger(__name__).exception("HF model request failed")
        raise HTTPException(status_code=503, detail="Model unavailable; check runtime dependencies, checkpoint, and storage configuration.") from exc


@app.post("/api/real-ai/guardrails/evaluate")
async def evaluate_safety(req: Request):
    """Evaluates prompt against jailbreak injections and scans for PII leaks."""
    payload = await req.json()
    text = payload.get("text", "")
    evaluation = _real_ai().evaluate_prompt_safety(text)
    scrubbed = _real_ai().scrub_pii(text)
    return {
        **evaluation,
        "scrubbed_text": scrubbed
    }

