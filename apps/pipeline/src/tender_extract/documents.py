"""Document tier: fetch a lot's Vergabeunterlagen over plain HTTP, or say why not.

One interface for every platform (ADR 0004): `fetch_documents(url)` returns
`Retrieved(files)` when an adapter could download the package anonymously, else
`Gated`, `Skipped` or `Unreachable` with the platform named, so an estimator is told
which portal to open instead of being shown a silent gap.

Files are unpacked from (nested) ZIPs and kept in a content-addressed store
`data/documents/<sha256>.<ext>`; a hash that is already there is never downloaded or
read twice.
"""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from . import adapters
from .reader import route

DEFAULT_STORE = Path("data/documents")


@dataclass
class File:
    name: str          # path inside the package, mojibake repaired, `__MACOSX` never present
    path: Path         # location in the content-addressed store
    sha256: str
    size: int

    @property
    def source_id(self) -> str:
        return f"doc:{self.sha256}"


@dataclass
class Retrieved:
    platform: str
    files: list[File] = field(default_factory=list)
    status = "RETRIEVED"


@dataclass
class Gated:
    platform: str
    status = "GATED"


@dataclass
class Skipped:
    platform: str
    reason: str
    status = "SKIPPED"


@dataclass
class Unreachable:
    platform: str
    reason: str
    status = "UNREACHABLE"


FetchOutcome = Retrieved | Gated | Skipped | Unreachable


def _fix_name(info: zipfile.ZipInfo) -> str:
    """ZIP names without the UTF-8 flag are decoded as cp437 by Python; most were UTF-8.

    Windows-built packages (Healy Hudson) separate folders with backslashes, which the
    filename router's basename split does not understand; normalised to '/'.
    """
    name = info.filename
    if not info.flag_bits & 0x800:
        try:
            name = name.encode("cp437").decode("utf-8")
        except UnicodeError:
            pass
    return name.replace("\\", "/")


def unpack(name: str, data: bytes, depth: int = 0) -> list[tuple[str, bytes]]:
    """Flatten a package into (path, bytes) pairs, recursing into nested ZIPs."""
    if not data.startswith(b"PK") or depth > 3:
        return [(name, data)]
    out: list[tuple[str, bytes]] = []
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return [(name, data)]
    prefix = name.rsplit("/", 1)[-1].rsplit(".", 1)[0] + "/" if depth else ""
    for info in archive.infolist():
        inner = _fix_name(info)
        if info.is_dir() or "__MACOSX" in inner or inner.rsplit("/", 1)[-1].startswith("."):
            continue
        member = archive.read(info)
        if inner.lower().endswith(".zip"):
            out.extend(unpack(prefix + inner, member, depth + 1))
        else:
            out.append((prefix + inner, member))
    return out


def store_file(name: str, data: bytes, store: Path) -> File:
    digest = hashlib.sha256(data).hexdigest()
    ext = re.sub(r"[^a-z0-9]", "", name.rsplit(".", 1)[-1].lower()) if "." in name else "bin"
    store.mkdir(parents=True, exist_ok=True)
    path = store / f"{digest}.{ext}"
    if not path.exists():
        path.write_bytes(data)
    return File(name=name, path=path, sha256=digest, size=len(data))


def fetch_documents(url: str, store: Path = DEFAULT_STORE) -> FetchOutcome:
    """Fetch what the URL's platform allows anonymously; never raises."""
    platform = adapters.host_of(url) or "unknown"
    kind = adapters.classify(url)
    if kind == "GATED":
        return Gated(platform)
    if kind == "NOTICE_ONLY":
        return Skipped(platform, "notice PDF only, already held structured")
    if kind == "JS_SHELL":
        return Unreachable(platform, "JavaScript shell, no anonymous document listing")
    if kind == "UNKNOWN":
        return Unreachable(platform, "no adapter for this platform")

    adapter = adapters.adapter_for(url)
    if adapter is None:
        return Unreachable(platform, "no adapter for this platform")
    try:
        # A listing adapter (currently only RIB) uses this to skip drawings before
        # downloading them; the single-package adapters ignore it.
        raw = adapter(url, lambda n: route(n) != "SKIP")
        files = [store_file(n, b, store) for name, data in raw for n, b in unpack(name, data)]
    except Exception as exc:  # transport, parsing, size, bad archive: all become an honest UNREACHABLE
        return Unreachable(platform, f"{type(exc).__name__}: {str(exc)[:160]}")

    if not files:
        return Unreachable(platform, "adapter returned no files")
    return Retrieved(platform, files)
