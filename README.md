# CleanUp

CleanUp helps people keep their machines and cloud storage in order:
organizing files and folders, offering backup mechanisms, suggesting how to
structure things better, and carrying out the fixes. Part of the **up**
ecosystem (walletup, sheetup, homeup, …): standalone apps that also plug
into the shared agent core in `upagent`.

## What the MVP does

Scan → review → apply, safely, on a local folder:

- **Scan**: point CleanUp at a folder (e.g. `~/Downloads`); it finds
  duplicates, huge files, stale files, loose-file clutter, and empty dirs.
- **Propose**: deterministic heuristics plus an optional LLM pass (your
  own Anthropic API key) turn findings into a reviewable move/archive plan.
- **Review**: approve or reject each proposal — nothing runs until you say so.
- **Apply**: approved changes execute with a journal; "deletes" only move
  files into `backups/<scan-id>/`, never off the disk.
- **Undo**: every apply batch can be reversed in one click.

## Running it

Prerequisites: Node 20+, pnpm.

```sh
pnpm install
cp .env.example .env       # add ANTHROPIC_API_KEY for LLM proposals (optional)
pnpm run db:push           # creates data/cleanup.db
pnpm run dev               # http://localhost:3000
```

Try it on a synthetic playground first: `npx tsx scripts/make-fixture.ts`
creates `scans/fixture/` with one of everything to scan.

Tests: `pnpm test` (vitest; executor and scanner run against real temp dirs).

## Safety model

- No hard deletes, ever — trash means "move to `backups/<scan-id>/`".
- Every filesystem change is journaled before it happens; undo replays the
  journal in reverse.
- Proposals resolving outside the scanned folder are rejected at apply
  time, whatever suggested them.
- Dangerous roots (`/`, `/System`, `/Library`, your home folder itself)
  are refused at scan time.

## HTTP API

The UI is a thin client over a localhost JSON API (the future integration
point for the `updiscord` bot):

| Endpoint | Purpose |
| --- | --- |
| `POST /api/scans` `{targetPath}` | start a scan |
| `GET /api/scans` / `GET /api/scans/:id` | list / detail with findings |
| `POST /api/scans/:id/plan` | generate proposals |
| `GET /api/scans/:id/proposals` | review list |
| `PATCH /api/proposals/:id` `{status}` | approve/reject one |
| `PATCH /api/proposals` `{ids, status}` | bulk approve/reject |
| `POST /api/scans/:id/apply` | execute approved proposals |
| `POST /api/scans/:id/undo` `{batchId?}` | reverse a batch (default: latest) |

## Stack

Next.js 16 + TypeScript, Prisma 7 on SQLite (better-sqlite3), vitest.
Pure-TS core (`src/core`: scanner, heuristics, planner, executor) with no
framework imports; `src/app` is UI plus thin API wrappers.
