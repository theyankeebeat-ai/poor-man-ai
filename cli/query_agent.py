import sys
import io
import asyncio
import json

# Force UTF-8 on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
sys.path.insert(0, '.')

from server.agent import run_agent

async def main():
    query = (
        "what is uefa, liga and soccer? "
        "is there any soccer game this weekend? what teams are playing? how to watch?"
    )
    print("=" * 60)
    print("QUERYING POOR MAN AI AGENT")
    print(f"Prompt: {query}")
    print("=" * 60)
    
    tokens = []
    async for line in run_agent(query, max_steps=8, thinking_level="medium"):
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except Exception:
            continue
        
        t = payload.get("type")
        if t == "plan":
            print(f"\n[PLAN] {payload.get('text')}")
        elif t == "tool":
            print(f"[TOOL] {payload.get('name')}: {payload.get('args')}")
        elif t == "observation":
            obs = str(payload.get("text") or "")[:140].replace("\n", " ")
            print(f"[OBS] ({payload.get('name')}): {obs}...")
        elif t == "token":
            tok = payload.get("text", "")
            tokens.append(tok)
            print(tok, end="", flush=True)
        elif t == "done":
            pass

    full = "".join(tokens)
    print("\n\n" + "=" * 60)
    print("FINAL SUMMARY FROM POOR MAN AI:")
    print("=" * 60)
    print(full if full.strip() else "(Completed without additional streaming tokens)")

if __name__ == "__main__":
    asyncio.run(main())
