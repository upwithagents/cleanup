<img src="docs/icon.svg" width="56" align="left" alt="" />

# CleanUp

Keeps machines and cloud storage in order: finds duplicates, huge/stale
files, and clutter, then proposes and applies fixes safely. Part of the
**up** ecosystem (walletup, sheetup, homeup, …).

<br clear="left"/>

## What it does

Scan → review → apply, safely, on a local folder:

- **Scan** a folder for duplicates, huge files, stale files, and clutter.
- **Propose** a move/archive plan (deterministic heuristics + optional AI).
- **Review** and approve/reject each proposal — nothing runs unapproved.
- **Apply**, journaled; "delete" only moves files to `backups/<scan-id>/`.
- **Undo** any apply batch in one click.

A thin UI over a localhost JSON API (the future `updiscord` integration
point) — see `src/app/api/`.

## Running it

```sh
pnpm install
cp .env.example .env       # add ANTHROPIC_API_KEY for LLM proposals (optional)
pnpm run db:push
pnpm run dev               # http://localhost:3000
```

Try it on a synthetic playground: `npx tsx scripts/make-fixture.ts`.
Tests: `pnpm test`.

## Stack

Next.js 16 + TypeScript, Prisma 7 on SQLite, vitest.
