"""Seeds the shared (firm_id=NULL) knowledge corpus: the 18 criterion standards (8 O-1A per
8 CFR 214.2(o)(3)(iii), 10 EB-1A per 8 CFR 204.5(h)(3)), core authorities, and starter argument
patterns (plan §6). Firm-private precedent is added per-tenant during onboarding, not here.

Run: python -m scripts.seed_knowledge
"""

import asyncio

from sqlalchemy import select

from app.db import session_scope
from app.models.knowledge import KnowledgeChunk
from app.services.embeddings import embed

CRITERIA: list[dict] = [
    # --- O-1A: 8 CFR 214.2(o)(3)(iii)(A)-(H) ---
    {
        "criterion_key": "o1a.awards",
        "ref": "8 CFR 214.2(o)(3)(iii)(A)",
        "content": (
            "Receipt of nationally or internationally recognized prizes or awards for excellence "
            "in the field of endeavor. Adjudication focus: the award's field-wide recognition and "
            "selectivity, not the beneficiary's subjective sense of its prestige. Purely local, "
            "internal, or participation-based awards rarely satisfy this criterion on their own."
        ),
    },
    {
        "criterion_key": "o1a.membership",
        "ref": "8 CFR 214.2(o)(3)(iii)(B)",
        "content": (
            "Membership in associations in the field which require outstanding achievement of "
            "their members, as judged by recognized national or international experts. Dues-paying "
            "or degree-based membership does not qualify; the association's admission criteria must "
            "themselves screen for outstanding achievement, evaluated by field experts."
        ),
    },
    {
        "criterion_key": "o1a.published_material",
        "ref": "8 CFR 214.2(o)(3)(iii)(C)",
        "content": (
            "Published material in professional or major trade publications, newspapers, or other "
            "major media relating to the beneficiary's work in the field. The material must be about "
            "the beneficiary specifically (not merely mentioning them), and the publication's title, "
            "circulation, and audience should be established in the record."
        ),
    },
    {
        "criterion_key": "o1a.judging",
        "ref": "8 CFR 214.2(o)(3)(iii)(D)",
        "content": (
            "Participation, either individually or on a panel, as a judge of the work of others in "
            "the same or an allied field. Peer review of journal manuscripts, grant panels, "
            "competition judging, and thesis committees all qualify; the invitation itself is the "
            "evidence of the field's regard for the beneficiary's expertise."
        ),
    },
    {
        "criterion_key": "o1a.original_contributions",
        "ref": "8 CFR 214.2(o)(3)(iii)(E)",
        "content": (
            "Original scientific, scholarly, or business-related contributions of major significance "
            "in the field. Requires evidence of the contribution's actual impact — citations, adoption "
            "by others, independent expert corroboration, downstream commercial or industry effect — "
            "not just novelty or the beneficiary's own description of significance."
        ),
    },
    {
        "criterion_key": "o1a.scholarly_articles",
        "ref": "8 CFR 214.2(o)(3)(iii)(F)",
        "content": (
            "Authorship of scholarly articles in the field, in professional journals or other major "
            "media. Volume alone is weak evidence; citation counts, journal impact/selectivity, and "
            "the beneficiary's authorship position strengthen this criterion."
        ),
    },
    {
        "criterion_key": "o1a.critical_employment",
        "ref": "8 CFR 214.2(o)(3)(iii)(G)",
        "content": (
            "Employment in a critical or essential capacity for organizations and establishments that "
            "have a distinguished reputation. Requires evidence both that the organization's reputation "
            "is distinguished (rankings, market position, awards) and that the beneficiary's specific "
            "role was critical or essential to it, not merely senior-sounding."
        ),
    },
    {
        "criterion_key": "o1a.high_remuneration",
        "ref": "8 CFR 214.2(o)(3)(iii)(H)",
        "content": (
            "Evidence of having commanded a high salary or other significantly high remuneration for "
            "services, in relation to others in the field. Requires a comparator — market survey data, "
            "BLS/OES wage percentiles, or comparable-role compensation — not just the raw figure."
        ),
    },
    # --- EB-1A: 8 CFR 204.5(h)(3)(i)-(x) ---
    {
        "criterion_key": "eb1a.awards",
        "ref": "8 CFR 204.5(h)(3)(i)",
        "content": (
            "Documentation of the alien's receipt of lesser nationally or internationally recognized "
            "prizes or awards for excellence in the field of endeavor. Same field-wide-recognition "
            "standard as the O-1A analog; adjudicators weigh selectivity and the number/caliber of "
            "competitors or nominees."
        ),
    },
    {
        "criterion_key": "eb1a.membership",
        "ref": "8 CFR 204.5(h)(3)(ii)",
        "content": (
            "Documentation of membership in associations in the field which demand outstanding "
            "achievement of their members, as judged by recognized national or international experts "
            "in their disciplines or fields. The association's admission standards, not its prestige "
            "in general, are what USCIS scrutinizes."
        ),
    },
    {
        "criterion_key": "eb1a.published_material",
        "ref": "8 CFR 204.5(h)(3)(iii)",
        "content": (
            "Published material about the alien in professional or major trade publications or other "
            "major media, relating to the alien's work in the field. Title, date, and author of the "
            "material must be provided, along with translation if not in English."
        ),
    },
    {
        "criterion_key": "eb1a.judging",
        "ref": "8 CFR 204.5(h)(3)(iv)",
        "content": (
            "Evidence of the alien's participation, either individually or on a panel, as a judge of "
            "the work of others in the same or an allied field. As with O-1A, the invitation to judge "
            "is itself probative of standing in the field."
        ),
    },
    {
        "criterion_key": "eb1a.original_contributions",
        "ref": "8 CFR 204.5(h)(3)(v)",
        "content": (
            "Evidence of the alien's original scientific, scholarly, artistic, athletic, or "
            "business-related contributions of major significance in the field. This is frequently the "
            "most heavily contested criterion at final merits; independent corroboration of impact "
            "(not just the beneficiary's own recommenders) carries the most weight."
        ),
    },
    {
        "criterion_key": "eb1a.scholarly_articles",
        "ref": "8 CFR 204.5(h)(3)(vi)",
        "content": (
            "Evidence of the alien's authorship of scholarly articles in the field, in professional or "
            "major trade publications or other major media. Citation metrics and venue selectivity are "
            "the standard strengthening evidence."
        ),
    },
    {
        "criterion_key": "eb1a.exhibitions",
        "ref": "8 CFR 204.5(h)(3)(vii)",
        "content": (
            "Evidence of the display of the alien's work in the field at artistic exhibitions or "
            "showcases. Applies primarily to visual/performing artists; the venue's prestige and "
            "curatorial selectivity matter more than exhibition count."
        ),
    },
    {
        "criterion_key": "eb1a.critical_role",
        "ref": "8 CFR 204.5(h)(3)(viii)",
        "content": (
            "Evidence that the alien has performed in a leading or critical role for organizations or "
            "establishments that have a distinguished reputation. Requires proof of both the "
            "organization's distinguished reputation and the specific, documented criticality of the "
            "alien's role (not job title alone)."
        ),
    },
    {
        "criterion_key": "eb1a.high_remuneration",
        "ref": "8 CFR 204.5(h)(3)(ix)",
        "content": (
            "Evidence that the alien has commanded a high salary or other significantly high "
            "remuneration for services, in relation to others in the field. A wage comparator "
            "(geographic and occupational) is expected."
        ),
    },
    {
        "criterion_key": "eb1a.commercial_success",
        "ref": "8 CFR 204.5(h)(3)(x)",
        "content": (
            "Evidence of commercial successes in the performing arts, as shown by box office receipts "
            "or record, cassette, compact disk, or video sales. Applies narrowly to performing artists; "
            "sales/receipts figures should be benchmarked against field norms."
        ),
    },
]

AUTHORITIES: list[dict] = [
    {
        "criterion_key": None,
        "ref": "8 CFR 204.5(h)(2)",
        "content": (
            'Defines "extraordinary ability" for EB-1A purposes as a level of expertise indicating '
            "that the individual is one of that small percentage who have risen to the very top of "
            "the field of endeavor."
        ),
    },
    {
        "criterion_key": None,
        "ref": "Kazarian v. USCIS, 596 F.3d 1115 (9th Cir. 2010)",
        "content": (
            "Establishes the two-step extraordinary-ability analysis USCIS now applies to both EB-1A "
            "and O-1A: (1) a count of which of the enumerated evidentiary criteria are satisfied, then "
            "(2) a final merits determination, considering the totality of the record, on whether the "
            "evidence as a whole shows sustained national or international acclaim and that the "
            "individual is among the small percentage at the very top of the field. Meeting three "
            "criteria is necessary but not sufficient — the final merits step is where borderline "
            "cases are actually won or lost, and strategy memos should address it explicitly."
        ),
    },
    {
        "criterion_key": None,
        "ref": "USCIS Policy Manual Vol. 6, Part F, Chapter 5 (EB-1A)",
        "content": (
            "USCIS's current adjudication guidance for EB-1A, including examples of qualifying and "
            "non-qualifying evidence for each criterion and the agency's articulation of the Kazarian "
            "final-merits step. The authoritative source for how an examiner is instructed to weigh "
            "borderline evidence."
        ),
    },
    {
        "criterion_key": None,
        "ref": "USCIS Policy Manual Vol. 2, Part M (O Nonimmigrant Classification)",
        "content": (
            "USCIS's current adjudication guidance for O-1A, parallel to the EB-1A policy manual "
            "chapter, including the 'extraordinary ability' standard for O-1A (sustained national or "
            "international acclaim, among the small percentage at the top of the field) and worked "
            "examples of each of the eight criteria."
        ),
    },
]

PATTERNS: list[dict] = [
    {
        "criterion_key": None,
        "ref": "pattern.standard-evidence-argument",
        "content": (
            "The standard section structure for a criterion argument: (1) state the regulatory "
            "standard verbatim with its citation, (2) present the specific evidence for this "
            "beneficiary with exhibit citations, (3) argue explicitly why that evidence satisfies the "
            "standard — never leave the connection implicit for the adjudicator to infer."
        ),
    },
    {
        "criterion_key": None,
        "ref": "pattern.borderline-evidence-distinguishing",
        "content": (
            "When evidence is borderline (e.g., a regional rather than national award, a mid-tier "
            "publication), the winning pattern is to preemptively distinguish it from disqualifying "
            "fact patterns in denial precedent and RFE templates, rather than ignoring the weakness "
            "and hoping it goes unnoticed."
        ),
    },
    {
        "criterion_key": None,
        "ref": "pattern.final-merits-synthesis",
        "content": (
            "The final merits narrative should synthesize across criteria rather than restate them: "
            "explain how the combination of evidence — not any single criterion — demonstrates "
            "sustained acclaim and top-of-field standing, directly answering the Kazarian step-two "
            "question."
        ),
    },
]


async def seed_knowledge() -> None:
    async with session_scope() as db:
        for row in [*CRITERIA, *AUTHORITIES, *PATTERNS]:
            existing = await db.execute(
                select(KnowledgeChunk).where(
                    KnowledgeChunk.ref == row["ref"], KnowledgeChunk.firm_id.is_(None)
                )
            )
            if existing.scalar_one_or_none() is not None:
                continue

            kind = (
                "criterion"
                if row in CRITERIA
                else "authority"
                if row in AUTHORITIES
                else "pattern"
            )
            embedding = await embed(row["content"])
            db.add(
                KnowledgeChunk(
                    firm_id=None,
                    kind=kind,
                    criterion_key=row["criterion_key"],
                    ref=row["ref"],
                    content=row["content"],
                    embedding=embedding,
                )
            )
        await db.flush()
    print(f"Seeded {len(CRITERIA)} criteria, {len(AUTHORITIES)} authorities, {len(PATTERNS)} patterns.")


def main() -> None:
    asyncio.run(seed_knowledge())


if __name__ == "__main__":
    main()
