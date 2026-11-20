# BlueCat Store System Collaboration Contract

This file is the repository-wide instruction source for Codex and human contributors.

## Start every task

1. Read `README.md`, `docs/CURRENT_STATE.md`, and `docs/DECISIONS.md`.
2. Run `git status --short --branch`. Never discard, overwrite, or clean changes you did not create.
3. Pull the latest `main`, then work on a short-lived branch named `feature/*`, `fix/*`, `docs/*`, or `codex/*`.
4. Search for existing implementations and business rules before adding new logic.

## Repository map

- `apps/web`: Vue 3 frontend.
- `apps/server`: NestJS API and business modules.
- `prisma`: schema and ordered database migrations.
- `packages/shared`: shared types and constants.
- Data collection code is not part of this repository. The independently deployed `DATAN-platform` repository is accessed only through the versioned BlueCat Bridge contract.
- `scripts`: deployment, database synchronization, and operational scripts.
- `docs`: architecture, decisions, current state, deployment, and historical records.

## Sources of truth

- Current implementation status and known risks: `docs/CURRENT_STATE.md`.
- Confirmed product and business rules: `docs/DECISIONS.md`.
- Database structure: `prisma/schema.prisma` and committed migrations.
- Executable behavior: current code and regression checks.
- Historical documents are evidence only. If they conflict with the files above, do not silently choose one; report the conflict and update the current source of truth after confirmation.

## Safety boundaries

- Never commit `.env`, credentials, cookies, tokens, private keys, production dumps, or employee/payroll exports.
- Never expose default or production passwords in documentation, logs, fixtures, screenshots, or PR descriptions.
- Do not change confirmed payroll formulas, cost attribution, historical financial records, attendance thresholds, or crawler classification rules without explicit user confirmation and an entry in `docs/DECISIONS.md`.
- Do not run production deployment, production migrations, destructive database commands, backfills, or historical corrections unless the user explicitly asks for that exact action.
- Before any approved production data or schema change, create/verify a recoverable backup and state the rollback plan.
- Closed stores must remain excluded where the product rules require it. Do not hard-code one-store fixes; correct shared rules and preserve auditability.
- Raw crawler/source data is append-only or versioned. Derived records must retain traceability to source records and rule versions.
- Do not add crawler implementations, credentials, sessions, or the collector database to this repository. Integrate through the versioned BlueCat Bridge contract documented in `docs/data-collection-service-boundary.md`.
- Do not add `DATAN-platform` as a Git submodule, subtree, vendored directory, deployment directory, package dependency, or runtime checkout. The two repositories must remain independently cloned, built, deployed, and rolled back.

## Implementation rules

- Preserve module boundaries and existing UI conventions.
- Use Prisma migrations for schema changes; do not use `db push` against production.
- Keep API contracts, shared types, frontend behavior, permissions, and migrations aligned.
- Add or update regression coverage for bug fixes and financial calculations.
- Avoid unrelated refactors in the same change.
- Update `docs/CURRENT_STATE.md` when status, known issues, deployment state, or next steps change.
- Update `docs/DECISIONS.md` when a product/business rule is confirmed or superseded.

## Verification

Run the checks relevant to the change. Before a PR is ready, the expected baseline is:

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm lint
pnpm typecheck
pnpm build
pnpm test:v2-regression
```

If a check cannot run, record the exact reason and the remaining risk in the PR. Never describe unrun checks as passing.

## Git and review

- Do not force-push or delete `main`.
- `dev` is the persistent collaboration and integration branch. The collaborating developer may use `dev` for ongoing iterations; short-lived `feature/*` and `fix/*` branches remain preferred for isolated or risky changes.
- Do not commit directly to `main`. Promotion from `dev` (or an approved short-lived branch) to `main` requires a reviewed pull request and the owner's explicit merge instruction.
- Merging to `main` never authorizes production deployment. Production deployment requires a separate explicit instruction from the owner.
- Pull requests must explain scope, business impact, database impact, verification, and rollback considerations.
- At least one other developer reviews changes before merge.
- Payroll, permissions, database migrations, deployment scripts, production corrections, and crawler accounting rules require owner review.
- Rebase or merge the latest `main` before final verification when the branch has diverged.
