#!/usr/bin/env python3
"""Regression checks for the native AssetsBuilder after changing branches/o2."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid


ROOT = Path(__file__).resolve().parents[2]
PLATFORM = os.environ.get("O2_PLATFORM", "Mac" if sys.platform == "darwin" else "Windows" if os.name == "nt" else "Linux")
BINARY = Path(os.environ.get("ASSETS_BUILDER", ROOT / "Bin" / PLATFORM / ("AssetsBuilder.exe" if os.name == "nt" else "AssetsBuilder"))).resolve()


class AssetsBuilderFolderReplacementTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="o2-assets-builder-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.source = self.work / "Assets"
        self.target = self.work / "BuiltAssets"
        self.tree = self.work / "Data.json"
        self.folder_ids = {}
        for folder in ("Styles", "Styles/Nested", "Other"):
            (self.source / folder).mkdir(parents=True, exist_ok=True)
            self.folder_ids[folder] = self.write_meta(folder, "FolderAsset")
        self.files = {
            "Styles/first.js": "var first = 1;\n",
            "Styles/second.js": "var second = 2;\n",
            "Styles/Nested/child.js": "var child = 3;\n",
            "Other/kept.js": "var kept = 4;\n",
        }
        for name, content in self.files.items():
            (self.source / name).write_text(content)
            self.write_meta(name, "JavaScriptAsset")

    def write_meta(self, name, asset_type):
        uid = uuid.uuid4().hex
        (self.source / (name + ".meta")).write_text(json.dumps({
            "Type": f"o2::DefaultAssetMeta<o2::{asset_type}>",
            "Value": {"mId": uid},
        }))
        return uid

    def build_and_check(self):
        result = subprocess.run([
            str(BINARY), "-platform", PLATFORM,
            "-source", str(self.source) + "/",
            "-target", str(self.target) + "/",
            "-target-tree", str(self.tree),
            "-compressor-config", str(ROOT / "o2/CompressToolsConfig.json"),
        ], cwd=self.work, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for name, content in self.files.items():
            self.assertEqual((self.target / name).read_text(), content, name)

        nodes = {}

        def visit(items):
            for item in items:
                value = item["Value"]
                self.assertNotIn(value["path"], nodes)
                nodes[value["path"]] = value
                visit(value.get("mChildren", []))

        visit(json.loads(self.tree.read_text())["rootAssets"])
        self.assertEqual(set(nodes), set(self.files) | set(self.folder_ids))
        for folder, uid in self.folder_ids.items():
            self.assertEqual(nodes[folder]["meta"]["Value"]["mId"], uid)

    def test_replaced_folder_meta_rebuilds_unchanged_descendants(self):
        self.build_and_check()
        self.folder_ids["Styles"] = self.write_meta("Styles", "FolderAsset")
        self.build_and_check()
        self.build_and_check()  # The saved tree must support the next incremental build.

    def test_replaced_nested_folder_preserves_siblings(self):
        self.build_and_check()
        self.folder_ids["Styles/Nested"] = self.write_meta("Styles/Nested", "FolderAsset")
        self.build_and_check()
        self.build_and_check()


if __name__ == "__main__":
    unittest.main()
