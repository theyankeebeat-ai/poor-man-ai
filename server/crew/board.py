from __future__ import annotations

from dataclasses import dataclass, field
import time
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
class BroadcastMessage:
    sender: str
    topic: str
    payload: str
    priority: str = "normal"  # "low", "normal", "urgent"
    requires_response: bool = False
    timestamp: float = field(default_factory=time.time)
    responses: dict[str, str] = field(default_factory=dict)


@dataclass
class DebateProposal:
    agent: str
    position: str
    confidence: float
    reasoning: str


@dataclass
class DebateTopic:
    topic_id: str
    subject: str
    initiated_by: str
    proposals: list[DebateProposal] = field(default_factory=list)
    coordinator_verdict: str = ""
    resolved: bool = False


@dataclass
class Blackboard:
    goal: str
    plan: Plan
    history: list[Turn]
    observations: list[tuple[str, str]]
    posts: list[Post] = field(default_factory=list)
    messages: list[Message] = field(default_factory=list)
    # Hub-and-Spoke with Broadcast Bus additions:
    broadcast_bus: list[BroadcastMessage] = field(default_factory=list)
    active_debates: list[DebateTopic] = field(default_factory=list)
    max_debate_rounds: int = 1  # Guardrail against runaway token/latency cycles

    def post(self, agent: str, expertise: str, text: str, **data: Any) -> None:
        self.posts.append(Post(agent=agent, expertise=expertise, text=text, data=data))

    def ask(self, src: str, dst: str, question: str, reply: str = "") -> Message:
        msg = Message(src=src, dst=dst, question=question, reply=reply)
        self.messages.append(msg)
        return msg

    # --- Hub-and-Spoke Broadcast Bus Operations ---
    def broadcast(
        self,
        sender: str,
        topic: str,
        payload: str,
        priority: str = "normal",
        requires_response: bool = False,
    ) -> BroadcastMessage:
        """Publish a message onto the shared broadcast bus for all agents & coordinator."""
        msg = BroadcastMessage(
            sender=sender,
            topic=topic,
            payload=payload,
            priority=priority,
            requires_response=requires_response,
        )
        self.broadcast_bus.append(msg)
        return msg

    def reply_to_broadcast(self, msg_idx: int, responder: str, response: str) -> None:
        """Worker or Hub answers a broadcast request on the bus."""
        if 0 <= msg_idx < len(self.broadcast_bus):
            self.broadcast_bus[msg_idx].responses[responder] = response

    def open_debate(self, topic_id: str, subject: str, initiator: str) -> DebateTopic:
        """Spoke raises a debate/course-of-action question to the Hub coordinator."""
        debate = DebateTopic(topic_id=topic_id, subject=subject, initiated_by=initiator)
        self.active_debates.append(debate)
        self.broadcast(
            sender=initiator,
            topic=f"debate:{topic_id}",
            payload=f"Debate opened on: {subject}",
            priority="urgent",
            requires_response=True,
        )
        return debate

    def submit_proposal(
        self,
        topic_id: str,
        agent: str,
        position: str,
        confidence: float,
        reasoning: str,
    ) -> None:
        """Spoke submits their stance/course of action on a debate."""
        for d in self.active_debates:
            if d.topic_id == topic_id and not d.resolved:
                d.proposals.append(
                    DebateProposal(
                        agent=agent,
                        position=position,
                        confidence=confidence,
                        reasoning=reasoning,
                    )
                )
                break

    def arbitrate_debate(
        self,
        topic_id: str,
        coordinator: str = "coordinator",
    ) -> str:
        """Hub Coordinator resolves the debate with strict bounded 1-round verdict."""
        for d in self.active_debates:
            if d.topic_id == topic_id and not d.resolved:
                if not d.proposals:
                    verdict = f"Arbitrated by {coordinator}: Proceed with baseline plan."
                else:
                    # Choose highest confidence proposal or consensus
                    best = max(d.proposals, key=lambda p: p.confidence)
                    verdict = (
                        f"Hub Arbiter [{coordinator}] ruled in favor of [{best.agent}]: "
                        f"Adopt '{best.position}' (confidence {best.confidence:.2f}). Reason: {best.reasoning}"
                    )
                d.coordinator_verdict = verdict
                d.resolved = True
                self.post(coordinator, "hub_arbitration", verdict, debate_id=topic_id)
                self.broadcast(
                    sender=coordinator,
                    topic=f"verdict:{topic_id}",
                    payload=verdict,
                    priority="urgent",
                )
                return verdict
        return ""

    def texts(self) -> str:
        return "\n".join(f"[{p.agent}] {p.text}" for p in self.posts)

    def talk_log(self) -> str:
        return "\n".join(
            f"{m.src}→{m.dst}: {m.question} || {m.reply}" for m in self.messages
        )

    def bus_log(self) -> str:
        lines = []
        for b in self.broadcast_bus:
            resp_str = (
                f" -> responses: {b.responses}" if b.responses else ""
            )
            lines.append(f"[BUS:{b.priority.upper()}] {b.sender} on '{b.topic}': {b.payload}{resp_str}")
        return "\n".join(lines)

    def obs_blob(self) -> str:
        return "\n".join(f"[{n}]\n{t}" for n, t in self.observations)
