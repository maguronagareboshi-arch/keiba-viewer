import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KEIBA = (ROOT / "keiba.html").read_text(encoding="utf-8")
PAGES = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")


class NankanPublicStabilityTests(unittest.TestCase):
    def test_initial_date_prefers_today_then_latest(self):
        init = KEIBA[KEIBA.index("async function init()") : KEIBA.index("// URLハッシュ")]
        self.assertIn("const dates = Object.keys(state.dates).sort().reverse();", init)
        self.assertIn("setDeckDate(state.dates[today] ? today : dates[0]);", init)
        self.assertNotIn("localStorage.getItem(`nk_last_date_", init)

    def test_all_bulk_reads_use_keyset_cursors(self):
        self.assertNotIn("offset=", KEIBA)
        self.assertIn("function sbCursorFilter(columns, values, directions)", KEIBA)
        self.assertIn("directions[index] === 'desc' ? 'lt' : 'gt'", KEIBA)
        self.assertIn("throw new Error('取得カーソルが進みませんでした')", KEIBA)
        self.assertEqual(7, len(re.findall(r"\bsbGetPaged\(\s*`", KEIBA)))
        # Every call supplies its stable unique key explicitly.  Composite primary keys
        # must include umaban so a page ending mid-race cannot skip the remaining horses.
        self.assertIn("{ columns: ['race_id'], directions: ['asc'] }", KEIBA)
        self.assertGreaterEqual(
            KEIBA.count("{ columns: ['race_id', 'umaban'], directions: ['desc', 'asc'] }"),
            5,
        )
        self.assertIn(
            "{ columns: ['horse_id', 'race_id', 'umaban'], directions: ['asc', 'asc', 'asc'] }",
            KEIBA,
        )

    def test_race_finder_uses_compound_cursor(self):
        finder = KEIBA[KEIBA.index("async function runRaceFinder") : KEIBA.index("// 当日どの場")]
        self.assertIn("state.finderCursor", finder)
        self.assertIn("['race_date', 'race_no', 'race_id']", finder)
        self.assertIn("['desc', 'asc', 'asc']", finder)
        self.assertNotIn("finderOffset", finder)

    def test_pages_prs_validate_but_do_not_deploy(self):
        self.assertRegex(PAGES, r"(?m)^\s*pull_request:\s*$")
        self.assertIn("cancel-in-progress: true", PAGES)
        self.assertIn("test_nankan_public_stability.py", PAGES)
        self.assertGreaterEqual(PAGES.count("if: github.event_name != 'pull_request'"), 3)


if __name__ == "__main__":
    unittest.main()
