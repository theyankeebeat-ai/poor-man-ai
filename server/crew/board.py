from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from server.reason import Plan, Turn


@dataclass
class Post:
    agent: str
    expertise: str
    text: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Message:
    src: str
    dst: str
    question: str
    reply: str = ""


@dataclass
class Blackboard:
    goal: str
    plan: Plan
    history: list[Turn]
    observations: list[tuple[str, str]]
    posts: list[Post] = field(default_factory=list)
    messages: list[Message] = field(default_factory=list)

    def post(self, agent: str, expertise: str, text: str, **data: Any) -> None:
        self.posts.append(Post(agent=agent, expertise=expertise, text=text, data=data))

    def ask(self, src: str, dst: str, question: str, reply: str = "") -> Message:
        msg = Message(src=src, dst=dst, question=question, reply=reply)
        self.messages.append(msg)
        return msg

    def texts(self) -> str:
        return "\n".join(f"[{p.agent}] {p.text}" for p in self.posts)

    def talk_log(self) -> str:
        return "\n".join(
            f"{m.src}→{m.dst}: {m.question} || {m.reply}" for m in self.messages
        )

    def obs_blob(self) -> str:
        return "\n".join(f"[{n}]\n{t}" for n, t in self.observations)
