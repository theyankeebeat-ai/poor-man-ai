"""Apply only this repair to the separate Render deployment checkout."""
from pathlib import Path
import re
import sys

source = Path(__file__).resolve().parents[1]
checkout = Path(sys.argv[1]).resolve()
target = checkout / "Poor man ai"
if not (target / "server" / "bucket_routes.py").is_file():
    raise SystemExit("Expected the existing Simple AI deployment checkout")

for name in ("backends.py", "hf_storage.py", "hf_tiny.py", "test_hf_runtime.py"):
    (target / "server" / name).write_bytes((source / "server" / name).read_bytes())

main = target / "server" / "main.py"
text = main.read_text(encoding="utf-8")
if '"hf": runtime_status()' not in text:
    text = text.replace('def health() -> dict:\n', 'def health() -> dict:\n    from server.hf_tiny import runtime_status\n')
    text = text.replace('"memory_scrub": _MEMORY_SCRUB,', '"memory_scrub": _MEMORY_SCRUB,\n        "hf": runtime_status(),')
local_main = (source / "server" / "main.py").read_text(encoding="utf-8")
if 'name="hf"' not in text:
    start = local_main.index('hf_dir = Path(')
    end = local_main.index('uploads_dir = ', start)
    text = text.replace('uploads_dir = Path(', local_main[start:end] + 'uploads_dir = Path(', 1)
if '@app.post("/api/webai/hf")' not in text:
    start = local_main.index('@app.get("/api/brain/hf")')
    end = local_main.index('@app.post("/api/real-ai/guardrails/evaluate")', start)
    text += "\n\n" + local_main[start:end]
if '@app.get("/api/backends")' not in text:
    text += '\n@app.get("/api/backends")\ndef cloud_backends():\n    from server.backends import status\n    return status()\n'
if 'exception("HF model request failed")' not in text:
    text = text.replace('    except (ImportError, RuntimeError) as exc:\n', '    except (ImportError, RuntimeError) as exc:\n        import logging\n        logging.getLogger(__name__).exception("HF model request failed")\n')
text = re.sub(r'def train_model_stub\(payload: dict\) -> dict:\n.*?(?=\n\n@app)',
              'def train_model_stub(payload: dict) -> dict:\n    raise HTTPException(status_code=501, detail="No training worker is configured; presets do not train model weights.")\n', text, flags=re.S)
main.write_text(text, encoding="utf-8")

tools = target / "server" / "tools.py"
text = tools.read_text(encoding="utf-8")
local_tools = (source / "server" / "tools.py").read_text(encoding="utf-8")
if 'RUNNERS["hf_search"]' not in text:
    start = local_tools.index('async def _run_hf_search(')
    end = local_tools.index('RUNNERS["hf_search"] = _run_hf_search', start) + len('RUNNERS["hf_search"] = _run_hf_search')
    text += "\n\n" + local_tools[start:end] + "\n"
tools.write_text(text, encoding="utf-8")

architecture = target / "server" / "architecture.py"
text = architecture.read_text(encoding="utf-8")
local_arch = (source / "server" / "architecture.py").read_text(encoding="utf-8")
start = local_arch.index('def runtime_profile()')
end = local_arch.index('def get_architecture_blueprint', start)
text = re.sub(r'def runtime_profile\(\).*?(?=def get_architecture_blueprint)', lambda _: local_arch[start:end], text, flags=re.S)
architecture.write_text(text, encoding="utf-8")

requirements = target / "server" / "requirements.txt"
text = requirements.read_text(encoding="utf-8")
for line in ('pyarrow>=18', 'transformers>=4.48,<5', 'torch>=2.6,<3'):
    if line.split('>=')[0] not in text:
        text += line + "\n"
requirements.write_text(text, encoding="utf-8")

# The production repository nests the API under Poor man ai/.
blueprint = (source / "render.yaml").read_text(encoding="utf-8")
blueprint = blueprint.replace('pip install -r server/requirements.txt', 'pip install -r "Poor man ai/server/requirements.txt" -r buckets/requirements.txt')
blueprint = blueprint.replace('server.main:app --host', 'server.main:app --app-dir "Poor man ai" --host')
(checkout / "render.yaml").write_text(blueprint, encoding="utf-8")
print("Prepared targeted Render backend update; preserved bucket routes and frontend")
