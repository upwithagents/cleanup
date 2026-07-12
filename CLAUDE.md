# CleanUp — File & Folder Organization Assistant

Working name **CleanUp**: file/folder organization app + agent expertise
pack for people who have trouble keeping their Mac/PC/cloud storage in
order. Scans and inventories folders, suggests better organization, offers
backup mechanisms, and applies the fixes. Standalone app that can also
serve as an extension to the `upagent` core.

## Ground rules

- **Independence from any employer.** This project stays fully separate
  from any employer's accounts, infra, or tooling.
- **PRIVACY (strict):** the owner's real machine is the first tryout
  target. Anything identifying it — real directory listings, scan results,
  file inventories, backup archives — is gitignored. Only code, schema,
  docs, and anonymized example data get committed.
- **SAFETY (strict):** never delete or move user files without a backup
  path and explicit confirmation. Destructive operations must be
  reversible (backup/undo) by design.
- **GitHub:** `github.com/upwithagents/cleanup`. Contributions push under
  the repo-local `upwithagents` identity (repo-local git config + its own
  SSH alias `github-upwithagents`), never a contributor's personal or
  employer GitHub identity.

## Conventions

- Branches: `up/<max-3-word-kebab>` (project convention — not the owner's
  personal `lm/` prefix, since this repo may have other contributors one
  day). Large implementation work goes through branches even though this
  repo allows direct commits to `main`.
- Stack: Next.js 16 + TypeScript + Prisma 7/SQLite + vitest (pnpm).
  Layering is strict: `src/core` is pure TS (scanner, heuristics, planner,
  executor) and must not import from `next`/`react`; `src/app` holds UI and
  thin API routes. The localhost HTTP API is updiscord's integration
  contract — keep it stable.
- Run: `pnpm install && pnpm run db:push && pnpm run dev`. Tests:
  `pnpm test`. Fixture playground: `npx tsx scripts/make-fixture.ts`.
- Plans live in the workspace-level `1_CLAUDE_WORKFLOW/plans/cleanup/`,
  not in this repo.
