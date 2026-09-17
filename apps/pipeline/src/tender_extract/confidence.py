"""Confidence is derived from the extractor route, never asked of the model (ADR 0003).

A shared, dependency-free constant: `factsheet.py`, `rules.py` and `enrich.py` all need
it, and `rules.py` in particular is a pure module with no I/O (tested without a database
or the network), so this cannot live in `factsheet.py`, which imports `db`.
"""

from __future__ import annotations

CONFIDENCE_BY_EXTRACTOR = {
    "xpath": "high",
    "rule": "medium",
    "llm_doc": "medium",
    "llm_notice": "low",
}
