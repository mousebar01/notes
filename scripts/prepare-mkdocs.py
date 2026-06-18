#!/usr/bin/env python3
from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".mkdocs" / "docs"

SKIP_DIRS = {
    ".git",
    ".agents",
    ".codex",
    ".mkdocs",
    "site",
}


def should_skip(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    return rel.parts[0] in SKIP_DIRS


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    for path in ROOT.iterdir():
        if should_skip(path):
            continue
        dest = OUT / path.name
        if path.is_dir():
            shutil.copytree(path, dest, symlinks=True, ignore=shutil.ignore_patterns("__pycache__"))
        elif path.name not in {"mkdocs.yml"}:
            shutil.copy2(path, dest)


if __name__ == "__main__":
    main()
