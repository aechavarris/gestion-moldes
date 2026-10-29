# CLAUDE.md

Guidance for Claude (or any agent) working on this repository.

## People

- The owners write in **Spanish**: answer in Spanish; keep code, comments, commits and PRs in English. The UI is Spanish only.
- They work on **Windows** (PowerShell, Docker Desktop): give PowerShell commands.
- Never ask for secrets in the chat (`POSTGRES_PASSWORD`, `TS_AUTHKEY`, user passwords); they go in `.env` or the app.
- Workflow: branch, PR against `main`, CI green, squash-merge.

## Product

Private, mobile-first tool for an injection-moulding shop: customers (`Client`) and their technical sheets (`TechSheet`:
part name, material, notes, the numeric settings listed in `src/lib/sheetFields.ts`, ordered `BarrelZone` temperatures and
`Photo`s). Labels, units and grouping of the numeric settings come from that catalog: adding one is a column in the schema
plus a catalog entry, never a hand-written input. Two or three coworkers, each with a `User` account; every user can do
everything, including managing users. It is **not public**: it runs on a
friend's home PC in Docker and is reachable only through Tailscale (`tailscale serve`, never Funnel). Keep it that way:
do not publish ports in `docker-compose.prod.yml` and do not add `AllowFunnel` to `deploy/tailscale-serve.json`.

## Architecture

Single Next.js 16 app (App Router) with server actions, no separate API.

```
src/app             pages: / (clients), /clients/[id], /clients/[id]/edit, /clients/[id]/sheets/new,
                    /sheets/[id], /sheets/[id]/edit, /search, /users, /login (first run: create first user)
src/app/photos/[id] authenticated photo route (?thumb for the thumbnail)
src/lib/actions.ts  all mutations (server actions), each starting with requireUser()
src/lib/auth.ts     scrypt passwords, Session rows (cookie holds a random token, DB its SHA-256), login lockout
src/lib/sheetFields catalog of sheet settings (label, unit, group)
src/lib/validation  zod schemas; form parsing (barrel zones are parallel fields, zones without temperature dropped)
src/proxy.ts        redirects to /login without a session cookie (presence only; pages validate it)
prisma/             schema + migrations; client generated to src/generated (gitignored)
```

## Commands

```powershell
docker compose up -d postgres   # dev DB on localhost:5433
pnpm install; pnpm db:deploy; pnpm dev
pnpm typecheck; pnpm build      # what CI runs
```

- `prisma migrate dev` is interactive. In non-interactive shells write the SQL by hand under
  `prisma/migrations/<timestamp>_<name>/` (or `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`),
  apply with `pnpm db:deploy`, and check the diff is then empty. Run `pnpm db:generate` after schema changes.
- Next.js 16 differs from older versions (async `params`/`searchParams`/`cookies()`, `proxy.ts`). Read the docs in
  `node_modules/next/dist/docs/` before writing web code.
- Tailwind 4: shared classes (`btn-primary`, `card`, `input`…) are `@utility` blocks in `globals.css`; plain CSS classes
  cannot be used with `@apply`.
- Check UI changes with Playwright (headless Chromium, a phone viewport, light and dark).
- Photos are resized and re-encoded to JPEG on the phone (`PhotoUploader`, canvas) and stored as `bytea`, so the
  `pg_dump` backup covers them; the server only accepts JPEG within size limits. Server actions allow 4 MB bodies
  (`next.config.ts`).

## Deployment

`scripts/setup-host.ps1` (Windows PowerShell 5.1, Spanish messages, UTF-8 with BOM so 5.1 reads the accents) prepares
the host PC end to end and is idempotent: WSL 2, winget packages, docker-users, Docker Desktop at sign-in, GitHub login,
a private copy of the repo in the host's own account (from a `git bundle`, ZIP, folder or URL), `<base>\app\.env`, a
self-hosted runner (label `gestion-moldes`) started by a scheduled task at sign-in (not a service: Docker Desktop lives in
the user session), repository variables `DEPLOY_TARGET=self-hosted` + `DEPLOY_DIR`, first deploy and a daily backup task.
`.github/workflows/deploy.yml` runs after CI succeeds on main, only where `DEPLOY_TARGET` is set: it copies the compose
file and `deploy/` into `DEPLOY_DIR` and builds from the checkout via `BUILD_CONTEXT`, recreating Tailscale when its serve
config changed. CI parses every `.ps1` on `windows-latest` because nothing else can run them before the host does.

Windows PowerShell 5.1 pitfalls already handled (do not reintroduce): redirecting a native command's stderr
(`2>$null`, `*>$null`) under `$ErrorActionPreference = 'Stop'` throws even on success (use `Test-Native` /
`Get-NativeOutput`; Actions' `powershell` steps run with `stop` too, so deploy steps reset it and check `$LASTEXITCODE`);
inner double quotes in native arguments are dropped (no `--jq` string comparisons: filter with `ConvertFrom-Json`);
`Add-Content -Encoding ascii` for `$GITHUB_ENV` (UTF-8 adds a BOM); `docker compose cp` destinations must be relative
(`C:\...` reads as a container named `C`); localized group names (use SIDs with `icacls`); `"$name:"` in a string is a
scope-qualified variable and breaks parsing (write `"$($name):"`).

## Conventions

TypeScript strict; validate all input with zod; JSDoc comments that explain *why*; ~130 columns, no Prettier.
Commits: imperative subject, body explaining why. Never commit `.env` or `next-env.d.ts`.
