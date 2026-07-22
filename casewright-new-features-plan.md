# Casewright — New Features Plan
### GenAI capabilities + eye-catching differentiators

Every feature below is scored on three axes: **wow** (demo/sales impact), **moat** (how hard to copy), and **effort**. Features are grouped so you can pick a slate rather than build all of them. The discipline throughout: nothing that undermines the trust thesis — GenAI proposes, the attorney disposes, and every output stays traceable.

---

## Part A — GenAI features that deepen the core product

These extend the reasoning engine you already have. They're the ones that actually move win-rates and retention.

### A1. RFE Risk Radar (predictive) ★ wow · ★★ moat · ●● effort
A live, per-criterion probability that *this* filing draws an RFE, shown as a radar/heatmap on the case before filing. Built from the eligibility assessments + the strategy memo's risk flags + retrieved patterns of what 2026-era officers actually challenge. Each risk is clickable → "why" (the specific weakness) → "fix" (the exact evidence or argument that lowers it), with the number updating as the attorney closes gaps.
- **Why it lands**: turns your risk analysis from prose into an instrument partners watch move. It's the single most demo-able screen you can build.
- **Data**: you already generate `rfe_risks`; this is surfacing + calibration + a mitigation loop.
- **Guardrail**: label it "modeled risk, not a guarantee" — never a false-precision percentage without a confidence band.

### A2. "Strengthen this case" copilot ★★ wow · ★★ moat · ●● effort
A standing panel that answers "what would most improve this petition right now?" — ranked, concrete, obtainable actions ("A letter from Dr. X quantifying adoption of the beneficiary's method would move Original Contributions from partial→met"). It reasons over gaps across all criteria and prioritizes by marginal impact on the overall case, not per-criterion in isolation.
- **Why it lands**: this is the paralegal's daily question, answered instantly. Directly attacks the cap-season capacity pain.
- **Moat**: requires the whole persistent case state + criterion reasoning — a wrapper can't do it.

### A3. Evidence-to-criterion auto-mapper with drag override ★ wow · ★ moat · ● effort
When documents land, the engine proposes which criteria each exhibit supports, drawn as connection lines between an Evidence column and a Criteria column. Attorney drags to re-map; the mapping feeds drafting. Visual, fast, and it makes the machine's reasoning inspectable.
- **Why it lands**: "watch it connect the evidence" is a great 20-second demo moment.

### A4. Grounded Q&A over the case file ★★ wow · ★ moat · ●● effort
A chat box scoped to one case: "Does the record show international recognition?" / "Summarize every mention of the beneficiary's patent." Answers are retrieval-grounded over the extracted facts + documents, every claim carrying a CitationChip to the source page. Refuses to answer beyond the record.
- **Why it lands**: it's the ChatGPT experience partners already reach for — but grounded, cited, and case-scoped, which is exactly the gap you're selling against.
- **Guardrail**: closed-world — "not found in this record" is a valid, frequent answer.

### A5. Recommendation-letter drafting studio ★★ wow · ★★ moat · ●●● effort
Generate tailored expert-letter drafts per recommender, each argued from that person's specific relationship to the beneficiary and mapped to target criteria — with a variance check so eight letters don't read identically (a known RFE trigger). Includes a per-letter "signer packet" the attorney sends out.
- **Why it lands**: letters are the most time-consuming, most templated, most RFE-prone artifact. High willingness to pay.
- **Moat**: the anti-repetition variance layer is genuinely hard and genuinely valuable.

### A6. Officer-lens adversarial review ★★ wow · ★★★ moat · ●● effort
A one-click "read this like a skeptical USCIS officer" pass that returns the objections a real adjudicator would raise on the current draft, ranked by likelihood — then offers to pre-empt each in the text. It's your verification layer turned into an offensive weapon.
- **Why it lands**: uniquely aligned to the fear partners actually have. Nothing generic-SaaS about it.
- **Moat**: depends on the same officer-framed reasoning that's core IP.

### A7. Precedent memory (firm-private compounding) ★ wow · ★★★ moat · ●●● effort
Every won case a firm files becomes retrievable precedent for their future cases — "here's how we successfully argued Original Contributions for a comp-bio researcher before." Private per firm; it makes the product *better the more they use it*.
- **Why it lands**: the retention story. Switching cost compounds monthly.
- **Moat**: the deepest one you have — a competitor starts every firm from zero.

---

## Part B — Eye-catching features (demo magnets, broad appeal)

Lower-moat but high visual/emotional impact — the things that make the product *feel* modern and alive.

### B1. Live agent theater ★★★ wow · ● effort
The PipelineTracker, elevated: when a run executes, an optional expanded view streams what each agent is doing in plain language ("Assessing Awards criterion against 8 CFR 204.5(h)(3)(i)… found 2 supporting exhibits… verdict: partial"), node by node, with the criterion cards materializing live. It's the "watching it think" moment that sells agentic products.
- Cheap because the data already flows; it's a presentation layer over the progress stream.

### B2. Case Health Score ★★ wow · ● effort
A single 0–100 composite (criteria met vs required, evidence strength, RFE risk, verification pass rate) with a big animated dial on the case Overview and Dashboard card. Partners love a number that goes up when they do good work. Pair with a sparkline of how it moved this week.
- **Guardrail**: make the composition transparent (click → breakdown) so it's not a black-box vanity metric.

### B3. Command palette (⌘K) ★★ wow · ● effort
Raycast/Linear-style: jump to any case, start a run, upload to a case, search the record, trigger any gate — all from the keyboard. Signals "serious professional tool" instantly and speeds power users.

### B4. Deadline command center ★★ wow · ●● effort
A calendar/timeline view of every RFE clock and filing deadline across the firm, color-urgency-coded, with the DeadlineRings you already built. Cap-season triage in one screen. This is an ops feature partners will pin as their home tab.

### B5. Filing-packet preview & export ★ wow · ●● effort
Assemble the approved drafts + exhibit index into a formatted, paginated petition packet preview (with auto-generated exhibit list and table of contents) exportable to Word/PDF. The satisfying "it's actually done" artifact at the end of the flow.

### B6. Weekly firm digest ★ wow · ● effort
An auto-generated Monday brief: cases awaiting review, deadlines this week, health-score movements, RFE risks that appeared. Delivered in-app and optionally emailed. Drives re-engagement without nagging.

### B7. Side-by-side draft diff on revision ★ wow · ● effort
When a section regenerates after attorney feedback, show a clean before/after diff highlighting exactly what changed — so the attorney verifies the fix in seconds instead of re-reading. Makes the revision loop feel trustworthy and fast.

### B8. Confidence-aware reading mode ★ wow · ● effort
A toggle that heat-tints draft sentences by the model's confidence and citation strength — high-confidence prose recedes, weak/uncited spans glow amber. Directs the attorney's scarce attention to exactly where it's needed. Visually striking and genuinely useful.

---

## Part C — Trust & control layer (unlocks enterprise, and it's differentiated)

These aren't flashy but they're what converts a pilot into a signed firm, and several double as demo credibility.

### C1. Explainability drawer — "why did the AI say this?"
Any verdict, risk, or drafted claim exposes a drawer: the retrieved authorities used, the facts relied on, the confidence, and the reasoning trace. This is the answer to every skeptical partner's first question and a real trust differentiator.

### C2. Human-authority controls
Per-firm policy: which steps *require* attorney sign-off, confidence thresholds that force review, criteria the firm never wants auto-argued. The firm sets the leash length. Sells directly to the "I don't trust black boxes" persona.

### C3. Model transparency & citations audit
A per-case report: every authority cited, every citation's verification status, which model produced each section, token/cost accounting. Malpractice-defensible and procurement-friendly.

### C4. Redaction & PII guard
Auto-detect and optionally redact sensitive PII in documents before processing; configurable retention. A compliance checkbox that unblocks larger firms.

---

## Recommended build slate

If you want a focused, high-impact set rather than everything:

**Tier 1 — build first (max wow-per-effort, reinforces the thesis):**
- B1 Live agent theater (cheap, huge demo lift)
- A1 RFE Risk Radar (signature screen)
- B2 Case Health Score (sticky, cheap)
- A4 Grounded case Q&A (the "grounded ChatGPT" wedge)
- B3 Command palette (credibility signal, cheap)

**Tier 2 — the moat-deepeners (build once Tier 1 proves adoption):**
- A6 Officer-lens adversarial review
- A5 Recommendation-letter studio
- A7 Precedent memory
- C1 Explainability drawer

**Tier 3 — enterprise unlock (when you're closing bigger firms):**
- B4 Deadline command center
- C2 Human-authority controls
- C3 Citations audit · C4 PII guard
- B5 Filing-packet export

---

## Cross-cutting principles

1. **GenAI proposes, attorney disposes.** Every generative feature ends in a human decision surface. No feature auto-files anything.
2. **Grounded or silent.** Anything that states a fact cites a source or says "not in the record." No ungrounded generation reaches a partner.
3. **Confidence is always visible.** Every AI output carries calibrated confidence; low confidence is surfaced, never hidden.
4. **Every wow feature has a "why" drawer.** Flash without explainability erodes trust in a legal tool; the two ship together.
5. **Reuse the state, don't rebuild it.** Most of these are new *surfaces* over the persistent case state and reasoning you already have — which is why they're cheap for you and expensive for a wrapper competitor to copy.

---

*Pick a slate and I can turn any of these into a detailed feature spec — data model additions, agent/graph changes, API, and UI components — in the same format as the earlier plans.*
