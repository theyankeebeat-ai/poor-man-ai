"""Path jail for coding tools. Every path must stay under the session workspace."""

from __future__ import annotations

import os
import re
from contextvars import ContextVar
from pathlib import Path

_workspace: ContextVar[Path | None] = ContextVar("workspace", default=None)
# Process-wide sticky root for follow-ups ("install yarn in it") and for
# StreamingResponse bodies where the endpoint ContextVar may not propagate.
_last_workspace: Path | None = None

# Quoted paths may contain spaces; bare paths stop at whitespace so
# `...\utter and install` does not become a new folder name.
_QUOTED_WIN = re.compile(r'["\']([A-Za-z]:[\\/][^"\'\r\n]+)["\']')
_QUOTED_UNIX = re.compile(r'["\'](/(?:Users|home|var|tmp|opt|etc)[^"\'\r\n]*)["\']')
_BARE_WIN = re.compile(r'(?<![\w])([A-Za-z]:[\\/][^\s"\'<>|?*]+)')
_BARE_UNIX = re.compile(r'(?<![\w])(/(?:Users|home|var|tmp|opt|etc)[^\s"\'<>|?*]*)')


def path_from_message(message: str, *, create: bool = False) -> str | None:
    """Extract the first absolute workspace path from a user message."""
    text = message or ""
    candidates: list[tuple[str, bool]] = []  # (path, was_quoted)
    for rx in (_QUOTED_WIN, _QUOTED_UNIX):
        for m in rx.finditer(text):
            candidates.append((m.group(1).rstrip(".,;!?: \t\\/"), True))
    for rx in (_BARE_WIN, _BARE_UNIX):
        for m in rx.finditer(text):
            candidates.append((m.group(1).rstrip(".,;!?: \t\\/"), False))
    for raw, quoted in candidates:
        p = Path(raw).expanduser()
        if p.is_dir():
            return str(p.resolve())
        if quoted and p.parent.is_dir():
            if create:
                p.mkdir(parents=True, exist_ok=True)
            if p.is_dir() or create:
                return str(p.resolve() if p.exists() else p)
        # Bare typo paths: only accept if the directory already exists.
    return None

IGNORE_DIRS = frozenset(
    {
        "node_modules",
        ".git",
        "dist",
        "build",
        "__pycache__",
        ".venv",
        "venv",
        ".next",
        "coverage",
    }
)


def default_workspace() -> Path:
    env = os.getenv("GROK_WORKSPACE")
    if env:
        return Path(env).expanduser().resolve()
    if _last_workspace is not None and _last_workspace.is_dir():
        return _last_workspace
    return Path.cwd().resolve()


def set_workspace(path: str | Path | None) -> Path:
    global _last_workspace
    root = Path(path).expanduser().resolve() if path else default_workspace()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"workspace is not a directory: {root}")
    _workspace.set(root)
    _last_workspace = root
    return root


def workspace_root() -> Path:
    global _last_workspace
    root = _workspace.get()
    if root is None:
        root = default_workspace()
        _workspace.set(root)
        if _last_workspace is None:
            _last_workspace = root
    return root


def safe_path(path: str | Path, *, must_exist: bool = False) -> Path:
    root = workspace_root()
    raw = Path(path)
    candidate = raw if raw.is_absolute() else (root / raw)
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as e:
        raise ValueError(f"path escapes workspace ({root}): {path}") from e
    if ".." in raw.parts:
        raise ValueError(f"path traversal rejected: {path}")
    if must_exist and not resolved.exists():
        raise ValueError(f"not found: {resolved}")
    return resolved
