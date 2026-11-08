#!/usr/bin/env python3
"""Create a deployment archive from explicit source roots, excluding private state."""
import argparse
import tarfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
excluded = {"node_modules", ".next", ".git", "private", "__pycache__"}
entries = ["package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts",
           "src", "public", "spacetimedb", "deployment", "tests", "README.md", "AGENTS.md"]
output = args.output.resolve()
if output.is_relative_to(root):
    raise SystemExit("Archive output must be outside the repository")
count = 0
with tarfile.open(output, "w:gz") as archive:
    for entry in entries:
        path = root / entry
        candidates = sorted(path.rglob("*")) if path.is_dir() else [path]
        for candidate in candidates:
            relative = candidate.relative_to(root)
            if any(part in excluded for part in relative.parts):
                continue
            if candidate.name.startswith(".env") or candidate.suffix in {".pem", ".key", ".tsbuildinfo"}:
                continue
            if candidate.is_symlink():
                raise SystemExit(f"Source symlink requires explicit review: {relative}")
            if candidate.is_file():
                archive.add(candidate, arcname=str(relative), recursive=False)
                count += 1
print(f"Packaged {count} source files; private environment and runtime state excluded.")
