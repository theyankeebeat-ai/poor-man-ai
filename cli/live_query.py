import sys
import io
import asyncio
import json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
sys.path.insert(0, '.')

from server.agent import run_agent
from server.cache import purge_matching

async def main():
    purge_matching(".*") # clear cached answers
    query = (
        "1. Define UEFA, La Liga, and soccer.\n"
        "2. Are there soccer games this weekend, what notable teams are playing, and how can viewers watch?"
    )
    print("=" * 60)
    print("POOR MAN AI LIVE QUERY RUNNER")
    print("=" * 60)
    
    async for line in run_agent(query, max_steps=8, thinking_level="medium"):
        line = line.strip()
        if not line:
            continue
        try:
            p = json.loads(line)
            ptype = p.get("type")
            if ptype == "plan":
                print(f"\n📋 [PLAN]: {p.get('text')}")
            elif ptype == "tool":
                print(f"🔧 [TOOL]: {p.get('name')}")
            elif ptype == "observation":
                obs = str(p.get("text") or "")[:120].replace("\n", " ")
                print(f"👁️  [OBS]: {obs}...")
            elif ptype == "token":
                print(p.get("text", ""), end="", flush=True)
            elif ptype == "done":
                print("\n\n✅ [RUN FINISHED]")
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(main())
