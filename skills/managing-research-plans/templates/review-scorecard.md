# Review — <Component> v<N>

Plan: [v<N>.md](../execution/<NN-slug>/v<N>.md) · Rubric: plan-rubric.md (v0.3) · Date: <YYYY-MM-DD>
Provenance: **<prospective | retrospective — covers \<range\>>** <!-- from the plan's Provenance header; stated in the verdict so a retrospective plan is never read as prospective -->
Threshold: **PASS (9/9)** <!-- or: **UNDETERMINED — T8 unknown** or: **FAIL — T1, T4** -->
Score: **<raw> / <applicable max> (<pct>%)** — <band>
<!-- Omit the Score line entirely on FAIL or UNDETERMINED. -->

## Threshold

| ID | Check | Result | Note |
|----|-------|--------|------|
| T1 | Goal + success criteria | pass | "<evidence quote>" |
| T8 | Prospective | N/A | unexecuted — commit before executing |

<On FAIL, add a verdict paragraph per failed check using the rubric's near-miss language, plus the nearest archetype (to-do list / prompt log / frozen preregistration / methods section). On UNDETERMINED, name the missing evidence.>

## Grading items

<Only when the threshold PASSES. One row per item, G1–G8. The prose table and the JSON block below MUST agree — the board renders the JSON.>

| # | Item | Score | Evidence | Justification |
|---|------|-------|----------|---------------|
| G1 | Decisions specific, reasoned, grounded | <0/1/2/N-A/unknown> | <quote or artifact> | <one line> |

## Top revisions

1. <the three concrete revisions that would most improve the plan — on FAIL, this is the fix list>

## Split assessment

<"Right-sized" with a reason, or the concrete proposed split per split-criteria.md. Mandatory in every review, including threshold failures.>

## Data

```json board-scorecard
{"schemaVersion": 2, "component": "<NN-slug>", "planVersion": 0,
 "planPath": "plans/execution/<NN-slug>/v<N>.md", "rubricVersion": "0.2", "date": "<YYYY-MM-DD>",
 "threshold": {"verdict": "pass",
   "checks": [
     {"id": "T1", "name": "Goal + success criteria", "result": "pass", "evidence": "<quote>", "note": "<one line>"},
     {"id": "T8", "name": "Prospective", "result": "na", "note": "unexecuted"}
   ],
   "failures": []},
 "items": [
   {"id": "G1", "name": "Decisions specific, reasoned, grounded", "score": 2, "evidence": "<quote>", "justification": "<one line>"},
   {"id": "G4", "name": "Revisions are substantive amendments", "score": null, "status": "N/A", "justification": "unexecuted v1"}
 ],
 "raw": 0, "applicableMax": 0, "percent": 0, "band": "<revise before executing|execute and address flags|strong>",
 "excluded": [{"id": "G4", "why": "N/A — unexecuted v1"}],
 "topRevisions": ["<revision 1>", "<revision 2>", "<revision 3>"],
 "split": {"verdict": "<right-sized|split required>", "detail": "<one paragraph>"}}
```

<On FAIL or UNDETERMINED the fence uses: "threshold": {"verdict": "fail" | "undetermined", "checks": [...], "failures": [{"id": "T1", "verdict": "<near-miss language>", "fix": "<concrete fix>"}]}, "items": [], "raw": null, "applicableMax": null, "percent": null, "band": "not a plan" (fail) or "undetermined". Check results use "pass" | "fail" | "na" | "unknown".>
