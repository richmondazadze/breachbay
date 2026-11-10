#!/usr/bin/env python3
"""Package deployable source and licensed assets; keep private project material local."""
import argparse
import os
import tarfile
from pathlib import Path

REQUIRED_FILES = ("package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts")
SOURCE_ROOTS = ("src", "public", "spacetimedb", "deployment")
EXCLUDED_DIRECTORIES = {
    "node_modules", ".next", ".git", "private", "__pycache__",
}
EXCLUDED_TREES = tuple(map(Path, (
    "src/lib/backend/tests", "spacetimedb/dist", "spacetimedb/tests",
    "deployment/acceptance", "deployment/fixtures", "deployment/tests",
    "public/design", "public/coordination",
)))
SOURCE_SUFFIXES = {
    ".ts", ".tsx", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".webp", ".ico", ".webmanifest",
    ".woff", ".woff2", ".sh", ".py", ".service", ".conf", ".toml",
}


def required_notice(relative: Path) -> bool:
    """Distributed third-party notices are the sole documentation exception."""
    return (relative.parent in (Path("public/licenses"), Path("public/fonts"))
            and relative.suffix.lower() in (".txt", ".md", "")
            and any(word in relative.name.lower() for word in ("license", "notice", "ofl", "apache")))


def source_files(root: Path) -> list[Path]:
    for name in REQUIRED_FILES:
        if not (root / name).is_file():
            raise ValueError(f"Required build file is missing: {name}")
    files = []
    for entry in (*REQUIRED_FILES, *SOURCE_ROOTS):
        path = root / entry
        if path.is_symlink():
            raise ValueError(f"Source symlink requires explicit review: {entry}")
        candidates = sorted(path.rglob("*")) if path.is_dir() else [path]
        for candidate in candidates:
            relative = candidate.relative_to(root)
            if (any(part in EXCLUDED_DIRECTORIES or part.startswith(".") for part in relative.parts)
                    or any(relative.is_relative_to(tree) for tree in EXCLUDED_TREES)):
                continue
            if candidate.is_symlink():
                raise ValueError(f"Source symlink requires explicit review: {relative}")
            if candidate.is_file() and (candidate.suffix.lower() in SOURCE_SUFFIXES
                                        or relative == Path("deployment/Caddyfile") or required_notice(relative)):
                files.append(candidate)
    return files


def package_source(root: Path, destination: Path) -> int:
    root, destination = root.resolve(), destination.resolve()
    if destination.is_relative_to(root):
        raise ValueError("Archive output must be outside the repository")
    files = source_files(root)
    # Exclusive creation also prevents overwriting an unrelated file through a destination symlink.
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output, tarfile.open(fileobj=output, mode="w:gz") as archive:
            for candidate in files:
                archive.add(candidate, arcname=candidate.relative_to(root).as_posix(), recursive=False)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return len(files)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, help="New private archive path outside the repository")
    args = parser.parse_args()
    try:
        count = package_source(Path(__file__).resolve().parent.parent, args.output)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Packaging refused: {error}\n")
    print(f"Packaged {count} source files, build configuration and licensed assets; project documents and private state excluded.")
