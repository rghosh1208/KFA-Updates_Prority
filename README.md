# COE 10.0 — KFA Priority Dashboard

A live dashboard of the UCSF Campus Life Services / Facilities Services 2026
program portfolio. Data flows:

```
Smartsheet  ──(hourly Vercel Cron)──►  /api/sync  ──►  Supabase (programs table)  ──►  Next.js dashboard on Vercel
```

The dashboard reproduces the dark, high-contrast, accessible "Programs by
Priority" view: priority tabs, per-program monthly progress bars, expandable
detail cards, and a jump-to-program picker.

---

## What's in this repo

| Path | Purpose |
|------|---------|
| `app/page.tsx` | Server component — reads Supabase, builds the payload |
| `app/Dashboard.tsx` | Client UI — tabs, cards, bars (matches the HTML sample) |
| `app/globals.css` | The high-contrast theme (ported verbatim) |
| `app/api/sync/route.ts` | Cron target — pulls Smartsheet, upserts Supabase |
| `lib/smartsheet.ts` | Fetch + map Smartsheet rows |
| `lib/transform.ts` | Group programs by priority, derive stats & health |
| `lib/supabase.ts` | Read (anon) and write (service-role) clients |
| `supabase/schema.sql` | The `programs` table + row-level security |
| `scripts/sync-local.mjs` | Optional one-off sync from your laptop |
| `vercel.json` | Hourly cron schedule for `/api/sync` |

---

## Setup — step by step

### 1. Create the Supabase project & table
1. Go to <https://supabase.com> → **New project**. Note the project **URL**.
2. In the project, open **Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (keep private)
3. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.

### 2. Get your Smartsheet credentials
- **API token:** Smartsheet → your avatar → **Personal Settings → API Access →
  Generate new access token** → `SMARTSHEET_API_TOKEN`.
- **Sheet ID:** open the sheet → **File → Properties** (or right-click the sheet
  in the left panel → Properties) → copy the **Sheet ID** → `SMARTSHEET_SHEET_ID`.

### 3. Push this folder to GitHub
Create a repo (you already have `KFA-Updates_Prority`) and upload everything in
this `coe-kfa-dashboard` folder. Two easy options:

**Web upload:** on the repo's **"uploading an existing file"** link, drag in all
files/folders from `coe-kfa-dashboard`. (The `.env.local` file is gitignored and
must never be uploaded.)

**Command line:**
```bash
cd coe-kfa-dashboard
git init
git add .
git commit -m "COE KFA live dashboard"
git branch -M main
git remote add origin https://github.com/rghosh1208/KFA-Updates_Prority.git
git push -u origin main
```

### 4. Deploy on Vercel
1. Go to <https://vercel.com> → **Add New… → Project** → import the GitHub repo.
2. Framework preset auto-detects **Next.js**. Leave defaults.
3. Under **Environment Variables**, add all six keys (from `.env.example`):
   `SMARTSHEET_API_TOKEN`, `SMARTSHEET_SHEET_ID`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
   (generate a long random string for `CRON_SECRET`).
4. Click **Deploy**.

### 5. First data load
The cron runs hourly, but to populate immediately after the first deploy, trigger
the sync once manually:
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP.vercel.app/api/sync
```
You should see `{"ok":true,"synced":30,...}`. Refresh the dashboard — done.

> Prefer to test locally first? Copy `.env.example` to `.env.local`, fill it in,
> run `npm install`, then `npm run sync:local` to load Supabase and `npm run dev`
> to view the dashboard at <http://localhost:3000>.

---

## How the sync stays "live"
- `vercel.json` schedules `GET /api/sync` **every hour** (`0 * * * *`). Change the
  cron expression to sync more/less often (e.g. `*/15 * * * *` for every 15 min).
- Each run pulls the whole sheet, **upserts** by Smartsheet row id (so edits update
  in place), and **deletes** rows removed from Smartsheet.
- The dashboard page revalidates its Supabase read every 60 seconds.

## Mapping notes
- **Priorities** come from the `Priority Alignment` column. A program aligned to
  several priorities (e.g. `P2 … / P4 …`) appears under each. `II - Independent
  Initiatives` shows as the **Isolated** group; `LITE - …` as **CLS Lite**.
- **Priority health** is derived: **RED** if any program is Off Track, **GREEN**
  if the average latest completion ≥ 50%, otherwise **YELLOW**.
- **"What's Working" / "What's At Risk"** are editorial and not standard Smartsheet
  columns. If you add columns with those exact names, the sync picks them up
  automatically; otherwise the cards fall back to the latest monthly update and the
  Latest Comment.
- **Months** render automatically for any month that has data (March onward). Add
  new months by extending `MONTH_DEFS` in `lib/types.ts` and `MONTH_COLUMNS` in
  `lib/smartsheet.ts`.

## Security
- `SUPABASE_SERVICE_ROLE_KEY` and `SMARTSHEET_API_TOKEN` are **server-only** — never
  prefixed with `NEXT_PUBLIC_`. Keep them in Vercel env vars, never in the repo.
- `/api/sync` is gated by `CRON_SECRET`; Vercel Cron sends it automatically.
- The `programs` table has row-level security allowing anonymous **reads only**.
