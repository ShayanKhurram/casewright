import uuid

from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    firm_id: uuid.UUID
    firm_name: str
    email: str
    role: str
    full_name: str | None
    is_active: bool
