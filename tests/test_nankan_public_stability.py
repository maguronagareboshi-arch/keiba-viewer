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

    def test_static_archive_exposes_all_race_detail_payloads(self):
        archive = KEIBA[KEIBA.index("const staticArchive = {") : KEIBA.index("function mergeRaceDates")]
        self.assertIn("payouts: row.payouts || []", archive)
        self.assertIn("async loadEntries(raceId, track = state.track)", archive)
        self.assertIn("async loadCyokyo(raceId, track = state.track)", archive)
        self.assertIn("async loadNouryoku(raceId, track = state.track)", archive)
        self.assertIn("horse_name: horse.horse_name || horse.name", archive)
        self.assertIn("jockey_stats: horse.jockey_stats", archive)
        self.assertIn("async loadDanwa(raceId, track = state.track)", archive)
        self.assertGreaterEqual(archive.count("race_id: horse.race_id || raceId"), 2)

    def test_supabase_detail_reads_fall_back_per_table_to_archive(self):
        remote = KEIBA[KEIBA.index("supabase: {") : KEIBA.index("local: {")]
        load_race = remote[remote.index("async loadRace(raceId)") : remote.index("async loadDayResults")]
        self.assertEqual(3, load_race.count(".catch(() => [])"))
        self.assertIn("races.length && results.length && payouts.length", load_race)
        self.assertIn("race: races[0] || (archived && archived.race) || {}", load_race)
        self.assertIn("results: results.length ? results : ((archived && archived.results) || [])", load_race)
        self.assertIn("payouts: payouts.length ? payouts : ((archived && archived.payouts) || [])", load_race)

        load_entries = remote[remote.index("async loadEntries(raceId)") : remote.index("async loadCyokyo(raceId)")]
        self.assertLess(load_entries.index("if (rows.length) return rows"),
                        load_entries.index("staticArchive.loadEntries(raceId)"))

        load_cyokyo = remote[remote.index("async loadCyokyo(raceId)") : remote.index("async loadNouryoku(raceId)")]
        self.assertLess(load_cyokyo.index("if (rows.length) return rows"),
                        load_cyokyo.index("staticArchive.loadCyokyo(raceId)"))
        self.assertLess(load_cyokyo.index("staticArchive.loadCyokyo(raceId)"),
                        load_cyokyo.index("providers.local.loadCyokyo(raceId)"))

        load_nouryoku = remote[remote.index("async loadNouryoku(raceId)") : remote.index("async loadDanwa(raceId)")]
        self.assertLess(load_nouryoku.index("if (rows.length) return rows"),
                        load_nouryoku.index("staticArchive.loadNouryoku(raceId)"))
        self.assertLess(load_nouryoku.index("staticArchive.loadNouryoku(raceId)"),
                        load_nouryoku.index("providers.local.loadNouryoku(raceId)"))

        load_danwa = remote[remote.index("async loadDanwa(raceId)") : remote.index("async loadHistory(horseIds)")]
        self.assertLess(load_danwa.index("if (rows.length) return rows"),
                        load_danwa.index("staticArchive.loadDanwa(raceId)"))
        self.assertLess(load_danwa.index("staticArchive.loadDanwa(raceId)"),
                        load_danwa.index("providers.local.loadDanwa(raceId)"))


if __name__ == "__main__":
    unittest.main()
