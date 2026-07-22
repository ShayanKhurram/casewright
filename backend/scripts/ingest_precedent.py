"""Ingest a firm-private precedent document as KnowledgeChunk rows (plan §4.4). Input is
already-plain-text (PDF/OCR happens elsewhere); we split on blank lines into paragraph-sized
chunks, embed each, and store with kind='precedent' and firm_id set so retrieval scopes it
to that tenant (firm_id IS NULL OR firm_id = caller — see services/retrieval.py).

Run: python -m scripts.ingest_precedent --firm-id <uuid> --file path/to/petition.txt --ref "Smith EB-1A 2024 petition"
"""

import argparse
import asyncio
import sys
import uuid

from app.db import session_scope
from app.models.knowledge import KnowledgeChunk
from app.models.tenant import Firm
from app.services.embeddings import embed

MIN_CHUNK_CHARS = 50  # below this a fragment isn't useful as a retrievable precedent chunk


async def ingest_precedent(firm_id: uuid.UUID, file: str, ref: str) -> int:
    with open(file, encoding="utf-8") as fh:
        text = fh.read()

    # Split on blank lines (one or more) into paragraphs, drop empties and tiny fragments.
    raw_chunks = [chunk.strip() for chunk in text.split("\n\n")]
    chunks = [c for c in raw_chunks if len(c) >= MIN_CHUNK_CHARS]

    async with session_scope() as db:
        # Fail loudly rather than silently ingesting orphaned chunks no firm can ever see.
        firm = await db.get(Firm, firm_id)
        if firm is None:
            print(f"Error: firm {firm_id} not found — refusing to ingest orphaned precedent chunks.", file=sys.stderr)
            raise SystemExit(1)

        for i, chunk in enumerate(chunks):
            embedding = await embed(chunk)
            db.add(
                KnowledgeChunk(
                    firm_id=firm_id,
                    kind="precedent",
                    criterion_key=None,
                    ref=f"{ref} [chunk {i}]",
                    content=chunk,
                    embedding=embedding,
                )
            )
        await db.flush()

    return len(chunks)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a plain-text precedent document as firm-scoped knowledge chunks."
    )
    parser.add_argument("--firm-id", required=True, help="Firm UUID owning this precedent.")
    parser.add_argument("--file", required=True, help="Path to a plain-text .txt file.")
    parser.add_argument(
        "--ref",
        required=True,
        help="Citable label for this precedent, e.g. 'Smith EB-1A 2024 petition'.",
    )
    args = parser.parse_args()

    count = asyncio.run(ingest_precedent(uuid.UUID(args.firm_id), args.file, args.ref))
    print(f"Ingested {count} precedent chunks for ref '{args.ref}'.")


if __name__ == "__main__":
    main()