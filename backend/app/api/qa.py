"""Grounded Q&A over a case's extracted facts (plan §7): the model may only answer from the
numbered facts for that one case, citing the indices it relied on, and must say so plainly
when the record doesn't contain the answer. Stateless per request — chat history lives only
in the client, never in the DB."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import call_structured
from app.api.deps import get_case_scoped
from app.db import get_db
from app.models.case import Case, Document, ExtractedFact
from app.schemas.qa import CaseQARequest, CaseQAResponse, QACitation, QAModelOutput

router = APIRouter(prefix="/cases", tags=["qa"])


@router.post("/{case_id}/qa", response_model=CaseQAResponse)
async def ask_case_question(
    payload: CaseQARequest,
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> CaseQAResponse:
    # Joined to Document for exhibit_label, which is the handle citations render back to the user.
    result = await db.execute(
        select(ExtractedFact, Document)
        .join(Document, ExtractedFact.source_document_id == Document.id)
        .where(ExtractedFact.case_id == case.id)
        .order_by(ExtractedFact.created_at, ExtractedFact.id)
    )
    rows = result.all()

    if not rows:
        # Intake hasn't run yet — answering anything here would be pure hallucination, so we
        # short-circuit before touching the model. A test asserts call_structured is NOT called.
        return CaseQAResponse(
            answer="No extracted facts exist yet for this case — run intake first.",
            grounded=False,
            citations=[],
        )

    facts = [fact for fact, _doc in rows]
    documents = [doc for _fact, doc in rows]

    lines = []
    for i, (fact, _doc) in enumerate(rows):
        lines.append(f"[{i}] fact_type={fact.fact_type} payload={fact.payload} source_quote={fact.source_quote!r}")
    context = "\n".join(lines)

    system = (
        "You are answering a question about a single immigration case using only the numbered "
        "facts provided below. Answer only from these facts. If they do not contain the answer, "
        "set found=false and give an answer like 'Not found in this record.' Always list the "
        "indices of every fact you actually relied on in cited_fact_indices."
    )
    user = f"{context}\n\nQUESTION: {payload.question}"

    result_model = await call_structured(
        tier="reasoning",
        system=system,
        user=user,
        response_model=QAModelOutput,
    )

    citations: list[QACitation] = []
    for index in result_model.cited_fact_indices:
        # The model can return an out-of-range index; never let that 500 the request.
        if 0 <= index < len(facts):
            fact = facts[index]
            doc = documents[index]
            citations.append(
                QACitation(
                    fact_id=fact.id,
                    document_id=doc.id,
                    exhibit_label=doc.exhibit_label,
                    source_page=fact.source_page,
                    source_quote=fact.source_quote,
                )
            )

    return CaseQAResponse(
        answer=result_model.answer,
        grounded=result_model.found,
        citations=citations,
    )