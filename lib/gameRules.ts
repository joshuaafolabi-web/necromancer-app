// lib/gameRules.ts
//
// ⚠️  SERVER ONLY. Never import this from a file with 'use client'.
//
// Reward structure rewritten 2026-08-27 from a per-tier weighted wheel to
// fixed order-count milestones — partners hit specific, named prize moments
// instead of climbing a continuous ladder. Three milestones (10/15/20
// orders) stay a genuine game of chance so spinning still means something;
// everything else (Merch, ₦25K, Photography, Instagram) is guaranteed once
// the order count is hit, which makes the biggest payouts predictable for
// budgeting instead of subject to draw variance.
//
// Client-safe display values (wedge colours) live in lib/scoring.ts.

export const CREDIT_CAP_ENABLED = true;
export const LIFETIME_CREDIT_CAP = 25000;
export const CHALLENGE_DAYS = 30;

/**
 * Chance of winning EACH ₦5,000 credit roll (credit-10 / credit-15 /
 * credit-20). Deliberately a single tunable constant — "very strict" per
 * product's request, adjust from here once real pilot economics are known.
 * 10 = 10% per roll, independently rolled once per milestone (up to 3 times
 * total per partner).
 */
export const STRICT_CREDIT_ODDS_PCT = 10;

export type Milestone = {
  /** Stable id — doubles as the SpinLog `wheelTier` / claim-lock key, so it
   *  must never be renamed once partners may have already claimed it. */
  name: string;
  minOrders: number;
  label: string;
  kind: 'guaranteed' | 'chance';
  /** Naira value of this prize if won; 0 for non-cash prizes. */
  credit: number;
  /** Only meaningful for kind: 'chance'. */
  oddsPct?: number;
  /** instagram-100 only: also requires being top 5 by total orders among
   *  every partner who has reached this milestone's threshold. Checked live
   *  on every claim attempt rather than snapshotted, since the roster keeps
   *  growing (pilot is scaling toward 1,000 partners) and a partner who
   *  isn't top 5 yet should get to try again later, not be locked out. */
  requiresTopRank?: boolean;
};

// Ordered by minOrders — routes rely on this order for "the next milestone"
// via a simple forward scan. At 20 orders there's only merch-20 now; the
// third chance credit draw moved to 50 orders (was 20) on 2026-08-27, so
// it's listed after credit-40 to keep the array in threshold order.
export const MILESTONES: Milestone[] = [
  { name: 'credit-10', minOrders: 10, label: '₦5,000 Ads Credit', kind: 'chance', credit: 5000, oddsPct: STRICT_CREDIT_ODDS_PCT },
  { name: 'credit-15', minOrders: 15, label: '₦5,000 Ads Credit', kind: 'chance', credit: 5000, oddsPct: STRICT_CREDIT_ODDS_PCT },
  { name: 'merch-20', minOrders: 20, label: 'Glovo Branded Merchandise', kind: 'guaranteed', credit: 0 },
  { name: 'credit-40', minOrders: 40, label: '₦25,000 Ads Credit', kind: 'guaranteed', credit: 25000 },
  { name: 'credit-50', minOrders: 50, label: '₦5,000 Ads Credit', kind: 'chance', credit: 5000, oddsPct: STRICT_CREDIT_ODDS_PCT },
  { name: 'photography-80', minOrders: 80, label: 'Pro Food Photography Session', kind: 'guaranteed', credit: 0 },
  { name: 'instagram-100', minOrders: 100, label: 'Instagram Story Feature', kind: 'guaranteed', credit: 0, requiresTopRank: true },
];

export const MILESTONE_LABELS = MILESTONES.map((m) => m.label);

/** The order count at which the first milestone unlocks — drives "hit N
 *  orders to unlock the wheel" style copy without hardcoding 10 elsewhere. */
export const FIRST_MILESTONE_ORDERS = MILESTONES[0].minOrders;

/** Every milestone a partner's current order count has reached. Multiple can
 *  be reached-but-unclaimed at once (e.g. both 20-order milestones). */
export function milestonesReached(orders: number): Milestone[] {
  return MILESTONES.filter((m) => orders >= m.minOrders);
}

/** First reached-but-unclaimed milestone, in order — what the spin button
 *  targets next. Null once everything reached so far has been claimed. */
export function nextClaimable(orders: number, claimedNames: Set<string>): Milestone | null {
  return milestonesReached(orders).find((m) => !claimedNames.has(m.name)) ?? null;
}

/** Next milestone by threshold that hasn't been reached by orders yet —
 *  drives "N more orders to unlock" once every reached milestone is already
 *  claimed. Null once every milestone has been reached. */
export function nextUpcoming(orders: number): Milestone | null {
  return MILESTONES.find((m) => orders < m.minOrders) ?? null;
}

export type ResolveResult = { won: boolean; label: string; credit: number };

/**
 * Resolves a claim against one milestone. Chance milestones respect the
 * lifetime cap by refusing to even roll once winning would exceed it — with
 * only two outcomes (win/no-win) there's nothing to reweight against, unlike
 * the old multi-prize wheel, so a would-be-capped roll is just a guaranteed
 * loss instead of a claim the partner can't make.
 */
export function resolveMilestone(milestone: Milestone, lifetimeCredit: number): ResolveResult {
  if (milestone.kind === 'guaranteed') {
    return { won: true, label: milestone.label, credit: milestone.credit };
  }

  const wouldExceedCap = CREDIT_CAP_ENABLED && lifetimeCredit + milestone.credit > LIFETIME_CREDIT_CAP;
  if (wouldExceedCap) {
    return { won: false, label: milestone.label, credit: 0 };
  }

  const won = Math.random() * 100 < (milestone.oddsPct ?? 0);
  return { won, label: milestone.label, credit: won ? milestone.credit : 0 };
}

export function challengeState(acceptedAt: string | null) {
  if (!acceptedAt) {
    return { accepted: false, acceptedAt: null, dayNumber: null, daysLeft: null, expired: false };
  }
  const started = new Date(acceptedAt);
  if (isNaN(started.getTime())) {
    return { accepted: false, acceptedAt: null, dayNumber: null, daysLeft: null, expired: false };
  }
  // Day 1 is the day they accepted, not the day after.
  const elapsed = Math.floor((Date.now() - started.getTime()) / 86400000);
  return {
    accepted: true,
    acceptedAt: started.toISOString(),
    dayNumber: Math.min(elapsed + 1, CHALLENGE_DAYS),
    daysLeft: Math.max(CHALLENGE_DAYS - elapsed, 0),
    expired: elapsed >= CHALLENGE_DAYS,
  };
}

/** Normalizes a SAID the way Sheets mangles it — 012345 arrives as 12345. */
export function normalizeSaid(v: unknown) {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits ? digits.padStart(6, '0') : '';
}
