# Context log — Necromancer (Glovo Nigeria SMB Win-Back Gamification)

Covers the full project arc to date. Written for picking this up fresh in
VS Code — read top to bottom, or jump to "Where to start in VS Code" if
you just want to get running.

---

## 1. The business problem

Glovo Nigeria's SMB team has 1,792 restaurant/store partners tracked in an
existing BigQuery segmentation, sourced from `SMB_Zombie_WinBack.xlsx`:

| Segment | Count | Definition |
|---|---|---|
| Tier 1 — Low-Hanging Fruit | 74 | Recently dipped, easiest to recover |
| Tier 2 — Churned Whales | 76 | High historical value, dark 31–60 days |
| Tier 3 — Frustrated Casuals | 291 | Moderate value, inconsistent activity |
| Tier 4 — True Zombies | 1,351 | 0 orders in 30 days, hardest to revive |

Owned across 10 Account Managers. The goal: reactivate these partners with
a gamified reward system, and gamify the AMs driving that outreach, piloted
on a subset before any full rollout.

## 2. How the design evolved (chronological)

1. **First pass** — a general "Revival" gamification concept: BigQuery +
   FastAPI/React (Cloud Run) *and* an Apps Script/Sheets alternative, reward
   tiers gated on orders-in-window AND a combined orders+uptime score, AM
   points weighted by segment difficulty. A full reference implementation
   was built and tested (this became superseded — see §4).
2. **Made it more game-like** — added streak mechanics, WhatsApp nudges,
   shareable badges for partners; weekly quests, squads, and persistent
   rank identity for AMs (this is where "NECROCLASH" and rank names like
   Bonecaller/Archnecromancer originated).
3. **Full reimagining with a wheel mechanic** — partner side became "The
   Awakening": spin-the-wheel/mystery-box tied to order thresholds, "Golden
   Hours" 2x-uptime events, instant victory-chime feedback. AM side became
   a full battle-arena metaphor.
4. **PRD-generation prompt, v1→v3** — turned the above into a structured,
   self-contained prompt for generating a real PRD. Iterated three times as
   requirements changed:
   - v1: 5 partners/AM pilot (50 total)
   - v2: merged in a second draft's ideas — simplified reward ladder
     (order-count only, no score gate), continuous spin cadence, but this
     draft used **literal Mortal Kombat IP** (Netherrealm, Outworld, Shirai
     Ryu, Lin Kuei, Earthrealm as tag-team names) — flagged as a real IP
     risk and renamed to generic fantasy terms (Ashcall Coven, Hollow
     Vanguard, etc.)
   - v3: reverted to the original tiered wheel odds table and the original
     NECROCLASH design (Soul Duel/Coven Clash, not fixed tag-teams), pilot
     bumped to 10 partners/AM (100 total)
5. **Full production PRD written** against the v3 prompt — 15 sections,
   Gherkin user stories, BigQuery data model, wireframe/component notes,
   Apps Script vs. Vercel comparison (recommended split: Apps Script for
   partners, Vercel for NECROCLASH), risks flagged (₦25K stacking between
   ladder and wheel jackpot; whether to reintroduce the dropped Bounty
   Board/power-ups).
6. **A finalized visual design arrived** (`Necromancer_dc.html`, a
   click-through prototype) — this **superseded the dark "Revival" theme**
   from earlier steps with a light, Apple-esque Glovo-branded look, and
   **simplified the wheel to one flat 8-prize table** shared across all six
   wheel tiers (rather than six different odds tables). This design is now
   the source of truth for the UI.
7. **Real app built** against that design, pivoting the backend from
   BigQuery to Google Sheets (constraint: no BigQuery API access yet) — see
   §4 for what exists now.

## 3. Current locked-in decisions (don't relitigate these without reason)

**Ads Credit ladder** (order count only — no uptime/score gate):

| Orders | Credit |
|---|---|
| 0 | ₦0 |
| 5 | ₦5,000 |
| 10 | ₦10,000 |
| 15 | ₦12,500 |
| 20 | ₦15,000 |
| 30 | ₦20,000 |
| 40+ | ₦25,000 |

**Spin wheel** — unlocked in tiers by orders (Starter 5 / Rising 8 / Surge
10 / Ascension 12 / Zenith 15 / Jackpot 20+), but **one flat prize table**
regardless of tier (per the final design file):

| Prize | Weight |
|---|---|
| Free Packaging | 8 |
| Branding Kit | 10 |
| ₦5K Credit | 12 |
| IG Feature | 15 |
| ₦10K Credit | 20 |
| Photography | 15 |
| ₦25K Credit | 16 |
| Photo + ₦25K combo | 4 |

**NECROCLASH EP formula**: `base points (by segment) × multiplier (by
credit tier reached)`. Base points — Leviathan (T2) 100, Wanderer (T3) 70,
Wraith (T4) 50, Sleeper (T1) 30. Multiplier — NONE 0, 5K 1.0, 10K 1.5,
12.5K 2.0, 15K 2.5, 20K 3.0, 25K 4.0. Ranks: Bonecaller (0+) →
Wraithbinder (500+) → Soulforger (1,200+) → Archnecromancer (2,400+),
persist across seasons.

**Pilot scope**: 10 partners per AM × 10 AMs = 100 stores.

**Known open item, never resolved**: a partner can earn ₦25,000 from the
ladder (40+ orders) *and* separately from a Jackpot Wheel spin/combo — two
independent paths to the same ceiling. Flagged in the PRD (§13 Risks) as
needing Finance sign-off; not capped in the shipped app yet.

**Design tokens** (from `Necromancer_dc.html`, now canonical): Glovo Yellow
`#FFC244`, Glovo Green `#00A082`, charcoal text `#1D1D1F`, background
`#F5F5F7`, cards white with soft shadows, fonts Manrope (headings) / Inter
(body) / JetBrains Mono (numbers, codes). This replaced an earlier dark
"Revival" theme — if you see dark-themed mockups anywhere in history,
they're superseded.

**Partner login**: 6-digit Store Address ID (SAID), not email/password.

## 4. What's actually built (the working app)

A Next.js 14 app, delivered as `necromancer-app.zip`, structured as:

```
necromancer-app/
  app/
    arcade/page.tsx       — partner login + dashboard (wallet, ladder, wheel)
    clash/page.tsx        — NECROCLASH (leaderboard, duel, coven, quest)
    api/partner/lookup/   — GET partner state by SAID
    api/partner/spin/     — POST server-side spin resolution
    api/necroclash/       — GET leaderboard + duel/coven/quest, all derived live
    layout.tsx, page.tsx, globals.css
  components/
    TopNav.tsx             — Arcade/NECROCLASH switcher
    Wheel.tsx               — SVG wheel, same wedge math as the design file
  lib/
    scoring.ts              — THE single source of truth for ladder/wheel/EP
                              math — ported line-for-line from the design file
    sheets.ts                — data layer, two modes (see below)
  data/
    partners.local.json     — sample data (5 partners, 10 AMs) for local mode
  README.md                 — setup, deploy, and Google Sheet schema instructions
  package.json, tsconfig.json, next.config.js, .env.example
```

**Data layer has two modes**, switched by one env var (`SHEETS_MODE`):
- `local` (default) — reads/writes `data/partners.local.json`. Zero setup,
  runs immediately. This is what's tested right now.
- `live` — reads/writes a real Google Sheet via a service account
  (`googleapis` npm package, JWT auth). Needs `GOOGLE_SHEETS_ID`,
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` env vars.
  Sheet schema (3 tabs: Partners, AMs, SpinLog) is documented in the
  README with exact column headers.

**Verified working** (tested via curl against a local build before
delivery): SAID login/lookup returns correct ladder+wheel state; spin
resolves server-side and is blocked from re-spinning the same tier; EP and
leaderboard rank compute correctly from raw partner data (no EP is stored
— it's always derived); Coven Clash correctly targets a real Tier-2
partner as the Reckoning boss; 404/400 error handling works.

**Simplified vs. the full PRD, on purpose, for now**:
- Soul Duel / Coven Clash pairings are computed live from current EP rank
  (adjacent AMs paired), not persisted in a weekly assignment table — so
  pairings can shift mid-week if EP order shifts. The PRD's `am_matches` /
  `coven_raids` tables are the real fix; noted in the app's README as the
  first upgrade to make.
- Golden Hour is a static banner, not yet wired to actually double
  anything (needs an order-timestamp feed, not just an order count).
- No "simulate an order" UI control yet, though `incrementOrders()` exists
  in `lib/sheets.ts` ready to be wired to a button or a real webhook.
- The ₦25K ladder/wheel stacking question (§3) is not capped in code.

## 5. Outstanding / blocking items

1. **The real 100-store shortlist has not been provided to this project
   yet.** You mentioned it's saved from a BigQuery query result, but only
   the design HTML was uploaded, not that data. The app currently runs on
   5 sample partners. Needed to actually populate the pilot.
2. **No real Google Sheet exists yet** — the app is running in `local`
   mode. Creating the Sheet, sharing it with a service account, and
   flipping `SHEETS_MODE=live` is a config change, not a code change, per
   the README.
3. **₦25K stacking** — decide whether to cap total lifetime credit per
   partner (ladder + wheel combined) or allow both to pay out
   independently, then implement whichever in `lib/scoring.ts`.
4. **Weekly pairing persistence** for Soul Duel/Coven Clash — decide if
   the live-computed pairing is acceptable for the pilot or needs a real
   table before launch.
5. **Bounty Board / power-ups reintroduction** — was explicitly dropped
   from the pilot scope (§2 step 4) in favor of pure NECROCLASH; still an
   open question for a later phase per the PRD.

## 6. Where to start in VS Code

```bash
unzip necromancer-app.zip
cd necromancer-app
npm install
cp .env.example .env.local     # edit if you already have Sheet credentials
npm run dev                     # http://localhost:3000/arcade
```

Sample SAIDs to log in with in local mode are defined in `data/partners.local.json`. Visit `/clash` for the AM side; use the dropdown to
switch which AM you're viewing as.

**First real task once you have the shortlist file**: convert it to the
Partners-tab column format in the README, either paste into
`data/partners.local.json` for continued local testing, or straight into
the real Google Sheet if that's ready — no code changes either way.

**To deploy**: `vercel deploy` from the project root. Set the four
`SHEETS_MODE=live` env vars in Vercel's project settings before deploying
if the real Sheet is ready; otherwise it deploys fine in `local` mode as a
demo.

## 7. Files delivered this project (in case any need re-downloading)

- `revival-winback-gamification.zip` — the earlier, now-superseded
  BigQuery/FastAPI/React + Apps Script reference build (§2 step 1)
- `prd-generation-prompt-revival-pilot.md` / `-v2.md` / `-v3.md`
- `necromancer-pilot-PRD-v1.md` — the full production PRD
- `context-log-revival-winback.md` — an earlier context log, covering only
  through the end of §2 step 1 above
- `necromancer-app.zip` — the current working app (§4)
