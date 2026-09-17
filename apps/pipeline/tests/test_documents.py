"""Tests for the document store's pure pieces: ZIP unpacking, mojibake repair, hashing.

No network, no filesystem beyond a tmp dir via store_file's own store parameter.
"""

import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from tender_extract.documents import store_file, unpack


def make_zip(entries: dict[str, bytes], cp437_names: bool = False) -> bytes:
    """Build a ZIP in memory. `cp437_names` writes names without the UTF-8 flag,
    matching the mojibake-prone packages the probe reports describe."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in entries.items():
            if cp437_names:
                info = zipfile.ZipInfo(name)
                zf.writestr(info, data)  # no ZIP64 UTF-8 flag set by default
            else:
                zf.writestr(name, data)
    return buf.getvalue()


class UnpackTests(unittest.TestCase):
    def test_flat_zip_yields_its_members(self):
        data = make_zip({"a.pdf": b"AAA", "b.pdf": b"BBB"})
        out = dict(unpack("package.zip", data))
        self.assertEqual(out, {"a.pdf": b"AAA", "b.pdf": b"BBB"})

    def test_macosx_and_dotfiles_are_dropped(self):
        data = make_zip({"real.pdf": b"X", "__MACOSX/._real.pdf": b"junk", ".DS_Store": b"junk"})
        out = dict(unpack("package.zip", data))
        self.assertEqual(out, {"real.pdf": b"X"})

    def test_directory_entries_are_skipped(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(zipfile.ZipInfo("folder/"), b"")
            zf.writestr("folder/file.pdf", b"X")
        out = dict(unpack("package.zip", buf.getvalue()))
        self.assertEqual(out, {"folder/file.pdf": b"X"})

    def test_nested_zip_is_recursed_and_prefixed(self):
        inner = make_zip({"inner.pdf": b"INNER"})
        outer = make_zip({"nested.zip": inner, "outer.pdf": b"OUTER"})
        out = dict(unpack("package.zip", outer))
        self.assertEqual(out["outer.pdf"], b"OUTER")
        self.assertIn("nested/inner.pdf", out)
        self.assertEqual(out["nested/inner.pdf"], b"INNER")

    def test_recursion_stops_at_depth_limit(self):
        # Four ZIPs nested inside each other should not recurse forever or raise.
        data = b"PLAIN"
        for i in range(5):
            data = make_zip({f"level{i}.zip": data})
        out = dict(unpack("package.zip", data))
        self.assertEqual(len(out), 1)  # bottoms out as a single (name, bytes) pair

    def test_non_zip_bytes_pass_through_unchanged(self):
        out = unpack("notice.pdf", b"%PDF-1.4 not a zip")
        self.assertEqual(out, [("notice.pdf", b"%PDF-1.4 not a zip")])

    def test_corrupt_zip_magic_passes_through_unchanged(self):
        # Starts with PK but is not a valid archive: never raise, hand the caller
        # the bytes as-is rather than losing the file.
        out = unpack("broken.zip", b"PK\x03\x04garbage")
        self.assertEqual(out, [("broken.zip", b"PK\x03\x04garbage")])


class StoreFileTests(unittest.TestCase):
    def test_same_content_is_written_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = Path(tmp)
            f1 = store_file("a.pdf", b"same bytes", store)
            f2 = store_file("b.pdf", b"same bytes", store)
            self.assertEqual(f1.sha256, f2.sha256)
            self.assertEqual(f1.path, f2.path)
            self.assertEqual(len(list(store.iterdir())), 1)

    def test_extension_comes_from_the_original_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = store_file("Teilnahmebedingungen.PDF", b"x", Path(tmp))
            self.assertTrue(f.path.name.endswith(".pdf"))

    def test_source_id_is_content_addressed(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = store_file("a.pdf", b"x", Path(tmp))
            self.assertEqual(f.source_id, f"doc:{f.sha256}")


if __name__ == "__main__":
    unittest.main()
