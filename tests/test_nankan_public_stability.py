import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KEIBA = (ROOT / "keiba.html").read_text(encoding="utf-8")


class KeibaRedirectTests(unittest.TestCase):
    """2026-09-12: keiba.html(門別・南関ビューア)は役目を終え、新しいサイトへの転送ページになった。"""

    def test_redirects_to_new_site(self):
        self.assertIn("https://nar.yukochi.com/venue/", KEIBA)
        self.assertIn("location.replace(", KEIBA)
        for name in ("門別", "大井", "船橋", "川崎", "浦和"):
            self.assertIn(name, KEIBA)

    def test_keeps_identity_words_for_validator(self):
        self.assertIn("地方競馬ビューア", KEIBA)

    def test_no_database_access_left(self):
        self.assertNotIn("supabase", KEIBA.lower())
        self.assertNotIn("sbGetPaged", KEIBA)
