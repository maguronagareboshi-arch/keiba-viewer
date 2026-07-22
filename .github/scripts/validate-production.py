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
    ".production-files",
    ".github/scripts/validate-production.py",
    ".github/workflows/odds-capture.yml",
    ".github/workflows/pages.yml",
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


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def normalize(line: str) -> str:
    return line.strip().replace("\\", "/")


def read_manifest(root: Path, errors: list[str]) -> list[str]:
    manifest = root / ".production-files"
    if not manifest.is_file():
        fail(errors, "missing .production-files")
        return []
    paths = [normalize(line) for line in manifest.read_text(encoding="utf-8").splitlines()]
    paths = [path for path in paths if path and not path.startswith("#")]
    if paths != sorted(set(paths)):
        fail(errors, ".production-files must be unique and sorted")
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
    public_set = set(public_files)

    for path in public_files:
        candidate = root / path
        if not candidate.is_file():
            fail(errors, f"missing public file: {path}")

    tracked = tracked_files(root, errors) if require_tracked else public_set | SUPPORT_FILES
    if require_tracked:
        allowed = public_set | SUPPORT_FILES
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

    return errors, public_files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--stage", help="copy only public allowlisted files to this directory")
    parser.add_argument("--no-tracked-check", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    errors, public_files = validate(root, not args.no_tracked_check)
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
        for path in public_files:
            destination = target / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / path, destination)
        print(f"Staged {len(public_files)} public files in {target}")
    print(f"Production validation passed ({len(public_files)} public files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
