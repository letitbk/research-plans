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


if __name__ == "__main__":
    unittest.main()
