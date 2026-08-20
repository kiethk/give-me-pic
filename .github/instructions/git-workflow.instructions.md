---
name: git-workflow
description: Use when AI has just finished a code change (a feature, a fix, a refactor) and needs to decide whether to commit/push. Also use when writing a commit message or when a change to the plan/architecture doc is needed.
---

# Git Workflow — Human In The Loop

## Core rule

AI **never commits or pushes on its own** without an explicit confirmation from the user in the current turn. This is a hard rule, no exceptions, even when:
- The change looks small ("just one line")
- Tests pass and the build succeeds
- The user confirmed a SIMILAR change in a previous turn (every commit needs its own confirmation)

## When AI should propose a commit

After completing **one complete unit of functionality** (not a single file, not a one-line fix), AI stops and asks using this pattern:

```
Done: [short description of the feature]
Changed files: [list]
Tests run: [pass/fail, count]

Do you want me to commit this?
```

**Do not ask to commit when:**
- The feature is incomplete (e.g. only the Entity was written, no Controller/Service yet)
- Build/tests are currently failing
- The user is mid-debugging (the issue hasn't been confirmed fixed yet)

## Commit message format

Use Conventional Commits:

```
<type>(<module scope>): <short description>
```

Common `type` values for this project:
- `feat`: new functionality (e.g. `feat(auth): add register/login endpoints`)
- `fix`: bug fix (e.g. `fix(auth): fix 401 caused by JwtAuthFilter blocking public endpoints`)
- `docs`: documentation/markdown only, no runtime code touched
- `refactor`: restructure code without changing behavior
- `chore`: housekeeping (dependency bumps, formatting...)

Scope should match the module name: `auth`, `media`, `subject`, `rag`, `db` (for migrations), `infra` (docker-compose, CI/CD).

**One commit = one logical unit of change.** Do not bundle unrelated features into a single commit (e.g. don't mix "add JWT" and "fix CORS" into one commit unless one doesn't work without the other).

## Before pushing

1. Confirm the commit landed on the intended branch — ask if unsure which branch is currently checked out
2. Even when working directly on `main`/`master` (solo project, no PR workflow yet), still ask for a separate confirmation for the **push** action — committing does not imply permission to push
3. Never `force push` unless the user explicitly types "force push" and confirms they understand the risk

## When a change to the plan is needed (docs/plan.md or other locked-in architecture decisions)

The plan file isn't code, but it follows the same principle: AI **proposes the change in words first**, stating the reason and which part of the existing plan is affected. Only after the user confirms does AI edit the file — and it should edit only the relevant section (not rewrite the whole file), the same way code changes are applied (clear diff, no silent overwrite).

## Sample confirmation prompts (reference only, not mandatory wording)

- "I've finished [X], want me to commit?"
- "Proposed commit message: `feat(auth): ...` — confirm and I'll commit?"
- "Committed. Want me to push to remote as well?"
