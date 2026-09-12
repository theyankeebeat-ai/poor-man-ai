import sys
import io
import asyncio
import json

# Ensure utf-8 output on Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
sys.path.insert(0, '.')

from server.agent import run_agent

async def main():
    query = "what is uefa, liga and soccer? is there any soccer game this weekend? what teams are playing? how to watch?"
    print(f"=== ASKING POOR MAN AI ===\nQuery: {query}\n")
    
    tokens = []
    async for chunk in run_agent(query, max_steps=6, thinking_level="medium"):
        chunk = chunk.strip()
        if not chunk.startswith("data: "):
            continue
        try:
            payload = json.loads(chunk[6:])
        except Exception:
            continue
        
        t = payload.get("type")
        if t == "plan":
            print(f"[PLAN] {payload.get('text')}")
        elif t == "tool":
            print(f"[TOOL] {payload.get('name')} {json.dumps(payload.get('args'))[:120]}")
        elif t == "observation":
            obs_sample = str(payload.get("text") or "")[:120].replace("\n", " ")
            print(f"[OBS] ({payload.get('name')}): {obs_sample}...")
        elif t == "token":
            tokens.append(payload.get("text", ""))
        elif t == "done":
            pass

    full_answer = "".join(tokens)
    print("\n" + "="*50)
    print("🤖 POOR MAN AI RESPONSE:")
    print("="*50)
    print(full_answer)

if __name__ == "__main__":
    asyncio.run(main())
