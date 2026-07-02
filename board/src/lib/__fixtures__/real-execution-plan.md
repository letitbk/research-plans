# Full Pipeline — Execution Plan v1

Component: `01-full-pipeline` · Master plan: [master-plan.md](../../master-plan.md) · Date: 2026-07-02

## Context

This plan covers the full analysis for the immigration attitudes project, from raw data to final tables.

## Scope decisions

| Dimension | Decision | Why |
|-----------|----------|-----|
| Missing values | Listwise deletion | Standard approach |
| Dependent variable | support | It is the outcome |
| Model | OLS regression | Appropriate for this data |
| Robustness | Simulation study | Good practice |

## Approach

1. Clean the ISSP data. 2. Produce descriptive statistics for all variables. 3. Run regression models of support on country and year. 4. Run a Monte Carlo simulation to assess robustness. 5. Export all tables and figures.

## Build steps

1. Load and clean data
2. Descriptives
3. Regressions
4. Simulation
5. Tables and figures

## Verification

Review the results to make sure they look reasonable.

## Out of scope

No additional analyses.

## Files to reuse

analyze.R
