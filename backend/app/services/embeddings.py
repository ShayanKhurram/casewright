"""Embeddings for the retrieval corpus. Voyage in production; a deterministic hash fallback
in dev so the stack (and retrieval logic) runs without external keys, per plan §3/§6."""

import hashlib
import math

import httpx

from app.config import get_settings
from app.models.knowledge import EMBEDDING_DIM

settings = get_settings()

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = "voyage-3"


def _hash_embedding(text: str) -> list[float]:
    """Deterministic, not semantic: same text always maps to the same vector, which is enough
    to exercise pgvector cosine-similarity plumbing in dev without a Voyage key. Never use this
    fallback's output to make real retrieval-quality claims."""
    vector: list[float] = []
    counter = 0
    while len(vector) < EMBEDDING_DIM:
        digest = hashlib.sha256(f"{text}:{counter}".encode()).digest()
        vector.extend(b / 255.0 - 0.5 for b in digest)
        counter += 1
    vector = vector[:EMBEDDING_DIM]
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


async def embed(text: str) -> list[float]:
    if not settings.voyage_api_key:
        return _hash_embedding(text)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            VOYAGE_URL,
            headers={"Authorization": f"Bearer {settings.voyage_api_key}"},
            json={"input": [text], "model": VOYAGE_MODEL},
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]
