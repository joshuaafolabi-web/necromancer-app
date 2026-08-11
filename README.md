# Necromancer — Reactivation Arcade + NECROCLASH

A Next.js app implementing the design in `Necromancer_dc.html`, backed by a
Google Sheet instead of BigQuery (per the pilot's access constraints). Two
routes, one deploy: `/arcade` (partner-facing) and `/clash` (AM-facing).

## Why a Google Sheet instead of BigQuery

You don't currently have BigQuery API access, and the shortlisted pilot
partners were saved as a query *result*, not a live connection. A Google
Sheet fills the same role as a live database here: it's mutable, it's
something Ops can open and edit by hand if something looks wrong mid-pilot,
and the app reads/writes it through a service account exactly the way it
would read/write BigQuery. If BigQuery access opens up later, only
`lib/sheets.ts` needs a third mode added — nothing in the UI or scoring
logic changes.

## Two run modes

| | `SHEETS_MODE=local` (default) | `SHEETS_MODE=live` |
|---|---|---|
| Data source | `data/partners.local.json` | Real Google Sheet |
| Setup needed | None | Service account + sharing (below) |
| Use for | Right now, before the Sheet exists | The actual pilot |

Everything else — the ladder math, wheel odds, EP formula, all the API
routes — is identical between modes. `lib/sheets.ts` is the only file that
branches on `SHEETS_MODE`.

## Setting up the real Google Sheet

1. Create a Sheet with three tabs, headers in row 1 exactly as below.

   **Partners**
   | store_id | store_name | said | am_email | segment | orders_delivered | campaign_start_date |
   |---|---|---|---|---|---|---|

   `segment` must be exactly `Tier 1`, `Tier 2`, `Tier 3`, or `Tier 4` —
   the scoring logic matches on that string. `said` is the 6-digit login
   code partners use in the Arcade.

   **AMs**
   | am_name | am_email |
   |---|---|

   **SpinLog** — leave empty except the header row; the app appends to it.
   | said | wheel_tier | prize | timestamp |
   |---|---|---|---|

2. Paste in your shortlisted 100 stores under Partners, and your 10 AMs
   under AMs.
3. Google Cloud Console → create a service account → generate a JSON key.
4. Share the Sheet with the service account's email (found in the JSON
   key) as an **Editor** — same as sharing with any other Google account.
5. Set environment variables (locally in `.env.local`, or in Vercel's
   project settings):
   ```
   SHEETS_MODE=live
   GOOGLE_SHEETS_ID=<the id from the sheet's URL>
   GOOGLE_SERVICE_ACCOUNT_EMAIL=<from the JSON key>
   GOOGLE_SERVICE_ACCOUNT_KEY=<the private_key field from the JSON key, keep the \n escapes>
   ```

## Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/arcade` — log in with `482103`, `560221`,
`701845`, `339910`, or `204471` (the sample partners in local mode).
Visit `/clash` for the AM side.

## Deploy to Vercel

```bash
vercel deploy
```

Set the four env vars above in the Vercel project settings before your
first `live`-mode deploy. `local` mode needs no env vars at all — you can
deploy and demo it today.

## What's real vs. simplified right now

- **Ladder, wheel odds, spin locking, EP formula**: ported exactly from
  `Necromancer_dc.html` and from the agreed PRD — these are correct.
- **Soul Duel / Coven Clash pairings**: computed live from current EP
  rank order (adjacent AMs are paired), not from a persisted weekly
  assignment. This is fine for a pilot but means pairings shift if EP
  order shifts mid-week. The PRD's `am_matches` / `coven_raids` tables are
  the real fix — add a "Weekly Pairings" Sheet tab and read from that
  instead of computing pairings on the fly, once you want pairings to
  hold steady for a full week regardless of EP movement.
- **Golden Hour**: shown as a static banner (5–8 PM) — it's not yet wired
  to actually double anything, since that requires an order-timestamp feed
  this pilot doesn't have yet (Sheets doesn't easily model "which hour was
  this order delivered in" without adding an order-level log, not just an
  order *count*).
- **"Simulate an order" control**: not built into the UI yet.
  `incrementOrders()` in `lib/sheets.ts` is ready for this — wire a button
  or a real order webhook to call it when you're ready to test progression
  live rather than editing the Sheet by hand.

## Still needed from you

The real 100-store shortlist. Once you share it (CSV, XLSX, or the Sheet
itself), it's a straight paste into the Partners tab — no code changes.
