"""Hybrid retrieval over the knowledge corpus: cosine similarity, filtered by kind/criterion_key,
tenant-scoped (firm_id IS NULL OR firm_id = caller). Retrieved ref strings are the only
authorities a drafting prompt may cite — that closed world is what makes citation
verification decidable (plan §6/§7)."""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeChunk
from app.services.embeddings import embed


async def retrieve(
    db: AsyncSession,
    *,
    query: str,
    firm_id: uuid.UUID,
    kind: str | None = None,
    criterion_key: str | None = None,
    limit: int = 8,
) -> list[KnowledgeChunk]:
    query_embedding = await embed(query)

    stmt = select(KnowledgeChunk).where(
        or_(KnowledgeChunk.firm_id.is_(None), KnowledgeChunk.firm_id == firm_id)
    )
    if kind is not None:
        stmt = stmt.where(KnowledgeChunk.kind == kind)
    if criterion_key is not None:
        stmt = stmt.where(KnowledgeChunk.criterion_key == criterion_key)
    stmt = stmt.order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding)).limit(limit)

    result = await db.execute(stmt)
    return list(result.scalars().all())
