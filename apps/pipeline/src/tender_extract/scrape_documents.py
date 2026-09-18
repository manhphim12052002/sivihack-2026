"""Scrape the Vergabeunterlagen behind `data/extra_doc.json` into the document store + one manifest.

Input rows come from a Supabase export: `buyer_name`, `document_urls` (a Postgres array
literal such as `{https://…}`), `notice_ids`. For every distinct URL the platform adapter
(`adapters.adapter_for`) fetches the whole package anonymously; every file is unpacked
(`documents.unpack`) and kept once in the content-addressed store `data/documents/` (gitignored).
Nothing is filtered here: drawings and bills of quantities are stored too, and
`reader.route(name)` is recorded per file so a downstream reader can pick the conditions
documents. Portals that demand a form before any download are recorded GATED; a closed
procedure or a transport failure is UNREACHABLE with the reason. Never raises per URL.

The manifest `data/extra_doc_files.json` (committed) has one entry per URL and is rewritten
after every URL, so an interrupted run loses nothing. Re-running skips URLs already
RETRIEVED unless `--refresh`.

    python -m tender_extract.scrape_documents --sample 1            # first URL of every buyer
    python -m tender_extract.scrape_documents --buyer Hamburg --limit 3
    python -m tender_extract.scrape_documents                       # everything in the input
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import adapters
from .documents import DEFAULT_STORE, store_file, unpack
from .reader import route

DEFAULT_INPUT = Path("data/extra_doc.json")
DEFAULT_MANIFEST = Path("data/extra_doc_files.json")

GATED_REASON = "registration or request form before any download (ADR 0004: not submitted)"


@dataclass
class Target:
    buyer_name: str
    url: str
    notice_ids: list[str] = field(default_factory=list)


def parse_array_literal(literal: str) -> list[str]:
    """`{a,b}` → ['a', 'b']; a plain string or a JSON list passes through."""
    if isinstance(literal, list):
        return [str(x) for x in literal]
    text = (literal or "").strip()
    if text.startswith("{") and text.endswith("}"):
        text = text[1:-1]
    return [p.strip().strip('"') for p in text.split(",") if p.strip()]


def load_targets(path: Path) -> list[Target]:
    """One Target per distinct URL, notice ids merged, input order kept."""
    by_url: dict[str, Target] = {}
    for row in json.loads(path.read_text("utf-8")):
        for url in parse_array_literal(row.get("document_urls")):
            target = by_url.setdefault(url, Target(row.get("buyer_name") or "", url))
            for nid in row.get("notice_ids") or []:
                if nid not in target.notice_ids:
                    target.notice_ids.append(nid)
    return list(by_url.values())


def scrape(target: Target, store: Path) -> dict[str, Any]:
    """Fetch one URL's package; returns the manifest entry. Never raises."""
    entry: dict[str, Any] = {
        "buyer_name": target.buyer_name, "document_url": target.url, "notice_ids": target.notice_ids,
        "platform": adapters.host_of(target.url), "status": None, "reason": None,
        "package": None, "files": [], "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    kind = adapters.classify(target.url)
    adapter = adapters.adapter_for(target.url)
    if kind != "ADAPTER" or adapter is None:
        entry["status"] = "GATED" if kind == "GATED" else "UNREACHABLE"
        entry["reason"] = GATED_REASON if kind == "GATED" else f"{kind}: no anonymous adapter for this platform"
        return entry
    try:
        raw = adapter(target.url, None)          # None: every file, nothing routed out
        if raw:
            name, data = raw[0]
            entry["package"] = ({"filename": name, "bytes": len(data)} if len(raw) == 1
                                else {"filename": None, "bytes": sum(len(d) for _, d in raw)})
        # unpack reads every member: an encrypted or truncated archive raises here, not in
        # the ZipFile constructor, so the loop stays inside the try.
        for name, data in raw:
            for inner, member in unpack(name, data):
                f = store_file(inner, member, store)
                entry["files"].append({"name": f.name, "sha256": f.sha256, "bytes": f.size,
                                       "ext": f.path.suffix.lstrip("."), "path": str(f.path), "route": route(f.name)})
    except Exception as exc:  # transport, 4xx, size, bad archive — all honest UNREACHABLE
        entry["status"] = "UNREACHABLE"
        entry["reason"] = f"{type(exc).__name__}: {str(exc)[:200]}"
        return entry
    if not entry["files"]:
        entry["status"], entry["reason"] = "UNREACHABLE", "adapter returned no files"
    else:
        entry["status"] = "RETRIEVED"
    return entry


def load_manifest(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    return {e["document_url"]: e for e in json.loads(path.read_text("utf-8"))}


def write_manifest(path: Path, entries: dict[str, dict[str, Any]]) -> None:
    ordered = sorted(entries.values(), key=lambda e: (e["buyer_name"], e["document_url"]))
    tmp = path.with_suffix(".json.tmp")          # write-then-rename: a crash never leaves half a manifest
    tmp.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", "utf-8")
    os.replace(tmp, path)


def select(targets: list[Target], *, buyer: str | None, limit: int | None, sample: int | None) -> list[Target]:
    if buyer:
        targets = [t for t in targets if buyer.lower() in t.buyer_name.lower()]
    if sample:
        per_buyer: Counter[str] = Counter()
        picked = []
        for t in targets:
            if per_buyer[t.buyer_name] < sample:
                per_buyer[t.buyer_name] += 1
                picked.append(t)
        targets = picked
    return targets[:limit] if limit else targets


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tender_extract.scrape_documents",
                                     description="Download every document package behind data/extra_doc.json.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--store", type=Path, default=DEFAULT_STORE)
    parser.add_argument("--buyer", help="only buyers whose name contains this text")
    parser.add_argument("--sample", type=int, help="first N URLs of every buyer")
    parser.add_argument("--limit", type=int, help="stop after N URLs")
    parser.add_argument("--refresh", action="store_true", help="re-fetch URLs already RETRIEVED")
    parser.add_argument("--sleep", type=float, default=1.0, help="seconds between URLs")
    args = parser.parse_args(argv)

    targets = select(load_targets(args.input), buyer=args.buyer, limit=args.limit, sample=args.sample)
    manifest = load_manifest(args.manifest)
    stats: Counter[str] = Counter()
    print(f"{len(targets)} url(s) selected", file=sys.stderr)
    for target in targets:
        previous = manifest.get(target.url)
        if previous and previous["status"] == "RETRIEVED" and not args.refresh:
            stats["skipped"] += 1
            continue
        entry = scrape(target, args.store)
        manifest[target.url] = entry
        write_manifest(args.manifest, manifest)
        stats[entry["status"]] += 1
        stats["files"] += len(entry["files"])
        print(f"  {entry['status']:11} {entry['platform']:34} {len(entry['files']):4} files  "
              f"{(entry['reason'] or '')[:80]}", file=sys.stderr)
        if entry["status"] != "GATED":            # GATED made no request; everything else did
            time.sleep(args.sleep)
    print("\n".join(f"  {k:12} {v}" for k, v in sorted(stats.items())), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
