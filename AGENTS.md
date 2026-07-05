# AGENTS.md

Muse is a web project using Bun, Next.js, TypeScript, Tailwind CSS v4,
shadcn/ui, SQLite, and the Vercel AI SDK. This harness keeps agent work
restartable, scoped, and verifiable.

## Startup Workflow

Before writing code:

1. **Confirm working directory** with `pwd`
2. **Read this file** completely
3. **Read design placeholder** in `DESIGN.md` before changing UI, layout, or copy tone
4. **Read project docs if present** (`README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, or equivalent)
5. **Run `./init.sh`** to verify environment is healthy
6. **Read `feature_list.json`** to see current feature state
7. **Review recent commits** with `git log --oneline -5`

If baseline verification is failing, repair that first before adding new scope.

## Working Rules

- **One feature at a time**: Pick exactly one unfinished feature from `feature_list.json`
- **Verification required**: Don't claim done without running verification commands
- **Update artifacts**: Before ending session, update `progress.md` and `feature_list.json`
- **Stay in scope**: Don't modify files unrelated to the current feature
- **Preserve stack choices**: Use Bun scripts, Next.js App Router conventions, TypeScript, Tailwind CSS v4 tokens, shadcn/ui components, SQLite persistence, and Vercel AI SDK patterns unless the user approves a change
- **Design source of truth**: `DESIGN.md` starts as a placeholder; fill it during the first concrete UI task, then treat it as the visual source of truth
- **Leave clean state**: Next session must be able to run `./init.sh` immediately

## Required Artifacts

- `feature_list.json` — Feature state tracker (source of truth)
- `progress.md` — Session continuity log
- `init.sh` — Standard startup and verification path
- `session-handoff.md` — Optional, for larger sessions
- `DESIGN.md` — Placeholder for visual identity and design tokens; fill on first concrete UI task

## Definition of Done

A feature is done only when ALL of the following are true:

- [ ] Target behavior is implemented
- [ ] Required verification actually ran (tests / lint / type-check)
- [ ] UI changes match `DESIGN.md` and shadcn/ui accessibility expectations
- [ ] Evidence recorded in `feature_list.json` or `progress.md`
- [ ] Repository remains restartable from standard startup path

## End of Session

Before ending a session:

1. Update `progress.md` with current state
2. Update `feature_list.json` with new feature status
3. Record any unresolved risks or blockers
4. Commit with descriptive message once work is in safe state
5. Leave repo clean enough for next session to run `./init.sh` immediately

## Verification Commands

```bash
# Full verification (recommended)
./init.sh
```

Required checks:
- `bun install`
- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `npx @google/design.md lint DESIGN.md`

## Escalation

If you encounter:
- **Architecture decisions**: Consult project architecture docs if present, otherwise ask user
- **Unclear requirements**: Check product/requirements docs if present, otherwise ask user
- **Repeated test failures**: Update progress, flag for human review
- **Scope ambiguity**: Re-read `feature_list.json` for definition of done
