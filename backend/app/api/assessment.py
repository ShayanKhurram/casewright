"""The criterion matrix and strategy memo (plan §8)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_case_scoped
from app.db import get_db
from app.models.assessment import CriterionAssessment, StrategyMemo
from app.models.case import Case
from app.schemas.assessment import CriterionAssessmentOut, StrategyMemoOut

router = APIRouter(prefix="/cases", tags=["assessment"])


@router.get("/{case_id}/criteria", response_model=list[CriterionAssessmentOut])
async def get_criteria(
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> list[CriterionAssessment]:
    result = await db.execute(
        select(CriterionAssessment)
        .where(CriterionAssessment.case_id == case.id)
        .order_by(CriterionAssessment.criterion_key)
    )
    return list(result.scalars().all())


@router.get("/{case_id}/strategy", response_model=StrategyMemoOut)
async def get_strategy(
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> StrategyMemo:
    result = await db.execute(select(StrategyMemo).where(StrategyMemo.case_id == case.id))
    memo = result.scalar_one_or_none()
    if memo is None:
        raise HTTPException(status_code=404, detail="No strategy memo yet for this case")
    return memo
