"""RFE notices and their parsed objections (plan §8)."""

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_case_scoped
from app.db import get_db
from app.models.case import Case
from app.models.rfe import RFENotice, RFEObjection
from app.schemas.rfe import RFENoticeOut, RFEObjectionOut

router = APIRouter(prefix="/cases", tags=["rfe"])


@router.get("/{case_id}/rfe", response_model=list[RFENoticeOut])
async def list_rfe_notices(
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> list[RFENoticeOut]:
    notices_result = await db.execute(
        select(RFENotice).where(RFENotice.case_id == case.id).order_by(RFENotice.created_at)
    )
    notices = list(notices_result.scalars().all())

    objections_by_notice: dict = defaultdict(list)
    if notices:
        objections_result = await db.execute(
            select(RFEObjection)
            .where(RFEObjection.notice_id.in_([n.id for n in notices]))
            .order_by(RFEObjection.position)
        )
        for objection in objections_result.scalars().all():
            objections_by_notice[objection.notice_id].append(RFEObjectionOut.model_validate(objection))

    out = []
    for notice in notices:
        item = RFENoticeOut.model_validate(notice)
        item.objections = objections_by_notice.get(notice.id, [])
        out.append(item)
    return out
