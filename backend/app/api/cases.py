"""Case CRUD. Every query here is firm-scoped — list filters by the caller's firm_id, and
single-case reads go through get_case_scoped so a cross-tenant id 404s.

There is deliberately no hard DELETE. Every case gets a `case.created` audit_log row the moment
it's created, and audit_log is append-only (a DB trigger blocks UPDATE *and* DELETE for every
role, including the owner) — a real DELETE FROM cases would cascade an UPDATE onto audit_log
(the FK is ON DELETE SET NULL) and the trigger would reject the whole transaction. Archiving
(DELETE /cases/{id} sets Case.archived, not a row deletion) is the actual "remove this case"
affordance: excluded from list_cases and from get_case_scoped (404s exactly like a case that
was never there), row and full history preserved underneath."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_case_scoped, get_current_user
from app.db import get_db
from app.models.case import Case
from app.models.tenant import User
from app.schemas.case import CaseCreate, CaseOut, CaseWithHealthOut
from app.services import audit
from app.services.health_score import compute_case_health

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post("", response_model=CaseOut, status_code=201)
async def create_case(
    payload: CaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Case:
    case = Case(firm_id=current_user.firm_id, **payload.model_dump())
    db.add(case)
    await db.flush()
    await audit.record(
        db,
        firm_id=current_user.firm_id,
        actor=f"user:{current_user.email}",
        action="case.created",
        case_id=case.id,
        detail={"beneficiary_name": case.beneficiary_name, "visa_category": case.visa_category},
    )
    await db.refresh(case)
    return case


@router.get("", response_model=list[CaseWithHealthOut])
async def list_cases(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CaseWithHealthOut]:
    result = await db.execute(
        select(Case)
        .where(Case.firm_id == current_user.firm_id, Case.archived.is_(False))
        .order_by(Case.created_at.desc())
    )
    cases = list(result.scalars().all())
    results = []
    for case in cases:
        health = await compute_case_health(db, case.id)
        results.append(CaseWithHealthOut(**CaseOut.model_validate(case).model_dump(), health=health))
    return results


@router.get("/{case_id}", response_model=CaseWithHealthOut)
async def get_case(
    case: Case = Depends(get_case_scoped),
    db: AsyncSession = Depends(get_db),
) -> CaseWithHealthOut:
    health = await compute_case_health(db, case.id)
    return CaseWithHealthOut(**CaseOut.model_validate(case).model_dump(), health=health)


@router.delete("/{case_id}", status_code=204)
async def archive_case(
    case: Case = Depends(get_case_scoped),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Soft-delete (see this module's docstring for why there's no hard delete). Idempotent by
    construction — get_case_scoped already 404s an already-archived case, so this can never
    double-archive."""
    case.archived = True
    await audit.record(
        db,
        firm_id=current_user.firm_id,
        actor=f"user:{current_user.email}",
        action="case.archived",
        case_id=case.id,
        detail={"beneficiary_name": case.beneficiary_name},
    )
