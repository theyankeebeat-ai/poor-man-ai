"""Dependency-free Okapi BM25 over an inverted index."""

from __future__ import annotations

import math
import re
from collections import Counter

_TOKEN = re.compile(r"[A-Za-z]{2,}")
_STOP = frozenset(
    """
    a an the of to and in on for with from that this these those
    was were are is be been being it its as at by or if than then
    into over after before about what which when where who how does did
    """.split()
)


def tokenize(text: str) -> list[str]:
    return [token for token in (match.lower() for match in _TOKEN.findall(text)) if token not in _STOP]


class BM25Index:
    def __init__(self, docs: list[str], *, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b
        self.docs = [tokenize(doc) for doc in docs]
        self._dl = [len(tokens) for tokens in self.docs]
        n = len(self.docs)
        avgdl = (sum(self._dl) / n) if n else 0.0
        self.avgdl = avgdl if avgdl else 1.0
        self._postings: dict[str, list[tuple[int, int]]] = {}
        for doc_id, tokens in enumerate(self.docs):
            for term, tf in Counter(tokens).items():
                self._postings.setdefault(term, []).append((doc_id, tf))
        self._idf = {
            term: math.log((n - len(postings) + 0.5) / (len(postings) + 0.5) + 1.0)
            for term, postings in self._postings.items()
        }

    def top(self, query: str, k: int) -> list[tuple[float, int]]:
        if k < 1:
            return []
        scores: dict[int, float] = {}
        for term in tokenize(query):
            postings = self._postings.get(term)
            if not postings:
                continue
            idf = self._idf[term]
            for doc_id, tf in postings:
                norm = 1.0 - self.b + self.b * self._dl[doc_id] / self.avgdl
                tf_part = tf * (self.k1 + 1.0) / (tf + self.k1 * norm)
                scores[doc_id] = scores.get(doc_id, 0.0) + idf * tf_part
        ranked = [(score, doc_id) for doc_id, score in scores.items() if score > 0.0]
        ranked.sort(key=lambda item: (-item[0], item[1]))
        return ranked[:k]
