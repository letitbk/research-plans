# research-plans

A Claude Code plugin for plan-based research workflows in the social sciences.

The idea is simple. A research project keeps two kinds of plans. A **master plan** is a lightweight roadmap: what the components of the project are, what state each one is in, and where its plan lives. An **execution plan** is a focused, written plan for one component (data cleaning, one analysis, a simulation), co-authored with the AI, signed by the researcher, and revised in tracked versions when execution teaches you something. A separate **decision log** records researcher and AI decisions as they happen. The AI carries the bookkeeping so the researcher can think about the research.

This turns AI assistance into something inspectable. The plan says what the work will do, why, and how you will judge whether it succeeded. The version history shows how your thinking changed. The log shows who decided what. A coauthor or reviewer can read all three.

## Install

In Claude Code:

```
/plugin marketplace add letitbk/research-plans
/plugin install research-plans@research-plans
```

Then restart Claude Code. See [QUICKSTART.md](QUICKSTART.md) for a walkthrough.

## Commands

| Command | What it does |
|---------|--------------|
| `/research-plans:init` | Opt a project in. Interview, seed the components list, create the artifacts. |
| `/research-plans:plan` | Scope the next component and co-author its execution plan. |
| `/research-plans:sync` | Post-execution checkpoint. Update the tracker, catch unlogged decisions, version the plan if execution deviated. |
| `/research-plans:review` | Score a plan against the quality rubric, with a split assessment. |
| `/research-plans:status` | Show the tracker and flag drift. |

Everything is opt-in. The plugin does nothing in projects you have not initialized.

## What it creates in your project

```
plans/
├── master-plan.md              roadmap + components tracker
├── decision-log.md             append-only, timestamped
└── execution/
    └── 01-data-cleaning/
        ├── v1.md               the signed plan
        └── v2.md               a revision; v1 is never edited
```

Plus a short marked section in your project's `CLAUDE.md` so every future session follows the conventions.

## Principles

- Plans are written before the work and govern it. They are not preregistrations; they are designed to be revised openly, with each version kept.
- Plan versions are immutable. Revisions are new files that say what changed and why.
- The decision log is written as decisions happen, never backfilled.
- The researcher decides and signs. The AI asks, drafts, and keeps the books.

The workflow comes out of a methods paper on plan-based human-AI research partnerships (reference to follow). The quality rubric bundled with the plugin (`skills/managing-research-plans/references/plan-rubric.md`) is a working draft.

## License

MIT
