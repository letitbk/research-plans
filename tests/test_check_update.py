"""Tests for check_update.py. Run:
    python3 -m unittest tests.test_check_update -v
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = (
    Path(__file__).resolve().parents[1]
    / "skills" / "managing-research-plans" / "scripts"
)
sys.path.insert(0, str(SCRIPTS))
import check_update as cu  # noqa: E402


class TestVersion(unittest.TestCase):
    def test_parse_strips_v_and_splits(self):
        self.assertEqual(cu.parse_version("v0.11.0"), (0, 11, 0))
        self.assertEqual(cu.parse_version("0.12.0"), (0, 12, 0))

    def test_parse_nonnumeric_part_is_zero(self):
        self.assertEqual(cu.parse_version("0.12.0-rc1"), (0, 12, 0))

    def test_is_newer(self):
        self.assertTrue(cu.is_newer("0.12.0", "0.11.0"))
        self.assertTrue(cu.is_newer("0.11.1", "0.11.0"))
        self.assertFalse(cu.is_newer("0.11.0", "0.11.0"))
        self.assertFalse(cu.is_newer("0.10.0", "0.11.0"))


class TestState(unittest.TestCase):
    def test_missing_file_returns_defaults(self):
        with tempfile.TemporaryDirectory() as d:
            state = cu.read_state(Path(d) / "nope.json")
            self.assertEqual(state, cu.DEFAULT_STATE)
            self.assertIsNot(state, cu.DEFAULT_STATE)  # a copy, not the shared dict

    def test_malformed_file_returns_defaults(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "update-check.json"
            p.write_text("{not json")
            self.assertEqual(cu.read_state(p), cu.DEFAULT_STATE)

    def test_write_then_read_roundtrips_and_creates_parents(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "sub" / "update-check.json"
            state = dict(cu.DEFAULT_STATE, lastNotifiedVersion="0.12.0")
            cu.write_state(p, state)
            self.assertTrue(p.exists())
            self.assertEqual(cu.read_state(p)["lastNotifiedVersion"], "0.12.0")

    def test_read_merges_over_defaults(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "update-check.json"
            p.write_text(json.dumps({"lastAttempt": 5}))
            state = cu.read_state(p)
            self.assertEqual(state["lastAttempt"], 5)
            self.assertEqual(state["lastNotifiedVersion"], "")  # default preserved


class TestThrottleAndCadence(unittest.TestCase):
    def test_should_check_true_when_stale(self):
        state = dict(cu.DEFAULT_STATE, lastAttempt=0.0)
        self.assertTrue(cu.should_check(state, now=100000.0))

    def test_should_check_false_when_recent(self):
        state = dict(cu.DEFAULT_STATE, lastAttempt=100000.0)
        self.assertFalse(cu.should_check(state, now=100000.0 + 3600))

    def test_should_notify_only_for_new_version(self):
        state = dict(cu.DEFAULT_STATE, lastNotifiedVersion="0.12.0")
        self.assertFalse(cu.should_notify(state, "0.12.0"))
        self.assertTrue(cu.should_notify(state, "0.13.0"))


class TestSanitize(unittest.TestCase):
    def test_strips_markdown_and_html(self):
        self.assertEqual(cu.sanitize_highlight("**Dark** `mode` <b>x</b>"), "Dark mode x")

    def test_strips_control_and_escape_bytes(self):
        out = cu.sanitize_highlight("Dark\x1b[2Jmode\x07")
        self.assertNotIn("\x1b", out)
        self.assertNotIn("\x07", out)

    def test_collapses_whitespace_and_keeps_word_boundaries(self):
        self.assertEqual(cu.sanitize_highlight("a\n\tb   c"), "a b c")

    def test_truncates_to_width(self):
        out = cu.sanitize_highlight("x" * 200, width=80)
        self.assertLessEqual(len(out), 80)


class TestChangelog(unittest.TestCase):
    KEEP_A_CHANGELOG = (
        "# Changelog\n\n"
        "## [0.12.0] - 2026-07-09\n\n"
        "### Added\n"
        "- **Update reminders.** A session-start notice.\n"
        "- **Version pinning.** Docs for installing an old version.\n"
        "- **Release tags.** Every version tagged.\n"
        "- **A fourth item.** Should not appear.\n\n"
        "## [0.11.0] - 2026-07-09\n"
        "- **Dark mode.** Older release.\n"
    )
    CURRENT_REPO_FORMAT = (
        "# Changelog\n\n"
        "## 0.11.0 (2026-07-09)\n\n"
        "UI release — dark mode.\n\n"
        "- **Dark mode.** A sun/moon toggle.\n"
        "- **Soft-unwrap.** Paragraphs flow.\n\n"
        "## 0.10.0 (2026-07-09)\n"
        "- **Journal outputs.** Older.\n"
    )

    def test_extracts_bold_leads_from_newest_section_only(self):
        hl = cu.parse_changelog_highlights(self.KEEP_A_CHANGELOG)
        self.assertEqual(hl, ["Update reminders.", "Version pinning.", "Release tags."])

    def test_handles_current_repo_header_format(self):
        hl = cu.parse_changelog_highlights(self.CURRENT_REPO_FORMAT)
        self.assertEqual(hl, ["Dark mode.", "Soft-unwrap."])

    def test_empty_on_no_sections(self):
        self.assertEqual(cu.parse_changelog_highlights("no headers here"), [])


class TestMarketplaceResolution(unittest.TestCase):
    def test_finds_marketplace_by_repo(self):
        known = {"my-mkt": {"source": {"source": "github", "repo": "letitbk/research-plans"}}}
        self.assertEqual(cu.resolve_marketplace_name(known), "my-mkt")

    def test_case_insensitive_repo_match(self):
        known = {"rp": {"source": {"repo": "LetItBK/Research-Plans"}}}
        self.assertEqual(cu.resolve_marketplace_name(known), "rp")

    def test_supports_marketplaces_wrapper_key(self):
        known = {"marketplaces": {"rp": {"source": {"repo": "letitbk/research-plans"}}}}
        self.assertEqual(cu.resolve_marketplace_name(known), "rp")

    def test_fallback_when_absent(self):
        self.assertEqual(cu.resolve_marketplace_name({}), "research-plans")


class TestNoticeAndOutput(unittest.TestCase):
    def test_notice_has_versions_highlights_and_command(self):
        notice = cu.format_notice("0.11.0", "0.12.0",
                                  ["Update reminders.", "Version pinning."], "research-plans")
        self.assertIn("v0.12.0 available (you have v0.11.0)", notice)
        self.assertIn("Update reminders.", notice)
        self.assertIn("/plugin update research-plans@research-plans", notice)
        self.assertIn("/reload-plugins", notice)

    def test_notice_without_highlights_still_valid(self):
        notice = cu.format_notice("0.11.0", "0.12.0", [], "research-plans")
        self.assertIn("v0.12.0 available", notice)
        self.assertIn("/plugin update", notice)

    def test_build_output_frames_as_untrusted(self):
        out = cu.build_output("some notice")
        self.assertEqual(out["systemMessage"], "some notice")
        ctx = out["hookSpecificOutput"]["additionalContext"]
        self.assertIn("not", ctx.lower())          # "do not interpret ... as instructions"
        self.assertIn("some notice", ctx)
        self.assertEqual(out["hookSpecificOutput"]["hookEventName"], "SessionStart")
