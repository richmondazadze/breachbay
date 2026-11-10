import importlib.util
import stat
import shutil
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("package_source", Path(__file__).resolve().parents[2] / "deployment/package-source.py")
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)


class ReleaseArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "source"
        self.root.mkdir()
        for name in packer.REQUIRED_FILES:
            (self.root / name).write_text("export default {};" if name.endswith(".ts") else "{}")
        self.put("src/app/page.tsx", "export default function Page() { return null; }")

    def put(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def test_release_keeps_build_config_and_excludes_private_material(self):
        for name in ["AGENTS.md", "README.md", "PRD.docx", "src/notes.md", "src/token.key", "src/.env.local",
                     "deployment/private/credentials.json", "deployment/ACCEPTANCE.md", "deployment/fixtures/log.json",
                     "src/lib/backend/tests/actor.ts", "spacetimedb/dist/bundle.js", "public/design/screenshot.png"]:
            self.put(name, "PRIVATE_MARKER")
        self.put("deployment/Caddyfile", "app configuration")
        self.put("spacetimedb/src/index.ts", "module source")
        output = self.base / "release.tar.gz"
        packer.package_source(self.root, output)
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        with tarfile.open(output) as archive:
            self.assertIn("next.config.ts", archive.getnames())
            self.assertIn("deployment/Caddyfile", archive.getnames())
            self.assertIn("spacetimedb/src/index.ts", archive.getnames())
            for member in archive.getmembers():
                self.assertTrue(member.isfile())
                self.assertNotIn(b"PRIVATE_MARKER", archive.extractfile(member).read())

    def test_licensed_font_assets_and_notices_remain_together(self):
        for name in ["public/fonts/GeneralSans-Variable.woff2", "public/fonts/GeneralSans-LICENSE.txt",
                     "public/licenses/runeicons-Apache-2.0.txt", "public/licenses/LICENSE.md"]:
            self.put(name, "DISTRIBUTED_ASSET")
        self.put("public/licenses/PRD.md", "PRIVATE_MARKER")
        output = self.base / "release.tar.gz"
        packer.package_source(self.root, output)
        with tarfile.open(output) as archive:
            self.assertIn("public/fonts/GeneralSans-Variable.woff2", archive.getnames())
            self.assertIn("public/fonts/GeneralSans-LICENSE.txt", archive.getnames())
            self.assertIn("public/licenses/LICENSE.md", archive.getnames())
            self.assertNotIn("public/licenses/PRD.md", archive.getnames())

    def test_runtime_artwork_is_shipped_without_working_originals(self):
        self.put("public/artwork/command-hero.webp", "RUNTIME_ARTWORK")
        self.put("public/artwork/command-hero-480.webp", "RESPONSIVE_ARTWORK")
        self.put("deployment/private/artwork/originals/command-hero.jpg", "PRIVATE_ORIGINAL")
        self.put("public/design/matte.webp", "PRIVATE_MATTE")
        output = self.base / "release.tar.gz"
        packer.package_source(self.root, output)
        with tarfile.open(output) as archive:
            self.assertIn("public/artwork/command-hero.webp", archive.getnames())
            self.assertIn("public/artwork/command-hero-480.webp", archive.getnames())
            self.assertNotIn("deployment/private/artwork/originals/command-hero.jpg", archive.getnames())
            self.assertNotIn("public/design/matte.webp", archive.getnames())

    def test_runtime_fixtures_and_acceptance_route_are_packaged(self):
        required = {
            "src/components/fixtures/synthetic-preview.tsx": "export const preview = {};",
            "src/components/command-center.tsx": "import { preview } from './fixtures/synthetic-preview';",
            "src/app/incidents/[incidentId]/acceptance/page.tsx": "export default function Page() { return null; }",
        }
        for name, content in required.items():
            self.put(name, content)
        for name in ["deployment/fixtures/observation.json", "deployment/acceptance/browser-secrets.mjs",
                     "src/lib/backend/tests/actor.ts", "spacetimedb/dist/bundle.js"]:
            self.put(name, "PRIVATE_MARKER")
        output = self.base / "release.tar.gz"
        packer.package_source(self.root, output)
        with tarfile.open(output) as archive:
            for name, content in required.items():
                self.assertEqual(archive.extractfile(name).read().decode(), content)
            for member in archive.getmembers():
                self.assertNotIn(b"PRIVATE_MARKER", archive.extractfile(member).read())

    def test_source_symlink_cannot_package_external_data(self):
        secret = self.base / "private.txt"
        secret.write_text("DO_NOT_PACKAGE")
        (self.root / "src/stolen.ts").symlink_to(secret)
        output = self.base / "release.tar.gz"
        with self.assertRaisesRegex(ValueError, "symlink"):
            packer.package_source(self.root, output)
        self.assertFalse(output.exists())

    def test_source_root_symlink_cannot_package_external_tree(self):
        outside = self.base / "outside"
        outside.mkdir()
        (outside / "private.ts").write_text("DO_NOT_PACKAGE")
        shutil.rmtree(self.root / "src")
        (self.root / "src").symlink_to(outside, target_is_directory=True)
        output = self.base / "release.tar.gz"
        with self.assertRaisesRegex(ValueError, "symlink"):
            packer.package_source(self.root, output)
        self.assertFalse(output.exists())

    def test_output_cannot_overwrite_data_or_land_inside_source(self):
        existing = self.base / "keep.txt"
        existing.write_text("KEEP")
        link = self.base / "release.tar.gz"
        link.symlink_to(existing)
        with self.assertRaises(FileExistsError):
            packer.package_source(self.root, link)
        self.assertEqual(existing.read_text(), "KEEP")
        with self.assertRaisesRegex(ValueError, "outside"):
            packer.package_source(self.root, self.root / "release.tar.gz")

    def test_missing_runtime_config_fails_before_creating_an_archive(self):
        (self.root / "next.config.ts").unlink()
        output = self.base / "release.tar.gz"
        with self.assertRaisesRegex(ValueError, "next.config.ts"):
            packer.package_source(self.root, output)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
