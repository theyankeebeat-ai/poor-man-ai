"""Render, Appwrite, and Supabase.

Local dev stays on 127.0.0.1:8000 and reads hf/ from disk.
The hosted site calls the Render API. Appwrite and Supabase keep a
private copy of that same hf snapshot.
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
import os

ROOT = Path(__file__).resolve().parent.parent
HF_DIR = ROOT / "hf"
load_dotenv(ROOT / ".env")

LOCAL = {
    "app": "http://localhost:5173/",
    "brain": "http://localhost:5173/brain",
    "api": "http://127.0.0.1:8000",
    "node": "http://127.0.0.1:3001",
}


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _hf_files() -> list[Path]:
    if not HF_DIR.is_dir():
        return []
    files: list[Path] = []
    for path in sorted(HF_DIR.rglob("*")):
        if path.is_file() and ".cache" not in path.parts:
            files.append(path)
    return files


def _rel(path: Path) -> str:
    return path.relative_to(HF_DIR).as_posix()


def _file_id(relative: str) -> str:
    return hashlib.sha256(relative.encode("utf-8")).hexdigest()[:32]


def _manifest(primary: str = "hf") -> dict[str, Any]:
    from server.buckets import remote_bucket

    items = []
    for path in _hf_files():
        relative = _rel(path)
        data = path.read_bytes()
        items.append({
            "path": relative,
            "bytes": len(data),
            "file_id": _file_id(relative),
            "sha256": hashlib.sha256(data).hexdigest(),
            "bucket": remote_bucket(primary, relative),
        })
    return {
        "root": "hf",
        "file_count": len(items),
        "total_bytes": sum(item["bytes"] for item in items),
        "files": items,
    }


def _appwrite() -> dict[str, str]:
    return {
        "endpoint": _env("APPWRITE_ENDPOINT", "https://fra.cloud.appwrite.io/v1").rstrip("/"),
        "project": _env("APPWRITE_PROJECT_ID"),
        "key": _env("APPWRITE_API_KEY"),
        "bucket": _env("APPWRITE_BUCKET", "hf"),
    }


def _supabase() -> dict[str, str]:
    return {
        "url": _env("SUPABASE_URL").rstrip("/"),
        "key": _env("SUPABASE_SECRET_KEY"),
        "bucket": _env("SUPABASE_BUCKET", "hf"),
    }


def _render() -> dict[str, str]:
    return {
        "url": _env("RENDER_API_URL", "https://poor-man-ai.onrender.com").rstrip("/"),
        "service_id": _env("RENDER_SERVICE_ID"),
    }


def _appwrite_headers(cfg: dict[str, str]) -> dict[str, str]:
    return {
        "X-Appwrite-Project": cfg["project"],
        "X-Appwrite-Key": cfg["key"],
    }


def _supabase_headers(cfg: dict[str, str]) -> dict[str, str]:
    headers = {"apikey": cfg["key"]}
    if not cfg["key"].startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {cfg['key']}"
    return headers


def _ensure_appwrite_bucket(client: httpx.Client, cfg: dict[str, str]) -> dict[str, Any]:
    if not cfg["project"] or not cfg["key"]:
        return {"ok": False, "bucket": cfg["bucket"], "detail": "Appwrite key is not set"}
    headers = _appwrite_headers(cfg)
    probe = client.get(f"{cfg['endpoint']}/storage/buckets/{cfg['bucket']}", headers=headers)
    if probe.status_code == 200:
        return {"ok": True, "bucket": cfg["bucket"], "created": False}
    if probe.status_code != 404:
        return {"ok": False, "bucket": cfg["bucket"], "detail": f"HTTP {probe.status_code}"}
    created = client.post(
        f"{cfg['endpoint']}/storage/buckets",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "bucketId": cfg["bucket"],
            "name": cfg["bucket"],
            "permissions": [],
            "fileSecurity": False,
            "enabled": True,
            "maximumFileSize": 33554432,
            "allowedFileExtensions": [],
            "compression": "none",
            "encryption": False,
            "antivirus": False,
        },
    )
    if created.status_code not in (200, 201, 409):
        return {"ok": False, "bucket": cfg["bucket"], "detail": created.text[:240]}
    return {"ok": True, "bucket": cfg["bucket"], "created": created.status_code != 409}


def _ensure_supabase_bucket(client: httpx.Client, cfg: dict[str, str]) -> dict[str, Any]:
    if not cfg["url"] or not cfg["key"]:
        return {"ok": False, "bucket": cfg["bucket"], "detail": "Supabase key is not set"}
    headers = {**_supabase_headers(cfg), "Content-Type": "application/json"}
    listed = client.get(f"{cfg['url']}/storage/v1/bucket", headers=headers)
    if listed.status_code != 200:
        return {"ok": False, "bucket": cfg["bucket"], "detail": f"HTTP {listed.status_code}"}
    names = {item.get("id") or item.get("name") for item in listed.json()}
    if cfg["bucket"] in names:
        return {"ok": True, "bucket": cfg["bucket"], "created": False}
    created = client.post(
        f"{cfg['url']}/storage/v1/bucket",
        headers=headers,
        json={"id": cfg["bucket"], "name": cfg["bucket"], "public": False},
    )
    if created.status_code not in (200, 201):
        return {"ok": False, "bucket": cfg["bucket"], "detail": created.text[:240]}
    return {"ok": True, "bucket": cfg["bucket"], "created": True}


def _upload_appwrite(client: httpx.Client, cfg: dict[str, str], relative: str, data: bytes) -> str | None:
    file_id = _file_id(relative)
    headers = _appwrite_headers(cfg)
    url = f"{cfg['endpoint']}/storage/buckets/{cfg['bucket']}/files"
    existing = client.get(f"{url}/{file_id}", headers=headers)
    chunk_size = 5 * 1024 * 1024
    signature = hashlib.md5(data).hexdigest()
    if len(data) > chunk_size:
        parts = [hashlib.md5(data[i:i + chunk_size]).digest() for i in range(0, len(data), chunk_size)]
        signature = hashlib.md5(b"".join(parts)).hexdigest() + f"-{len(parts)}"
    if existing.status_code == 200 and existing.json().get("signature") == signature:
        return None
    if existing.status_code == 200:
        deleted = client.delete(f"{url}/{file_id}", headers=headers)
        deleted.raise_for_status()
    elif existing.status_code != 404:
        existing.raise_for_status()
    name = relative.replace("/", "__")
    mime = mimetypes.guess_type(relative)[0] or "application/octet-stream"
    if len(data) <= chunk_size:
        response = client.post(
            url,
            headers=headers,
            data={"fileId": file_id},
            files={"file": (name, data, mime)},
        )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"Appwrite {relative}: HTTP {response.status_code} {response.text[:180]}")
        return relative
    start = 0
    total = len(data)
    while start < total:
        end = min(start + chunk_size, total) - 1
        part_headers = {**headers, "Content-Range": f"bytes {start}-{end}/{total}"}
        if start:
            part_headers["x-appwrite-id"] = file_id
        response = client.post(
            url,
            headers=part_headers,
            data={"fileId": file_id},
            files={"file": (name, data[start:end + 1], mime)},
        )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"Appwrite {relative}: HTTP {response.status_code} {response.text[:180]}")
        start = end + 1
    return relative


def _upload_supabase(client: httpx.Client, cfg: dict[str, str], relative: str, data: bytes) -> None:
    target = quote(relative, safe="/")
    response = client.post(
        f"{cfg['url']}/storage/v1/object/{cfg['bucket']}/{target}",
        headers={
            **_supabase_headers(cfg),
            "x-upsert": "true",
            "Content-Type": mimetypes.guess_type(relative)[0] or "application/octet-stream",
        },
        content=data,
    )
    if response.status_code not in (200, 201):
        raise RuntimeError(f"Supabase {relative}: HTTP {response.status_code} {response.text[:180]}")


def _ensure_named(client: httpx.Client, cfg: dict[str, str], names: list[str], kind: str) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    ensure = _ensure_appwrite_bucket if kind == "appwrite" else _ensure_supabase_bucket
    for name in names:
        results[name] = ensure(client, {**cfg, "bucket": name})
    return results


def sync_hf() -> dict[str, Any]:
    """Copy hf/ into Appwrite and Supabase.

    Checkpoint files stay in the primary bucket. Each directory under
    hf/buckets/<name>/ is a separate bucket so every bucket stays under 50 MB.
    """
    from server.buckets import plan_storage, remote_bucket

    files = _hf_files()
    if not files:
        raise RuntimeError("No local hf files to synchronize")
    appwrite = _appwrite()
    supabase = _supabase()
    listed = [(_rel(path), path.stat().st_size) for path in files]
    plan_storage(listed, appwrite["bucket"])
    if supabase["bucket"] != appwrite["bucket"]:
        plan_storage(listed, supabase["bucket"])
    blobs = [( _rel(path), path.read_bytes()) for path in files]
    uploaded: list[str] = []
    errors: list[str] = []
    timeout = httpx.Timeout(120.0, connect=20.0)
    with httpx.Client(timeout=timeout) as client:
        app_names = sorted({remote_bucket(appwrite["bucket"], relative) for relative, _data in blobs})
        sup_names = sorted({remote_bucket(supabase["bucket"], relative) for relative, _data in blobs})
        app_buckets = _ensure_named(client, appwrite, app_names, "appwrite")
        sup_buckets = _ensure_named(client, supabase, sup_names, "supabase")
        quiet = {"Appwrite key is not set", "Supabase key is not set"}
        app_blocked = False
        sup_blocked = False
        for name, result in {**{f"appwrite:{key}": value for key, value in app_buckets.items()}, **{f"supabase:{key}": value for key, value in sup_buckets.items()}}.items():
            if not result.get("ok"):
                detail = str(result.get("detail") or "unavailable")
                if detail not in quiet:
                    errors.append(f"{name}: {detail}")
                    if name.startswith("appwrite:"):
                        app_blocked = True
                    else:
                        sup_blocked = True
        for relative, data in blobs:
            app_name = remote_bucket(appwrite["bucket"], relative)
            sup_name = remote_bucket(supabase["bucket"], relative)
            if app_buckets.get(app_name, {}).get("ok"):
                try:
                    changed = _upload_appwrite(client, {**appwrite, "bucket": app_name}, relative, data)
                    if changed:
                        uploaded.append(f"appwrite:{app_name}:{changed}")
                except Exception as exc:
                    errors.append(str(exc))
                    app_blocked = True
            if sup_buckets.get(sup_name, {}).get("ok"):
                try:
                    _upload_supabase(client, {**supabase, "bucket": sup_name}, relative, data)
                    uploaded.append(f"supabase:{sup_name}:{relative}")
                except Exception as exc:
                    errors.append(str(exc))
                    sup_blocked = True
        # Each provider gets a manifest when its own uploads succeeded.
        # An Appwrite plan limit must not hide a finished Supabase snapshot.
        if not app_blocked and app_buckets.get(appwrite["bucket"], {}).get("ok"):
            _upload_appwrite(
                client,
                appwrite,
                "manifest.json",
                json.dumps(_manifest(appwrite["bucket"])).encode("utf-8"),
            )
        if not sup_blocked and sup_buckets.get(supabase["bucket"], {}).get("ok"):
            _upload_supabase(
                client,
                supabase,
                "manifest.json",
                json.dumps(_manifest(supabase["bucket"])).encode("utf-8"),
            )
    return {
        "local_files": len(files),
        "uploaded": len(uploaded),
        "errors": errors,
        "appwrite": app_buckets.get(appwrite["bucket"], {"ok": False, "bucket": appwrite["bucket"]}),
        "supabase": sup_buckets.get(supabase["bucket"], {"ok": False, "bucket": supabase["bucket"]}),
        "buckets": sorted(set(app_names) | set(sup_names)),
    }


def _count_appwrite(client: httpx.Client, cfg: dict[str, str]) -> dict[str, Any]:
    if not cfg["project"] or not cfg["key"]:
        return {"ok": False, "detail": "Appwrite credentials missing"}
    listed = client.get(
        f"{cfg['endpoint']}/storage/buckets/{cfg['bucket']}/files",
        headers=_appwrite_headers(cfg),
    )
    if listed.status_code != 200:
        return {"ok": False, "bucket": cfg["bucket"], "detail": f"HTTP {listed.status_code}"}
    body = listed.json()
    return {
        "ok": True,
        "bucket": cfg["bucket"],
        "endpoint": cfg["endpoint"],
        "project": cfg["project"],
        "files": body.get("total", len(body.get("files") or [])),
    }


def _count_supabase(client: httpx.Client, cfg: dict[str, str]) -> dict[str, Any]:
    if not cfg["url"] or not cfg["key"]:
        return {"ok": False, "detail": "Supabase credentials missing"}
    headers = _supabase_headers(cfg)
    manifest = client.get(
        f"{cfg['url']}/storage/v1/object/{cfg['bucket']}/manifest.json",
        headers=headers,
    )
    file_count = None
    if manifest.status_code == 200:
        try:
            file_count = int(manifest.json().get("file_count"))
        except Exception:
            file_count = None
    return {
        "ok": True,
        "bucket": cfg["bucket"],
        "project": cfg["url"],
        "files": file_count,
        "manifest": manifest.status_code == 200,
    }


def _ping_render(client: httpx.Client) -> dict[str, Any]:
    cfg = _render()
    try:
        response = client.get(f"{cfg['url']}/health")
    except httpx.HTTPError as exc:
        return {"ok": False, "url": cfg["url"], "service_id": cfg["service_id"], "detail": type(exc).__name__}
    return {
        "ok": response.status_code == 200 and response.headers.get("content-type", "").startswith("application/json") and response.json().get("status") == "ok",
        "url": cfg["url"],
        "service_id": cfg["service_id"],
        "status": response.status_code,
    }


def status() -> dict[str, Any]:
    """Return the one local system. Does not contact cloud storage."""
    from server.mesh import registry

    return registry()


if __name__ == "__main__":
    result = sync_hf()
    print(json.dumps({
        "local_files": result["local_files"],
        "uploaded": result["uploaded"],
        "errors": result["errors"],
        "appwrite_ok": result["appwrite"].get("ok"),
        "supabase_ok": result["supabase"].get("ok"),
    }, indent=2))
