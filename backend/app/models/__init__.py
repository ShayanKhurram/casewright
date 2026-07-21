"""Import every model module so Base.metadata is fully populated for Alembic autogenerate."""

from app.models.assessment import CriterionAssessment, StrategyMemo
from app.models.base import Base
from app.models.case import Case, Document, ExtractedFact
from app.models.draft import Citation, Draft, DraftSection
from app.models.knowledge import KnowledgeChunk
from app.models.ops import AgentRun, AuditLog, BillingEvent
from app.models.rfe import RFENotice, RFEObjection
from app.models.tenant import Firm, User

__all__ = [
    "Base",
    "Firm",
    "User",
    "Case",
    "Document",
    "ExtractedFact",
    "CriterionAssessment",
    "StrategyMemo",
    "Draft",
    "DraftSection",
    "Citation",
    "RFENotice",
    "RFEObjection",
    "AgentRun",
    "AuditLog",
    "BillingEvent",
    "KnowledgeChunk",
]
