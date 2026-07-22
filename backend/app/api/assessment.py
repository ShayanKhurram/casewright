"""The criterion matrix and strategy memo (plan §8)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_case_scoped
from app.db import get_db
from app.models.assessment import CriterionAssessment, StrategyMemo
from app.models.case import Case
from app.schemas.assessment import CriterionAssessmentOut, RiskRadarOut, StrategyMemoOut
from app.services.risk_radar import compute_criterion_risk, compute_overall_risk

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


@router.get("/{case_id}/risk-radar", response_model=RiskRadarOut)
async def get_risk_radar(
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> RiskRadarOut:
    result = await db.execute(
        select(CriterionAssessment)
        .where(CriterionAssessment.case_id == case.id)
        .order_by(CriterionAssessment.criterion_key)
    )
    assessments = list(result.scalars().all())
    if not assessments:
        raise HTTPException(status_code=404, detail="No criteria assessed yet for this case")

    criteria = [compute_criterion_risk(a) for a in assessments]
    overall_risk = compute_overall_risk(criteria)

    memo_result = await db.execute(select(StrategyMemo).where(StrategyMemo.case_id == case.id))
    memo = memo_result.scalar_one_or_none()
    general_risks = memo.rfe_risks if memo is not None else []

    return RiskRadarOut(overall_risk=overall_risk, criteria=criteria, general_risks=general_risks)
