#!/usr/bin/env python3
"""Validate and optionally stage the deliberately small production site."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path


SUPPORT_FILES = {
    ".gitignore",
    ".production-files",
    ".preserved-production-files",
    ".github/scripts/validate-production.py",
    ".github/workflows/odds-capture.yml",
    ".github/workflows/pages.yml",
    ".github/workflows/worker-check.yml",
    "AGENTS.md",
    "CLAUDE.md",
    "cloudflare-worker.js",
    "package.json",
    "pnpm-lock.yaml",
    "supabase-cloud-capture.sql",
    "tests/test_kochi_worker_scope.js",
    "tests/test_kochi_worker_precompute.js",
    "tests/test_kochi_worker_unit.js",
    "tests/test_umaren_cloud_equivalence.js",
    "wrangler.toml",
}
SECRET_NAMES = {
    ".env",
    ".env.local",
    "wrangler-account.json",
    "credentials.json",
    "service-account.json",
}
SECRET_PATTERNS = (
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?:CAPTURE_TOKEN|SUPABASE_SERVICE_KEY)\s*=\s*[^$\s{][^\s]*", re.I),
)
TEXT_SUFFIXES = {"", ".html", ".js", ".json", ".webmanifest", ".yml", ".yaml", ".py", ".txt", ".md"}

# 先に読まれるモジュールが、遅延ロードのモジュールでしか定義されない名前を「裸で」参照すると、
# その行に到達した瞬間 ReferenceError で落ちる。2026-08-04 に馬場ページが例外も出さずに
# 真っ白になった故障（dateDiffDays が ai-analysis.js にしか無かった）がまさにこれで、
# 人のレビューでは見つからなかったため機械で検出する。
# typeof ガードがある行と、try で囲まれた行は落ちないので対象外。
#
# 下は 2026-08-04 時点の既存分を登録したベースライン。目的は「これ以上増やさない」ことで、
# 登録済みが安全だと保証するものではない。いずれも呼び出し元が先に
# _ensureAiAnalysisModule() 等でモジュールを読む作りになっているが、
# 実測で確かめたのは horseTagBadgesHtml（openHorseModal 経由）だけ。
# 実際に落ちれば _kvSwallow が記録するので、計測管理ページの「伏せた不具合の記録」で分かる。
# 新しく名前を足したくなったら、まず typeof ガードか定義の移設を検討すること。
MODULE_DEP_ALLOW = {
    # switchPage('bunseki') は needsAiModule=true 付きで呼ぶため、描画時にはロード済み
    ("modules/app-main.js", "renderAnalysis"),
    # renderAbilityTable / openHorseModal はどちらも先に _ensureAiAnalysisModule() を待つ
    # （2026-08-04 実測: openHorseModal 実行後に computeYosoScored が定義済みになる）
    ("modules/app-main.js", "horseTagBadgesHtml"),
    # 以下は AI 予想まわりの経路。_ensureRaceIntelligence() を通ってから呼ばれる想定。
    ("modules/app-main.js", "computeYosoScored"),
    ("modules/app-main.js", "renderPredictionPanel"),
    ("modules/app-main.js", "lookupJockeyStats"),
    # 管理者が公式DataRoomを取得する時だけ。admin-horse-data.js を _kvLoadLibrary してから使う
    ("modules/app-main.js", "storeOfficialRacesAsHorseEntries"),
}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


_REGEX_PRECEDERS = set("(,=:[!&|?{};+-*%~^<>")
_REGEX_KEYWORDS = {"return", "typeof", "case", "in", "of", "new", "delete", "void",
                   "do", "else", "yield", "await", "instanceof"}


def strip_js_noise(src: str) -> str:
    """コメント・文字列・正規表現リテラルを潰した JS を返す。
    行番号を保つため、消す部分は改行以外を空白に置き換える。
    テンプレートリテラルは ${} の中が本物のコードなので、literal 部分だけ潰す。

    ⛔正規表現リテラルを飛ばさないと `/`/` のようなコードで状態が壊れ、
    以降のファイル全体が空白になって検査が黙って何も見なくなる（2026-08-04 に実際に踏んだ）。
    そのため終端状態は check_module_dependencies 側で必ず検証する。"""
    out: list[str] = []
    n = len(src)
    i = 0
    tpl_stack: list[int] = []        # テンプレート内 ${} の深さ（入れ子対応）
    last_code = ""                   # 直前の意味のあるコード文字（正規表現判定用）

    def blank(ch: str) -> None:
        out.append("\n" if ch == "\n" else " ")

    def regex_allowed() -> bool:
        if not last_code or last_code in _REGEX_PRECEDERS:
            return True
        tail = "".join(out)[-12:]
        word = re.search(r"([A-Za-z_$][\w$]*)\s*$", tail)
        return bool(word and word.group(1) in _REGEX_KEYWORDS)

    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""

        if tpl_stack and tpl_stack[-1] == 0:      # テンプレートの literal 部分
            if ch == "\\":
                blank(ch)
                if i + 1 < n:
                    blank(src[i + 1])
                i += 2
                continue
            if ch == "`":
                tpl_stack.pop()
                out.append(" ")
                last_code = "`"
                i += 1
                continue
            if ch == "$" and nxt == "{":
                tpl_stack[-1] = 1
                out.append("  ")
                i += 2
                continue
            blank(ch)
            i += 1
            continue

        if ch == "/" and nxt == "/":              # 行コメント
            while i < n and src[i] != "\n":
                out.append(" ")
                i += 1
            continue
        if ch == "/" and nxt == "*":              # ブロックコメント
            out.append("  ")
            i += 2
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                blank(src[i])
                i += 1
            out.append("  ")
            i += 2
            continue
        if ch in "'\"":                           # 文字列
            out.append(" ")
            i += 1
            while i < n:
                if src[i] == "\\":
                    blank(src[i])
                    if i + 1 < n:
                        blank(src[i + 1])
                    i += 2
                    continue
                if src[i] == ch:
                    out.append(" ")
                    i += 1
                    break
                blank(src[i])
                i += 1
            last_code = "x"
            continue
        if ch == "`":                             # テンプレート開始
            tpl_stack.append(0)
            out.append(" ")
            i += 1
            continue
        if ch == "/" and regex_allowed():         # 正規表現リテラル
            out.append(" ")
            i += 1
            in_class = False
            while i < n and src[i] != "\n":
                if src[i] == "\\":
                    out.append("  ")
                    i += 2
                    continue
                if src[i] == "[":
                    in_class = True
                elif src[i] == "]":
                    in_class = False
                elif src[i] == "/" and not in_class:
                    out.append(" ")
                    i += 1
                    break
                out.append(" ")
                i += 1
            while i < n and src[i].isalpha():     # フラグ
                out.append(" ")
                i += 1
            last_code = "x"
            continue

        if tpl_stack:                             # ${} の中のコード
            if ch == "{":
                tpl_stack[-1] += 1
            elif ch == "}":
                tpl_stack[-1] -= 1
                if tpl_stack[-1] == 0:
                    out.append(" ")
                    i += 1
                    continue
        out.append(ch)
        if not ch.isspace():
            last_code = ch
        i += 1

    return "".join(out)


_GLOBAL_DEF = re.compile(
    r"^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)"
    r"|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*="
    r"|^class\s+([A-Za-z_$][\w$]*)",
    re.M,
)
_ANY_DEF = re.compile(
    r"(?:async\s+)?function\s+([A-Za-z_$][\w$]*)"
    r"|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*="
    r"|class\s+([A-Za-z_$][\w$]*)"
)


def _names(pattern: re.Pattern, src: str) -> set[str]:
    return {m.group(1) or m.group(2) or m.group(3) for m in pattern.finditer(src)}


def check_module_dependencies(root: Path, errors: list[str]) -> None:
    index_path = root / "index.html"
    modules_dir = root / "modules"
    if not index_path.is_file() or not modules_dir.is_dir():
        return
    index = index_path.read_text(encoding="utf-8", errors="replace")
    eager = sorted(set(re.findall(r'<script[^>]+src="(modules/[^"?]+)', index)))
    every = sorted(f"modules/{path.name}" for path in modules_dir.glob("*.js"))
    lazy = [name for name in every if name not in eager]
    if not eager or not lazy:
        return

    sources = {}
    for name in every:
        path = root / name
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8", errors="replace")
        stripped = strip_js_noise(raw)
        # ⛔自己検査: 文字列/テンプレートの解釈が途中でずれると、以降が丸ごと空白になり
        #   「違反0件」と嘘の合格を返す。末尾に目印を足して生き残るかを必ず確かめる。
        canary = "\nvar __kv_canary_ok__ = 1;\n"
        if "__kv_canary_ok__" not in strip_js_noise(raw + canary):
            fail(errors, f"module dependency check cannot parse {name}; "
                         f"the scan would silently see nothing (fix strip_js_noise)")
            return
        if stripped.count("\n") != raw.count("\n"):
            fail(errors, f"module dependency check changed line count for {name}")
            return
        sources[name] = stripped

    eager_globals: set[str] = set()
    for name in eager:
        eager_globals |= _names(_GLOBAL_DEF, sources.get(name, ""))
    owners: dict[str, list[str]] = {}
    for name in lazy:
        for symbol in _names(_GLOBAL_DEF, sources.get(name, "")):
            owners.setdefault(symbol, []).append(name)
    risky = {symbol: mods for symbol, mods in owners.items() if symbol not in eager_globals}

    for module in eager:
        src = sources.get(module, "")
        lines = src.split("\n")
        local = _names(_ANY_DEF, src)
        for symbol, mods in sorted(risky.items()):
            if symbol in local or (module, symbol) in MODULE_DEP_ALLOW:
                continue
            guard = re.compile(r"typeof\s+" + re.escape(symbol) + r"\b")
            for hit in re.finditer(r"(?<![.\w$])" + re.escape(symbol) + r"\b", src):
                # オブジェクトのキー（median: ...）は参照ではない
                if re.match(r"\s*:(?!:)", src[hit.end():hit.end() + 4]):
                    continue
                line_no = src.count("\n", 0, hit.start()) + 1
                line = lines[line_no - 1]
                if guard.search(line) or re.search(r"\btry\s*\{", line):
                    continue
                fail(
                    errors,
                    f"{module}:{line_no} references '{symbol}', defined only in lazily loaded "
                    f"{', '.join(mods)}; guard it with typeof or move the definition",
                )


def normalize(line: str) -> str:
    return line.strip().replace("\\", "/")


def read_manifest(root: Path, errors: list[str], manifest_name: str = ".production-files") -> list[str]:
    manifest = root / manifest_name
    if not manifest.is_file():
        fail(errors, f"missing {manifest_name}")
        return []
    entries = [normalize(line) for line in manifest.read_text(encoding="utf-8").splitlines()]
    entries = [path for path in entries if path and not path.startswith("#")]
    if entries != sorted(set(entries)):
        fail(errors, f"{manifest_name} must be unique and sorted")
    paths: list[str] = []
    for entry in entries:
        if entry.endswith("/"):
            directory = root / entry
            if not directory.is_dir():
                fail(errors, f"missing public directory: {entry}")
                continue
            files = sorted(
                normalize(str(path.relative_to(root)))
                for path in directory.rglob("*")
                if path.is_file()
            )
            if not files:
                fail(errors, f"public directory is empty: {entry}")
            paths.extend(files)
        else:
            paths.append(entry)
    if paths != sorted(set(paths)):
        fail(errors, "expanded production paths must be unique and sorted")
    return paths


def tracked_files(root: Path, errors: list[str]) -> set[str]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files"],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode:
        fail(errors, "git ls-files failed; run this check inside the deployment repository")
        return set()
    return {normalize(path) for path in result.stdout.splitlines() if path.strip()}


def validate(root: Path, require_tracked: bool) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    public_files = read_manifest(root, errors)
    preserved_files = read_manifest(root, errors, ".preserved-production-files")
    public_set = set(public_files)
    preserved_set = set(preserved_files)
    overlap = public_set & preserved_set
    for path in sorted(overlap):
        fail(errors, f"file cannot be both Kochi-owned and preserved: {path}")

    deployment_files = sorted(public_set | preserved_set)
    for path in deployment_files:
        candidate = root / path
        if not candidate.is_file():
            fail(errors, f"missing deployment file: {path}")

    tracked = tracked_files(root, errors) if require_tracked else set(deployment_files) | SUPPORT_FILES
    if require_tracked:
        allowed = set(deployment_files) | SUPPORT_FILES
        for path in sorted(tracked - allowed):
            fail(errors, f"tracked file is not allowlisted: {path}")
        for path in sorted(allowed - tracked):
            fail(errors, f"required repository file is not tracked: {path}")

    for path in sorted(tracked):
        candidate = root / path
        lower_name = candidate.name.lower()
        if lower_name in SECRET_NAMES or lower_name.endswith((".pem", ".p12", ".pfx", ".key")):
            fail(errors, f"possible credential file: {path}")
        if candidate.is_file() and candidate.stat().st_size > 2_000_000:
            fail(errors, f"file exceeds 2 MB deployment limit: {path}")
        if candidate.is_file() and candidate.suffix.lower() in TEXT_SUFFIXES:
            text = candidate.read_text(encoding="utf-8", errors="replace")
            for pattern in SECRET_PATTERNS:
                if pattern.search(text):
                    fail(errors, f"possible embedded secret in: {path}")
                    break

    index_path = root / "index.html"
    if index_path.is_file():
        index = index_path.read_text(encoding="utf-8", errors="replace")
        if "高知競馬ビューア" not in index:
            fail(errors, "index.html does not identify the 高知競馬ビューア")

    keiba_path = root / "keiba.html"
    if keiba_path.is_file():
        keiba = keiba_path.read_text(encoding="utf-8", errors="replace")
        if "地方競馬ビューア" not in keiba or "門別" not in keiba or "大井" not in keiba:
            fail(errors, "keiba.html does not identify the shared Monbetsu/Ooi viewer")

    monbetsu_path = root / "monbetsu.html"
    if monbetsu_path.is_file() and "keiba.html" not in monbetsu_path.read_text(encoding="utf-8", errors="replace"):
        fail(errors, "monbetsu.html does not route to keiba.html")

    nankan_path = root / "nankan.html"
    if nankan_path.is_file():
        nankan = nankan_path.read_text(encoding="utf-8", errors="replace")
        if "keiba.html" not in nankan or "大井" not in nankan:
            fail(errors, "nankan.html does not route to the Ooi view in keiba.html")

    sw_path = root / "sw.js"
    if sw_path.is_file():
        sw = sw_path.read_text(encoding="utf-8", errors="replace")
        if re.search(r"cache\.put\(\s*['\"]\./index\.html['\"]", sw):
            fail(errors, "service worker can overwrite index.html from a navigation response")

    manifest_path = root / "manifest.webmanifest"
    if manifest_path.is_file() and "高知" not in manifest_path.read_text(encoding="utf-8", errors="replace"):
        fail(errors, "manifest.webmanifest does not identify the Kochi app")

    check_module_dependencies(root, errors)

    return errors, deployment_files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--stage", help="copy only public allowlisted files to this directory")
    parser.add_argument("--no-tracked-check", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    errors, deployment_files = validate(root, not args.no_tracked_check)
    if errors:
        print("Production validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    if args.stage:
        target = Path(args.stage).resolve()
        if target == root or root in target.parents:
            print("stage directory must be outside the repository root", file=sys.stderr)
            return 1
        if target.exists():
            shutil.rmtree(target)
        for path in deployment_files:
            destination = target / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / path, destination)
        print(f"Staged {len(deployment_files)} deployment files in {target}")
    print(f"Production validation passed ({len(deployment_files)} deployment files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
