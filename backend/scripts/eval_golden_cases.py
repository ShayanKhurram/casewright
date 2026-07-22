"""Golden-case eval harness CLI (plan §13). Also the sales-pilot instrument: "run it on ten of
your decided cases" is the pitch, so the report format is a product surface, not just internal QA.

Run: python -m scripts.eval_golden_cases --fixtures-dir eval_fixtures
"""

import argparse
import asyncio
from pathlib import Path

from app.eval.replay import delete_eval_case, replay_case
from app.eval.schemas import GoldenCase
from app.eval.scoring import score_citation_pass_rate, score_criterion_agreement, score_rfe_risk_precision


async def run(fixtures_dir: Path, run_drafting: bool, keep_cases: bool) -> None:
    fixture_paths = sorted(fixtures_dir.glob("*.json"))
    if not fixture_paths:
        print(f"No fixtures found in {fixtures_dir}")
        return

    for path in fixture_paths:
        fixture = GoldenCase.model_validate_json(path.read_text(encoding="utf-8"))
        print(f"\n=== {fixture.case_name} ===")
        result = await replay_case(fixture, run_drafting=run_drafting)

        agreement = score_criterion_agreement(fixture.known_outcome.criteria_verdicts, result["predicted_verdicts"])
        print(f"Criterion-verdict agreement: {agreement.agreement_rate:.0%} ({agreement.compared_count} compared)")
        for mismatch in agreement.mismatches:
            print(f"  mismatch: {mismatch}")

        rfe = score_rfe_risk_precision(fixture.known_outcome.rfe_objections_raised, result["predicted_risks"])
        print(f"RFE-risk precision: {rfe.precision:.0%}  recall: {rfe.recall:.0%}")

        if run_drafting:
            pass_rate = score_citation_pass_rate(result["verified_flags"])
            print(f"Citation verification pass rate: {pass_rate:.0%} ({len(result['verified_flags'])} citations)")

        if not keep_cases:
            await delete_eval_case(result["case_id"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay golden cases and score agreement with the real outcome.")
    parser.add_argument("--fixtures-dir", default=Path("eval_fixtures"), type=Path)
    parser.add_argument(
        "--run-drafting",
        action="store_true",
        help="Also run drafting+verification (more LLM calls) to score citation pass rate.",
    )
    parser.add_argument(
        "--keep-cases",
        action="store_true",
        help="Don't delete the replayed cases afterward (useful for manual inspection in the UI).",
    )
    args = parser.parse_args()
    asyncio.run(run(args.fixtures_dir, args.run_drafting, args.keep_cases))


if __name__ == "__main__":
    main()
