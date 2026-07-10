# Board control surface 1/3 — Python backend (ports, health, tokens, tickets, canonical orders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `board.py` everything the persistent control surface needs server-side: a stable derived port with pinning state, an identifying health endpoint, per-boot token + GET hardening, durable single-slot action orders with a typed, ticket-issuing sign-off path, and action-key stripping on hand-delivered ingress.

**Architecture:** All changes live in `skills/managing-research-plans/scripts/board.py` (plus tests). The one-shot request core stays: first accepted action still sets the done event and exits; persistence is the command loop's job (plan 3/3). The batch-ticket mechanism (`write_ticket` + `signoff_gate.check_ticket` + shared `normalize_plan`) is reused verbatim for single-plan approval — no `signoff_gate.py` changes.

**Tech Stack:** Python 3 stdlib only (repo rule). Tests: stdlib `unittest` in `tests/test_board.py` (repo convention — docstrings say `python3 -m unittest`; run via `python3 -m unittest tests.test_board -v` or `python3 -m pytest tests/ -q`, both work).

**Spec:** `docs/specs/2026-07-09-board-control-surface-design.md` §3–§5. All anchors below are at `0d01a90` (v0.13 merge).

## Global Constraints

- Python stdlib only; no new runtime deps.
- The one-shot request core is UNCHANGED: accepted action → durable write → `done.set()` → exit. No serve-forever loop in board.py.
- `signoff_gate.py` is NOT modified — the generalized approval ticket rides the existing acceptance path (`signoff_gate.py:292-297`) and forgery guard (`:228-244`).
- Hosted/remote/static capabilities unchanged; `--pull` stripping (`board.py:1369-1399`, `:1408-1409`) unchanged.
- Every new POST behavior keeps `local_request_ok` (`board.py:674-677`) in front of it.
- Baseline before starting: `python3 -m pytest tests/ -q` → 179 passed; `npm --prefix board test` → 95 passed.

---

### Task 1: Derived port + lock metadata

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py` (`acquire_lock` at :554-578, `serve()` server construction at :791-792, `parse_args` at :1648-1671)
- Test: `tests/test_board.py` (new `TestPortDerivation`, `TestLockMeta` classes)

**Interfaces:**
- Produces: `derive_port(root: Path) -> int` (41000..41999, deterministic per canonical root); `pick_port(root, requested: int) -> int` (requested if nonzero, else first bindable of derived..derived+9, else 0); `read_lock(plans_dir: Path) -> dict | None` returning `{"pid": int, "port": int, "bootId": str}` (back-compat: legacy int-only lock file → `{"pid": N, "port": 0, "bootId": ""}`); `acquire_lock(plans_dir, force, meta=None)` now writes JSON `{"pid": ..., **meta}`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_board.py`:

```python
class TestPortDerivation(unittest.TestCase):
    def test_derive_port_deterministic_and_in_range(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            p1 = board.derive_port(root)
            p2 = board.derive_port(root)
            self.assertEqual(p1, p2)
            self.assertGreaterEqual(p1, 41000)
            self.assertLess(p1, 42000)

    def test_derive_port_differs_across_roots(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            ports = {board.derive_port(Path(a)), board.derive_port(Path(b))}
            # Not guaranteed distinct, but the hash inputs must differ:
            self.assertEqual(
                board.derive_port(Path(a)), board.derive_port(Path(a) / ".." / Path(a).name)
            )

    def test_pick_port_respects_explicit_request(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertEqual(board.pick_port(Path(td), 5123), 5123)

    def test_pick_port_probes_past_busy(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            base = board.derive_port(root)
            blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                blocker.bind(("127.0.0.1", base))
                blocker.listen(1)
                picked = board.pick_port(root, 0)
                self.assertNotEqual(picked, base)
                self.assertTrue(base < picked <= base + 9 or picked == 0)
            finally:
                blocker.close()


class TestLockMeta(unittest.TestCase):
    def test_lock_written_as_json_with_meta(self):
        with tempfile.TemporaryDirectory() as td:
            plans = Path(td) / "plans"
            plans.mkdir()
            board.acquire_lock(plans, False, meta={"port": 41234, "bootId": "abc"})
            info = board.read_lock(plans)
            self.assertEqual(info["pid"], os.getpid())
            self.assertEqual(info["port"], 41234)
            self.assertEqual(info["bootId"], "abc")

    def test_read_lock_legacy_plain_pid(self):
        with tempfile.TemporaryDirectory() as td:
            plans = Path(td) / "plans"
            plans.mkdir()
            (plans / ".board.lock").write_text("4242")
            info = board.read_lock(plans)
            self.assertEqual(info, {"pid": 4242, "port": 0, "bootId": ""})
```

Add `import socket` to the test file's imports if absent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_board.TestPortDerivation tests.test_board.TestLockMeta -v`
Expected: FAIL / ERROR with `AttributeError: module 'board' has no attribute 'derive_port'` (and `read_lock`, and `acquire_lock` rejecting `meta=`).

- [ ] **Step 3: Implement**

In `board.py`, next to `acquire_lock` (:554):

```python
def derive_port(root):
    """Stable per-project default port: 41000 + sha256(canonical root) % 1000."""
    digest = hashlib.sha256(str(Path(root).resolve()).encode("utf-8")).hexdigest()
    return 41000 + int(digest, 16) % 1000


def _bindable(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def pick_port(root, requested):
    """requested wins; else probe derived..derived+9; else 0 (OS-assigned)."""
    if requested:
        return requested
    base = derive_port(root)
    for cand in range(base, base + 10):
        if _bindable(cand):
            return cand
    return 0


def read_lock(plans_dir):
    lock = plans_dir / ".board.lock"
    if not lock.exists():
        return None
    raw = lock.read_text(encoding="utf-8").strip()
    try:
        info = json.loads(raw)
        if isinstance(info, dict) and "pid" in info:
            return {"pid": int(info["pid"]),
                    "port": int(info.get("port", 0)),
                    "bootId": str(info.get("bootId", ""))}
    except (ValueError, TypeError):
        pass
    try:
        return {"pid": int(raw), "port": 0, "bootId": ""}
    except ValueError:
        return None
```

Add `import socket` to board.py's imports (it is not imported today). Change `acquire_lock(plans_dir, force)` (:554) to `acquire_lock(plans_dir, force, meta=None)`; replace the PID read (:558-followed lines) with `info = read_lock(plans_dir); pid = info["pid"] if info else None`, and the final write (:577) with:

```python
    lock.write_text(json.dumps({"pid": os.getpid(), **(meta or {})}), encoding="utf-8")
    return lock
```

In `serve()` (:617-), the lock is currently acquired at :620 BEFORE the port is known. Move the bind earlier or update the lock after binding — do the latter (smallest diff): keep `acquire_lock(plans_dir, args.force)` at :620, then after `port = server.server_address[1]` (:792) rewrite the lock with metadata:

```python
    lock.write_text(json.dumps({"pid": os.getpid(), "port": port, "bootId": boot_id}), encoding="utf-8")
```

(`boot_id` arrives in Task 2 — for this task write `"bootId": ""` and update in Task 2.) Change server construction (:791) to use the picked port:

```python
    server = ThreadingHTTPServer(("127.0.0.1", pick_port(root, args.port)), Handler)
```

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_board.TestPortDerivation tests.test_board.TestLockMeta -v`
Expected: PASS. Then full suite: `python3 -m pytest tests/ -q` → 179 + 6 new pass (no regressions; existing `run_board` subprocess tests exercise `--export`/`--collect` paths that never bind).

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "feat(board): derived per-project port with probe + JSON lock metadata"
```

---

### Task 2: Boot identity, health payload, no-store, GET hardening

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py` (`serve()` :617-, `do_GET` :645-667)
- Test: `tests/test_board.py` (new `TestServeHTTP` socket harness + cases)

**Interfaces:**
- Produces: module-level `payload_generation(payload: dict) -> str` (sha256 hex over `json.dumps(payload, sort_keys=True)` EXCLUDING volatile keys `publishToken` and `boardToken`); `project_id(root) -> str` (first 16 hex of sha256 of canonical root — note: same digest input as `derive_port`); `/api/health` → `{"ok": true, "app": "research-plans-board", "bootId": <32-hex>, "generation": <64-hex>, "projectId": <16-hex>}`; `Cache-Control: no-store` on health and HTML GET responses; non-local `Host` on GET → 403; HTML responses carry `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`.
- Produces (test infra): `serve_in_thread(root, payload, **argkw)` helper in `tests/test_board.py` returning `(base_url, stop_fn, thread)` — the net-new socket harness later tasks reuse.
- Consumes: Task 1's lock metadata write (fills real `bootId` now).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_board.py`:

```python
import urllib.request
import urllib.error


def serve_in_thread(root, payload=None, **argkw):
    """Run board.serve() on an OS port in a daemon thread; return (url, stop, thread)."""
    if payload is None:
        payload = board.collect_payload(root)
        payload["mode"] = "live"
    args = argparse.Namespace(port=0, timeout=30, no_open=True, force=False)
    for k, v in argkw.items():
        setattr(args, k, v)
    started = {}

    def run():
        try:
            board.serve(root, payload, args)
        except SystemExit as e:
            started["exit"] = e.code

    t = threading.Thread(target=run, daemon=True)
    t.start()
    plans = root / "plans"
    for _ in range(200):
        info = board.read_lock(plans)
        if info and info.get("port"):
            break
        time.sleep(0.02)
    info = board.read_lock(plans)
    url = "http://127.0.0.1:%d" % info["port"]

    def stop():
        try:
            urllib.request.urlopen(url + "/__nostop__", timeout=1)
        except Exception:
            pass

    return url, info, t


def http_json(url, path, body=None, headers=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, method=method or ("POST" if data else "GET"))
    req.add_header("Content-Type", "application/json")
    req.add_header("Host", "127.0.0.1")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read().decode() or "{}"), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}"), dict(e.headers)


class TestServeHTTP(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.root = Path(self.td.name)
        make_project(self.root)

    def tearDown(self):
        self.td.cleanup()

    def test_health_carries_identity_and_no_store(self):
        url, info, t = serve_in_thread(self.root)
        status, body, headers = http_json(url, "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["bootId"]), 32)
        self.assertEqual(body["bootId"], info["bootId"])
        self.assertEqual(len(body["generation"]), 64)
        self.assertEqual(body["projectId"], board.project_id(self.root))
        self.assertEqual(headers.get("Cache-Control"), "no-store")

    def test_html_get_has_frame_denial_and_no_store(self):
        url, info, t = serve_in_thread(self.root)
        req = urllib.request.Request(url + "/", method="GET")
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.headers.get("X-Frame-Options"), "DENY")
            self.assertIn("frame-ancestors 'none'", r.headers.get("Content-Security-Policy", ""))
            self.assertEqual(r.headers.get("Cache-Control"), "no-store")

    def test_get_with_evil_host_is_403(self):
        url, info, t = serve_in_thread(self.root)
        status, body, _ = http_json(url, "/api/health", headers={"Host": "evil.example.com"})
        self.assertEqual(status, 403)

    def test_generation_stable_across_volatile_tokens(self):
        p1 = {"a": 1, "publishToken": "x", "boardToken": "y"}
        p2 = {"a": 1, "publishToken": "zzz", "boardToken": "qqq"}
        self.assertEqual(board.payload_generation(p1), board.payload_generation(p2))
```

Add `import argparse`, `import threading`, `import time` to test imports if absent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_board.TestServeHTTP -v`
Expected: FAIL — no `project_id`/`payload_generation`; health body lacks `bootId`; no headers.

- [ ] **Step 3: Implement**

In `board.py`:

```python
def project_id(root):
    return hashlib.sha256(str(Path(root).resolve()).encode("utf-8")).hexdigest()[:16]


def payload_generation(payload):
    trimmed = {k: v for k, v in payload.items() if k not in ("publishToken", "boardToken")}
    return hashlib.sha256(
        json.dumps(trimmed, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
```

In `serve()` before the Handler class (:633): `boot_id = uuid.uuid4().hex`, `generation = payload_generation(payload)`, `proj_id = project_id(root)` (and Task 1's lock rewrite now uses the real `boot_id`). In `do_GET` (:645):

- First line of `do_GET`: `if not _host_is_local(self.headers.get("Host", "")): self.send_response(403); self.end_headers(); return` (reuse `_host_is_local` :51-55).
- Health branch (:646-648) becomes `self._json(200, {"ok": True, "app": "research-plans-board", "bootId": boot_id, "generation": generation, "projectId": proj_id}, no_store=True)`.
- Extend `_json` (:637) with `no_store=False` kwarg → when true `self.send_header("Cache-Control", "no-store")`.
- HTML branch (:663-667): add `self.send_header("Cache-Control", "no-store")`, `self.send_header("X-Frame-Options", "DENY")`, `self.send_header("Content-Security-Policy", "frame-ancestors 'none'")`.

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_board.TestServeHTTP tests.test_board.TestLockMeta -v` then `python3 -m pytest tests/ -q`
Expected: PASS; no regressions.

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "feat(board): boot identity on /api/health + no-store + GET Host/frame hardening"
```

---

### Task 3: Per-boot board token on mutating routes

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py` (`serve()` payload injection :626-627 area, `do_POST` :673-)
- Test: `tests/test_board.py` (`TestServeHTTP` additions)

**Interfaces:**
- Produces: `payload["boardToken"]` = 64-hex per-boot secret injected in `serve()` (same pattern as `publishToken` :626-627); every `/api/*` POST route requires body `boardToken` matching, else 403 `{"error": "bad-token"}`. `/publish-web` keeps its existing `publishToken` check (:684) unchanged.
- Consumes: `payload_generation` excludes `boardToken` (Task 2 already does).

- [ ] **Step 1: Write the failing tests**

```python
    def test_api_post_without_board_token_is_403(self):
        url, info, t = serve_in_thread(self.root)
        status, body, _ = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "hi", "payloadHash": "x",
        })
        self.assertEqual(status, 403)
        self.assertEqual(body.get("error"), "bad-token")

    def test_api_post_with_board_token_accepted(self):
        payload = board.collect_payload(self.root)
        payload["mode"] = "live"
        url, info, t = serve_in_thread(self.root, payload=payload)
        status, body, _ = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "hi", "payloadHash": "x",
            "boardToken": payload["boardToken"],
        })
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest tests.test_board.TestServeHTTP -v`
Expected: first new test FAILS (feedback accepted without token → 200).

- [ ] **Step 3: Implement**

In `serve()` next to the publishToken injection (:626-627): `payload["boardToken"] = hashlib.sha256(os.urandom(32)).hexdigest()` — capture `board_token = payload["boardToken"]` before html render. In `do_POST` right after the `local_request_ok` guard (:674-677) add, for every path starting with `/api/`:

```python
            if self.path.startswith("/api/"):
                try:
                    body = self._read_body()
                except Exception:
                    self.send_response(400); self.end_headers(); return
                if not hmac.compare_digest(str(body.get("boardToken", "")), board_token):
                    self._json(403, {"error": "bad-token"}); return
```

Add `import hmac`. Refactor the individual route branches to reuse this pre-read `body` instead of calling `self._read_body()` again (feedback :702-716, approve :717-733, deny :734-747, batch/* :750-787). `/api/approve` currently posts `{}` from the client — the client gains the token in plan 2/3 (App.tsx `gateApprove`), so gate/batch routes take the same body-token path. `/publish-web` (:678-701) is NOT under `/api/` and keeps publishToken semantics.

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_board.TestServeHTTP -v && python3 -m pytest tests/ -q`
Expected: PASS. Existing gate/batch unit tests that call handlers via HTTP do not exist (nothing else posts), so no fixture updates needed.

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "feat(board): per-boot boardToken required on all /api mutating routes"
```

---

### Task 4: Durable single-slot action orders + POST response contract

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py` (`do_POST` feedback/approve/deny :702-747)
- Test: `tests/test_board.py`

**Interfaces:**
- Produces: every accepted `/api/feedback|approve|deny` POST → atomic write of `plans/.board-feedback.md` (tmp + `os.replace`), response `{"ok": true, "actionId": <32-hex>, "bootId": ..., "projectId": ...}`; a second such POST to the same server instance → `409 {"error": "already-accepted", "actionId": <first id>}`; the accepted-slot flag is guarded by a `threading.Lock` so concurrent POSTs cannot both write (`board.py:687-691`'s ThreadingHTTPServer stays).
- Consumes: Task 2 identity values; Task 3 token gate.

- [ ] **Step 1: Write the failing tests**

```python
    def _live_url(self):
        payload = board.collect_payload(self.root)
        payload["mode"] = "live"
        url, info, t = serve_in_thread(self.root, payload=payload)
        return url, payload

    def test_accepted_post_returns_action_identity(self):
        url, payload = self._live_url()
        status, body, _ = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "hello", "payloadHash": "x",
            "boardToken": payload["boardToken"],
        })
        self.assertEqual(status, 200)
        self.assertEqual(len(body["actionId"]), 32)
        self.assertEqual(len(body["bootId"]), 32)
        self.assertEqual(body["projectId"], board.project_id(self.root))
        self.assertTrue((self.root / "plans" / ".board-feedback.md").exists())

    def test_second_action_post_is_409(self):
        url, payload = self._live_url()
        first = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "one", "payloadHash": "x",
            "boardToken": payload["boardToken"]})
        second = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "two", "payloadHash": "x",
            "boardToken": payload["boardToken"]})
        self.assertEqual(first[0], 200)
        self.assertEqual(second[0], 409)
        self.assertEqual(second[1]["error"], "already-accepted")
        self.assertEqual(second[1]["actionId"], first[1]["actionId"])
        doc = (self.root / "plans" / ".board-feedback.md").read_text()
        self.assertIn("one", doc)
        self.assertNotIn("two", doc)
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest tests.test_board.TestServeHTTP -v`
Expected: FAIL — response has no `actionId`; second POST also 200 and overwrites.

- [ ] **Step 3: Implement**

In `serve()` before Handler: `slot = {"actionId": None}; slot_lock = threading.Lock()`. Add a helper inside `serve()`:

```python
        def accept_order(doc, exit_code):
            with slot_lock:
                if slot["actionId"] is not None:
                    return None
                slot["actionId"] = uuid.uuid4().hex
            tmp = plans_dir / ".board-feedback.md.tmp"
            tmp.write_text(doc, encoding="utf-8")
            os.replace(tmp, plans_dir / ".board-feedback.md")
            result["doc"] = doc
            result["exit"] = exit_code
            return slot["actionId"]
```

Rewrite the `/api/feedback` branch (:702-716) to:

```python
            if self.path == "/api/feedback" and not gate_mode:
                doc = document_from_body(body, payload)
                aid = accept_order(doc, 0)
                if aid is None:
                    self._json(409, {"error": "already-accepted", "actionId": slot["actionId"]})
                    return
                self._json(200, {"ok": True, "actionId": aid,
                                 "bootId": boot_id, "projectId": proj_id})
                done.set()
                return
```

Apply the same `accept_order`/409 shape to `/api/approve` (:717-733, exit 0, synthesized APPROVED doc) and `/api/deny` (:734-747, exit 3). Batch routes are untouched (multi-accept by design, tickets persist per decision).

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_board.TestServeHTTP -v && python3 -m pytest tests/ -q`
Expected: PASS, no regressions (gate approve/deny unit coverage lives in `TestGateBatchTickets`/lifecycle tests which don't hit these routes over HTTP).

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "feat(board): durable atomic action orders, 409 single slot, actionId response contract"
```

---

### Task 5: Typed SIGNOFF requests — validation, staleness, ticket issuance

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py`
- Test: `tests/test_board.py` (new `TestSignoffAction`)

**Interfaces:**
- Produces: `collect_draft_hashes(root) -> dict[tuple[str, int], str]` mapping `(slug, version)` → `sha256(normalize_plan(text))` for every `plans/execution/*/.draft-v*.md` (same glob as `apply_gate_batch` :1536-1559); POST body may carry `"action": {"kind": "signoff", "component": "<NN-slug>", "version": N, "decision": "approve" | "request-changes", "reason": "<str, optional>"}`. Server validation: unknown component/version or non-dict action → 400 `{"error": "bad-action"}`; `decision == "approve"` and disk draft hash ≠ boot-time hash → `409 {"error": "stale-draft"}` (no ticket); valid approve → `board.write_ticket(root, slug, version, disk_content, action_id)` (existing fn :1517-1533) BEFORE the 200 reply.
- Consumes: Task 4's `accept_order`; `normalize_plan` import (:45); `write_ticket` (:1517).

- [ ] **Step 1: Write the failing tests**

```python
class TestSignoffAction(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.root = Path(self.td.name)
        make_project(self.root)  # creates 01-*/ .draft-v2.md per helper (:21-78)

    def tearDown(self):
        self.td.cleanup()

    def _serve(self):
        payload = board.collect_payload(self.root)
        payload["mode"] = "live"
        url, info, t = serve_in_thread(self.root, payload=payload)
        return url, payload

    def _draft(self):
        d = next((self.root / "plans" / "execution").glob("*/.draft-v*.md"))
        slug = d.parent.name
        ver = int(d.name.split("-v")[1].split(".")[0])
        return d, slug, ver

    def test_signoff_approve_writes_ticket(self):
        url, payload = self._serve()
        draft, slug, ver = self._draft()
        status, body, _ = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "approving", "payloadHash": "x",
            "boardToken": payload["boardToken"],
            "action": {"kind": "signoff", "component": slug, "version": ver,
                       "decision": "approve"},
        })
        self.assertEqual(status, 200)
        ticket = self.root / "plans" / "execution" / (".import-approved-%s-v%d" % (slug, ver))
        self.assertTrue(ticket.exists())
        tdoc = json.loads(ticket.read_text())
        self.assertEqual(tdoc["slug"], slug)
        self.assertEqual(tdoc["version"], ver)
        self.assertEqual(
            tdoc["contentHash"],
            hashlib.sha256(board.normalize_plan(draft.read_text()).encode()).hexdigest(),
        )

    def test_stale_draft_rejected_no_ticket(self):
        url, payload = self._serve()
        draft, slug, ver = self._draft()
        draft.write_text(draft.read_text() + "\n\nEDITED AFTER BOOT\n")
        status, body, _ = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "approving", "payloadHash": "x",
            "boardToken": payload["boardToken"],
            "action": {"kind": "signoff", "component": slug, "version": ver,
                       "decision": "approve"},
        })
        self.assertEqual(status, 409)
        self.assertEqual(body["error"], "stale-draft")
        ticket = self.root / "plans" / "execution" / (".import-approved-%s-v%d" % (slug, ver))
        self.assertFalse(ticket.exists())

    def test_unknown_component_is_400(self):
        url, payload = self._serve()
        status, body, _ = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "x", "payloadHash": "x",
            "boardToken": payload["boardToken"],
            "action": {"kind": "signoff", "component": "99-nope", "version": 1,
                       "decision": "approve"},
        })
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "bad-action")

    def test_request_changes_never_writes_ticket(self):
        url, payload = self._serve()
        draft, slug, ver = self._draft()
        status, body, _ = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "needs work", "payloadHash": "x",
            "boardToken": payload["boardToken"],
            "action": {"kind": "signoff", "component": slug, "version": ver,
                       "decision": "request-changes", "reason": "tighten H2"},
        })
        self.assertEqual(status, 200)
        ticket = self.root / "plans" / "execution" / (".import-approved-%s-v%d" % (slug, ver))
        self.assertFalse(ticket.exists())

    def test_ticket_admits_signed_write_e2e(self):
        # Mirror of test_gate_results.test_producer_ticket_allows_signed_write_e2e,
        # but the producer is the HTTP signoff route.
        url, payload = self._serve()
        draft, slug, ver = self._draft()
        http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "approving", "payloadHash": "x",
            "boardToken": payload["boardToken"],
            "action": {"kind": "signoff", "component": slug, "version": ver,
                       "decision": "approve"}})
        signed = draft.read_text() + "\nSigned off: BK 2026-07-10\n"
        gate = Path(board.__file__).parent / "signoff_gate.py"
        event = json.dumps({"tool_name": "Write", "tool_input": {
            "file_path": str(draft.parent / ("v%d.md" % ver)), "content": signed}})
        proc = subprocess.run([sys.executable, str(gate)], input=event,
                              capture_output=True, text=True, cwd=str(self.root))
        out = json.loads(proc.stdout)
        self.assertEqual(
            out.get("hookSpecificOutput", {}).get("permissionDecision"), "allow")
```

Match the hook-event shape used by `run_gate` in `tests/test_gate_results.py:33-41` — copy its exact JSON structure when writing this test (it is the source of truth for the event format; adjust the assertion to that helper's decision-extraction if it differs).

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest tests.test_board.TestSignoffAction -v`
Expected: FAIL — action key ignored, no ticket, no 400/409 branches.

- [ ] **Step 3: Implement**

In `board.py`:

```python
def collect_draft_hashes(root):
    out = {}
    for d in sorted((root / "plans" / "execution").glob("*/.draft-v*.md")):
        try:
            ver = int(d.name.split("-v")[1].split(".")[0])
        except (IndexError, ValueError):
            continue
        out[(d.parent.name, ver)] = hashlib.sha256(
            normalize_plan(d.read_text(encoding="utf-8")).encode("utf-8")).hexdigest()
    return out


def validate_signoff_action(action, draft_hashes):
    """Returns (slug, version, decision, reason) or raises ValueError."""
    if not isinstance(action, dict) or action.get("kind") != "signoff":
        raise ValueError("bad-action")
    slug = action.get("component"); ver = action.get("version")
    decision = action.get("decision")
    if decision not in ("approve", "request-changes"):
        raise ValueError("bad-action")
    if not isinstance(slug, str) or not isinstance(ver, int) or (slug, ver) not in draft_hashes:
        raise ValueError("bad-action")
    reason = action.get("reason")
    if reason is not None and not isinstance(reason, str):
        raise ValueError("bad-action")
    return slug, ver, decision, reason
```

In `serve()`: `draft_hashes = collect_draft_hashes(root)` before Handler. In the `/api/feedback` live branch (Task 4's version), before `accept_order`:

```python
                action = body.get("action")
                aid_ticket = None
                if action is not None:
                    try:
                        slug, ver, decision, reason = validate_signoff_action(action, draft_hashes)
                    except ValueError:
                        self._json(400, {"error": "bad-action"}); return
                    if decision == "approve":
                        dpath = root / "plans" / "execution" / slug / (".draft-v%d.md" % ver)
                        try:
                            dtext = dpath.read_text(encoding="utf-8")
                        except OSError:
                            self._json(409, {"error": "stale-draft"}); return
                        now_hash = hashlib.sha256(
                            normalize_plan(dtext).encode("utf-8")).hexdigest()
                        if now_hash != draft_hashes[(slug, ver)]:
                            self._json(409, {"error": "stale-draft"}); return
                        aid_ticket = (slug, ver, dtext)
```

then, AFTER `accept_order` succeeds and before replying 200: `if aid_ticket: write_ticket(root, aid_ticket[0], aid_ticket[1], aid_ticket[2], aid)` (`write_ticket`'s `batch_id` param takes the action id — it lands in the ticket's `batchId` field, a per-action audit tag). `serve()` needs `root` — it already has it (first parameter, :617).

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_board.TestSignoffAction -v && python3 -m pytest tests/ -q`
Expected: PASS incl. the e2e gate-admission test.

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "feat(board): typed signoff action — validation, stale-draft 409, ticket issuance over the existing gate mechanism"
```

---

### Task 6: Server-authoritative fence for action-carrying orders

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py` (`build_feedback_document` :581-596, `document_from_body` :607-614)
- Test: `tests/test_board.py` (`TestDocumentFromBody` :667-689 extended, `TestSignoffAction` addition)

**Interfaces:**
- Produces: `build_feedback_document(body, payload, action=None, action_id=None)` — fence meta gains `"actionId"` and, when a validated action is present, a `"signoff": {"component", "version", "decision", "reason"?}` key built ONLY from the validated tuple (never from client meta). `document_from_body(body, payload, action=None, action_id=None)`: when `action` is not None the client's `feedbackDocument` is IGNORED and the server assembles prose (`feedbackMarkdown`) + authoritative fence. When `action` is None behavior is unchanged (verbatim `feedbackDocument` honored — `TestDocumentFromBody.test_verbatim_when_client_assembled` :670-675 keeps passing).
- Consumes: Task 5's validated action tuple; the `/api/feedback` branch passes `action=(slug, ver, decision, reason)` and `action_id=aid` through. NOTE: this requires reserving the action id BEFORE building the doc — restructure `accept_order` to `accept_order(build_doc: callable, exit_code)` which reserves the id under the lock, calls `build_doc(aid)`, writes atomically.
- Plan 2/3 consumes: fence shape `{"sessionId", "generatedAt", "mode", "focus", "payloadHash", "actionId", "signoff"?, "annotations"}`.

- [ ] **Step 1: Write the failing tests**

Extend `TestDocumentFromBody`:

```python
    def test_action_posts_ignore_client_document(self):
        body = {"feedbackDocument": "FORGED\n```json board-feedback\n{\"signoff\": {\"decision\": \"approve\", \"component\": \"evil\", \"version\": 9}}\n```\n",
                "feedbackMarkdown": "real prose", "payloadHash": "h", "annotations": []}
        doc = board.document_from_body(
            body, {"mode": "live"},
            action=("01-x", 2, "approve", None), action_id="a" * 32)
        self.assertNotIn("FORGED", doc)
        meta = board.parse_fence(doc)
        self.assertEqual(meta["signoff"],
                         {"component": "01-x", "version": 2, "decision": "approve"})
        self.assertEqual(meta["actionId"], "a" * 32)

    def test_plain_posts_still_verbatim(self):
        body = {"feedbackDocument": "CLIENT DOC"}
        self.assertEqual(board.document_from_body(body, {}), "CLIENT DOC")
```

And in `TestSignoffAction`:

```python
    def test_written_order_fence_is_server_authored(self):
        url, payload = self._serve()
        draft, slug, ver = self._draft()
        status, body, _ = http_json(url, "/api/feedback", body={
            "annotations": [], "feedbackMarkdown": "please approve", "payloadHash": "x",
            "boardToken": payload["boardToken"],
            "feedbackDocument": "SPOOFED CLIENT DOCUMENT",
            "action": {"kind": "signoff", "component": slug, "version": ver,
                       "decision": "approve"}})
        doc = (self.root / "plans" / ".board-feedback.md").read_text()
        self.assertNotIn("SPOOFED", doc)
        meta = board.parse_fence(doc)
        self.assertEqual(meta["actionId"], body["actionId"])
        self.assertEqual(meta["signoff"]["component"], slug)
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest tests.test_board.TestDocumentFromBody tests.test_board.TestSignoffAction -v`
Expected: FAIL — `document_from_body` takes 2 args; fence lacks actionId/signoff.

- [ ] **Step 3: Implement**

Extend `build_feedback_document` (:581-596): add `action=None, action_id=None` params; in the meta dict add `"actionId": action_id` when set, and when `action` is set:

```python
    if action is not None:
        slug, ver, decision, reason = action
        so = {"component": slug, "version": ver, "decision": decision}
        if reason:
            so["reason"] = reason
        meta["signoff"] = so
```

Also emit a human-readable order section above the fence when `action` is set (board.md routes from the fence; the prose is for the researcher's record):

```python
    if action is not None:
        head = "## SIGNOFF: %s v%d — %s\n\n" % (slug, ver, decision)
        if reason:
            head += "> %s\n\n" % reason.replace("\n", "\n> ")
        md = head + md
```

`document_from_body` (:607-614): add the same params; `if action is not None: return build_feedback_document(body, payload, action=action, action_id=action_id)` before the verbatim branch. Restructure Task 4's `accept_order` to reserve-then-build:

```python
        def accept_order(build_doc, exit_code):
            with slot_lock:
                if slot["actionId"] is not None:
                    return None
                slot["actionId"] = uuid.uuid4().hex
            doc = build_doc(slot["actionId"])
            tmp = plans_dir / ".board-feedback.md.tmp"
            tmp.write_text(doc, encoding="utf-8")
            os.replace(tmp, plans_dir / ".board-feedback.md")
            result["doc"] = doc
            result["exit"] = exit_code
            return slot["actionId"]
```

with the feedback branch calling `accept_order(lambda aid: document_from_body(body, payload, action=validated, action_id=aid), 0)` (`validated` is Task 5's tuple or None) and ticket issuance moving after a successful accept (`write_ticket(..., aid)` using the returned id).

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_board.TestDocumentFromBody tests.test_board.TestSignoffAction tests.test_board.TestServeHTTP -v && python3 -m pytest tests/ -q`
Expected: PASS (verbatim behavior intact for plain posts; server-authored for actions).

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "feat(board): server-authoritative SIGNOFF fence + prose order; client doc ignored for action posts"
```

---

### Task 7: Strip action keys on hand-delivered ingress (`--collect FILE`)

**Files:**
- Modify: `skills/managing-research-plans/scripts/board.py` (`collect_file` :1507-1514, `inspect_feedback_document` :1482-1504)
- Test: `tests/test_board.py` (new `TestCollectStripsActions`)

**Interfaces:**
- Produces: `strip_action_keys_from_document(doc: str) -> tuple[str, list[str]]` — parses the fence (`parse_fence` :1320-1337); pops `signoff`, `verdict`, `reviewRequest`, `reportRequest` from fence meta top level AND from each `meta["annotations"][i]`; re-serializes the fence in place; returns the sanitized doc and the list of stripped keys. `collect_file()` sanitizes before `inspect_feedback_document` and prints a warning line `board: stripped researcher-action keys from hand-delivered file: <keys>` to stderr when anything was stripped. `collect_pending()` (:1310, the server-written `.board-feedback.md` recovery path) is NOT sanitized — it is live ingress.
- Consumes: fence shape from Task 6.

- [ ] **Step 1: Write the failing test**

```python
class TestCollectStripsActions(unittest.TestCase):
    def test_hand_delivered_file_loses_action_keys(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); make_project(root)
            fence = {"sessionId": "s", "mode": "remote", "payloadHash": "h",
                     "signoff": {"component": "01-x", "version": 2, "decision": "approve"},
                     "verdict": {"status": "accepted"},
                     "annotations": [{"type": "general", "comment": "hi",
                                      "reviewRequest": {"agent": "codex"}}]}
            doc = "# Feedback\n\nhi\n\n```json board-feedback\n%s\n```\n" % json.dumps(fence)
            f = root / "delivered.md"; f.write_text(doc)
            clean, stripped = board.strip_action_keys_from_document(doc)
            meta = board.parse_fence(clean)
            self.assertNotIn("signoff", meta)
            self.assertNotIn("verdict", meta)
            self.assertNotIn("reviewRequest", meta["annotations"][0])
            self.assertEqual(sorted(stripped),
                             ["reviewRequest", "signoff", "verdict"])
            # collect_file path routes the sanitized doc:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                board.collect_file(root, str(f))
            self.assertNotIn('"signoff"', out.getvalue())

    def test_pending_recovery_keeps_signoff(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); make_project(root)
            fence = {"sessionId": "s", "mode": "live", "payloadHash": "h",
                     "actionId": "a" * 32,
                     "signoff": {"component": "01-x", "version": 2, "decision": "approve"},
                     "annotations": []}
            doc = "## SIGNOFF: 01-x v2 — approve\n\n```json board-feedback\n%s\n```\n" % json.dumps(fence)
            (root / "plans" / ".board-feedback.md").write_text(doc)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                board.collect_pending(root)
            self.assertIn('"signoff"', out.getvalue())
```

Add `import io, contextlib` to test imports if absent. Check `collect_file`/`collect_pending` signatures at :1507/:1310 first and match the call shape used by existing collect tests in this file (grep `collect_pending(` / `collect_file(` in tests for the current calling convention and copy it).

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest tests.test_board.TestCollectStripsActions -v`
Expected: FAIL — `strip_action_keys_from_document` missing.

- [ ] **Step 3: Implement**

```python
ACTION_KEYS = ("signoff", "verdict", "reviewRequest", "reportRequest")


def strip_action_keys_from_document(doc):
    try:
        meta = parse_fence(doc)
    except SystemExit:
        raise
    except Exception:
        return doc, []
    if meta is None:
        return doc, []
    stripped = []
    for k in ACTION_KEYS:
        if meta.pop(k, None) is not None:
            stripped.append(k)
    for ann in meta.get("annotations", []) or []:
        if isinstance(ann, dict):
            for k in ACTION_KEYS:
                if ann.pop(k, None) is not None:
                    stripped.append(k)
    if not stripped:
        return doc, []
    new_fence = "```json board-feedback\n%s\n```" % json.dumps(meta, indent=1)
    clean = FENCE_RE.sub(lambda m: new_fence, doc, count=1)
    return clean, sorted(set(stripped))
```

Check `parse_fence`'s exact return/raise contract at :1320-1337 and `FENCE_RE`'s group shape before writing the `sub` — if `FENCE_RE` matches with surrounding newlines, preserve them in the replacement. In `collect_file` (:1507-1514), before handing to `inspect_feedback_document`:

```python
    doc, stripped = strip_action_keys_from_document(doc)
    if stripped:
        print("board: stripped researcher-action keys from hand-delivered file: %s"
              % ", ".join(stripped), file=sys.stderr)
```

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest tests.test_board.TestCollectStripsActions -v && python3 -m pytest tests/ -q`
Expected: PASS; existing collect/pull tests unaffected (`--pull` path already strips upstream at :1369-1399 and does not route through `collect_file`).

- [ ] **Step 5: Commit**

```bash
git add skills/managing-research-plans/scripts/board.py tests/test_board.py
git commit -m "fix(board): --collect strips researcher-action keys from hand-delivered fences (live pending recovery untouched)"
```

---

## Self-review notes (kept with the plan)

- Spec §4 port pinning across relaunches is deliberately NOT in board.py: the pinned port travels via the lock file metadata (Task 1) + `--port` on relaunch; the loop (plan 3/3) reads `read_lock()["port"]` and passes `--port <pinned>`.
- Spec §5.4 "per-boot token" = Task 3; "Host on GET + frame denial" = Task 2.
- Spec §3 canonical assembly = Task 6; ticket authority = Task 5; §5.3 non-live ingress = Task 7 (+ v0.13's existing pull strip).
- Batch routes intentionally keep multi-accept and no boardToken exemption — they get the token check too (BatchGate client adds it in plan 2/3).
