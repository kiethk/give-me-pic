# give-me-pic — Copilot Instructions

## Always read the plan first

Before starting any task, always read `docs/plan.md` first to check the current
development phase, what has already been completed, and what decisions have
already been locked in. Do not rely on memory of a previous conversation — the
file is the single source of truth for project status.

If a task seems to conflict with the plan, or the plan looks outdated compared
to the current state of the code, **stop and ask the user before proceeding**.
Do not silently deviate from the plan or "fix" it without confirmation.

## Human-in-the-loop is mandatory

- Never commit or push without an explicit confirmation from the user in the
  current turn. See `.github/instructions/git-workflow.instructions.md` for
  the full rule and commit message format.
- Never edit `docs/plan.md` without first proposing the change in words and
  getting the user's confirmation. When approved, edit only the relevant
  section — do not rewrite the whole file.
- When a request is ambiguous or could be implemented multiple ways that
  affect architecture (not just style), ask before picking one.

## Scope discipline

Only implement what was explicitly asked for in the current task. If a task
naturally requires touching an adjacent file (e.g. a new Entity needs a
matching Flyway migration), that's expected — but do not proactively start
an unrelated module or feature "while you're at it" without asking first.

## Where the module-specific rules live

Detailed coding conventions for each concern are in `.github/instructions/`:

- `database-schema.instructions.md` — table/column design rules
- `spring-boot-module-structure.instructions.md` — package layout, naming
- `flyway-migration.instructions.md` — migration file rules
- `jwt-auth-cookie.instructions.md` — auth, security config, CORS
- `rag-pipeline.instructions.md` — OCR, chunking, embedding, retrieval
- `git-workflow.instructions.md` — commit/push rules

These are scoped by `applyTo` patterns and load automatically when relevant
files are touched. This file (`copilot-instructions.md`) always loads
regardless of what's being worked on.

## Progress tracking

After completing a unit of work, propose an update to the `## Completed` /
`## In Progress` sections of `docs/plan.md` as part of the same confirmation
step used for commits — don't let the plan silently fall out of sync with
what the code actually does.
