import asyncio
import json
from server.agent import run_agent

async def main():
    query = (
        "what is uefa, liga and soccer? "
        "is there any soccer game this weekend? what teams are playing? how to watch?"
    )
    print("=== Sending Query to Poor Man AI ===")
    print(f"Prompt: {query}\n")
    async for chunk in run_agent(query, max_steps=10, thinking_level="medium"):
        chunk = chunk.strip()
        if not chunk or not chunk.startswith("data: "):
            continue
        try:
            payload = json.loads(chunk[6:])
        except Exception:
            continue
        
        event_type = payload.get("type")
        if event_type == "plan":
            print(f"📋 [PLAN]: {payload.get('text')}")
        elif event_type == "tool":
            print(f"🔧 [TOOL]: {payload.get('name')} (args: {payload.get('args')})")
        elif event_type == "observation":
            obs_text = str(payload.get("text") or "")[:150]
            print(f"👁️  [OBSERVATION] ({payload.get('name')}): {obs_text}...")
        elif event_type == "token":
            print(payload.get("text", ""), end="", flush=True)
        elif event_type == "done":
            print("\n\n✅ [EXECUTION COMPLETE]")

if __name__ == "__main__":
    asyncio.run(main())
