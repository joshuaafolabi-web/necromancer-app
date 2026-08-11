# Product Requirements Document — Necromancer Reactivation Platform (Pilot)

## 1. Document Control & Executive Summary

| | |
|---|---|
| **Document owner** | SMB Growth / Account Management (Glovo Nigeria) |
| **Version** | 1.0 (Pilot) |
| **Status** | Draft — pending sign-off from Engineering, Design, and Head of Ops |
| **Approvers** | Head of Ops (business), Engineering Lead (build), Design Lead (UI) |
| **Related assets** | Existing BigQuery zombie/churn tiering (1,792 partners, 10 AMs); `SMB_Zombie_WinBack.xlsx` source segmentation |

**Summary**: Necromancer is a gamified reactivation program for Glovo
Nigeria's dormant SMB restaurant partners, piloted on 100 stores (10 per
Account Manager) before any decision to scale to the full 1,792-partner
book. It has two connected halves: a **Reactivation Arcade** for partners
(an order-driven Ads Credit ladder plus a probability-weighted spin wheel)
and **NECROCLASH**, a battle-arena leaderboard layer for the 10 Account
Managers driving outreach. The pilot's job is to prove reactivation lift,
Merchant App uptime improvement, and AM engagement are real and worth the
cost of the reward mechanics, before committing to a full rollout.

## 2. Problem & Opportunity

1,351 of Glovo Nigeria's 1,792 tracked SMB partners are "True Zombies" —
zero delivered orders in 30 days — and another 291 are trending the same
way. The existing outreach motion is a manually worked call list with no
built-in incentive loop for either the partner (why come back now,
specifically) or the Account Manager (why prioritize a hard, low-value
Zombie over an easy Tier 1 account). Necromancer replaces that with two
incentive loops running in parallel: a visible, escalating reward for the
partner, and a competitive, status-bearing game for the AM. The pilot
tests whether that loop measurably outperforms the status quo before any
spend commitment against all 1,792 partners.

## 3. Goals & Pilot Success Metrics

| Goal | Metric | 
|---|---|
| Partners come back and stay active | % of 100 pilot stores placing ≥1 order in the pilot window |
| Partners recover fully | % of pilot stores reaching 40+ orders (₦25,000 / Full Recovery tier) |
| Merchant App discipline improves | Average uptime % during operating hours, pilot stores vs. their pre-pilot 30-day baseline |
| AMs actually use NECROCLASH | Weekly active AM logins to the portal; Soul Duel and Coven Clash participation rate (target: all 10 AMs engage weekly, not just top performers) |
| The reward economics work | Total Ads Credit + physical prize cost issued, divided by incremental GMV recovered (orders × average basket) — a cost-per-recovered-order figure Finance can judge against |
| Partners like it, not just tolerate it | Post-pilot merchant survey / NPS on the Reactivation Arcade experience |

**Go/no-go for full rollout** hinges primarily on reactivation rate and
cost-per-recovered-order clearing thresholds Finance and Ops agree on
before launch (not specified here — see Open Questions).

## 4. Personas

**Partner (Merchant)** — an SMB restaurant/store owner or manager who has
gone quiet on Glovo, usually for reasons outside the app itself (cash
flow, staffing, a bad past experience with cancellations or low orders).
They are not going to read a rulebook. They check a phone or a shared
tablet, sporadically, between running the actual business.

**Account Manager (AM)** — owns a portfolio of ~180 partners on average
(1,792 ÷ 10), of which 10 are in this pilot. Comfortable with a
leaderboard and a target; unlikely to open a tool that feels like extra
admin on top of an already-full day of outreach calls.

## 5. Scope

**In scope for the pilot:**
- Reactivation Arcade: Ads Credit ladder, six-tier spin wheel, Golden
  Hours, victory-chime/confetti feedback — for the 100 selected stores only
- NECROCLASH: segment reskinning, AM rank progression, EP scoring, Soul
  Duel, Coven Clash, weekly quests, The Bone Throne — for all 10 AMs
- BigQuery views/tables listed in Section 7
- A single frontend/backend build per portal (final stack per Section 9)

**Out of scope for the pilot** (candidates for a later phase, not this one):
- The "Most Wanted" Daily Bounty Board, the fixed 2-AM tag-team league,
  and the three tactical power-ups (Golden Voucher, Debt Eraser, Executive
  Lifeline) from an earlier draft — see Open Questions on reintroducing these
- Any rollout beyond the 100 selected stores / 10 AMs
- Escalating/tiered spin wheels being replaced or redesigned mid-pilot —
  the six-tier structure is fixed for the pilot's duration to keep the
  measurement clean

## 6. User Stories & Acceptance Criteria

```gherkin
Feature: Ads Credit ladder

  Scenario: Partner crosses a ladder threshold
    Given a pilot partner has 0 delivered orders in the campaign window
    And the partner is enrolled in the win-back campaign
    When the partner accumulates 10 delivered orders
    Then the partner's Ads Credit tier updates to ₦10,000
    And the partner receives a notification confirming the unlocked credit
    And the wallet balance shown in the Reactivation Arcade updates immediately

  Scenario: Zero-order partner earns nothing
    Given a pilot partner has 0 delivered orders in the campaign window
    When the campaign window is evaluated
    Then the partner's Ads Credit tier remains ₦0
    And no spin eligibility is granted


Feature: Spin Wheel eligibility and choice

  Scenario: Partner unlocks the Starter Wheel
    Given a pilot partner has fewer than 5 delivered orders
    When the partner opens the Reactivation Arcade
    Then the spin wheel is shown in a locked "not yet eligible" state
    And the UI shows how many more orders unlock the first spin

  Scenario: Partner chooses to hold for a better wheel
    Given a pilot partner has 6 delivered orders (Starter Wheel unlocked, Rising Wheel not yet)
    When the partner views their spin options
    Then they are shown both "Spin now (Starter Wheel)" and "Hold for Rising Wheel at 8 orders"
    And selecting either option is a partner-initiated choice, never automatic


Feature: NECROCLASH — Essence Points

  Scenario: AM earns EP for a reactivation
    Given an AM's assigned partner was originally segmented as Tier 2 (Leviathan)
    And that partner reaches the ₦15,000 Ads Credit tier
    When the reactivation is recorded
    Then the AM is awarded EP = 100 (base) × 2.5 (multiplier) = 250 EP
    And the AM's leaderboard total and rank title update accordingly


Feature: Soul Duel

  Scenario: Weekly duel is resolved
    Given two AMs were paired into a Soul Duel at the start of the week
    When the week ends
    Then the AM with the higher EP earned that week is marked the winner
    And both AMs' Revival Meters reset for the next week's duel
    And the result is visible on both AMs' dashboards


Feature: Coven Clash

  Scenario: A Coven reclaims a Reckoning target first
    Given two Covens are racing to reclaim the same Leviathan partner
    When one Coven's member logs the order that crosses that partner's Ads Credit ladder threshold
    Then that Coven is declared the winner of the Reckoning
    And the losing Coven's progress on that target is closed out, not carried over


Feature: Weekly quest

  Scenario: AM completes a weekly quest
    Given the active weekly quest is "Reactivate 2 Leviathans this week"
    When the AM logs a second Leviathan reactivation within the same week
    Then the AM receives a 2x EP multiplier applied to that week's remaining EP
    And the quest is marked complete on their dashboard
```

## 7. Data Model & Field Definitions

**`v_merchant_game_state`** (view, built on `v_partner_tiers`, filtered to
the 100 pilot stores)

| Field | Type | Description |
|---|---|---|
| store_id | INT64 | Partner identifier |
| store_name | STRING | Display name |
| am_email | STRING | Owning Account Manager |
| original_segment | STRING | Tier 1–4 label |
| orders_in_window | INT64 | Delivered orders since campaign enrollment |
| current_credit_tier | STRING | NONE / 5K / 10K / 12.5K / 15K / 20K / 25K |
| current_credit_value | NUMERIC | Naira value of current_credit_tier |
| orders_to_next_credit_tier | INT64 | Nullable — null once at 25K |
| current_wheel_tier | STRING | NONE / Starter / Rising / Surge / Ascension / Zenith / Jackpot |
| orders_to_next_wheel_tier | INT64 | Nullable |
| lifetime_credit_earned | NUMERIC | Ladder + wheel combined — see Section 12 stacking flag |

**`v_am_leaderboard`** (extended view, built on existing leaderboard logic)

| Field | Type | Description |
|---|---|---|
| am_email | STRING | Account Manager identifier |
| total_ep | NUMERIC | Cumulative Essence Points, persists across seasons |
| rank_title | STRING | Bonecaller / Wraithbinder / Soulforger / Archnecromancer |
| current_duel_opponent | STRING | Nullable — am_email of this week's Soul Duel opponent |
| revival_meter_pct | FLOAT64 | This week's reactivation progress, 0–100 |
| active_coven_partner | STRING | Nullable — am_email of current Coven teammate, if any |

**`spin_prize_pool`** (table — config, not computed)

| Field | Type | Description |
|---|---|---|
| wheel_tier | STRING | Starter / Rising / Surge / Ascension / Zenith / Jackpot |
| prize_name | STRING | e.g. "Free Packaging", "Photography + 25K combo" |
| weight_pct | FLOAT64 | Must sum to 100 within each wheel_tier |

**`spin_log`** (table — append-only, RNG audit trail)

| Field | Type | Description |
|---|---|---|
| spin_id | STRING | UUID |
| store_id | INT64 | Who spun |
| wheel_tier | STRING | Which wheel |
| prize_won | STRING | Resolved prize |
| resolved_at | TIMESTAMP | Server-side resolution time |
| server_seed_ref | STRING | Reference to the seed/request used, for auditability |

**`am_matches`** (table — Soul Duel state)

| Field | Type | Description |
|---|---|---|
| week_start | DATE | Identifies the duel week |
| am_a, am_b | STRING | The paired AMs |
| ep_a, ep_b | NUMERIC | EP earned that week by each |
| winner | STRING | Nullable until week closes |

**`coven_raids`** (table — Coven Clash state)

| Field | Type | Description |
|---|---|---|
| week_start | DATE | Identifies the raid week |
| target_store_id | INT64 | The Reckoning target (a Leviathan or Wraith) |
| coven_a_members, coven_b_members | STRING (2 emails each) | Competing Covens |
| reclaim_progress_pct | FLOAT64 | Progress toward the target's next ladder tier |
| winner_coven | STRING | Nullable until resolved |

## 8. Wireframe Layout & Component Descriptions

**Reactivation Arcade (Partner)** — mobile-first, phone/tablet:
- **Wallet card** (Glovo Yellow, rounded 16px) — current Ads Credit balance, top of screen
- **Progress bar** (Glovo Green) — orders remaining to next ladder tier, standard DS progress component
- **Spin wheel module** — *not a standard Glovo DS component; needs bespoke design*. Flag to Design early — this is the highest-design-risk element on the timeline
- **Golden Hour banner** — dismissible top banner, DS status-badge styling, countdown timer
- **Order-complete moment** (confetti + chime) — full-screen transient overlay, DS doesn't currently have a "celebration" pattern; confirm whether one exists before building custom

**NECROCLASH (AM)** — desktop-first, dark arcade theme:
- **Rank badge + EP counter** — persistent header element, DS pill/badge components on the `#0F172A` dark background
- **Soul Duel face-off card** — two-sided card, Revival Meter bars either side, DS progress bar component reused; the "VS" divider and fighter-style avatars are *bespoke, not DS-standard*
- **Coven Clash raid card** — target partner shown as a "boss" card with a shared progress bar; same bespoke-avatar caveat as above
- **Weekly quest card** — standard DS card component, no bespoke need
- **Bone Throne leaderboard** — standard DS table/list component, rank-1 row gets a highlighted variant

**Action for Design**: confirm whether bespoke fighter-avatar and spin-wheel components can be built within the pilot timeline, or whether simplified DS-native placeholders (e.g. initials-in-a-badge instead of illustrated avatars) should be the pilot fallback.

## 9. Technical Architecture

| | Reactivation Arcade (Partner) | NECROCLASH (AM) |
|---|---|---|
| **Recommendation** | Google Apps Script Web App | Python API + React/Next.js on Vercel |
| **Why** | Faster to ship for a 100-store pilot; Ops can own and iterate on it directly (mirrors the org's existing Apps Script pattern for the source zombie-tiering dashboard); the mechanic itself (ladder + wheel) doesn't need much beyond server-side computation and a simple UI | NECROCLASH's weekly matchmaking (Soul Duel pairing, Coven Raid assignment), real-time-feeling face-off UI, and persistent rank state are a better fit for a proper application framework; only 10 users, so the extra engineering investment is affordable and worth the more game-like UX it enables |
| **RNG integrity** | Server-side `Code.gs` function resolves spins against `spin_prize_pool` weights — client never sees the odds table, only the outcome, logged to `spin_log` | N/A |
| **Auth** | Partner login via Store Address ID (SAID), matching existing merchant login pattern | Google Workspace SSO, matching internal tooling standard |
| **Scheduling** | Apps Script time-driven trigger recomputes `v_merchant_game_state` nightly | Vercel Cron (or Cloud Scheduler calling the API) runs weekly Soul Duel pairing and Coven Raid assignment each Monday |

Both portals read the same BigQuery dataset; there is no data-layer
divergence between the two stacks, only presentation and hosting.

## 10. Design Requirements

- Fixed tokens (confirmed, build against these): Glovo Yellow `#FFC244`,
  Glovo Green `#00A082`, dark charcoal `#0F172A` (NECROCLASH background),
  pill-shaped buttons, `border-radius: 16px` cards, vibrant status badges.
- **Open dependency**: the exact Glovo DS component library (buttons,
  cards, badges, tables as actual reusable components, not just color
  values) has not been supplied. Design must confirm which components
  exist and are approved for reuse before final UI spec — treat anything
  in Section 8 marked "bespoke" as provisional pending that confirmation.

## 11. Non-Functional Requirements

- **RNG integrity**: spin outcomes must be resolved server-side against
  `spin_prize_pool`; the client receives only the result, never the odds
  table or a client-side random draw. Every spin logged to `spin_log` for
  audit.
- **Performance**: Merchant App tablets in SMB kitchens are frequently
  low-end Android devices; the confetti/chime moment and spin-wheel
  animation must be lightweight (CSS/SVG-based, not heavy animation
  libraries) to avoid lag or dropped frames.
- **Offline handling**: order-complete events (confetti/chime trigger)
  should queue locally and fire on reconnect if the tablet briefly loses
  connectivity mid-shift, rather than silently dropping the moment.
- **Legibility**: status badges and progress bars need sufficient contrast
  to be readable on a tablet screen in bright kitchen lighting — a
  practical field condition worth testing, not just a lab-condition check.

## 12. Pilot Test Execution Roadmap & KPIs

| Phase | Duration | Activity |
|---|---|---|
| Setup & QA | Week 0 | BigQuery views/tables live; both portals built and QA'd; spin RNG audited against `spin_prize_pool` weights before go-live |
| Soft launch | Weeks 1–2 | 20 stores (2 per AM) and all 10 AMs live, to catch issues before full exposure |
| Full pilot | Weeks 3–8 | All 100 stores enrolled; weekly Soul Duels and Coven Raids running |
| Measurement close | Week 9 | Freeze metrics from Section 3; compile results |
| Go/no-go review | Week 10 | Present to Head of Ops, Engineering, Finance |

**Store selection rubric** (recommendation): each AM's 10
highest-`priority_score` partners, rather than a stratified tier mix — a
pilot testing whether the mechanic works at all should test it against
the partners each AM was already going to prioritize, not add segment-mix
as a confounding variable on top of an already-new mechanic.

KPIs tracked weekly throughout: reactivation rate, Full Recovery rate,
average uptime %, AM weekly active usage, spin economics (cost per
recovered order).

## 13. Risks & Assumptions

- **₦25,000 stacking risk (open, flagged in prior drafts)**: as specified,
  a partner can earn ₦25,000 from the ladder (40+ orders) *and* up to
  ₦25,000 again from a Jackpot Wheel spin or combo — two independent paths
  to the same ceiling value. **Recommendation**: cap total lifetime Ads
  Credit per partner (ladder + wheel combined) at ₦25,000, tracked via
  `lifetime_credit_earned` in `v_merchant_game_state`; once a partner hits
  that cap, further wheel spins exclude cash/credit prizes and reweight
  toward non-monetary prizes (packaging, branding, IG feature,
  photography) instead. This needs explicit Finance sign-off before
  launch, not a silent default.
- **Physical prize fulfillment**: Free Packaging and the Pro Photography
  Session are physical/service fulfillments, not digital credits — no
  stock-counter is being built per instruction, but someone still needs
  to own the actual fulfillment workflow (who ships packaging, who books
  the photographer) once a partner wins one. Assign an owner before launch.
- **Design timeline risk**: the spin wheel and fighter-avatar components
  are bespoke, not from the existing Glovo DS component set — if Design
  can't confirm feasibility quickly, this is the most likely source of
  schedule slip.
- **AM adoption risk**: gamification can land as gimmicky with a skeptical
  AM. Mitigation: keep onboarding to NECROCLASH under 10 minutes and frame
  it as additive to, not a replacement for, existing performance reviews.
- **Assumption**: `priority_score` in the existing BigQuery model is
  current and reliable enough to drive pilot store selection without
  additional Ops review.

## 14. Open Questions

1. Should the ₦25,000 stacking cap (Section 13 recommendation) be adopted
   as specified, or is double-earning intentional as an extra-strong pilot
   incentive?
2. Should the Bounty Board and the three tactical power-ups (Golden
   Voucher, Debt Eraser, Executive Lifeline) from an earlier draft be
   reintroduced now, or held for a post-pilot Phase 2? (Recommendation:
   hold — keep the pilot's variables limited to the ladder/wheel and
   NECROCLASH core loop so results are attributable.)
3. Final pilot duration and go/no-go thresholds (reactivation rate,
   cost-per-recovered-order) — Section 12 proposes a structure but not
   the numeric bar, which needs Finance and Ops agreement.
4. Store selection rubric — top-`priority_score` (recommended) vs.
   stratified-by-tier — needs Ops confirmation.
5. Physical prize fulfillment ownership (Section 13).
6. Glovo DS component library confirmation (Section 10) — blocks final UI spec.

## 15. Appendix

**Ads Credit ladder**

| Delivered orders | Ads credit |
|---|---|
| 0 | ₦0 |
| 5 | ₦5,000 |
| 10 | ₦10,000 |
| 15 | ₦12,500 |
| 20 | ₦15,000 |
| 30 | ₦20,000 |
| 40+ | ₦25,000 |

**Spin wheel eligibility**

| Orders | Wheel |
|---|---|
| 5 | Starter |
| 8 | Rising |
| 10 | Surge |
| 12 | Ascension |
| 15 | Zenith |
| 20+ | Jackpot |

**Spin prize pool (%)**

| Prize | Starter | Rising | Surge | Ascension | Zenith | Jackpot |
|---|---|---|---|---|---|---|
| Free Packaging | 40 | 25 | 18 | 12 | 8 | 4 |
| Store Branding Kit | 25 | 25 | 20 | 15 | 10 | 6 |
| ₦5,000 Ads Credit | 20 | 20 | 18 | 15 | 12 | 8 |
| Instagram Story Feature | 10 | 12 | 14 | 15 | 15 | 12 |
| ₦10,000 Ads Credit | 4 | 10 | 15 | 18 | 20 | 20 |
| Pro Photography Session | 1 | 5 | 8 | 12 | 15 | 18 |
| ₦25,000 Ads Credit | 0 | 2.5 | 6 | 11 | 16 | 24 |
| Photography + ₦25K combo | 0 | 0.5 | 1 | 2 | 4 | 8 |

**NECROCLASH EP formula**

Base points — Leviathan (T2) 100, Wanderer (T3) 70, Wraith (T4) 50,
Sleeper (T1) 30. Multiplier by credit tier reached — NONE 0, 5K 1.0,
10K 1.5, 12.5K 2.0, 15K 2.5, 20K 3.0, 25K 4.0. EP = base × multiplier.

**Rank progression**: Bonecaller → Wraithbinder → Soulforger →
Archnecromancer, persists across seasons.
