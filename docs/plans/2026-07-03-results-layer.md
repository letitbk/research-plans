# Results Layer (v0.6.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Versioned, immutable result bundles per component (report + figure/table snapshots + script snapshots + key metrics) with a fifth board view for review, verdicts (accept / request-changes), and retrofit adoption of pre-existing artifacts.

**Architecture:** A new stdlib-only `results.py` owns bundle mechanics (discover → stage → finalize → verdict) with a staging-then-atomic-rename protocol; `signoff_gate.py` gains a synchronous immutability branch for finalized bundles; `board.py` collects bundles into the payload and serves artifact bytes in live mode / inlines data URIs in static+remote modes; the React board gains a Results view, two annotation types, and a verdict action block that the session (not the server) applies.

**Tech Stack:** Python 3.9+ stdlib only (scripts), React 18 + TypeScript + Tailwind + marked + vite (board), unittest + vitest (tests).

**Spec:** `docs/specs/2026-07-03-results-layer-design.md` (read it first).

## Global Constraints

- Python scripts: stdlib only, Python 3.9+ compatible (no `match`, no `|` type unions).
- Branch: `feature/results-layer`, worktree `~/github/research-plans-results`. Never touch `~/github/research-plans` (another session works there).
- Size cap: artifacts > 5 MB (5\*1024\*1024 bytes) are not copied (`file: null`, `oversized: true`).
- Finalized bundles (`results/rN/`) are immutable; the ONE exception is one-time creation of `verdict.json`.
- The gate's results branch is synchronous file policy only — it must NEVER launch the browser board.
- `board.py` never mutates plan/results files — verdicts are applied by the session via `results.py verdict`.
- `Markdown.tsx`'s HTML-escaping policy stays intact; table HTML renders only through the whitelist-sanitizing `SafeTable`.
- All hook decisions: exit 0 + PreToolUse decision JSON (`decide()` helper); exit 0 with no output = not gated.
- Tests after every task: `python3 -m unittest discover -s tests -q` and (for board tasks) `cd board && npx vitest run`.
- Commits: imperative one-liners, no Co-Authored-By.

---

### Task 1: `results.py` — stage / copy / finalize

**Files:**
- Create: `skills/managing-research-plans/scripts/results.py`
- Test: `tests/test_results.py`

**Interfaces:**
- Produces CLI: `results.py stage --component NN-slug [--root R]` → prints abs staging dir path.
- `results.py copy --staging DIR --into artifacts|scripts SRC...` → prints JSON list of `{"src": rel, "file": "artifacts/<name>"|null, "sha256": hex, "bytes": int, "oversized": bool}`.
- `results.py finalize --staging DIR` → validates, atomically renames to next `rN/`, prints JSON `{"resultsVersion": N, "path": "plans/execution/<slug>/results/rN"}`. Exit 1 + stderr message on validation failure.
- Produces functions used by tests and later tasks: `next_version(results_dir) -> int`, `sha256_file(path) -> str`, `MAX_BYTES = 5 * 1024 * 1024`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_results.py
"""Tests for results.py bundle mechanics. Run:
    python3 -m unittest tests.test_results -v
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = (
    Path(__file__).resolve().parents[1]
    / "skills" / "managing-research-plans" / "scripts"
)
RESULTS = SCRIPTS / "results.py"
sys.path.insert(0, str(SCRIPTS))
import results  # noqa: E402


def make_project(root: Path):
    plans = root / "plans"
    (plans / "execution" / "02-analysis").mkdir(parents=True)
    (plans / "master-plan.md").write_text(
        "<!-- research-plans:master-plan -->\n# T — Master Plan\n\n"
        "## Components\n\n"
        "| # | Component | Status | Execution plan | Outcome / notes | Serves |\n"
        "|---|-----------|--------|----------------|-----------------|--------|\n"
        "| 1 | Analysis | done | [v1](execution/02-analysis/v1.md) | — | — |\n",
        encoding="utf-8",
    )
    (plans / "execution" / "02-analysis" / "v1.md").write_text(
        "# Analysis — Execution Plan v1\n\n## Goal and success criteria\n\nG.\n",
        encoding="utf-8",
    )
    out = root / "output"
    out.mkdir()
    (out / "fig1.png").write_bytes(b"\x89PNG fake image bytes")
    (out / "table1.csv").write_text("a,b\n1,2\n", encoding="utf-8")
    code = root / "code"
    code.mkdir()
    (code / "03_model.R").write_text("lm(y ~ x)\n", encoding="utf-8")
    return plans


def run_cli(cwd, *argv):
    return subprocess.run(
        [sys.executable, str(RESULTS), *argv],
        capture_output=True, text=True, cwd=str(cwd), timeout=60,
    )


def manifest_for(staging: Path, component="02-analysis", version=1, entries=None):
    return {
        "schemaVersion": 1,
        "component": component,
        "resultsVersion": version,
        "planVersion": 1,
        "provenance": "planned",
        "trigger": "initial",
        "capturedAt": "2026-07-03 12:00",
        "summary": "test bundle",
        "metrics": [{"label": "N", "value": "10"}],
        "artifacts": entries or [],
    }


class TestStageCopyFinalize(unittest.TestCase):
    def _stage(self, root):
        p = run_cli(root, "stage", "--component", "02-analysis")
        self.assertEqual(p.returncode, 0, p.stderr)
        staging = Path(p.stdout.strip())
        self.assertTrue(staging.is_dir())
        self.assertTrue(staging.name.startswith(".staging-"))
        self.assertTrue((staging / "artifacts").is_dir())
        self.assertTrue((staging / "scripts").is_dir())
        return staging

    def test_stage_copy_finalize_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            staging = self._stage(root)
            p = run_cli(root, "copy", "--staging", str(staging),
                        "--into", "artifacts", "output/fig1.png", "output/table1.csv")
            self.assertEqual(p.returncode, 0, p.stderr)
            recs = json.loads(p.stdout)
            self.assertEqual(recs[0]["file"], "artifacts/fig1.png")
            self.assertFalse(recs[0]["oversized"])
            self.assertEqual(recs[0]["sha256"],
                             results.sha256_file(root / "output" / "fig1.png"))
            p2 = run_cli(root, "copy", "--staging", str(staging),
                         "--into", "scripts", "code/03_model.R")
            self.assertEqual(p2.returncode, 0, p2.stderr)
            arts = [
                {"id": "fig", "kind": "figure", "title": "F",
                 "file": "artifacts/fig1.png",
                 "source": {"path": "output/fig1.png",
                            "sha256": recs[0]["sha256"],
                            "bytes": recs[0]["bytes"], "oversized": False},
                 "producedBy": {"script": "scripts/03_model.R",
                                "sourcePath": "code/03_model.R", "lang": "r"}},
            ]
            (staging / "manifest.json").write_text(
                json.dumps(manifest_for(staging, entries=arts)), encoding="utf-8")
            (staging / "report.md").write_text("# Report\n\nDone.\n", encoding="utf-8")
            p3 = run_cli(root, "finalize", "--staging", str(staging))
            self.assertEqual(p3.returncode, 0, p3.stderr)
            out = json.loads(p3.stdout)
            self.assertEqual(out["resultsVersion"], 1)
            r1 = root / "plans" / "execution" / "02-analysis" / "results" / "r1"
            self.assertTrue((r1 / "manifest.json").is_file())
            self.assertTrue((r1 / "artifacts" / "fig1.png").is_file())
            self.assertFalse(staging.exists())

    def test_finalize_numbers_sequentially(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            for expected in (1, 2):
                staging = self._stage(root)
                (staging / "manifest.json").write_text(
                    json.dumps(manifest_for(staging, version=99)), encoding="utf-8")
                (staging / "report.md").write_text("# R\n", encoding="utf-8")
                p = run_cli(root, "finalize", "--staging", str(staging))
                self.assertEqual(p.returncode, 0, p.stderr)
                self.assertEqual(json.loads(p.stdout)["resultsVersion"], expected)
            # finalize rewrote the manifest's resultsVersion to the real number
            m = json.loads((root / "plans" / "execution" / "02-analysis" /
                            "results" / "r2" / "manifest.json").read_text())
            self.assertEqual(m["resultsVersion"], 2)

    def test_finalize_rejects_missing_artifact_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            staging = self._stage(root)
            arts = [{"id": "x", "kind": "figure", "title": "X",
                     "file": "artifacts/nope.png",
                     "source": {"path": "output/nope.png", "sha256": "0" * 64,
                                "bytes": 1, "oversized": False},
                     "producedBy": None}]
            (staging / "manifest.json").write_text(
                json.dumps(manifest_for(staging, entries=arts)), encoding="utf-8")
            (staging / "report.md").write_text("# R\n", encoding="utf-8")
            p = run_cli(root, "finalize", "--staging", str(staging))
            self.assertEqual(p.returncode, 1)
            self.assertIn("nope.png", p.stderr)

    def test_finalize_rejects_missing_manifest_or_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            staging = self._stage(root)
            p = run_cli(root, "finalize", "--staging", str(staging))
            self.assertEqual(p.returncode, 1)

    def test_copy_applies_size_cap(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            big = root / "output" / "big.png"
            big.write_bytes(b"\0" * (results.MAX_BYTES + 1))
            staging = self._stage(root)
            p = run_cli(root, "copy", "--staging", str(staging),
                        "--into", "artifacts", "output/big.png")
            rec = json.loads(p.stdout)[0]
            self.assertIsNone(rec["file"])
            self.assertTrue(rec["oversized"])
            self.assertFalse((staging / "artifacts" / "big.png").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/github/research-plans-results && python3 -m unittest tests.test_results -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'results'`).

- [ ] **Step 3: Write `results.py`**

```python
#!/usr/bin/env python3
"""research-plans results: bundle mechanics for the results layer.

Stdlib only, Python 3.9+. Subcommands:
  discover  [--component NN-slug]      list candidate output artifacts (JSON)
  stage     --component NN-slug        create/print a .staging-<id>/ dir
  copy      --staging DIR --into artifacts|scripts SRC...   copy + hash (JSON)
  finalize  --staging DIR              validate, atomic-rename to next rN/ (JSON)
  verdict   --component S --version N --status accepted|changes-requested
            --reviewer NAME [--comment TEXT] [--plan-version M]
  changed   --component NN-slug        sources drifted since latest bundle? (JSON)

The agent writes manifest.json and report.md into the staging dir itself;
finalize validates them. Finalized bundles are immutable (enforced by the
sign-off hook for Write/Edit; by convention otherwise).
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

MAX_BYTES = 5 * 1024 * 1024
SCAN_DIRS = ["output", "outputs", "figures", "figs", "tables", "results", "reports"]
SCAN_EXTS = {
    ".png", ".jpg", ".jpeg", ".svg", ".gif", ".pdf",
    ".csv", ".tsv", ".html", ".md", ".txt", ".tex", ".json",
}
SKIP_DIRS = {".git", "node_modules", "plans", ".staging", "__pycache__"}
R_RE = re.compile(r"^r(\d+)$")


def die(msg, code=1):
    print("results: %s" % msg, file=sys.stderr)
    sys.exit(code)


def find_root(start=None):
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=10,
            cwd=str(start) if start else None,
        )
        if out.returncode == 0 and out.stdout.strip():
            return Path(out.stdout.strip())
    except Exception:
        pass
    return Path.cwd()


def sha256_file(path):
    h = hashlib.sha256()
    with open(str(path), "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def component_dir(root, component):
    d = root / "plans" / "execution" / component
    if not d.is_dir():
        die("no component at plans/execution/%s" % component)
    return d


def next_version(results_dir):
    n = 0
    if results_dir.is_dir():
        for p in results_dir.iterdir():
            m = R_RE.fullmatch(p.name)
            if m and p.is_dir():
                n = max(n, int(m.group(1)))
    return n + 1


def cmd_discover(root, args):
    found = []
    for dname in SCAN_DIRS:
        d = root / dname
        if not d.is_dir():
            continue
        for p in d.rglob("*"):
            if not p.is_file() or p.suffix.lower() not in SCAN_EXTS:
                continue
            if any(part in SKIP_DIRS or part.startswith(".") for part in p.parts):
                continue
            rel = str(p.relative_to(root))
            if rel.startswith("plans/"):
                continue  # bundles never adopt themselves
            st = p.stat()
            found.append({"path": rel, "bytes": st.st_size,
                          "mtime": datetime.datetime.fromtimestamp(
                              st.st_mtime).strftime("%Y-%m-%d %H:%M")})
    found.sort(key=lambda x: x["mtime"], reverse=True)
    print(json.dumps(found[:200], indent=1))


def cmd_stage(root, args):
    comp = component_dir(root, args.component)
    results_dir = comp / "results"
    staging = results_dir / (".staging-%s" % uuid.uuid4().hex[:8])
    (staging / "artifacts").mkdir(parents=True)
    (staging / "scripts").mkdir()
    print(str(staging))


def cmd_copy(root, args):
    staging = Path(args.staging)
    if not staging.is_dir() or not staging.name.startswith(".staging-"):
        die("--staging must be an existing .staging-* directory")
    into = staging / args.into
    into.mkdir(exist_ok=True)
    records = []
    for src in args.sources:
        sp = Path(src)
        if not sp.is_absolute():
            sp = root / sp
        if not sp.is_file():
            die("source not found: %s" % src)
        size = sp.stat().st_size
        digest = sha256_file(sp)
        rec = {"src": src, "sha256": digest, "bytes": size, "oversized": False}
        if args.into == "artifacts" and size > MAX_BYTES:
            rec["file"] = None
            rec["oversized"] = True
        else:
            dest = into / sp.name
            shutil.copy2(str(sp), str(dest))
            rec["file"] = "%s/%s" % (args.into, sp.name)
        records.append(rec)
    print(json.dumps(records, indent=1))


def validate_staged(staging):
    manifest_p = staging / "manifest.json"
    if not manifest_p.is_file():
        return None, "manifest.json missing from staging dir"
    try:
        manifest = json.loads(manifest_p.read_text(encoding="utf-8"))
    except ValueError as e:
        return None, "manifest.json is not valid JSON: %s" % e
    for key in ("component", "provenance", "trigger", "capturedAt", "artifacts"):
        if key not in manifest:
            return None, "manifest.json missing required key: %s" % key
    if not (staging / "report.md").is_file():
        return None, "report.md missing from staging dir"
    for art in manifest["artifacts"]:
        f = art.get("file")
        if f is None:
            if not art.get("source", {}).get("oversized"):
                return None, "artifact %s has no file and is not oversized" % art.get("id")
            continue
        fp = staging / f
        if not fp.is_file():
            return None, "artifact file missing in staging: %s" % f
        src = art.get("source", {})
        if src.get("sha256") and sha256_file(fp) != src["sha256"]:
            return None, "checksum mismatch for %s (copy differs from source hash)" % f
        pb = art.get("producedBy")
        if pb and pb.get("script") and not (staging / pb["script"]).is_file():
            return None, "script snapshot missing: %s" % pb["script"]
    return manifest, None


def cmd_finalize(root, args):
    staging = Path(args.staging)
    if not staging.is_dir():
        die("no staging dir at %s" % staging)
    manifest, err = validate_staged(staging)
    if err:
        die(err)
    results_dir = staging.parent
    version = next_version(results_dir)
    manifest["resultsVersion"] = version
    manifest.setdefault("schemaVersion", 1)
    (staging / "manifest.json").write_text(
        json.dumps(manifest, indent=1), encoding="utf-8")
    target = results_dir / ("r%d" % version)
    try:
        os.rename(str(staging), str(target))
    except OSError as e:
        die("atomic rename failed: %s" % e)
    try:
        rel = str(target.relative_to(find_root(target)))
    except ValueError:
        rel = str(target)
    print(json.dumps({"resultsVersion": version, "path": rel}))


def cmd_verdict(root, args):
    comp = component_dir(root, args.component)
    bundle = comp / "results" / ("r%d" % args.version)
    if not bundle.is_dir():
        die("no bundle at %s" % bundle)
    vp = bundle / "verdict.json"
    doc = {
        "status": args.status,
        "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "planVersion": args.plan_version,
        "reviewer": args.reviewer,
    }
    if args.comment:
        doc["comment"] = args.comment
    try:
        fd = os.open(str(vp), os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    except FileExistsError:
        die("verdict already recorded for %s r%d — verdicts are written once"
            % (args.component, args.version))
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1)
    print(str(vp))


def cmd_changed(root, args):
    comp = component_dir(root, args.component)
    results_dir = comp / "results"
    latest = next_version(results_dir) - 1
    if latest < 1:
        print(json.dumps({"latest": None, "changed": [], "note": "no bundles yet"}))
        return
    manifest_p = results_dir / ("r%d" % latest) / "manifest.json"
    try:
        manifest = json.loads(manifest_p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        print(json.dumps({"latest": latest, "changed": [],
                          "note": "manifest unreadable"}))
        return
    changed = []
    for art in manifest.get("artifacts", []):
        src = art.get("source", {})
        rel = src.get("path")
        if not rel:
            continue
        sp = root / rel
        if not sp.is_file():
            changed.append({"path": rel, "why": "source deleted"})
        elif src.get("sha256") and sha256_file(sp) != src["sha256"]:
            changed.append({"path": rel, "why": "content changed"})
    print(json.dumps({"latest": latest, "changed": changed}, indent=1))


def main():
    ap = argparse.ArgumentParser(description="research-plans results mechanics")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("discover")
    s = sub.add_parser("stage")
    s.add_argument("--component", required=True)
    c = sub.add_parser("copy")
    c.add_argument("--staging", required=True)
    c.add_argument("--into", required=True, choices=["artifacts", "scripts"])
    c.add_argument("sources", nargs="+")
    f = sub.add_parser("finalize")
    f.add_argument("--staging", required=True)
    v = sub.add_parser("verdict")
    v.add_argument("--component", required=True)
    v.add_argument("--version", type=int, required=True)
    v.add_argument("--status", required=True,
                   choices=["accepted", "changes-requested"])
    v.add_argument("--reviewer", required=True)
    v.add_argument("--comment", default="")
    v.add_argument("--plan-version", type=int, default=None)
    g = sub.add_parser("changed")
    g.add_argument("--component", required=True)
    for p in (d, s, c, f, v, g):
        p.add_argument("--root", default=None)
    args = ap.parse_args()
    root = Path(args.root) if args.root else find_root()
    {"discover": cmd_discover, "stage": cmd_stage, "copy": cmd_copy,
     "finalize": cmd_finalize, "verdict": cmd_verdict,
     "changed": cmd_changed}[args.cmd](root, args)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python3 -m unittest tests.test_results -v` — Expected: all PASS.
Also run the full suite: `python3 -m unittest discover -s tests -q` — Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/results.py tests/test_results.py
git commit -m "results.py: stage/copy/finalize with staging-then-atomic-rename"
```

---

### Task 2: `results.py` — discover / verdict / changed tests

**Files:**
- Modify: `tests/test_results.py` (append test classes)

**Interfaces:**
- Consumes: Task 1 CLI. Produces: verified `discover`, `verdict`, `changed` behavior relied on by commands.

- [ ] **Step 1: Append failing-ish tests** (implementation exists from Task 1; these lock behavior)

```python
class TestDiscoverVerdictChanged(unittest.TestCase):
    def test_discover_lists_outputs_excludes_plans(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            r1 = root / "plans" / "execution" / "02-analysis" / "results" / "r1" / "artifacts"
            r1.mkdir(parents=True)
            (r1 / "old.png").write_bytes(b"x")
            p = run_cli(root, "discover")
            self.assertEqual(p.returncode, 0, p.stderr)
            paths = [e["path"] for e in json.loads(p.stdout)]
            self.assertIn("output/fig1.png", paths)
            self.assertIn("output/table1.csv", paths)
            self.assertFalse(any(x.startswith("plans/") for x in paths))

    def _finalized(self, root):
        p = run_cli(root, "stage", "--component", "02-analysis")
        staging = Path(p.stdout.strip())
        p = run_cli(root, "copy", "--staging", str(staging),
                    "--into", "artifacts", "output/fig1.png")
        rec = json.loads(p.stdout)[0]
        arts = [{"id": "fig", "kind": "figure", "title": "F",
                 "file": "artifacts/fig1.png",
                 "source": {"path": "output/fig1.png", "sha256": rec["sha256"],
                            "bytes": rec["bytes"], "oversized": False},
                 "producedBy": None}]
        (staging / "manifest.json").write_text(
            json.dumps(manifest_for(staging, entries=arts)), encoding="utf-8")
        (staging / "report.md").write_text("# R\n", encoding="utf-8")
        run_cli(root, "finalize", "--staging", str(staging))

    def test_verdict_written_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            self._finalized(root)
            p = run_cli(root, "verdict", "--component", "02-analysis",
                        "--version", "1", "--status", "accepted",
                        "--reviewer", "BK", "--plan-version", "1")
            self.assertEqual(p.returncode, 0, p.stderr)
            vp = (root / "plans" / "execution" / "02-analysis" / "results" /
                  "r1" / "verdict.json")
            doc = json.loads(vp.read_text())
            self.assertEqual(doc["status"], "accepted")
            self.assertEqual(doc["reviewer"], "BK")
            p2 = run_cli(root, "verdict", "--component", "02-analysis",
                         "--version", "1", "--status", "accepted",
                         "--reviewer", "BK")
            self.assertEqual(p2.returncode, 1)
            self.assertIn("once", p2.stderr)

    def test_changed_detects_source_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            self._finalized(root)
            p = run_cli(root, "changed", "--component", "02-analysis")
            self.assertEqual(json.loads(p.stdout)["changed"], [])
            (root / "output" / "fig1.png").write_bytes(b"different bytes")
            p2 = run_cli(root, "changed", "--component", "02-analysis")
            out = json.loads(p2.stdout)
            self.assertEqual(out["latest"], 1)
            self.assertEqual(out["changed"][0]["path"], "output/fig1.png")
```

- [ ] **Step 2: Run** `python3 -m unittest tests.test_results -v` — Expected: all PASS (fix `results.py` if any fail; the code in Task 1 is written to satisfy these).

- [ ] **Step 3: Commit**

```bash
git add tests/test_results.py
git commit -m "results.py: lock discover/verdict/changed behavior with tests"
```

---

### Task 3: `signoff_gate.py` — bundle immutability branch

**Files:**
- Modify: `skills/managing-research-plans/scripts/signoff_gate.py` (insert branch after the path is resolved, before the `VERSION_RE` plan check — around line 108)
- Test: `tests/test_gate_results.py`

**Interfaces:**
- Consumes: hook stdin JSON `{tool_name, tool_input: {file_path, content}, cwd}`; `find_project_root()`, `deny()`, `allow()` already in the file.
- Produces: Write/Edit inside existing `results/rN/` → deny; `verdict.json` create-once → allow; staging writes and new-`rN` component paths outside initialized projects → untouched (exit 0, no output). NEVER launches board.py.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_gate_results.py
"""Sign-off gate: results-bundle immutability branch. Run:
    python3 -m unittest tests.test_gate_results -v
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GATE = (
    Path(__file__).resolve().parents[1]
    / "skills" / "managing-research-plans" / "scripts" / "signoff_gate.py"
)


def make_initialized(root: Path):
    plans = root / "plans"
    rdir = plans / "execution" / "02-analysis" / "results" / "r1"
    rdir.mkdir(parents=True)
    (rdir / "manifest.json").write_text("{}", encoding="utf-8")
    (rdir / "report.md").write_text("# R\n", encoding="utf-8")
    (plans / "master-plan.md").write_text(
        "<!-- research-plans:master-plan -->\n# MP\n", encoding="utf-8")
    (root / "CLAUDE.md").write_text(
        "<!-- research-plans:start -->\nconventions\n", encoding="utf-8")
    return rdir


def run_gate(root, tool, path, content="x"):
    event = {"tool_name": tool, "cwd": str(root),
             "tool_input": {"file_path": str(path), "content": content}}
    p = subprocess.run([sys.executable, str(GATE)], input=json.dumps(event),
                       capture_output=True, text=True, timeout=30)
    decision = None
    if p.stdout.strip():
        decision = json.loads(p.stdout)["hookSpecificOutput"]["permissionDecision"]
    return p.returncode, decision


class TestGateResults(unittest.TestCase):
    def test_edit_inside_finalized_bundle_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            rdir = make_initialized(Path(tmp))
            code, decision = run_gate(tmp, "Edit", rdir / "report.md")
            self.assertEqual((code, decision), (0, "deny"))
            code, decision = run_gate(tmp, "Write", rdir / "manifest.json")
            self.assertEqual((code, decision), (0, "deny"))

    def test_verdict_create_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            rdir = make_initialized(Path(tmp))
            code, decision = run_gate(tmp, "Write", rdir / "verdict.json")
            self.assertEqual((code, decision), (0, "allow"))
            (rdir / "verdict.json").write_text("{}", encoding="utf-8")
            code, decision = run_gate(tmp, "Write", rdir / "verdict.json")
            self.assertEqual((code, decision), (0, "deny"))
            code, decision = run_gate(tmp, "Edit", rdir / "verdict.json")
            self.assertEqual((code, decision), (0, "deny"))

    def test_staging_writes_not_gated(self):
        with tempfile.TemporaryDirectory() as tmp:
            rdir = make_initialized(Path(tmp))
            staging = rdir.parent / ".staging-abc123" / "artifacts"
            staging.mkdir(parents=True)
            code, decision = run_gate(tmp, "Write", staging.parent / "manifest.json")
            self.assertEqual((code, decision), (0, None))

    def test_direct_new_rn_write_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            rdir = make_initialized(Path(tmp))
            code, decision = run_gate(
                tmp, "Write", rdir.parent / "r2" / "manifest.json")
            self.assertEqual((code, decision), (0, "deny"))

    def test_uninitialized_project_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rdir = root / "plans" / "execution" / "x" / "results" / "r1"
            rdir.mkdir(parents=True)
            (rdir / "report.md").write_text("# R\n", encoding="utf-8")
            code, decision = run_gate(tmp, "Edit", rdir / "report.md")
            self.assertEqual((code, decision), (0, None))
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest tests.test_gate_results -v`
Expected: FAIL — writes under `results/` currently fall through the `VERSION_RE` check and exit 0 with no decision.

- [ ] **Step 3: Insert the results branch in `signoff_gate.py`**

Add a regex near the top (after `VERSION_RE`):

```python
RESULTS_RE = re.compile(r"/plans/execution/([^/]+)/results/(r\d+)/")
```

Insert this block in `main()` immediately AFTER `p = Path(os.path.realpath(str(p)))` and BEFORE the `m = VERSION_RE.fullmatch(p.name)` check:

```python
    # ---- Results-bundle immutability (synchronous file policy; NEVER opens
    # the board — a browser gate here would deadlock capture). ----
    res_m = RESULTS_RE.search(str(p))
    if res_m:
        if os.environ.get("RESEARCH_PLANS_NO_GATE", "") == "1":
            print(
                "research-plans: results immutability bypassed by "
                "RESEARCH_PLANS_NO_GATE for %s" % p.name,
                file=sys.stderr,
            )
            sys.exit(0)
        if find_project_root(p) is None:
            sys.exit(0)
        bundle_dir = Path(str(p)[: res_m.end()].rstrip("/"))
        if p.name == "verdict.json" and p.parent == bundle_dir:
            if tool_name == "Write" and not p.exists():
                allow(
                    "One-time verdict for %s %s. Prefer results.py verdict "
                    "(it stamps date and reviewer)." % (res_m.group(1), res_m.group(2))
                )
            deny(
                "verdict.json is written once and never edited. The verdict for "
                "%s %s is already recorded; a redo is a NEW bundle (results.py "
                "stage/finalize), not an edit." % (res_m.group(1), res_m.group(2))
            )
        if bundle_dir.is_dir():
            deny(
                "Finalized results bundles are immutable — %s %s already exists. "
                "Capture a new bundle instead: results.py stage --component %s, "
                "copy artifacts, write manifest.json and report.md in the staging "
                "dir, then results.py finalize."
                % (res_m.group(1), res_m.group(2), res_m.group(1))
            )
        deny(
            "Results bundles are created by results.py finalize (staging, "
            "validation, atomic rename), never by direct writes into %s. Use "
            "results.py stage --component %s and write into the .staging-* dir."
            % (res_m.group(2), res_m.group(1))
        )
```

Note: staging paths (`.staging-*`) do not match `RESULTS_RE` (no `/r<digits>/` segment), so they fall through untouched by design.

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_gate_results -v` — Expected: PASS.
Run: `python3 -m unittest discover -s tests -q` — Expected: OK (no regression in existing gate behavior; the branch sits before the plan-version logic and only fires on `/results/rN/` paths).

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/signoff_gate.py tests/test_gate_results.py
git commit -m "gate: enforce results-bundle immutability (verdict.json create-once; no browser)"
```

---

### Task 4: `board.py` — results in the payload

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py`
  - `GITIGNORE_LINES` (line ~31), `payload_files()` (line ~108), `collect_payload()` (lines ~138-163, group loop + append condition), payload `schemaVersion` (line ~193)
- Test: `tests/test_board.py` (extend `make_project`, add class)

**Interfaces:**
- Produces payload shape consumed by Tasks 5-9: each execution group may carry
  `"results": [bundle...]`, bundle =
  `{"resultsVersion": int, "dir": rel, "manifest": dict|null, "manifestRaw": {path,content}, "report": {path,content}|null, "verdict": dict|null, "verdictRaw": {path,content}|null, "scripts": [{path,content}...], "assets": {}}`
  (assets filled in Task 5). Groups with only results (no plan versions) ARE emitted. `payload_files()` includes manifestRaw/report/verdictRaw/scripts. Payload `schemaVersion` becomes 2.

- [ ] **Step 1: Extend the fixture and write failing tests**

In `tests/test_board.py`, extend `make_project` (after the reviews write) with:

```python
    r1 = plans / "execution" / "01-data-prep" / "results" / "r1"
    (r1 / "artifacts").mkdir(parents=True)
    (r1 / "scripts").mkdir()
    (r1 / "artifacts" / "fig1.png").write_bytes(b"\x89PNG r1 fig")
    (r1 / "scripts" / "clean.R").write_text("x <- 1\n", encoding="utf-8")
    (r1 / "report.md").write_text("# Results r1\n\nAll good.\n", encoding="utf-8")
    (r1 / "manifest.json").write_text(json.dumps({
        "schemaVersion": 1, "component": "01-data-prep", "resultsVersion": 1,
        "planVersion": 1, "provenance": "planned", "trigger": "initial",
        "capturedAt": "2026-07-03 10:00", "summary": "r1",
        "metrics": [{"label": "N", "value": "100"}],
        "artifacts": [{"id": "fig", "kind": "figure", "title": "Fig 1",
                       "file": "artifacts/fig1.png",
                       "source": {"path": "output/fig1.png", "sha256": "0" * 64,
                                  "bytes": 11, "oversized": False},
                       "producedBy": {"script": "scripts/clean.R",
                                      "sourcePath": "code/clean.R", "lang": "r"}}],
    }), encoding="utf-8")
    (r1 / "verdict.json").write_text(json.dumps({
        "status": "accepted", "date": "2026-07-03 11:00",
        "planVersion": 1, "reviewer": "BK"}), encoding="utf-8")
    # a results-only component: no vN.md, only a bundle (retrofit case)
    r_only = plans / "execution" / "03-retrofit" / "results" / "r1"
    (r_only / "artifacts").mkdir(parents=True)
    (r_only / "report.md").write_text("# Retrofit r1\n", encoding="utf-8")
    (r_only / "manifest.json").write_text(json.dumps({
        "schemaVersion": 1, "component": "03-retrofit", "resultsVersion": 1,
        "planVersion": None, "provenance": "retrofit", "trigger": "initial",
        "capturedAt": "2026-07-02 09:00", "metrics": [], "artifacts": []}),
        encoding="utf-8")
    # a stale staging dir that must NOT appear in the payload
    (plans / "execution" / "01-data-prep" / "results" / ".staging-zz" ).mkdir()
```

Add the test class:

```python
class TestResultsPayload(unittest.TestCase):
    def test_bundles_collected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            payload = board.collect_payload(root, "live", None)
            self.assertEqual(payload["schemaVersion"], 2)
            groups = {g["component"]: g for g in payload["files"]["executionPlans"]}
            b = groups["01-data-prep"]["results"][0]
            self.assertEqual(b["resultsVersion"], 1)
            self.assertEqual(b["manifest"]["provenance"], "planned")
            self.assertEqual(b["verdict"]["status"], "accepted")
            self.assertEqual(b["report"]["content"].splitlines()[0], "# Results r1")
            self.assertEqual(b["scripts"][0]["path"],
                             "plans/execution/01-data-prep/results/r1/scripts/clean.R")

    def test_results_only_component_emitted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            payload = board.collect_payload(root, "live", None)
            comps = [g["component"] for g in payload["files"]["executionPlans"]]
            self.assertIn("03-retrofit", comps)
            g = next(g for g in payload["files"]["executionPlans"]
                     if g["component"] == "03-retrofit")
            self.assertEqual(g["versions"], [])
            self.assertIsNone(g["results"][0]["manifest"]["planVersion"])

    def test_payload_files_include_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            payload = board.collect_payload(root, "live", None)
            paths = [f["path"] for f in board.payload_files(payload)]
            self.assertIn("plans/execution/01-data-prep/results/r1/manifest.json", paths)
            self.assertIn("plans/execution/01-data-prep/results/r1/report.md", paths)
            self.assertIn("plans/execution/01-data-prep/results/r1/verdict.json", paths)
            self.assertIn("plans/execution/01-data-prep/results/r1/scripts/clean.R", paths)

    def test_staging_dirs_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            payload = board.collect_payload(root, "live", None)
            g = next(g for g in payload["files"]["executionPlans"]
                     if g["component"] == "01-data-prep")
            self.assertEqual(len(g["results"]), 1)
```

- [ ] **Step 2: Run to verify failure** — `python3 -m unittest tests.test_board -v` → new tests FAIL (`KeyError: 'results'`, schemaVersion 1, missing component).

- [ ] **Step 3: Implement in `board.py`**

Add `"/execution/*/results/.staging-*/"` to `GITIGNORE_LINES`. Add a collector:

```python
def collect_results(root, comp_dir):
    bundles = []
    res_dir = comp_dir / "results"
    if not res_dir.is_dir():
        return bundles
    for rdir in sorted(res_dir.iterdir()):
        m = re.fullmatch(r"r(\d+)", rdir.name)
        if not m or not rdir.is_dir():
            continue
        manifest_p = rdir / "manifest.json"
        if not manifest_p.is_file():
            continue
        try:
            manifest = json.loads(manifest_p.read_text(encoding="utf-8"))
        except ValueError:
            manifest = None
        bundle = {
            "resultsVersion": int(m.group(1)),
            "dir": str(rdir.relative_to(root)),
            "manifest": manifest,
            "manifestRaw": read_file(root, str(manifest_p.relative_to(root))),
            "report": None,
            "verdict": None,
            "verdictRaw": None,
            "scripts": [],
            "assets": {},
        }
        if (rdir / "report.md").is_file():
            bundle["report"] = read_file(root, str((rdir / "report.md").relative_to(root)))
        vp = rdir / "verdict.json"
        if vp.is_file():
            bundle["verdictRaw"] = read_file(root, str(vp.relative_to(root)))
            try:
                bundle["verdict"] = json.loads(bundle["verdictRaw"]["content"])
            except ValueError:
                bundle["verdict"] = None
        sdir = rdir / "scripts"
        if sdir.is_dir():
            for sf in sorted(sdir.iterdir()):
                if sf.is_file():
                    bundle["scripts"].append(read_file(root, str(sf.relative_to(root))))
        bundles.append(bundle)
    bundles.sort(key=lambda b: b["resultsVersion"])
    return bundles
```

In `collect_payload`, inside the component loop after the draft block:

```python
            group["results"] = collect_results(root, comp_dir)
            if versions or group.get("draft") or group["results"]:
                exec_groups.append(group)
```

In `payload_files`, extend the group loop:

```python
    for g in f["executionPlans"]:
        out.extend(g["versions"])
        if g.get("draft"):
            out.append(g["draft"])
        for b in g.get("results", []):
            out.append(b["manifestRaw"])
            if b.get("report"):
                out.append(b["report"])
            if b.get("verdictRaw"):
                out.append(b["verdictRaw"])
            out.extend(b.get("scripts", []))
```

Set `"schemaVersion": 2` in the payload dict. Also extend `all_paths` (git dates) with each bundle's manifest path.

- [ ] **Step 4: Run tests** — `python3 -m unittest discover -s tests -q` → OK. (The `apply_gate` synthetic group has no `results` key — `payload_files` uses `.get("results", [])`, so no fix needed; verify the gate test still passes.)

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "board.py: collect results bundles into payload (schemaVersion 2)"
```

---

### Task 5: `board.py` — artifact assets: live route + static/remote inlining + `--focus slug:rN`

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py` — new `build_assets()`, `do_GET` route in `serve()`, focus parsing in `main()`
- Test: `tests/test_board.py`

**Interfaces:**
- Produces: every bundle's `assets` maps artifact basename → URL. Live: `/artifact/<component>/rN/<basename>`; static/remote: `data:<mime>;base64,...`. Table/text artifacts (`.csv .md .html .txt .tsv .tex .json`) ≤ 200 KB additionally get `inlineText` injected into the parsed manifest artifact entry. `payload["focusResults"]` = int | None.
- Consumes: Task 4 bundle shape.

- [ ] **Step 1: Failing tests**

```python
class TestAssets(unittest.TestCase):
    def _bundle(self, payload):
        g = next(g for g in payload["files"]["executionPlans"]
                 if g["component"] == "01-data-prep")
        return g["results"][0]

    def test_live_assets_are_routes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            payload = board.collect_payload(root, "live", None)
            board.build_assets(root, payload)
            b = self._bundle(payload)
            self.assertEqual(b["assets"]["fig1.png"],
                             "/artifact/01-data-prep/r1/fig1.png")

    def test_static_assets_are_data_uris(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            payload = board.collect_payload(root, "static", None)
            board.build_assets(root, payload)
            b = self._bundle(payload)
            self.assertTrue(b["assets"]["fig1.png"].startswith("data:image/png;base64,"))

    def test_artifact_map_and_export_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            payload = board.collect_payload(root, "live", None)
            board.build_assets(root, payload)
            amap = board.artifact_map(root, payload)
            key = "/artifact/01-data-prep/r1/fig1.png"
            self.assertIn(key, amap)
            self.assertTrue(amap[key].is_file())
            self.assertNotIn("/artifact/01-data-prep/r1/../secret", amap)

    def test_focus_results_parsing(self):
        self.assertEqual(board.split_focus("02-x:r3"), ("02-x", 3))
        self.assertEqual(board.split_focus("02-x"), ("02-x", None))
        self.assertEqual(board.split_focus(None), (None, None))
```

Run: `python3 -m unittest tests.test_board -v` → FAIL (`AttributeError: build_assets`).

- [ ] **Step 2: Implement**

```python
import base64
import mimetypes

TEXT_INLINE_EXTS = {".csv", ".md", ".html", ".txt", ".tsv", ".tex", ".json"}
TEXT_INLINE_MAX = 200 * 1024


def iter_bundles(payload):
    for g in payload["files"]["executionPlans"]:
        for b in g.get("results", []):
            yield g["component"], b


def build_assets(root, payload):
    """Fill bundle['assets'] (basename -> URL) and artifact inlineText."""
    live = payload["mode"] == "live"
    for component, b in iter_bundles(payload):
        adir = root / b["dir"] / "artifacts"
        if not adir.is_dir():
            continue
        for f in sorted(adir.iterdir()):
            if not f.is_file():
                continue
            if live:
                b["assets"][f.name] = "/artifact/%s/r%d/%s" % (
                    component, b["resultsVersion"], f.name)
            else:
                mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
                data = base64.b64encode(f.read_bytes()).decode("ascii")
                b["assets"][f.name] = "data:%s;base64,%s" % (mime, data)
        if b.get("manifest") and isinstance(b["manifest"].get("artifacts"), list):
            for art in b["manifest"]["artifacts"]:
                fp = art.get("file")
                if not fp:
                    continue
                p = root / b["dir"] / fp
                if (p.is_file() and p.suffix.lower() in TEXT_INLINE_EXTS
                        and p.stat().st_size <= TEXT_INLINE_MAX):
                    art["inlineText"] = p.read_text(encoding="utf-8", errors="replace")


def artifact_map(root, payload):
    """Route path -> absolute file path, built ONLY from files on disk."""
    amap = {}
    for component, b in iter_bundles(payload):
        adir = root / b["dir"] / "artifacts"
        if not adir.is_dir():
            continue
        for f in sorted(adir.iterdir()):
            if f.is_file():
                amap["/artifact/%s/r%d/%s" % (component, b["resultsVersion"], f.name)] = f
    return amap


def split_focus(focus):
    if not focus:
        return None, None
    m = re.fullmatch(r"(.+):r(\d+)", focus)
    if m:
        return m.group(1), int(m.group(2))
    return focus, None
```

In `serve()`, build `amap = artifact_map(root, payload)` before the Handler class, and extend `do_GET` (before the HTML fallthrough):

```python
        def do_GET(self):
            if self.path == "/api/health":
                self._json(200, {"ok": True, "app": "research-plans-board"})
                return
            if self.path.startswith("/artifact/"):
                f = amap.get(self.path)
                if f is None:
                    self.send_response(404)
                    self.end_headers()
                    return
                data = f.read_bytes()
                mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            # ... existing HTML response unchanged
```

In `main()`: after parsing args, `slug, focus_results = split_focus(args.focus)`; pass `slug` wherever `args.focus` was used for collection, and after `collect_payload` set `payload["focusResults"] = focus_results`. Call `build_assets(root, payload)` in the live path of `main()`, in `export()`, and in `share()` (after `collect_payload`, before `inject`).

- [ ] **Step 3: Run tests** — `python3 -m unittest discover -s tests -q` → OK.

- [ ] **Step 4: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "board.py: artifact route (live) + data-URI inlining (static/remote) + focus slug:rN"
```

---

### Task 6: Frontend types + parsers + dev data

**Files:**
- Modify: `board/src/lib/types.ts`, `board/src/lib/parse.ts`, `board/src/lib/feedback.ts`, `board/src/dev-data.ts`
- Test: `board/src/lib/parse.test.ts`

**Interfaces (produces — later tasks import these exact names):**

```ts
// types.ts additions
export interface ResultsBundle {
  resultsVersion: number;
  dir: string;
  manifest: ResultsManifest | null;
  manifestRaw: BoardFile;
  report: BoardFile | null;
  verdict: ResultsVerdict | null;
  verdictRaw: BoardFile | null;
  scripts: BoardFile[];
  assets: Record<string, string>;
}
export interface ResultsManifest {
  schemaVersion: number;
  component: string;
  resultsVersion: number;
  planVersion: number | null;
  provenance: "planned" | "retrofit";
  trigger: "initial" | "redo-after-review" | "plan-revision";
  capturedAt: string;
  summary?: string;
  metrics: { label: string; value: string; note?: string }[];
  artifacts: ResultArtifact[];
}
export interface ResultArtifact {
  id: string;
  kind: "figure" | "table" | "other";
  title: string;
  caption?: string;
  file: string | null;
  data?: string | null;
  inlineText?: string;
  source: { path: string; sha256: string; bytes: number; oversized: boolean };
  producedBy: { script: string; sourcePath: string; lang?: string } | null;
}
export interface ResultsVerdict {
  status: "accepted" | "changes-requested";
  date: string;
  planVersion: number | null;
  reviewer: string;
  comment?: string;
}
export interface ResultCommentAnnotation {
  id: string;
  type: "result-comment";
  component: string;
  resultsVersion: number;
  target: {
    kind: "artifact" | "report" | "metric";
    artifactId?: string;
    metricLabel?: string;
    quote?: string;
    occurrenceIndex?: number;
  };
  comment: string;
}
export interface ScriptCommentAnnotation {
  id: string;
  type: "script-comment";
  component: string;
  resultsVersion: number;
  script: string;       // payload path of the snapshot
  lineStart: number;
  lineEnd: number;
  excerpt: string;
  comment: string;
}
export interface VerdictRequest {
  component: string;
  resultsVersion: number;
  status: "accepted" | "changes-requested";
  comment: string;
}
```

Also: `ExecutionPlanGroup` gains `results?: ResultsBundle[]`; `BoardData` gains `focusResults?: number | null`; `TrackerStatus` union gains `"done (verified)"`; `Annotation` union gains the two new types.

- [ ] **Step 1: Failing vitest tests** (append to `board/src/lib/parse.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { allFiles, parseMasterPlan } from "./parse";

describe("results layer", () => {
  it("parses done (verified) tracker status", () => {
    const mp = parseMasterPlan(
      "# T\n\n## Components\n\n" +
        "| # | Component | Status | Execution plan | Outcome / notes | Serves |\n" +
        "|---|---|---|---|---|---|\n" +
        "| 1 | X | done (verified) | — | — | — |\n",
    );
    expect(mp.components[0].status).toBe("done (verified)");
  });

  it("allFiles includes results bundle text files", () => {
    const data = {
      files: {
        masterPlan: { path: "plans/master-plan.md", content: "m" },
        decisionLog: { path: "plans/decision-log.md", content: "d" },
        executionPlans: [
          {
            component: "01-x",
            versions: [{ path: "plans/execution/01-x/v1.md", content: "v", version: 1 }],
            results: [
              {
                resultsVersion: 1,
                dir: "plans/execution/01-x/results/r1",
                manifest: null,
                manifestRaw: { path: "plans/execution/01-x/results/r1/manifest.json", content: "{}" },
                report: { path: "plans/execution/01-x/results/r1/report.md", content: "# R" },
                verdict: null,
                verdictRaw: { path: "plans/execution/01-x/results/r1/verdict.json", content: "{}" },
                scripts: [{ path: "plans/execution/01-x/results/r1/scripts/a.R", content: "x" }],
                assets: {},
              },
            ],
          },
        ],
        reviews: [],
      },
    };
    const paths = allFiles(data as never).map((f) => f.path);
    expect(paths).toContain("plans/execution/01-x/results/r1/manifest.json");
    expect(paths).toContain("plans/execution/01-x/results/r1/report.md");
    expect(paths).toContain("plans/execution/01-x/results/r1/verdict.json");
    expect(paths).toContain("plans/execution/01-x/results/r1/scripts/a.R");
  });
});
```

Run: `cd board && npx vitest run` → FAIL.

- [ ] **Step 2: Implement**

- `types.ts`: paste the interfaces above; extend the three existing types named above.
- `parse.ts`: add `"done (verified)"` to `STATUSES`; extend `allFiles` group loop mirroring `payload_files` (manifestRaw, report, verdictRaw, scripts — use `g.results ?? []`); loosen its parameter type to include the optional `results` array.
- `feedback.ts`: `FeedbackMeta` gains `verdict?: VerdictRequest | null;` (import type).
- `dev-data.ts`: give `02-data-cleaning` a `results` array with one accepted bundle (planVersion 2, one figure asset as a small inline SVG data URI, one table artifact with `inlineText: "a,b\n1,2\n"`, one script `clean.R`, metrics `[{label:"Rows", value:"66,864"}]`) and `03-descriptives` one pending bundle (`verdict: null`, provenance `"retrofit"`, `planVersion: null`). Use the existing dev-data structure; assets example:

```ts
const FIG_SVG =
  "data:image/svg+xml;base64," +
  btoa('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#eee"/><circle cx="160" cy="100" r="60" fill="#4a7"/></svg>');
```

- [ ] **Step 3: Run** — `npx vitest run` → PASS; `npx tsc -b --noEmit 2>/dev/null || npx vite build` compiles.

- [ ] **Step 4: Commit**

```bash
git add board/src/lib/types.ts board/src/lib/parse.ts board/src/lib/feedback.ts board/src/dev-data.ts board/src/lib/parse.test.ts
git commit -m "board ui: results types, parser + allFiles extensions, dev data bundles"
```

---

### Task 7: `SafeTable` + `ScriptViewer` components

**Files:**
- Create: `board/src/components/SafeTable.tsx`
- Create: `board/src/components/ScriptViewer.tsx`

**Interfaces:**
- `SafeTable({ content, kind }: { content: string; kind: "html" | "md" | "csv" })` — renders sanitized table markup inside `overflow-x-auto`.
- `ScriptViewer({ file, canAnnotate, onAddLineComment }: { file: BoardFile; canAnnotate: boolean; onAddLineComment: (lineStart: number, lineEnd: number, excerpt: string, comment: string) => void })` — line-numbered code with click-drag line-range selection and a comment composer.

- [ ] **Step 1: Write `SafeTable.tsx`**

```tsx
import { useMemo } from "react";
import Markdown from "./Markdown";

const ALLOWED_TAGS = new Set([
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD",
  "CAPTION", "COL", "COLGROUP",
]);
const ALLOWED_ATTRS = new Set(["colspan", "rowspan", "align"]);

/** Whitelist-sanitize table HTML: unknown tags are dropped (children of
 * non-table containers are kept as text), attributes outside the whitelist
 * are stripped. Markdown.tsx's escape-all policy stays global; this is the
 * ONLY sanctioned raw-HTML path, and it renders tables only. */
export function sanitizeTableHtml(src: string): string {
  const doc = new DOMParser().parseFromString(src, "text/html");
  const table = doc.querySelector("table");
  if (!table) return "";
  const walk = (el: Element): void => {
    for (const child of [...el.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(doc.createTextNode(child.textContent ?? ""));
        continue;
      }
      for (const attr of [...child.attributes]) {
        if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) {
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };
  for (const attr of [...table.attributes]) table.removeAttribute(attr.name);
  walk(table);
  return table.outerHTML;
}

function csvToMarkdown(csv: string): string {
  const rows = csv.trim().split("\n").map((l) => l.split(","));
  if (rows.length === 0) return "";
  const md = [
    `| ${rows[0].join(" | ")} |`,
    `| ${rows[0].map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`),
  ];
  return md.join("\n");
}

export default function SafeTable({
  content,
  kind,
}: {
  content: string;
  kind: "html" | "md" | "csv";
}) {
  const html = useMemo(
    () => (kind === "html" ? sanitizeTableHtml(content) : ""),
    [content, kind],
  );
  if (kind === "html") {
    if (!html) {
      return (
        <pre className="overflow-x-auto rounded bg-stone-50 p-2 text-xs">{content}</pre>
      );
    }
    return (
      <div
        className="prose-md overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  const md = kind === "csv" ? csvToMarkdown(content) : content;
  return (
    <div className="overflow-x-auto">
      <Markdown source={md} className="text-sm" />
    </div>
  );
}
```

- [ ] **Step 2: Write `ScriptViewer.tsx`**

```tsx
import { useState } from "react";
import type { BoardFile } from "../lib/types";

/** Line-numbered script snapshot with line-range comments. Text-selection
 * anchoring (anchor.ts) is for prose; scripts anchor by line number. */
export default function ScriptViewer({
  file,
  canAnnotate,
  onAddLineComment,
}: {
  file: BoardFile;
  canAnnotate: boolean;
  onAddLineComment: (
    lineStart: number,
    lineEnd: number,
    excerpt: string,
    comment: string,
  ) => void;
}) {
  const lines = file.content.replace(/\n$/, "").split("\n");
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [text, setText] = useState("");

  const lo = selStart !== null && selEnd !== null ? Math.min(selStart, selEnd) : null;
  const hi = selStart !== null && selEnd !== null ? Math.max(selStart, selEnd) : null;

  const clickLine = (n: number, shift: boolean) => {
    if (!canAnnotate) return;
    if (shift && selStart !== null) {
      setSelEnd(n);
    } else {
      setSelStart(n);
      setSelEnd(n);
    }
  };

  const save = () => {
    if (lo === null || hi === null || !text.trim()) return;
    onAddLineComment(
      lo,
      hi,
      lines.slice(lo - 1, hi).join("\n").slice(0, 500),
      text.trim(),
    );
    setSelStart(null);
    setSelEnd(null);
    setText("");
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white">
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-1.5">
        <span className="font-mono text-xs text-stone-600">{file.path.split("/results/")[1] ?? file.path}</span>
        {canAnnotate && (
          <span className="text-[11px] text-stone-400">
            click a line (shift-click to extend) to comment
          </span>
        )}
      </div>
      <pre className="max-h-96 overflow-auto p-0 text-xs leading-5">
        {lines.map((ln, i) => {
          const n = i + 1;
          const selected = lo !== null && hi !== null && n >= lo && n <= hi;
          return (
            <div
              key={n}
              className={`flex cursor-pointer px-0 ${selected ? "bg-amber-100" : "hover:bg-stone-50"}`}
              onClick={(e) => clickLine(n, e.shiftKey)}
            >
              <span className="w-10 shrink-0 select-none border-r border-stone-100 pr-2 text-right text-stone-400">
                {n}
              </span>
              <code className="whitespace-pre pl-3">{ln || " "}</code>
            </div>
          );
        })}
      </pre>
      {canAnnotate && lo !== null && hi !== null && (
        <div className="border-t border-stone-200 p-2">
          <div className="mb-1 text-[11px] text-stone-500">
            Comment on lines {lo}
            {hi !== lo ? `–${hi}` : ""}
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-16 w-full resize-none rounded border border-stone-200 p-2 text-sm outline-none focus:border-stone-400"
            placeholder="Your comment on these lines…"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
              onClick={() => {
                setSelStart(null);
                setSelEnd(null);
                setText("");
              }}
            >
              Cancel
            </button>
            <button
              className="rounded bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-40"
              disabled={!text.trim()}
              onClick={save}
            >
              Save comment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Sanity-compile** — `cd board && npx vite build` → succeeds (components not yet imported; build proves syntax).

- [ ] **Step 4: Commit**

```bash
git add board/src/components/SafeTable.tsx board/src/components/ScriptViewer.tsx
git commit -m "board ui: SafeTable (whitelist-sanitized) and ScriptViewer (line comments)"
```

---

### Task 8: The Results view

**Files:**
- Create: `board/src/views/Results.tsx`
- Modify: `board/src/components/AnnotationLayer.tsx` (loosen `annotations` prop type only)

**Interfaces:**
- Consumes: `ResultsBundle`, `SafeTable`, `ScriptViewer`, `AnnotationLayer`, `GeneralCommentBox`.
- Produces: `Results({ data, canAnnotate, canPost, selectedComponent, onSelectComponent, annotations, onAddResultComment, onAddScriptComment, onPaintResult, onVerdict, focusResults })` where `onVerdict(v: VerdictRequest)` triggers App's verdict submit and `onAddResultComment` / `onAddScriptComment` take the annotation minus `id`/`type`.

- [ ] **Step 1: Loosen `AnnotationLayer` prop**

In `AnnotationLayer.tsx`, replace the `annotations: PlanCommentAnnotation[]` prop type with a minimal structural type and drop the now-unused import if it becomes unused:

```tsx
interface PaintableAnnotation {
  id: string;
  quote: string;
  occurrenceIndex: number;
}
// props: annotations: PaintableAnnotation[]
```

(Its `onAdd` payload type is unchanged. `PlanReader` still compiles because `PlanCommentAnnotation[]` is structurally assignable.)

- [ ] **Step 2: Write `Results.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import Markdown from "../components/Markdown";
import SafeTable from "../components/SafeTable";
import ScriptViewer from "../components/ScriptViewer";
import AnnotationLayer from "../components/AnnotationLayer";
import { Notice } from "./Tracker";
import type {
  Annotation,
  BoardData,
  ResultArtifact,
  ResultCommentAnnotation,
  ResultsBundle,
  ScriptCommentAnnotation,
  VerdictRequest,
} from "../lib/types";

function verdictBadge(b: ResultsBundle): { label: string; cls: string } {
  if (b.verdict?.status === "accepted")
    return { label: "accepted", cls: "bg-green-50 text-green-800 border-green-200" };
  if (b.verdict?.status === "changes-requested")
    return { label: "changes requested", cls: "bg-red-50 text-red-700 border-red-200" };
  return { label: "pending review", cls: "bg-amber-50 text-amber-800 border-amber-200" };
}

function tableKind(art: ResultArtifact): "html" | "md" | "csv" {
  const f = (art.file ?? "").toLowerCase();
  if (f.endsWith(".html")) return "html";
  if (f.endsWith(".md")) return "md";
  return "csv";
}

export default function Results({
  data,
  canAnnotate,
  canPost,
  selectedComponent,
  onSelectComponent,
  annotations,
  onAddResultComment,
  onAddScriptComment,
  onPaintResult,
  onVerdict,
  focusResults,
}: {
  data: BoardData;
  canAnnotate: boolean;
  canPost: boolean;
  selectedComponent: string | null;
  onSelectComponent: (slug: string) => void;
  annotations: Annotation[];
  onAddResultComment: (a: Omit<ResultCommentAnnotation, "id" | "type">) => void;
  onAddScriptComment: (a: Omit<ScriptCommentAnnotation, "id" | "type">) => void;
  onPaintResult: (painted: Set<string>) => void;
  onVerdict: (v: VerdictRequest) => void;
  focusResults: number | null;
}) {
  const groups = data.files.executionPlans.filter(
    (g) => (g.results ?? []).length > 0,
  );
  const group =
    groups.find((g) => g.component === selectedComponent) ?? groups[0] ?? null;
  const bundles = group?.results ?? [];

  const [idx, setIdx] = useState(() => {
    if (focusResults !== null) {
      const i = bundles.findIndex((b) => b.resultsVersion === focusResults);
      if (i !== -1) return i;
    }
    return Math.max(0, bundles.length - 1);
  });
  useEffect(
    () => setIdx(Math.max(0, bundles.length - 1)),
    [group?.component, bundles.length],
  );
  const bundle = bundles[Math.min(idx, bundles.length - 1)] ?? null;

  const [openScript, setOpenScript] = useState<string | null>(null);
  const [verdictComment, setVerdictComment] = useState("");
  useEffect(() => setOpenScript(null), [bundle?.dir]);

  const bundleAnnotations = useMemo(
    () =>
      annotations.filter(
        (a) =>
          (a.type === "result-comment" || a.type === "script-comment") &&
          group !== null &&
          a.component === group.component &&
          a.resultsVersion === (bundle?.resultsVersion ?? -1),
      ),
    [annotations, group, bundle],
  );

  if (!group || !bundle) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
        No results captured yet. Capture a bundle with{" "}
        <code>/research-plans:results</code>.
      </div>
    );
  }

  const m = bundle.manifest;
  const badge = verdictBadge(bundle);
  const reportComments = bundleAnnotations.filter(
    (a): a is ResultCommentAnnotation =>
      a.type === "result-comment" && a.target.kind === "report",
  );

  const addArtifactComment = (art: ResultArtifact, comment: string) =>
    onAddResultComment({
      component: group.component,
      resultsVersion: bundle.resultsVersion,
      target: { kind: "artifact", artifactId: art.id },
      comment,
    });

  return (
    <div className="flex gap-5">
      <aside className="w-56 shrink-0">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Components
        </h2>
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.component}>
              <button
                className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm ${
                  g.component === group.component
                    ? "bg-stone-900 font-medium text-white"
                    : "text-stone-700 hover:bg-stone-100"
                }`}
                onClick={() => onSelectComponent(g.component)}
              >
                {g.component}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1">
        {/* version strip */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {bundles.map((b, i) => {
            const vb = verdictBadge(b);
            return (
              <button
                key={b.dir}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  i === Math.min(idx, bundles.length - 1)
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white text-stone-600 hover:border-stone-500"
                }`}
                onClick={() => setIdx(i)}
                title={vb.label}
              >
                r{b.resultsVersion}
                {b.manifest?.planVersion != null
                  ? ` · plan v${b.manifest.planVersion}`
                  : ""}
                {b.verdict?.status === "accepted"
                  ? " ✓"
                  : b.verdict?.status === "changes-requested"
                    ? " ✕"
                    : " ●"}
              </button>
            );
          })}
        </div>

        {/* verdict banner */}
        <div
          className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${badge.cls}`}
        >
          <span className="text-sm font-semibold">
            {group.component} r{bundle.resultsVersion} — {badge.label}
          </span>
          {bundle.verdict && (
            <span className="text-xs">
              {bundle.verdict.reviewer} · {bundle.verdict.date}
              {bundle.verdict.comment ? ` — “${bundle.verdict.comment}”` : ""}
            </span>
          )}
          {m?.provenance === "retrofit" && (
            <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[11px] font-medium text-stone-700">
              retrofit — produced outside a plan
            </span>
          )}
          {m?.trigger === "redo-after-review" && (
            <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[11px] font-medium text-stone-700">
              redo after review
            </span>
          )}
          {canPost && !bundle.verdict && (
            <span className="ml-auto flex items-center gap-2">
              <input
                className="w-56 rounded-md border border-stone-300 px-2 py-1 text-xs"
                placeholder="Optional verdict comment…"
                value={verdictComment}
                onChange={(e) => setVerdictComment(e.target.value)}
              />
              <button
                className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
                onClick={() =>
                  onVerdict({
                    component: group.component,
                    resultsVersion: bundle.resultsVersion,
                    status: "accepted",
                    comment: verdictComment.trim(),
                  })
                }
              >
                Accept
              </button>
              <button
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                onClick={() =>
                  onVerdict({
                    component: group.component,
                    resultsVersion: bundle.resultsVersion,
                    status: "changes-requested",
                    comment: verdictComment.trim(),
                  })
                }
              >
                Request changes
              </button>
            </span>
          )}
        </div>

        {!m && (
          <Notice text="This bundle's manifest.json did not parse — showing what can be shown." />
        )}

        {/* metrics */}
        {m && m.metrics.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-3">
            {m.metrics.map((metric) => (
              <button
                key={metric.label}
                className="group rounded-lg border border-stone-200 bg-white px-4 py-2 text-left"
                disabled={!canAnnotate}
                onClick={() => {
                  const c = canAnnotate
                    ? window.prompt(`Comment on ${metric.label}:`)
                    : null;
                  if (c && c.trim())
                    onAddResultComment({
                      component: group.component,
                      resultsVersion: bundle.resultsVersion,
                      target: { kind: "metric", metricLabel: metric.label },
                      comment: c.trim(),
                    });
                }}
                title={canAnnotate ? "Click to comment on this number" : undefined}
              >
                <div className="text-[11px] uppercase tracking-wide text-stone-500">
                  {metric.label}
                </div>
                <div className="text-lg font-bold text-stone-900">{metric.value}</div>
                {metric.note && (
                  <div className="text-[11px] text-stone-400">{metric.note}</div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* report */}
        {bundle.report && (
          <section className="mb-4 rounded-lg border border-stone-200 bg-white p-5">
            {canAnnotate ? (
              <AnnotationLayer
                docKey={bundle.report.path}
                annotations={reportComments.map((a) => ({
                  id: a.id,
                  quote: a.target.quote ?? "",
                  occurrenceIndex: a.target.occurrenceIndex ?? 0,
                }))}
                onPaintResult={onPaintResult}
                onAdd={(partial) =>
                  onAddResultComment({
                    component: group.component,
                    resultsVersion: bundle.resultsVersion,
                    target: {
                      kind: "report",
                      quote: partial.quote,
                      occurrenceIndex: partial.occurrenceIndex,
                    },
                    comment: partial.comment,
                  })
                }
              >
                <Markdown source={bundle.report.content} />
              </AnnotationLayer>
            ) : (
              <Markdown source={bundle.report.content} />
            )}
          </section>
        )}

        {/* artifact gallery */}
        {m && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {m.artifacts.map((art) => {
              const basename = art.file ? art.file.split("/").pop()! : null;
              const url = basename ? bundle.assets[basename] : null;
              const scriptFile = art.producedBy
                ? bundle.scripts.find((s) =>
                    s.path.endsWith("/" + art.producedBy!.script),
                  )
                : null;
              const nComments = bundleAnnotations.filter(
                (a) =>
                  a.type === "result-comment" &&
                  a.target.kind === "artifact" &&
                  a.target.artifactId === art.id,
              ).length;
              return (
                <div
                  key={art.id}
                  className="rounded-lg border border-stone-200 bg-white p-4"
                >
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-stone-800">
                      {art.title}
                    </span>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase text-stone-500">
                      {art.kind}
                    </span>
                    {canAnnotate && (
                      <button
                        className="ml-auto rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-600 hover:border-stone-500"
                        onClick={() => {
                          const c = window.prompt(`Comment on “${art.title}”:`);
                          if (c && c.trim()) addArtifactComment(art, c.trim());
                        }}
                      >
                        comment{nComments > 0 ? ` (${nComments})` : ""}
                      </button>
                    )}
                  </div>
                  {art.source.oversized ? (
                    <div className="rounded border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">
                      Too large to snapshot ({Math.round(art.source.bytes / 1024 / 1024)}{" "}
                      MB) — original at <code>{art.source.path}</code>
                    </div>
                  ) : art.kind === "table" && art.inlineText ? (
                    <SafeTable content={art.inlineText} kind={tableKind(art)} />
                  ) : art.kind === "figure" && url ? (
                    <img
                      src={url}
                      alt={art.title}
                      className="max-h-80 w-full rounded border border-stone-100 object-contain"
                    />
                  ) : url ? (
                    <a
                      href={url}
                      download={basename ?? undefined}
                      className="text-xs font-medium text-blue-700 underline"
                    >
                      download {basename}
                    </a>
                  ) : (
                    <div className="text-xs text-stone-400">no snapshot file</div>
                  )}
                  {art.caption && (
                    <p className="mt-2 text-xs text-stone-500">{art.caption}</p>
                  )}
                  {art.producedBy && (
                    <button
                      className="mt-2 text-[11px] font-medium text-blue-700 underline disabled:text-stone-400 disabled:no-underline"
                      disabled={!scriptFile}
                      onClick={() =>
                        setOpenScript(
                          openScript === scriptFile?.path
                            ? null
                            : (scriptFile?.path ?? null),
                        )
                      }
                    >
                      ▸ produced by {art.producedBy.sourcePath}
                      {scriptFile ? " (view snapshot)" : " (snapshot missing)"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* script drawer */}
        {openScript &&
          (() => {
            const sf = bundle.scripts.find((s) => s.path === openScript);
            if (!sf) return null;
            return (
              <section className="mt-4">
                <ScriptViewer
                  file={sf}
                  canAnnotate={canAnnotate}
                  onAddLineComment={(lineStart, lineEnd, excerpt, comment) =>
                    onAddScriptComment({
                      component: group.component,
                      resultsVersion: bundle.resultsVersion,
                      script: sf.path,
                      lineStart,
                      lineEnd,
                      excerpt,
                      comment,
                    })
                  }
                />
              </section>
            );
          })()}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Compile** — `cd board && npx vite build` → succeeds (view not yet wired; syntax + types check).

- [ ] **Step 4: Commit**

```bash
git add board/src/views/Results.tsx board/src/components/AnnotationLayer.tsx
git commit -m "board ui: Results view — version strip, verdict banner, gallery, script drawer"
```

---

### Task 9: Wire App — tab, annotations, verdict submit, cross-links

**Files:**
- Modify: `board/src/App.tsx`, `board/src/views/Tracker.tsx`, `board/src/views/PlanReader.tsx`, `board/src/views/Timeline.tsx`

**Interfaces:**
- Consumes: everything above. Produces the final UI behavior:
  - `TABS` gains `{ id: "results", label: "Results" }`; `Tab` union gains `"results"`.
  - App state: `addResultComment`, `addScriptComment` (mirror `addPlanComment`), `pendingVerdict: VerdictRequest | null`.
  - Verdict submit: `onVerdict(v)` stores the verdict and calls `submit()` with `meta.verdict = v` and a leading markdown section; `buildFeedbackMarkdown` renders all four annotation types + the verdict block.
  - Tracker: new "Results" column with latest-bundle badge button → `onOpenResults(slug)`.
  - PlanReader: chip row under the version strip listing bundles with `manifest.planVersion === doc.version` → `onOpenResults`.
  - Timeline: `result` events (capture + verdict).

- [ ] **Step 1: App.tsx changes**

- Extend `Tab` type + `TABS` (insert after "plans"): `{ id: "results", label: "Results" }`.
- Initial tab: `gate ? "plans" : data.focusResults != null ? "results" : data.focus ? "plans" : "tracker"`.
- Add callbacks after `addPlanComment`:

```tsx
  const addResultComment = useCallback(
    (a: Omit<ResultCommentAnnotation, "id" | "type">) => {
      setAnnotations((prev) => [
        ...prev,
        { ...a, id: nextId(), type: "result-comment" },
      ]);
      setDrawerOpen(true);
    },
    [],
  );

  const addScriptComment = useCallback(
    (a: Omit<ScriptCommentAnnotation, "id" | "type">) => {
      setAnnotations((prev) => [
        ...prev,
        { ...a, id: nextId(), type: "script-comment" },
      ]);
      setDrawerOpen(true);
    },
    [],
  );
```

- Verdict: add `const [pendingVerdict, setPendingVerdict] = useState<VerdictRequest | null>(null);`. Thread `pendingVerdict` into `buildFeedbackMarkdown(annotations, pendingVerdict)` and into the `buildFeedbackDocument` meta as `verdict: pendingVerdict`. Add:

```tsx
  const onVerdict = useCallback((v: VerdictRequest) => {
    setPendingVerdict(v);
    setDrawerOpen(true);
  }, []);
```

  In the drawer (non-gate, `canPost` branch), above the send button, render the pending verdict as a removable card:

```tsx
  {pendingVerdict && (
    <div className="mb-2 rounded-md border border-stone-300 bg-stone-50 p-2 text-xs">
      <span className="font-semibold">
        Verdict: {pendingVerdict.status} — {pendingVerdict.component} r
        {pendingVerdict.resultsVersion}
      </span>
      <button
        className="ml-2 text-stone-400 hover:text-red-600"
        onClick={() => setPendingVerdict(null)}
      >
        ✕
      </button>
    </div>
  )}
```

  and change the send button's `disabled` to `annotations.length === 0 && !pendingVerdict`.
- `buildFeedbackMarkdown(annotations, verdict)` extension — full replacement:

```tsx
function buildFeedbackMarkdown(
  annotations: Annotation[],
  verdict: VerdictRequest | null,
): string {
  if (annotations.length === 0 && !verdict) return "# Board Feedback\n\nNo feedback.";
  const lines: string[] = ["# Board Feedback", ""];
  if (verdict) {
    lines.push(
      `## VERDICT: ${verdict.status.toUpperCase()} — ${verdict.component} r${verdict.resultsVersion}`,
    );
    if (verdict.comment) lines.push(`> ${verdict.comment}`);
    lines.push(
      "",
      "Apply via: results.py verdict --component " +
        `${verdict.component} --version ${verdict.resultsVersion} --status ${verdict.status}`,
      "",
    );
  }
  if (annotations.length > 0) {
    lines.push(
      `I've reviewed the board and have ${annotations.length} piece${annotations.length === 1 ? "" : "s"} of feedback:`,
      "",
    );
  }
  annotations.forEach((a, i) => {
    if (a.type === "plan-comment") {
      const head = `${a.component} v${a.version}${a.isDraft ? " (draft)" : ""}${a.sectionHeading ? ` — ${a.sectionHeading}` : ""}`;
      lines.push(`## ${i + 1}. [${head}]`);
      lines.push(`Feedback on: "${a.quote}"`);
    } else if (a.type === "result-comment") {
      const t =
        a.target.kind === "artifact"
          ? `artifact ${a.target.artifactId}`
          : a.target.kind === "metric"
            ? `metric ${a.target.metricLabel}`
            : "report";
      lines.push(`## ${i + 1}. [${a.component} r${a.resultsVersion} — ${t}]`);
      if (a.target.quote) lines.push(`Feedback on: "${a.target.quote}"`);
    } else if (a.type === "script-comment") {
      lines.push(
        `## ${i + 1}. [${a.component} r${a.resultsVersion} — ${a.script.split("/").pop()} lines ${a.lineStart}-${a.lineEnd}]`,
      );
      lines.push("```", a.excerpt, "```");
    } else {
      lines.push(`## ${i + 1}. [${a.view} — general]`);
    }
    for (const ln of a.comment.split("\n")) lines.push(`> ${ln}`);
    lines.push("");
  });
  return lines.join("\n");
}
```

- Drawer annotation cards: in the card header ternary (currently `a.type === "plan-comment" ? ... : ...`), expand to cover all four types:

```tsx
  {a.type === "plan-comment" ? (
    <>
      <span className="font-medium text-stone-700">
        {a.component} v{a.version}
        {a.isDraft ? " (draft)" : ""}
      </span>
      {a.sectionHeading && <span>· {a.sectionHeading}</span>}
      {!a.anchored && (
        <span className="rounded bg-stone-100 px-1 py-0.5">unanchored</span>
      )}
    </>
  ) : a.type === "result-comment" ? (
    <span className="font-medium text-stone-700">
      {a.component} r{a.resultsVersion} ·{" "}
      {a.target.kind === "artifact"
        ? a.target.artifactId
        : a.target.kind === "metric"
          ? a.target.metricLabel
          : "report"}
    </span>
  ) : a.type === "script-comment" ? (
    <span className="font-medium text-stone-700">
      {a.script.split("/").pop()} L{a.lineStart}
      {a.lineEnd !== a.lineStart ? `–${a.lineEnd}` : ""}
    </span>
  ) : (
    <span className="font-medium text-stone-700">{a.view} — general</span>
  )}
```

  and extend the quote preview condition to also show `a.target.quote` for report comments and `a.excerpt` (monospace) for script comments.
- Render the view in `<main>`:

```tsx
  {tab === "results" && (
    <Results
      data={data}
      canAnnotate={canAnnotate}
      canPost={canPost}
      selectedComponent={selectedComponent}
      onSelectComponent={setSelectedComponent}
      annotations={annotations}
      onAddResultComment={addResultComment}
      onAddScriptComment={addScriptComment}
      onPaintResult={onPaintResult}
      onVerdict={onVerdict}
      focusResults={data.focusResults ?? null}
    />
  )}
```

- Tracker + PlanReader get a new prop `onOpenResults={(slug) => { setSelectedComponent(slug); setTab("results"); }}`.
- `submit()` success handler: also `setPendingVerdict(null)`.

- [ ] **Step 2: Tracker.tsx** — add prop `onOpenResults: (slug: string) => void`; add a `<th>` "Results" after "Plan"; in each row:

```tsx
  <td className="px-4 py-2.5">
    {(() => {
      const g = slug ? data.files.executionPlans.find((x) => x.component === slug) : null;
      const latest = g?.results?.[g.results.length - 1];
      if (!latest) return <span className="text-xs text-stone-400">—</span>;
      const mark =
        latest.verdict?.status === "accepted"
          ? "✓"
          : latest.verdict?.status === "changes-requested"
            ? "✕"
            : "●";
      return (
        <button
          className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
          onClick={() => onOpenResults(slug!)}
        >
          r{latest.resultsVersion} {mark}
        </button>
      );
    })()}
  </td>
```

Also add `"done (verified)": "bg-green-100 text-green-900 border-green-300",` to `CHIP`.

- [ ] **Step 3: PlanReader.tsx** — add prop `onOpenResults: (slug: string) => void`; under the version-strip row insert:

```tsx
  {(group.results ?? []).some((b) => b.manifest?.planVersion === doc.version) && (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
      Results under this version:
      {(group.results ?? [])
        .filter((b) => b.manifest?.planVersion === doc.version)
        .map((b) => (
          <button
            key={b.dir}
            className="rounded-full border border-stone-300 bg-white px-2 py-0.5 font-medium text-blue-700 hover:border-stone-500"
            onClick={() => onOpenResults(group.component)}
          >
            r{b.resultsVersion}
            {b.verdict?.status === "accepted"
              ? " ✓"
              : b.verdict?.status === "changes-requested"
                ? " ✕"
                : " ●"}
          </button>
        ))}
    </div>
  )}
```

- [ ] **Step 4: Timeline.tsx** — add `"result"` to `EventKind` and `KIND_STYLE` (`{ dot: "bg-emerald-500", label: "Results" }`), include it in the filter row array, and in `buildEvents` append after the plans loop:

```tsx
  for (const group of data.files.executionPlans) {
    for (const b of group.results ?? []) {
      const m = b.manifest;
      events.push({
        kind: "result",
        sortKey: m?.capturedAt ?? "0000-00-00 00:00",
        title: `${group.component} r${b.resultsVersion}`,
        badge: m?.provenance === "retrofit" ? "retrofit" : undefined,
        body: `Results captured${m?.planVersion != null ? ` under plan v${m.planVersion}` : ""}${m?.trigger && m.trigger !== "initial" ? ` (${m.trigger})` : ""}${m?.summary ? ` — ${m.summary}` : ""}.`,
        searchText: `results ${group.component} r${b.resultsVersion} ${m?.summary ?? ""}`,
      });
      if (b.verdict) {
        events.push({
          kind: "result",
          sortKey: b.verdict.date,
          title: `${group.component} r${b.resultsVersion}`,
          badge: b.verdict.status,
          body: `Verdict by ${b.verdict.reviewer}: **${b.verdict.status}**${b.verdict.comment ? ` — ${b.verdict.comment}` : ""}.`,
          searchText: `verdict ${group.component} ${b.verdict.status}`,
        });
      }
    }
  }
```

- [ ] **Step 5: Verify** — `cd board && npx vitest run` (PASS) and `npm run dev` visual check against dev-data: Results tab shows both dev bundles, verdict banner, table renders, script drawer opens, comments + verdict land in the drawer, Tracker/PlanReader/Timeline cross-links work.

- [ ] **Step 6: Commit**

```bash
git add board/src/App.tsx board/src/views/Tracker.tsx board/src/views/PlanReader.tsx board/src/views/Timeline.tsx
git commit -m "board ui: wire Results tab, verdict submit, cross-links, timeline events"
```

---

### Task 10: Build template + end-to-end fixture check

**Files:**
- Modify: `skills/managing-research-plans/assets/board-template.html` (build artifact)
- Modify: `tests/test_board.py` (export round-trip assertion)

- [ ] **Step 1: Add export round-trip test**

```python
class TestExportResults(unittest.TestCase):
    def test_export_embeds_bundles_and_data_uris(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            p = run_board(root, "--export")
            self.assertEqual(p.returncode, 0, p.stderr)
            payload = extract_payload((root / "plans" / "board.html").read_text())
            g = next(g for g in payload["files"]["executionPlans"]
                     if g["component"] == "01-data-prep")
            self.assertTrue(
                g["results"][0]["assets"]["fig1.png"].startswith("data:image/png;base64,"))
```

Run: `python3 -m unittest tests.test_board -v` — should already PASS given Task 5's `export()` change; if `build_assets` was not wired into `export()`, fix that now.

- [ ] **Step 2: Build the template**

```bash
cd board && npm run build
```

Expected: build succeeds and copies `dist/index.html` → `skills/managing-research-plans/assets/board-template.html`. Verify the dev-data sentinel was tree-shaken: `grep -c RP_BOARD_DEV_DATA ../skills/managing-research-plans/assets/board-template.html` → `0`.

- [ ] **Step 3: Full-suite check**

```bash
python3 -m unittest discover -s tests -q && cd board && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add skills/managing-research-plans/assets/board-template.html tests/test_board.py
git commit -m "board: rebuild template with Results view; export round-trip test"
```

---

### Task 11: Commands — `/results`, and updates to sync/board/status

**Files:**
- Create: `commands/results.md`
- Modify: `commands/sync.md` (allowed-tools + new step 6.5), `commands/board.md` (verdict + results routing in step 5; results focus in step 3), `commands/status.md` (unverified-done note)

- [ ] **Step 1: Write `commands/results.md`**

```markdown
---
description: Capture a versioned results bundle for a component — report, figures/tables, key numbers, and script snapshots — or adopt pre-existing artifacts (--adopt)
argument-hint: [component name/number | --adopt]
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Bash(python3:*), Bash(git:*), Bash(ls:*), Bash(date:*)
---

Capture results for review on the board. Skill context: `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/SKILL.md`. Mechanics script: `${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/scripts/results.py` (python3 only). Requires an initialized project (`plans/master-plan.md` with its marker); if absent, say so and stop.

A bundle is immutable once finalized. It records what the analysis produced (report.md), the exact files (artifacts/, sha256-verified), the code that produced them (scripts/), and the key numbers (manifest metrics). Verdicts happen later, on the board — never here.

1. **Resolve the component.** From `$ARGUMENTS` (name or number) via the master plan tracker. With `--adopt`, skip to step 7.

2. **Gather candidates.** Run `python3 <script> discover` and cross-reference: (a) this session's context — what was just produced; (b) the component's latest plan `Verification` section — what outputs the plan promised. Zero qualifying artifacts is a legitimate answer — report it honestly and stop; never pad a bundle.

3. **Interview.** Ask the researcher which artifacts belong in the bundle (multi-select), then for each: title, one-line caption, and the producing script if you cannot identify it from session context. Ask which key numbers to surface as metrics (label + value + optional note). Never guess a producing script — record `producedBy: null` if unknown.

4. **Stage.** Run `python3 <script> stage --component <NN-slug>` → staging dir. Copy artifacts: `python3 <script> copy --staging <dir> --into artifacts <paths...>`; copy scripts likewise with `--into scripts`. The copy output gives you sha256/bytes/oversized for the manifest.

5. **Write report.md and manifest.json into the staging dir.** report.md is brief: what ran, what came out, how it meets or misses the plan's success criteria, anomalies worth the researcher's eyes; cite artifacts by id. manifest.json fields: schemaVersion 1, component, resultsVersion (finalize renumbers), planVersion = latest signed vN (null if none), provenance "planned", trigger "initial" | "redo-after-review" (when acting on board feedback) | "plan-revision" (first capture after a new plan version), capturedAt via `date +"%Y-%m-%d %H:%M"`, summary, metrics, artifacts (id/kind/title/caption/file/source/producedBy exactly as the copy output reported).

6. **Finalize and verify on disk.** Run `python3 <script> finalize --staging <dir>`. On validation failure, fix the staged files and retry. On success, verify the printed `rN` path exists on disk before reporting. Then offer the board: `/research-plans:board <NN-slug>:r<N>` opens directly on the bundle for review and verdict. Suggest a commit like `plans: results — <NN-slug> r<N> captured` (do not run without approval).

7. **Adopt mode (--adopt).** For pre-existing figures/tables made before or outside any plan. Run discover, present the candidates grouped by directory, and interview: which artifacts matter, and which component each belongs to — offer to add a tracker row for work that has no component yet (status from evidence, notes say "retrofit"). Then per component follow steps 4-6 with provenance "retrofit" and planVersion = latest signed version or null. Retrofit bundles review and verdict identically; the provenance chip keeps the record honest.

8. **Log.** Append a decision-log entry (real timestamp) recording what was captured and why, per the standard format.
```

- [ ] **Step 2: `commands/sync.md`** — in the frontmatter `allowed-tools`, no change needed (python3 not currently allowed — ADD it): `Bash(python3:*)`. Insert a new step between steps 6 and 7:

```markdown
6.5. **Offer results capture.** For each component whose status moved to `done` this sync — or where `python3 ${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/scripts/results.py changed --component <NN-slug>` reports drifted sources — offer `/research-plans:results <component>`. Never capture silently; the researcher decides. A component with an accepted bundle whose sources have since drifted deserves an explicit flag: the verified results no longer match the code outputs on disk.
```

- [ ] **Step 3: `commands/board.md`** — step 3: component resolution now also accepts `NN-slug:rN` (pass through to `--focus` verbatim). Step 5 gains two bullets before "Log the exchange":

```markdown
   - **Verdict block** (`## VERDICT: ...` in the markdown, `verdict` object in the fence): apply it via `python3 ${CLAUDE_PLUGIN_ROOT}/skills/managing-research-plans/scripts/results.py verdict --component <c> --version <N> --status <s> --reviewer "<git user.name>" [--comment "..."] --plan-version <latest signed vN>`. Then: on **accepted**, update the component's tracker status to `done (verified)`; on **changes-requested**, treat the accompanying result/script comments as revision instructions — fix the scripts, re-run the analysis, and capture the fix as a NEW bundle via /research-plans:results (trigger `redo-after-review`). Either way, append a decision-log entry recording the verdict.
   - **Result comments** (`[<component> rN — artifact/metric/report]`) and **script comments** (`[... lines A-B]`): these reference immutable bundle contents — never edit the bundle. Discuss with the researcher; fixes flow into scripts in the working tree and a new capture.
```

- [ ] **Step 4: `commands/status.md`** — add one line to the drift checks: "Flag components marked `done` whose latest results bundle is pending or has `changes-requested` (unverified done), and `done (verified)` components whose `results.py changed` reports drifted sources."

- [ ] **Step 5: Commit**

```bash
git add commands/results.md commands/sync.md commands/board.md commands/status.md
git commit -m "commands: /results capture+adopt; sync/board/status results routing"
```

---

### Task 12: Docs, version bump, headless pressure test, final verification

**Files:**
- Modify: `README.md` (commands table + new "Results" section after "The board"), `QUICKSTART.md` (one paragraph), `skills/managing-research-plans/SKILL.md` (artifact map + conventions), `CHANGELOG.md`, `.claude-plugin/plugin.json` (version 0.6.0)

- [ ] **Step 1: Docs.** README: add `/research-plans:results` row to the commands table; add a "Results" section describing bundles (immutable rN dirs, staging protocol, verdicts recorded not gated, retrofit provenance, 5 MB cap) and extend the board section (fifth view) + the export privacy warning (now includes figures and script snapshots). Update the "What it creates in your project" tree with `results/r1/...`. QUICKSTART: add a capture-and-verdict paragraph after the sync step. SKILL.md: add results conventions (bundle layout, when to offer capture, verdict semantics, `done (verified)` status). CHANGELOG:

```markdown
## 0.6.0 (2026-07-03)

- **Results layer**: versioned, immutable result bundles per component
  (`plans/execution/<slug>/results/rN/` — report, figure/table snapshots with
  sha256 provenance, script snapshots, key metrics). Capture via
  `/research-plans:results` (or `--adopt` for pre-existing artifacts;
  `provenance: retrofit`), staging-then-atomic-rename via `results.py`.
- **Board: fifth view (Results)** — version strip with plan tags and verdict
  badges, verdict banner (Accept / Request changes), metric tiles, figure/table
  gallery (tables via a whitelist-sanitizing renderer), per-artifact
  "produced by" script drawer with line-anchored comments.
- **Verdicts are recorded acts, not gates**: accept/request-changes flows back
  as an action block; the session applies it (`results.py verdict`), logs it,
  and marks the tracker `done (verified)`. verdict.json is written once.
- Sign-off hook now also enforces bundle immutability (synchronous policy;
  never opens a browser; one-time verdict.json creation allowed).
- `/sync` offers capture when components hit done or sources drift;
  `/status` flags unverified done components. Payload schemaVersion 2.
```

plugin.json: `"version": "0.6.0"`.

- [ ] **Step 2: Headless pressure test.** In a scratch dir (use the session scratchpad, NOT the repo): build a minimal initialized project (markers + master plan + one component + fake `output/fig.png` + `code/model.R`), then drive the full mechanics loop directly (no nested claude needed for the mechanical path):

```bash
python3 <plugin>/scripts/results.py stage --component 01-x        # → staging
python3 <plugin>/scripts/results.py copy --staging <s> --into artifacts output/fig.png
python3 <plugin>/scripts/results.py copy --staging <s> --into scripts code/model.R
# write manifest.json + report.md into staging (as the command would)
python3 <plugin>/scripts/results.py finalize --staging <s>        # → r1
python3 <plugin>/scripts/board.py --export                        # → board.html embeds r1
python3 <plugin>/scripts/results.py verdict --component 01-x --version 1 \
  --status accepted --reviewer BK --plan-version 1
```

Verify on disk after each step (r1 exists, board.html contains the data URI, verdict.json written; second verdict attempt fails). Then one nested headless check of the gate: `RESEARCH_PLANS_NO_GATE` unset, simulate the hook with the test-style stdin JSON against the scratch project and confirm deny on editing `r1/report.md`.

- [ ] **Step 3: Final verification**

```bash
python3 -m unittest discover -s tests -q     # OK
cd board && npx vitest run                   # all pass
npm run build                                # template rebuilt cleanly
claude plugin validate ~/github/research-plans-results --strict
```

- [ ] **Step 4: Commit**

```bash
git add README.md QUICKSTART.md skills/managing-research-plans/SKILL.md CHANGELOG.md .claude-plugin/plugin.json
git commit -m "v0.6.0: results layer — docs, changelog, version bump"
```

- [ ] **Step 5: Researcher UI review.** Create a demo project (scratchpad) with 2-3 realistic bundles (a real matplotlib-style PNG, an HTML regression table, a pending + an accepted + a retrofit bundle), run `board.py` live, and hand the URL to the researcher for review. Act on feedback.

## Deviation policy

If execution reveals a mismatch between this plan and the code (line numbers moved, the concurrent remote-review branch shifted an interface), follow the code, keep the interface contracts above, and note the deviation in the final report.
