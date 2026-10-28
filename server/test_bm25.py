from server.bm25 import BM25Index

_SHORT = "Paris is the capital of France"
_LONG = "The catalog lists capital once and France once " + " ".join(f"quartz{i}" for i in range(200))


def test_short_relevant_doc_outranks_long_filler():
    index = BM25Index([_LONG, _SHORT])
    hits = index.top("capital of France", 5)
    assert [doc_id for _, doc_id in hits][0] == 1
    assert hits[0][0] > hits[1][0]


def test_empty_query_returns_nothing():
    index = BM25Index([_SHORT, ""])
    assert index.top("", 5) == []


def test_top_is_stable_across_calls():
    index = BM25Index([_LONG, _SHORT, "Berlin is a city"])
    first = index.top("capital France", 5)
    second = index.top("capital France", 5)
    assert first == second
    assert first


def test_k_larger_than_corpus_returns_only_matches():
    docs = [
        "Paris is the capital of France",
        "Bananas ripen in warm weather",
        "Lyon is a city in France",
    ]
    index = BM25Index(docs)
    hits = index.top("France", 100)
    assert [doc_id for _, doc_id in hits] == [0, 2]
    assert len(hits) < len(docs)
