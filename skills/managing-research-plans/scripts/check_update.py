#!/usr/bin/env python3
"""research-plans SessionStart update check. Stdlib only.

Compares the installed plugin version against GitHub `main` and, at most once
per new version, prints a JSON notice. Any failure exits 0 silently — this must
never slow or break session start.
"""
import json
import os
import re
import time
from pathlib import Path

DEFAULT_STATE = {
    "lastAttempt": 0.0,
    "lastSuccess": 0.0,
    "lastSeenRemoteVersion": "",
    "lastNotifiedVersion": "",
    "installedVersionAtLastCheck": "",
}


def parse_version(s):
    parts = []
    for chunk in str(s).lstrip("vV").split("."):
        num = ""
        for ch in chunk:
            if ch.isdigit():
                num += ch
            else:
                break
        parts.append(int(num) if num else 0)
    return tuple(parts)


def is_newer(remote, installed):
    return parse_version(remote) > parse_version(installed)


def read_state(path):
    state = dict(DEFAULT_STATE)
    try:
        loaded = json.loads(Path(path).read_text())
        if isinstance(loaded, dict):
            state.update({k: loaded[k] for k in DEFAULT_STATE if k in loaded})
    except (OSError, ValueError):
        pass
    return state


def write_state(path, state):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(state))
    os.replace(tmp, path)


def should_check(state, now, ttl=86400.0):
    return (now - float(state.get("lastAttempt", 0.0))) >= ttl


def should_notify(state, remote_version):
    return state.get("lastNotifiedVersion", "") != remote_version


def sanitize_highlight(s, width=80):
    s = re.sub(r"<[^>]*>", "", str(s))     # strip HTML tags
    s = re.sub(r"[`*_]", "", s)            # strip markdown emphasis/code marks
    s = re.sub(r"\s+", " ", s)             # newlines/tabs -> single space (keep word gaps)
    s = "".join(ch for ch in s if ord(ch) >= 32 and ord(ch) != 127)  # drop ESC/control
    s = s.strip()
    if len(s) > width:
        s = s[: width - 1].rstrip() + "…"
    return s


_HEADER_RE = re.compile(r"^##\s+.*\d")          # a version header line
_BOLD_LEAD_RE = re.compile(r"^\s*-\s+\*\*(.+?)\*\*")


def parse_changelog_highlights(text, limit=3):
    lines = str(text).splitlines()
    start = None
    for i, ln in enumerate(lines):
        if _HEADER_RE.match(ln):
            start = i + 1
            break
    if start is None:
        return []
    highlights = []
    for ln in lines[start:]:
        if _HEADER_RE.match(ln) or ln.startswith("## "):
            break
        m = _BOLD_LEAD_RE.match(ln)
        if m:
            highlights.append(sanitize_highlight(m.group(1)))
            if len(highlights) >= limit:
                break
    return highlights
