"""Closes a gap flagged in PLAN.md T4.4's review: precedent ingestion needs the same tenancy
discipline as everything else in this codebase, and that wasn't actually tested — only
py_compile'd and manually traced. This is the real test.

ingest_precedent() calls session_scope() directly (like the graph nodes), so this needs the
graph_db fixture to redirect that at the test database — a plain db_session (savepoint-based,
uncommitted) wouldn't be visible to it. See test_petition_graph.py for the same pattern.
"""

import uuid
from pathlib import Path

from app.db import session_scope
from app.models.tenant import Firm
from app.services import retrieval
from scripts.ingest_precedent import ingest_precedent


async def _make_firm(name: str) -> uuid.UUID:
    async with session_scope() as db:
        firm = Firm(name=name)
        db.add(firm)
        await db.flush()
        return firm.id


async def test_ingested_precedent_is_scoped_to_the_owning_firm(graph_db, tmp_path: Path):
    firm_a_id = await _make_firm("Firm A")
    firm_b_id = await _make_firm("Firm B")

    doc = tmp_path / "petition.txt"
    doc.write_text(
        "This paragraph is long enough to clear the minimum chunk length threshold for ingestion.\n\n"
        "This second paragraph is also long enough and describes a distinct winning argument.\n\n"
        "short\n",
        encoding="utf-8",
    )

    count = await ingest_precedent(firm_a_id, str(doc), "Smith EB-1A 2024 petition")
    assert count == 2, "the 'short' paragraph should be filtered out by the minimum length"

    async with session_scope() as db:
        results_for_a = await retrieval.retrieve(db, query="winning argument", firm_id=firm_a_id, kind="precedent")
        results_for_b = await retrieval.retrieve(db, query="winning argument", firm_id=firm_b_id, kind="precedent")

    assert len(results_for_a) == 2
    assert all(r.firm_id == firm_a_id for r in results_for_a)
    assert all("Smith EB-1A 2024 petition" in r.ref for r in results_for_a)
    assert results_for_b == [], "firm B must not see firm A's precedent chunks"


async def test_ingest_precedent_refuses_an_unknown_firm(graph_db, tmp_path: Path):
    doc = tmp_path / "petition.txt"
    doc.write_text("This paragraph is long enough to clear the minimum chunk length threshold.\n", encoding="utf-8")

    raised = False
    try:
        await ingest_precedent(uuid.uuid4(), str(doc), "Orphan petition")
    except SystemExit:
        raised = True

    assert raised, "ingesting under a nonexistent firm_id must fail loudly, not silently insert orphaned chunks"
