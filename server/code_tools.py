"""Local coding tools: list/read/grep/patch/run under workspace jail."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from server.cache import get as cache_get
from server.cache import put as cache_put
from server.workspace import IGNORE_DIRS, safe_path, workspace_root

AUDIT = Path(__file__).resolve().parent / "data" / "code-audit.jsonl"

ALLOW_BINS = frozenset(
    {
        "python",
        "py",
        "npm",
        "npx",
        "node",
        "git",
        "pytest",
        "pip",
        "tsc",
        "yarn",
        "uv",
    }
)

DENY_RE = re.compile(
    r"(Remove-Item\s+-Recurse|Format-|reg\s|shutdown|"
    r"irm\s+https?://|curl\s+[^\n]+\|\s*(iex|bash)|"
    r"rm\s+-rf|del\s+/[sf]|Invoke-WebRequest[^\n]*\|\s*iex)",
    re.I,
)

GIT_WRITE = re.compile(r"\b(commit|push|reset\s+--hard|clean\s+-fd)\b", re.I)


def _audit(event: dict[str, Any]) -> None:
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    event = {"ts": datetime.now(timezone.utc).isoformat(), **event}
    with AUDIT.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def _tree(root: Path, max_entries: int = 200, depth: int = 3) -> list[str]:
    lines: list[str] = []

    def walk(p: Path, d: int, prefix: str) -> None:
        if len(lines) >= max_entries or d > depth:
            return
        try:
            kids = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        except OSError:
            return
        for child in kids:
            if child.name in IGNORE_DIRS or child.name.startswith("."):
                continue
            rel = child.relative_to(root).as_posix()
            lines.append(prefix + ("/" if child.is_dir() else "") + rel)
            if child.is_dir():
                walk(child, d + 1, prefix)

    walk(root, 0, "")
    return lines[:max_entries]


async def workspace_info(_args: dict[str, Any]) -> str:
    root = workspace_root()
    branch = ""
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
        )
        if r.returncode == 0:
            branch = r.stdout.strip()
    except Exception:
        pass
    hints: list[str] = []
    for name in (
        "package.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "package-lock.json",
        "pyproject.toml",
        "requirements.txt",
        "Cargo.toml",
        "go.mod",
    ):
        if (root / name).exists():
            hints.append(name)
    agents = (root / "AGENTS.md").exists()
    scripts: dict[str, str] = {}
    package_manager = ""
    pkg = root / "package.json"
    if pkg.exists():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
            raw = data.get("scripts") if isinstance(data, dict) else None
            if isinstance(raw, dict):
                scripts = {str(k): str(v)[:120] for k, v in list(raw.items())[:20]}
        except (OSError, json.JSONDecodeError):
            pass
        if (root / "yarn.lock").exists():
            package_manager = "yarn"
        elif (root / "pnpm-lock.yaml").exists():
            package_manager = "pnpm"
        elif (root / "package-lock.json").exists():
            package_manager = "npm"
    return json.dumps(
        {
            "root": str(root),
            "git_branch": branch,
            "language_hints": hints,
            "has_agents_md": agents,
            "scripts": scripts,
            "package_manager": package_manager,
        },
        ensure_ascii=False,
    )


async def list_dir(args: dict[str, Any]) -> str:
    rel = str(args.get("path") or ".")
    p = safe_path(rel, must_exist=True)
    if not p.is_dir():
        return f"error: not a directory: {rel}"
    depth = int(args.get("depth") or 3)
    lines = _tree(p, depth=depth)
    return json.dumps({"path": str(p), "entries": lines}, ensure_ascii=False)


async def read_file(args: dict[str, Any]) -> str:
    p = safe_path(str(args.get("path") or ""), must_exist=True)
    if p.name == ".env" or p.suffix in {".pem", ".key"}:
        return "error: refusing to print secrets (.env / keys)"
    text = p.read_text(encoding="utf-8", errors="replace")
    start = int(args.get("start") or args.get("start_line") or 1)
    end = args.get("end") or args.get("end_line")
    lines = text.splitlines()
    if end is None:
        end = min(start + 199, len(lines))
    else:
        end = min(int(end), len(lines))
    start = max(1, start)
    chunk = lines[start - 1 : end]
    numbered = "\n".join(f"{i + start}|{line}" for i, line in enumerate(chunk))
    return json.dumps(
        {"path": str(p), "start": start, "end": end, "total": len(lines), "text": numbered},
        ensure_ascii=False,
    )


async def grep(args: dict[str, Any]) -> str:
    pattern = str(args.get("pattern") or args.get("query") or "")
    if not pattern:
        return "error: empty pattern"
    root = workspace_root()
    rel = str(args.get("path") or ".")
    target = safe_path(rel, must_exist=True)
    rg = shutil.which("rg")
    if rg:
        cmd = [rg, "--line-number", "--max-count", "40", "-e", pattern, str(target)]
        glob = args.get("glob")
        if glob:
            cmd.extend(["--glob", str(glob)])
        r = subprocess.run(
            cmd,
            cwd=root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
        )
        out = (r.stdout or r.stderr or "")[:8000]
        return json.dumps({"pattern": pattern, "hits": out}, ensure_ascii=False)
    rx = re.compile(pattern, re.I)
    hits: list[str] = []

    def _scan_file(fp: Path) -> bool:
        try:
            if fp.stat().st_size > 400_000:
                return False
            text = fp.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return False
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                relp = fp.relative_to(root).as_posix()
                hits.append(f"{relp}:{i}:{line[:200]}")
                if len(hits) >= 80:
                    return True
        return False

    if target.is_file():
        _scan_file(target)
    else:
        for dirpath, dirnames, filenames in os.walk(target):
            dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")]
            for fn in filenames:
                if _scan_file(Path(dirpath) / fn):
                    return json.dumps({"pattern": pattern, "hits": "\n".join(hits)})
    return json.dumps({"pattern": pattern, "hits": "\n".join(hits)}, ensure_ascii=False)


def _apply_unified(text: str, diff: str) -> str:
    """Apply a single-file unified diff (@@ hunks) without spawning patch(1)."""
    lines = text.splitlines(keepends=True)
    hunks = re.split(r"(?=^@@ )", diff, flags=re.M)
    offset = 0
    applied = 0
    for hunk in hunks:
        m = re.match(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", hunk)
        if not m:
            continue
        old_start = int(m.group(1))
        body = hunk.splitlines(keepends=True)[1:]
        old_lines: list[str] = []
        new_lines: list[str] = []
        for raw in body:
            if raw.startswith("\\"):
                continue
            mark, rest = (raw[0], raw[1:]) if raw[:1] in "+- " else (" ", raw)
            if mark in " -":
                old_lines.append(rest if rest.endswith("\n") else rest + "\n")
            if mark in " +":
                new_lines.append(rest if rest.endswith("\n") else rest + "\n")
        # @@ -0,0 means insert at start (or into empty file), not index -1.
        i = 0 if old_start == 0 else old_start - 1 + offset
        chunk = lines[i : i + len(old_lines)]
        if [c.replace("\r\n", "\n") for c in chunk] != [c.replace("\r\n", "\n") for c in old_lines]:
            raise ValueError("unified hunk did not match; read_file again")
        lines[i : i + len(old_lines)] = new_lines
        offset += len(new_lines) - len(old_lines)
        applied += 1
    if not applied:
        raise ValueError("no @@ hunks in diff")
    return "".join(lines)


async def apply_patch(args: dict[str, Any]) -> str:
    p = safe_path(str(args.get("path") or ""))
    if not p.exists() or not p.is_file():
        return f"error: file not found: {p}"
    old = args.get("old")
    new = args.get("new")
    diff = args.get("diff") or args.get("unified")
    text = p.read_text(encoding="utf-8", errors="replace")
    if diff:
        try:
            updated = _apply_unified(text, str(diff))
        except ValueError as e:
            return f"error: {e}"
    elif old is not None:
        old_s = str(old)
        new_s = str(new if new is not None else "")
        n = text.count(old_s)
        if n == 0:
            return "error: old snippet not found; read_file again, do not guess"
        if n > 1:
            return "error: old snippet not unique; include more context"
        updated = text.replace(old_s, new_s, 1)
    else:
        return "error: provide old/new unique snippet or unified diff"
    p.write_text(updated, encoding="utf-8")
    _audit({"op": "apply_patch", "path": str(p)})
    return json.dumps({"ok": True, "path": str(p)}, ensure_ascii=False)


async def write_file(args: dict[str, Any]) -> str:
    p = safe_path(str(args.get("path") or ""))
    if p.exists() and not args.get("overwrite"):
        return f"error: exists (use apply_patch or overwrite=true): {p}"
    p.parent.mkdir(parents=True, exist_ok=True)
    content = str(args.get("content") or "")
    p.write_text(content, encoding="utf-8")
    _audit({"op": "write_file", "path": str(p), "bytes": len(content)})
    return json.dumps({"ok": True, "path": str(p), "bytes": len(content)})


def _unquote(token: str) -> str:
    """Strip one layer of matching quotes. shlex(posix=False) keeps them."""
    if len(token) >= 2 and token[0] == token[-1] and token[0] in "\"'":
        return token[1:-1]
    return token


def _split_cmd(cmd: str) -> list[str]:
    # Windows-style split, then drop surrounding quotes so python -c / node -e work.
    import shlex

    try:
        parts = shlex.split(cmd, posix=False)
    except ValueError:
        parts = cmd.split()
    return [_unquote(p) for p in parts]


async def run_cmd(args: dict[str, Any]) -> str:
    cmd = str(args.get("cmd") or "").strip()
    if not cmd:
        return "error: empty cmd"
    if DENY_RE.search(cmd):
        return "error: command denied by policy"
    parts = _split_cmd(cmd)
    if not parts:
        return "error: empty cmd"
    bin_name = Path(parts[0]).name.lower()
    if bin_name.endswith(".exe") or bin_name.endswith(".cmd") or bin_name.endswith(".ps1"):
        bin_name = Path(bin_name).stem
    if bin_name not in ALLOW_BINS:
        return f"error: binary not allowlisted: {bin_name}"
    env = os.environ.copy()
    extra_path = [
        r"C:\Program Files\nodejs",
        str(Path.home() / "AppData" / "Roaming" / "npm"),
        str(Path.home() / "AppData" / "Local" / "Programs" / "nodejs"),
    ]
    env["PATH"] = os.pathsep.join([*extra_path, env.get("PATH", "")])
    # Non-interactive: create-vite / npm prompts cancel when stdin is not a TTY.
    env.setdefault("CI", "1")
    env.setdefault("npm_config_yes", "true")
    env.setdefault("NPM_CONFIG_YES", "true")
    env.setdefault("FORCE_COLOR", "0")
    resolved = shutil.which(parts[0], path=env["PATH"]) or shutil.which(bin_name, path=env["PATH"])
    if not resolved:
        return json.dumps({"exit": -1, "error": f"not found: {bin_name}", "cmd": cmd})
    parts[0] = resolved
    # .cmd/.bat need cmd.exe; CreateProcess cannot run them as PE images.
    if resolved.lower().endswith((".cmd", ".bat")):
        parts = ["cmd.exe", "/c", resolved, *parts[1:]]
    if bin_name == "git" and GIT_WRITE.search(cmd) and not args.get("allow_git_write"):
        return "error: git commit/push/reset blocked unless allow_git_write=true"
    timeout = int(args.get("timeout_sec") or 60)
    root = workspace_root()
    # npm/yarn --prefix/--cwd outside the workspace previously mutated THIS repo's
    # package.json (init -y ignores --prefix and writes into cwd).
    for flag in ("--prefix", "--cwd"):
        if flag in parts:
            idx = parts.index(flag)
            if idx + 1 < len(parts):
                pref = Path(parts[idx + 1]).expanduser().resolve()
                try:
                    pref.relative_to(root)
                except ValueError:
                    return json.dumps(
                        {
                            "exit": -1,
                            "error": (
                                f"{flag} path escapes workspace ({root}): {pref}. "
                                "Point the session workspace at that folder "
                                "(or put the absolute path in the user message) "
                                f"and run without {flag}."
                            ),
                            "cmd": cmd,
                        }
                    )
    if (
        bin_name in {"npm", "yarn", "pnpm"}
        and re.search(r"\binit\b", cmd, re.I)
        and (root / "package.json").is_file()
    ):
        return json.dumps(
            {
                "exit": -1,
                "error": (
                    f"refusing `{bin_name} init` — workspace {root} already has "
                    "package.json (init -y merges into it). Use an empty project "
                    "folder as the workspace, or write package.json with write_file."
                ),
                "cmd": cmd,
            }
        )
    _audit({"op": "run_cmd", "cmd": cmd, "cwd": str(root)})
    try:
        import asyncio

        r = await asyncio.to_thread(
            subprocess.run,
            parts,
            cwd=root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            shell=False,
            env=env,
        )
    except subprocess.TimeoutExpired:
        return json.dumps({"exit": -1, "error": "timeout", "cmd": cmd})
    except FileNotFoundError:
        return json.dumps({"exit": -1, "error": f"not found: {bin_name}", "cmd": cmd})
    except OSError as e:
        return json.dumps({"exit": -1, "error": f"os error: {e}", "cmd": cmd})
    payload = {
        "cmd": cmd,
        "exit": r.returncode,
        "stdout": (r.stdout or "")[-6000:],
        "stderr": (r.stderr or "")[-4000:],
    }
    if r.returncode != 0:
        err_tail = "\n".join((r.stderr or r.stdout or "").splitlines()[-20:])
        payload["error_tail"] = err_tail
        cache_key = err_tail[:240]
        cached = cache_get("code_err_search", cache_key)
        if cached:
            payload["search_cached"] = cached if isinstance(cached, str) else json.dumps(cached)
        else:
            from server.tools import web_search

            hits = await web_search({"query": err_tail[:180]})
            cache_put("code_err_search", hits, cache_key)
            payload["search"] = hits[:4000]
            try:
                from server.tools import read_url

                urls = re.findall(r"https?://[^\s\"']+", hits)
                official = [
                    u
                    for u in urls
                    if any(
                        h in u
                        for h in (
                            "docs.",
                            "github.com",
                            "readthedocs",
                            "python.org",
                            "fastapi.tiangolo",
                            "eslint.org",
                            "typescriptlang.org",
                            "stackoverflow.com",
                            "vitejs.dev",
                            "react.dev",
                        )
                    )
                ]
                pick = (official or urls)[:1]
                if pick:
                    payload["docs"] = (await read_url({"url": pick[0]}))[:2500]
            except Exception:
                pass
    return json.dumps(payload, ensure_ascii=False)


async def git_status(_args: dict[str, Any]) -> str:
    root = workspace_root()
    r = subprocess.run(
        ["git", "status", "--short"],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=15,
    )
    return json.dumps({"exit": r.returncode, "text": r.stdout or r.stderr}, ensure_ascii=False)


async def git_diff(_args: dict[str, Any]) -> str:
    root = workspace_root()
    r = subprocess.run(
        ["git", "diff"],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=15,
    )
    return json.dumps({"exit": r.returncode, "text": (r.stdout or "")[:12_000]}, ensure_ascii=False)


CODE_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "workspace_info",
            "description": "Workspace root, git branch, language hints. Call first on coding turns.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": "List files under workspace (skips node_modules/.git/dist).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "depth": {"type": "integer"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file with optional start/end line numbers. Never dump huge files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "start": {"type": "integer"},
                    "end": {"type": "integer"},
                    "start_line": {"type": "integer"},
                    "end_line": {"type": "integer"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "grep",
            "description": "Search workspace for a regex (ripgrep if installed).",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string"},
                    "query": {"type": "string"},
                    "path": {"type": "string"},
                    "glob": {"type": "string"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "apply_patch",
            "description": "Replace a unique old snippet with new, or apply a unified diff (diff=).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old": {"type": "string"},
                    "new": {"type": "string"},
                    "diff": {"type": "string"},
                    "unified": {"type": "string"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create a new file. Use apply_patch for edits.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "overwrite": {"type": "boolean"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_cmd",
            "description": "Run an allowlisted command in the workspace (python, npm, git, pytest, tsc, pip, node, npx). On failure includes search hits for the traceback.",
            "parameters": {
                "type": "object",
                "properties": {
                    "cmd": {"type": "string"},
                    "timeout_sec": {"type": "integer"},
                    "allow_git_write": {"type": "boolean"},
                },
                "required": ["cmd"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_status",
            "description": "git status --short in workspace.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_diff",
            "description": "git diff in workspace.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

CODE_RUNNERS = {
    "workspace_info": workspace_info,
    "list_dir": list_dir,
    "read_file": read_file,
    "grep": grep,
    "apply_patch": apply_patch,
    "write_file": write_file,
    "run_cmd": run_cmd,
    "git_status": git_status,
    "git_diff": git_diff,
}
