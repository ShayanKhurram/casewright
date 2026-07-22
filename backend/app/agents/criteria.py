"""The fixed criterion_key lists for each visa category — must match the keys seeded into
knowledge_chunks by scripts/seed_knowledge.py exactly, since assess_criterion retrieves the
standard for each key from that corpus."""

O1A_CRITERIA = (
    "o1a.awards",
    "o1a.membership",
    "o1a.published_material",
    "o1a.judging",
    "o1a.original_contributions",
    "o1a.scholarly_articles",
    "o1a.critical_employment",
    "o1a.high_remuneration",
)

EB1A_CRITERIA = (
    "eb1a.awards",
    "eb1a.membership",
    "eb1a.published_material",
    "eb1a.judging",
    "eb1a.original_contributions",
    "eb1a.scholarly_articles",
    "eb1a.exhibitions",
    "eb1a.critical_role",
    "eb1a.high_remuneration",
    "eb1a.commercial_success",
)


def criteria_for(visa_category: str) -> tuple[str, ...]:
    return O1A_CRITERIA if visa_category == "O-1A" else EB1A_CRITERIA
