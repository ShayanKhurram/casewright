"""Document upload, inventory, and presigned read URLs (plan §8). Exhibit labels are assigned
deterministically here (a counter, not an agent decision) since both workflows cite by [EX-n]."""

import uuid

import pymupdf
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_case_scoped, get_current_user, get_document_scoped
from app.db import get_db
from app.models.case import DOCUMENT_KINDS, Case, Document
from app.models.tenant import User
from app.schemas.document import DocumentOut, DocumentUrlOut
from app.schemas.rollup import DocumentWithCaseOut
from app.services import audit, storage
from app.services.document_processing import extract_text

router = APIRouter(prefix="/cases", tags=["documents"])

# Separate router (own prefix, no /cases collision) for the firm-wide listing — the first
# document endpoint that isn't scoped under a single case. Registered separately in main.py.
firmwide_router = APIRouter(prefix="/documents", tags=["documents"])


async def _next_exhibit_label(db: AsyncSession, case_id: uuid.UUID) -> str:
    result = await db.execute(
        select(func.count()).select_from(Document).where(Document.case_id == case_id)
    )
    count = result.scalar_one()
    return f"EX-{count + 1}"


@router.post("/{case_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    kind: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    case: Case = Depends(get_case_scoped),
) -> Document:
    if kind not in DOCUMENT_KINDS:
        raise HTTPException(status_code=422, detail=f"kind must be one of {DOCUMENT_KINDS}")

    content = await file.read()
    key = storage.build_key(case.firm_id, case.id, file.filename or "upload")
    await storage.ensure_bucket()
    await storage.upload_bytes(key, content, file.content_type or "application/octet-stream")

    page_count = None
    extracted_text = None
    classification_confidence = None
    if file.content_type == "application/pdf":
        try:
            result = await extract_text(content)
            page_count = result.page_count
            extracted_text = result.text
            classification_confidence = result.classification_confidence
        except pymupdf.FileDataError:
            # Corrupt/garbage upload (plan §16): keep the file, surface zero confidence
            # instead of failing the whole upload.
            classification_confidence = 0.0

    document = Document(
        firm_id=case.firm_id,
        case_id=case.id,
        s3_key=key,
        content_type=file.content_type or "application/octet-stream",
        kind=kind,
        exhibit_label=await _next_exhibit_label(db, case.id),
        page_count=page_count,
        extracted_text=extracted_text,
        classification_confidence=classification_confidence,
    )
    db.add(document)
    await db.flush()
    await audit.record(
        db,
        firm_id=case.firm_id,
        actor=f"user:{current_user.email}",
        action="document.uploaded",
        case_id=case.id,
        detail={"document_id": str(document.id), "kind": kind, "exhibit_label": document.exhibit_label},
    )
    await db.refresh(document)
    return document


@router.get("/{case_id}/documents", response_model=list[DocumentOut])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> list[Document]:
    result = await db.execute(
        select(Document).where(Document.case_id == case.id).order_by(Document.created_at)
    )
    return list(result.scalars().all())


@router.get("/{case_id}/documents/{document_id}/url", response_model=DocumentUrlOut)
async def get_document_url(document: Document = Depends(get_document_scoped)) -> DocumentUrlOut:
    url = await storage.presigned_url(document.s3_key)
    return DocumentUrlOut(url=url)


@firmwide_router.get("", response_model=list[DocumentWithCaseOut])
async def list_all_documents(
    case_id: uuid.UUID | None = None,
    kind: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentWithCaseOut]:
    if kind is not None and kind not in DOCUMENT_KINDS:
        raise HTTPException(status_code=422, detail=f"kind must be one of {DOCUMENT_KINDS}")

    query = (
        select(Document, Case)
        .join(Case, Case.id == Document.case_id)
        .where(Case.firm_id == current_user.firm_id)
        .order_by(Document.created_at.desc())
    )
    if case_id is not None:
        query = query.where(Document.case_id == case_id)
    if kind is not None:
        query = query.where(Document.kind == kind)

    result = await db.execute(query)
    return [
        DocumentWithCaseOut(
            **DocumentOut.model_validate(document).model_dump(),
            beneficiary_name=case.beneficiary_name,
        )
        for document, case in result.all()
    ]
