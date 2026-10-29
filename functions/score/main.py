"""Appwrite proxy for the Go brain. The plan only allows the existing functions."""

import json
import os
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

UPSTREAMS = [
    os.environ.get("VERCEL_API", "https://poor-man-ai.vercel.app").rstrip("/"),
    os.environ.get("RENDER_API", "https://poor-man-ai.onrender.com").rstrip("/"),
]

CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, accept",
    "access-control-allow-methods": "GET, POST, OPTIONS",
}


def main(context):
    method = (context.req.method or "GET").upper()
    if method == "OPTIONS":
        return context.res.send("", 204, CORS)

    path = context.req.path or "/"
    if not path.startswith("/"):
        path = "/" + path
    query = ""
    raw_query = getattr(context.req, "query_string", None)
    if raw_query:
        query = raw_query if str(raw_query).startswith("?") else "?" + str(raw_query)
    else:
        params = getattr(context.req, "query", None)
        if isinstance(params, dict) and params:
            query = "?" + urlencode(params)

    body = None
    if method not in ("GET", "HEAD"):
        payload = context.req.body
        if isinstance(payload, (dict, list)):
            body = json.dumps(payload).encode()
        elif isinstance(payload, str) and payload:
            body = payload.encode()
        elif isinstance(payload, (bytes, bytearray)) and payload:
            body = bytes(payload)

    headers = {}
    req_headers = context.req.headers if isinstance(context.req.headers, dict) else {}
    content_type = req_headers.get("content-type") or req_headers.get("Content-Type")
    accept = req_headers.get("accept") or req_headers.get("Accept")
    if content_type:
        headers["Content-Type"] = content_type
    elif body:
        headers["Content-Type"] = "application/json"
    if accept:
        headers["Accept"] = accept

    last_status = 502
    for base in UPSTREAMS:
        try:
            upstream = urlrequest.Request(
                base + path + query, data=body, headers=headers, method=method
            )
            try:
                with urlrequest.urlopen(upstream, timeout=20) as resp:
                    data = resp.read()
                    status = resp.status
                    response_type = resp.headers.get("Content-Type", "application/json")
            except HTTPError as err:
                data = err.read()
                status = err.code
                response_type = (
                    err.headers.get("Content-Type", "application/json")
                    if err.headers
                    else "application/json"
                )
            last_status = status
            if status == 404 or status >= 500:
                continue
            out = dict(CORS)
            out["content-type"] = response_type
            out["cache-control"] = "no-cache"
            return context.res.send(data.decode("utf-8", errors="replace"), status, out)
        except (URLError, TimeoutError) as err:
            context.error(str(err))
            last_status = 502

    err_headers = dict(CORS)
    err_headers["content-type"] = "application/json"
    return context.res.send(
        json.dumps({"status": "error", "detail": "upstream unavailable"}),
        last_status,
        err_headers,
    )
