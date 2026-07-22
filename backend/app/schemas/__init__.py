"""Pydantic request/response models, one module per resource. Mirrors app/models/ (the
SQLAlchemy layer) but stays a separate layer on purpose — API shape and DB shape are
allowed to diverge (e.g. CaseWithHealthOut adds a computed field no column backs)."""
