# Mysorat — Operational Runbook for Claude Code Sessions

Read this before touching anything in this repo. It exists because two straight days were lost to the same three mistakes repeating.

## Deployment topology
- Backend: Render (auto-deploys from `main`) — https://mysorat-yourservice.onrender.com
- Frontend: Vercel (auto-deploys from `main`) — mysorat-yourservice-frontend.vercel.app
- Database: Postgres on Render. Migrations only actually apply when someone hits `/api/bootstrap` — there is no CI step that runs `prisma migrate deploy` automatically.
- GitHub: `hezmai039-boop/Mysorat-yourservice`, branch `main` is the only branch that matters.

## Claude Code sessions have READ-ONLY access to this repo
`git push` and the GitHub API's write endpoints both return `403 Resource not accessible by integration`. This is not fixable from inside a session. Every fix MUST be applied by the human, manually, through GitHub's web UI. Plan accordingly:

1. Before proposing any fix, fetch the CURRENT real file from GitHub yourself. Never assume the local sandbox checkout matches what's actually deployed — it usually doesn't.
2. Make the edit locally, review it character-by-character (or compile it) before handing anything over.
3. Give the user the COMPLETE file content to paste. **Never** give "find this line and replace it" instructions — every partial/line-level edit attempted in GitHub's web editor this project has introduced a new bug (a deleted line, a duplicated line, a missing comma), each costing a full extra round trip. Full-file paste only, every time.
4. Tell the user exactly: open `https://github.com/hezmai039-boop/Mysorat-yourservice/edit/main/<path>`, Ctrl+A, delete, paste, commit directly to `main`.
5. The moment the user says they committed, re-fetch the file from GitHub yourself and compare it against what you intended, BEFORE telling them to wait for a deploy. Catch transcription mistakes here, not after a failed Render build.
6. Only then check deploy status (ask the user for the Render "Deploys" tab, or for Render logs if it failed).

**Never** suggest uploading a zip or a folder via "Add file → Upload files" for a fix that touches existing files. Every previous attempt at this landed the files as a new decoy top-level folder (`delivery/`, `dbfix/`, `redesign/`) sitting next to the real code instead of overwriting it, and the mistake went undetected for an entire session because the JSON response silently kept using the old code.

## Known landmine: silently-missing Prisma migrations
Twice now, an entire migration folder existed in local history but was never actually part of what got uploaded to GitHub, so `prisma migrate deploy` never ran its SQL. Production then 500s with `PrismaClientKnownRequestError P2022: column does not exist`, which the frontend's generic error handling displays as "العملية غير موجودة" (operation not found) — a completely misleading symptom for a schema-drift bug.

Confirmed missing at one point or another: `20260717051538_add_favorites_and_featured_feedback` and `20260719091203_add_cancellation_and_terms_consent`. Both are now patched via an idempotent safety net in `backend/src/routes/bootstrap.ts` (the `COLUMN_SAFETY_NET` array — `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` statements that run on every `/api/bootstrap` hit regardless of migration history state).

**Before declaring any session's work done**, compare the migration folder listing in `backend/prisma/migrations/` between the local sandbox and GitHub (`get_file_contents` on that directory lists folder names). If anything is missing on GitHub:
1. Read that migration's `migration.sql` locally.
2. Add its statements (converted to idempotent `IF NOT EXISTS` form) to `COLUMN_SAFETY_NET` and to the `columnChecks` list in `handleHealthCheck`, inside `bootstrap.ts`.
3. Don't wait for it to surface as a production crash first.

## Diagnostic endpoints (already built)
- `GET /api/bootstrap?secret=<BOOTSTRAP_SECRET>` — runs `prisma migrate deploy` + the safety net + reseeds catalog data. Safe to call repeatedly, always idempotent.
- `GET /api/bootstrap/health-check?secret=<BOOTSTRAP_SECRET>` — reports whether every known-risky column/table exists, AND whether a real `prisma.operation.findFirst` with the full production include chain (steps/documents/feedback/service/expert.user) actually succeeds — not just a bare count(). `healthy:false` means schema drift; the `hint` field says what to do next.
- `BOOTSTRAP_SECRET` already exists in Render → Environment — reuse it, never invent a new one.
- Claude sessions cannot call these endpoints directly — outbound requests from this environment get a `403` from Render regardless of the secret's correctness (likely a WAF blocking non-browser traffic). Always ask the user to open the URL in their own browser and paste back the raw JSON.

## When the user reports a bug
1. Get an exact reproduction — a screenshot, a video, or precise steps. Don't guess from a vague description.
2. If it smells like a crash (blank error, generic "not found", anything that could be masking a 500): ask the user for Render → Logs at the exact timestamp of the failure. That is the only way to see the real Prisma/Node stack trace. Guessing wastes a full round trip every time; the log line always has the exact answer (`P2022`, missing table, whatever it is).
3. Where possible, reproduce the root cause locally first (spin up a local Postgres, apply/drop the suspect migration, hit the real endpoint) rather than shipping a guessed fix.
4. Check whether a frontend page is swallowing the real error into a generic message before assuming a bug report describes what actually happened server-side — `OperationDetail.tsx`'s error handling in particular has drifted from local history before; verify what's really on GitHub, don't assume.
5. Fix using the full-file handoff process above. Re-verify via GitHub fetch + the health-check endpoint before telling the user it's resolved.
