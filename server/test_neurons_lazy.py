from concurrent.futures import ThreadPoolExecutor

from server import neurons


def test_registry_does_not_train_networks(monkeypatch):
    monkeypatch.setattr(neurons, "_BANKS", {})
    def unexpected(*args):
        raise AssertionError("Status inspection must not train routing networks")
    monkeypatch.setattr(neurons, "_fit", unexpected)
    assert "reason" in neurons.banks()
    assert "crew:judge" in neurons.crew_banks()
    assert neurons._BANKS == {}


def test_concurrent_first_use_trains_once_and_preserves_fallback(monkeypatch):
    monkeypatch.setattr(neurons, "_BANKS", {})
    calls = []
    network = object()
    def fit(seed, pairs):
        calls.append((seed, pairs))
        return network
    monkeypatch.setattr(neurons, "_fit", fit)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(neurons._get_bank, ["reason"] * 8))
    assert all(item is network for item in results)
    assert calls == [neurons._BANK_SPECS["reason"]]
    assert neurons._get_bank("unregistered") is network
    assert len(calls) == 1
