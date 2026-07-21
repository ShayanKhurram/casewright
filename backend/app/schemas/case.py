import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

VisaCategory = Literal["O-1A", "EB-1A"]


class CaseCreate(BaseModel):
    beneficiary_name: str
    field_of_endeavor: str | None = None
    visa_category: VisaCategory
    filing_deadline: date | None = None


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    firm_id: uuid.UUID
    beneficiary_name: str
    field_of_endeavor: str | None
    visa_category: str
    status: str
    profile: dict
    filing_deadline: date | None
    created_at: datetime
    updated_at: datetime
