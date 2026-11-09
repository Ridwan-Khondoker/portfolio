# Automated Finance

Private, invite-only finance dashboard for TRIBE LLC (Happy To Deliver, 4our Living, LUX Life, HTD LA, Tribe Entertainment),
served at **https://automatedfinance.ridwankhondoker.dev**. It replaces the spreadsheet dashboard: people keep working in
Google Sheets or Excel, and uploads or the Google sync update every dashboard, projection and check automatically.

> **This folder lives in a public repository.** It contains code only. Company data (`data/`, `source-workbooks/`),
> layouts, budgets, the issues log and the Google Sheet ID live in the database and the gitignored kit folder,
> never in git. Don't commit `.env` files, workbooks or CSV exports.

## What's inside

| Area | Where |
|---|---|
| Request guard (deny by default, CSP nonce, headers, CSRF origin check, IP allowlist) | `src/proxy.ts`, `src/lib/security/` |
| Accounts: invites, argon2id, TOTP 2FA + recovery codes, sessions, lockout, audit log | `src/lib/server/accounts.ts`, `src/lib/security/` |
| Importer (one engine for uploads, Google sync and manual entries) | `src/lib/importer/`, `src/lib/server/imports.ts` |
| Business rules and calculations (pure, decimal-safe) | `src/lib/finance/` |
| Pages | `src/app/(app)/` (signed in), `src/app/(public)/` (login, invite, reset) |
| Seed, first admin, sync tick | `scripts/` |
| Tests (acceptance 1–7) | `tests/` |

Stack: Next.js 16 (App Router, server rendering), TypeScript, Tailwind 4, Prisma 6 + PostgreSQL, SheetJS 0.20.3
(installed from the SheetJS CDN: the npm `xlsx` package is outdated and has known vulnerabilities), decimal.js, Chart.js.
Colours are Happy To Deliver's brand tokens; the chart palette was validated for colour-blind separation and contrast.

Money is stored at full source precision and rounded only for display. That's how the source workbook totals
(e.g. 69,219.853 shows as 69,219.85); rounding each row to cents first would make several totals a cent off.

## Roles

| Role | Can |
|---|---|
| Viewer | Read the dashboard and reports, export transactions |
| Editor | + upload and import sheets, mapping step, manual entries, payment statuses, scenarios, Sync now |
| Admin | + users, roles, sessions, settings, layouts, rollback, original-file downloads, Export everything, audit log |

## Local setup

Requirements: Node 22+, PostgreSQL 14+.

```bash
cd automatedfinance
cp .env.example .env          # then fill in DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL; APP_URL=http://localhost:3000
npm install
npx prisma migrate deploy
```

Put the confidential build kit next to `package.json` (both folders are gitignored):

```
automatedfinance/data/...                (source_layouts.json, categories.csv, ...)
automatedfinance/source-workbooks/ORIGINAL_Google_Sheet_export.xlsx
```

```bash
npm run seed                  # reference data + layouts + imports the original workbook through the real importer
npm run seed:admin            # prints a one-time invite link for ADMIN_EMAIL
npm run dev
```

Open the invite link, choose a password (12+ characters, not a common password), scan the QR code with Google
Authenticator (or any TOTP app), and save the 8 recovery codes.

### Tests

```bash
npm test                      # acceptance tests 1-6 (+ 7 if a build exists); needs TEST_DATABASE_URL or a local finance_test DB
npm run test:security         # builds, starts the production server and runs the access-control tests
npm run typecheck
```

Acceptance tests read expected numbers from the gitignored `data/` folder and skip with a note when it's missing,
so no company figures are in the test code. The security tests use synthetic users only.

## Deploying on Railway

Railway project **automatedfinance** (workspace "Ridwan's Projects") has two services:

- **Postgres** (Railway template).
- **web**: this app, built from the `Ridwan-Khondoker/portfolio` repo with **root directory** `/automatedfinance` and
  **watch paths** `/automatedfinance/**` (so portfolio-only commits don't redeploy it, and vice versa).
  - Build: `npm run build`.
  - Start: `npm start`, which runs migrations, creates the first-admin invite if there's no admin yet, then starts the server.
  - Healthcheck: `/login`.

Service variables on **web**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_URL` | `https://automatedfinance.ridwankhondoker.dev` |
| `SESSION_SECRET` | 48+ random characters (`openssl rand -base64 48`); never change it casually: it encrypts 2FA secrets |
| `ADMIN_EMAIL` | the first admin's email |
| `PORT` | `8080` (the custom domain routes to this port) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | optional, see below |
| `RESEND_API_KEY`, `MAIL_FROM` | optional, to email invite links |
| `IP_ALLOWLIST` | optional, e.g. office IPs |

### First start

1. In the **web** deploy logs, find `Admin invite for …` and open the link (valid 72 hours, single use).
   If you missed it, run it again on the service with the Railway CLI: `railway ssh -- npm run seed:admin -- --force`.
2. Sign in, go to **Settings → First-time setup** and upload the build kit `.zip`. It loads categories,
   mappings, budgets, layouts, reconciliation checks and the issues log, then imports the original workbook.
   The zip is read in memory and not stored. (Alternatively run `npm run seed` from a machine that has the kit,
   with `DATABASE_URL` set to the database's public URL.)
3. Invite the rest of the team from **Users**.

### Connecting the domain

The custom domain `automatedfinance.ridwankhondoker.dev` is attached to the **web** service. At the DNS provider for
`ridwankhondoker.dev`, add exactly the two records Railway shows (Service → Settings → Networking):

| Type | Name | Value |
|---|---|---|
| CNAME | `automatedfinance` | the `*.up.railway.app` target Railway shows |
| TXT | `_railway-verify.automatedfinance` | the `railway-verify=…` value Railway shows |

HTTPS certificates are issued automatically once the records resolve. If the DNS is on Cloudflare, set the CNAME to
**DNS only** (grey cloud) unless you put Cloudflare Access in front (below).

## Adding users

**Users → Invite someone**: enter the email and role, then copy the one-time link (or tick *Email it* when Resend is
configured). There is no public sign-up. From the same page an admin can change roles, deactivate someone (all their
sessions end immediately), reset a person's password and 2FA (they get a new one-time link), end sessions, and read
the audit log (logins, failed logins, invites, role changes, uploads, imports, rollbacks, setting changes and exports,
with user, time and IP).

## Enabling Google Sheets sync

1. In Google Cloud Console: create a project → enable the **Google Drive API** → *IAM & Admin → Service accounts* →
   create a service account → *Keys → Add key → JSON*.
2. In Railway, set `GOOGLE_SERVICE_ACCOUNT_JSON` on **web** to the whole JSON (or its base64). Redeploy.
3. **Settings → Google sync** shows the service account email. In Google Sheets, share the sheet with that
   email as **Viewer**.
4. Add the sheet (link or ID) in **Settings → Google sync**. For a new year's file, add it as another sheet and set
   its year (used for tabs without a year in their name, e.g. `HTD` in the 2027 copy).

The app checks every minute and syncs each sheet every 15 minutes (configurable), plus **Sync now** on the Upload
page. It goes through the same importer as an upload, and auto-commits only when:

- there are no validation errors;
- no new tab or block needs a mapping step;
- no business-month changes by 25% or more (configurable) and none drops to zero.

Otherwise the batch is **held** for an Editor to review on the Upload page. Filling in a month that was empty never
holds a sync. The last sync time and status show in the header.

## Uploading sheets (including future years)

**Upload & sync** accepts `.xlsx` and `.csv`.

1. **Detect.** Each tab is matched to a saved layout:
   - the business tabs, P&L tabs, recurring list and October snapshot;
   - any new block with *Category*, *Item* and *January…December* headers (one blank spacer column allowed);
   - Expense Entry lists (download the blank template on the Upload page).

   Anything else is listed as skipped, with the reason.
2. **Map.** A tab or block seen for the first time gets a mapping step: business, year, block type
   (Recorded / Estimate / Actual / Summary / do not import) and the first and last expense rows. It's pre-filled from
   the same-named tab of another year (e.g. `HTD 2027` copies `HTD`). The answer is saved as a layout profile, so the
   next upload of that tab asks nothing.
3. **Preview.** Before anything is saved you see:
   - rows added, amounts changed (old → new) and rows that disappeared;
   - validation errors and warnings;
   - the effect on totals per business and month.
4. **Import.** Commits as one batch (who, when, file name, checksum, counts). Admins can **roll back** any batch.

Re-uploading the same or an updated sheet replaces values and never double counts. Each grid cell is keyed by layout,
row label, year and month; transactions by reference, or by a hash of their contents when there's none. A line that
disappears is marked removed in that batch. Payment statuses are stored separately on those keys, so they survive
re-imports.

## Backups and restore

**Daily backups:**

1. Railway → **Postgres** service → **Backups**.
2. Turn on the **Daily** schedule (and Weekly/Monthly if you like). Railway keeps daily backups for 6 days, weekly for
   27 days and monthly for 89 days.

For finer recovery, Railway Postgres also offers **Point-in-Time Recovery**: it continuously archives the database to a
storage bucket, so you can restore to any moment in roughly the last 4 weeks (`railway postgres pitr`).

**Restoring a Railway backup:**

1. In the same Backups tab, choose a backup → **Restore**. Restoring creates a fresh volume and keeps the previous
   one, unmounted, in the project.
2. Redeploy **web** afterwards.

Wiping a volume deletes its backups, so don't wipe it to "start over".

**Logical dump** (any time, from a machine with the database's public URL):

```bash
pg_dump "$DATABASE_PUBLIC_URL" --format=custom --file=automatedfinance-$(date +%F).dump
```

Restore it into an empty database:

```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" automatedfinance-YYYY-MM-DD.dump
```

**Export everything** (Settings) downloads one `.xlsx` with every current row, reference table, setting and the audit
log. It's a readable archive, not a restore source.

## Extra layers (optional)

- **IP allowlist:** set `IP_ALLOWLIST` (e.g. `203.0.113.10,198.51.100.0/24`). Requests from other addresses get a 403
  before anything else runs. Railway passes the client address in `X-Real-IP`.
- **Cloudflare Access (Zero Trust):** if `ridwankhondoker.dev` is on Cloudflare:
  1. Proxy the `automatedfinance` CNAME (orange cloud).
  2. Create a self-hosted Access application for `automatedfinance.ridwankhondoker.dev`, with a policy allowing only
     your team's emails (one-time PIN or Google login).
  3. Keep the app's own login and 2FA: Access is an extra wall, and the app stays secure without it.

## Security notes

- **Public routes:** every route is denied unless signed in with password + 2FA. The only exceptions are `/login`,
  `/invite/<token>`, `/reset/<token>`, the `/api/auth/*` endpoints those pages use, and the hashed build files under
  `/_next/static` (code only, needed to draw the login page).
- **Passwords:** argon2id (64 MiB, 3 passes), at least 12 characters, checked against a 49,000-entry common-password list.
- **Lockout:** 5 failures per account or per IP lock that account or IP for 15 minutes, for both the password and the
  2FA step. Error messages are generic, so they never reveal whether an email exists.
- **2FA:** a TOTP code can't be reused. TOTP secrets are encrypted at rest (AES-256-GCM, key derived from `SESSION_SECRET`).
- **Sessions:** server-side, idle timeout 12 h, absolute limit 7 days. Cookie `__Host-af_session` with
  `HttpOnly; Secure; SameSite=Strict`.
- **Cross-site requests:** every state-changing request must come from `APP_URL` (Origin check). API calls also need
  the per-session CSRF token. Every server action checks the user's role itself.
- **Headers:** a strict CSP with a per-request nonce, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`
  and `X-Robots-Tag: noindex` on every response.
- **Uploaded files** are stored in PostgreSQL, never under a URL, and only Admins can download them.
