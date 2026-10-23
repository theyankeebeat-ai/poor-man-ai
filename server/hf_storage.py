"""Restore a checksummed private snapshot, with Supabase/Appwrite failover."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from urllib.parse import quote

import httpx

from server.backends import _appwrite, _appwrite_headers, _file_id, _supabase, _supabase_headers


def restore_snapshot(root: Path) -> dict:
    provider = os.getenv("HF_STORAGE_PROVIDER", "local").strip().lower()
    if provider == "local":
        return {"provider": "local", "downloaded": 0}
    if provider not in {"auto", "supabase", "appwrite"}:
        raise ValueError("HF_STORAGE_PROVIDER must be local, auto, supabase, or appwrite")
    providers = ["supabase", "appwrite"] if provider == "auto" else [provider]
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        for source in providers:
            try:
                if source == "supabase":
                    cfg = _supabase()
                    headers = _supabase_headers(cfg)
                    base = f"{cfg['url']}/storage/v1/object/{cfg['bucket']}/"
                    def fetch(name):
                        return client.get(base + quote(name, safe="/"), headers=headers)
                else:
                    cfg = _appwrite()
                    headers = _appwrite_headers(cfg)
                    base = f"{cfg['endpoint']}/storage/buckets/{cfg['bucket']}/files/"
                    def fetch(name):
                        return client.get(base + _file_id(name) + "/download", headers=headers)
                response = fetch("manifest.json")
                response.raise_for_status()
                entries = response.json()["files"]
                if not entries:
                    raise ValueError("Empty snapshot manifest")
                downloaded = 0
                for entry in entries:
                    destination = (root / entry["path"]).resolve()
                    if root.resolve() not in destination.parents:
                        raise ValueError("Invalid snapshot path")
                    checksum = entry.get("sha256", "")
                    if len(checksum) != 64:
                        raise ValueError("Snapshot requires SHA-256 checksums")
                    if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == checksum:
                        continue
                    response = fetch(entry["path"])
                    response.raise_for_status()
                    if len(response.content) != entry["bytes"] or hashlib.sha256(response.content).hexdigest() != checksum:
                        raise ValueError("Snapshot checksum mismatch")
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    temporary = destination.with_suffix(destination.suffix + ".part")
                    temporary.write_bytes(response.content)
                    temporary.replace(destination)
                    downloaded += 1
                return {"provider": source, "downloaded": downloaded}
            except (httpx.HTTPError, ValueError, KeyError, OSError):
                # Never propagate credential-bearing request URLs or response bodies.
                continue
    raise RuntimeError("Snapshot restore failed; check storage credentials and manifest checksums")
