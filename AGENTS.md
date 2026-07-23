# AGENTS.md

## Repository

Planboard is a Claude Code plugin published from `letitbk/planboard`.

The product name and current identifiers are `planboard` and `pb-*`. References
to `research-plans`, `rp-*`, and old environment variables may be intentional
compatibility code, migration fixtures, or historical documentation. Do not
remove them based on name alone.

## Working rules

Keep changes limited to the requested work. Preserve unrelated changes in a
dirty worktree. Stage files by explicit path.

Canonical plan versions and finalized result bundles are immutable. A change
must not weaken sign-off binding, stale-client checks, checksum validation, or
retry safety.

## Validation

Before completing a code change, run:

```sh
python3 -m pytest tests/ -q
(cd board && npm test && npx tsc --noEmit)
(cd skills/managing-planboard/assets/web-template && npm test)
```

If `board/src/` changes, run `cd board && npm run build`. Commit the regenerated
`skills/managing-planboard/assets/board-template.html`. Run the build again and
require a clean diff for that template.

## Regression coverage

When fixing an observed product bug or a failure in CI or a development
environment:

- Add or update an automated test that fails before the fix and passes afterward.
- Run that test through one of the existing required test jobs.
- If an automated test is not practical, explain why in the pull request.
- Do not present the fix as complete without a regression test or a specific
  explanation for the exception.

## Release policy

Every PR that changes shipped code or behavior is a release. Use a patch bump
by default. Use a minor bump for a larger feature.

Keep these versions identical:

- `.claude-plugin/plugin.json`
- `board/package.json`
- The root package fields in `board/package-lock.json`

Run `cd board && npm install --package-lock-only` after changing the version.
Add the new version as the first release entry in `CHANGELOG.md`.

Documentation-only, test-only, and maintenance-only PRs do not require a
version bump.

## Code Review Rules

- Flag changes that weaken immutable artifact handling, sign-off binding,
  content-hash checks, stale-client protection, or idempotent retries.
- Treat legacy `research-plans` and `rp-*` readers as compatibility behavior.
  Flag their removal unless the PR explicitly ends that compatibility.
- For board lifecycle changes, check persistent, sign-session, hosted, offline,
  and stale-tab paths. Do not assume one mode represents all modes.
- Treat reported model provenance as self-attested. Do not present it as
  confirmed runtime identity.
- Check that the pull request's regression coverage choice matches the change.
  Flag a failure fix that lacks a relevant automated test or a specific reason
  why a test is not practical.
