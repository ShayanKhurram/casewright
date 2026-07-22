"""Case CRUD. Every query here is firm-scoped — list filters by the caller's firm_id, and
single-case reads go through get_case_scoped so a cross-tenant id 404s."""

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
        select(Case).where(Case.firm_id == current_user.firm_id).order_by(Case.created_at.desc())
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
