# Contributing

## First-time setup

```bash
git clone git@github.com:kang360970725/bluecat-store-system-v2.git
cd bluecat-store-system-v2
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm prisma:generate
```

Configure local MySQL and Redis in `.env`. Production credentials and datasets are not distributed through Git.

Before changing code, read `AGENTS.md`, `docs/CURRENT_STATE.md`, and `docs/DECISIONS.md`.

## Branch workflow

```bash
git switch dev
git pull --ff-only
git switch -c feature/short-description
```

`dev` is the persistent collaboration and integration branch. The collaborating developer may continue routine iterations on `dev`; use `feature/`, `fix/`, `docs/`, or `codex/` for isolated, risky, or independently reviewed work. Keep one business change per branch and pull request when using a short-lived branch.

Before opening a PR:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:v2-regression
```

Do not push directly to `main`. Promotion from `dev` or a short-lived branch to `main` is performed only after owner instruction and review. Resolve conflicts before requesting promotion.

## Database and production

- Create and commit a Prisma migration for schema changes.
- Never commit database dumps or real employee/payroll data.
- Never deploy or modify production merely because code was merged.
- Production deployment and historical data correction require explicit authorization, backup verification, and a rollback plan.
- A merge instruction and a production-deployment instruction are separate approvals.

## Keeping Codex sessions aligned

Codex sessions do not share conversation history. The repository is the shared memory:

- update `docs/CURRENT_STATE.md` before handing work off;
- record confirmed or changed rules in `docs/DECISIONS.md`;
- include acceptance criteria and verification in the PR;
- commit all required migrations, scripts, types, and documentation together.
