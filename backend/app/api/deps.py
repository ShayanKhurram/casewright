"""Auth + tenancy dependencies. get_case_scoped is the ONLY sanctioned way a route touches a
case — it filters by the caller's firm_id, so a cross-tenant case_id 404s exactly like a
nonexistent one (no existence leak). No route should query the Case table directly."""

import uuid
from collections.abc import Awaitable, Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.case import Case, Document
from app.models.draft import DraftSection
from app.models.ops import AgentRun
from app.models.tenant import User
from app.services.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise CREDENTIALS_ERROR from exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise CREDENTIALS_ERROR
    return user


def require_role(*roles: str) -> Callable[[User], Awaitable[User]]:
    """Route-level RBAC guard, e.g. Depends(require_role("partner", "associate"))."""

    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not permitted for this role",
            )
        return user

    return _check


async def get_case_scoped(
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Case:
    # archived == False here too, not just in the list endpoint: an archived case is the "remove
    # this case" affordance (real hard DELETE is architecturally impossible once a case has any
    # audit_log row — see Case.archived's docstring), so it must 404 like it doesn't exist for
    # every case-scoped route (documents, runs, gates, everything), not just stay hidden from the
    # list view while still directly reachable by a stale/guessed URL.
    result = await db.execute(
        select(Case).where(Case.id == case_id, Case.firm_id == current_user.firm_id, Case.archived.is_(False))
    )
    case = result.scalar_one_or_none()
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


async def get_document_scoped(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> Document:
    """Reuses get_case_scoped, then further filters by case_id — a document can't be reached
    by id alone even within the caller's own firm if it belongs to a different case."""
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.case_id == case.id)
    )
    document = result.scalar_one_or_none()
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


async def get_run_scoped(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentRun:
    result = await db.execute(
        select(AgentRun).where(AgentRun.id == run_id, AgentRun.firm_id == current_user.firm_id)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


async def get_section_scoped(
    section_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DraftSection:
    result = await db.execute(
        select(DraftSection).where(DraftSection.id == section_id, DraftSection.firm_id == current_user.firm_id)
    )
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    return section
