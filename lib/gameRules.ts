// lib/gameRules.ts
//
// ⚠️  SERVER ONLY. Never import this from a file with 'use client'.
//
// It holds the spin odds. Importing it into a client component would bundle
// the weight table into the browser, which PRD Section 11 forbids — the
// client must receive only the resolved outcome, never the odds. Client-safe
// display values (wedge colours) live in lib/scoring.ts instead.
//
// This is the single source of truth for the game's numbers now that Netlify
// resolves spins itself. Apps Script no longer computes any of it.

export const CREDIT_STEPS = [
  { orders: 0, label: '₦0', credit: 0 },
  { orders: 5, label: '₦5K', credit: 5000 },
  { orders: 10, label: '₦10K', credit: 10000 },
  { orders: 15, label: '₦12.5K', credit: 12500 },
  { orders: 20, label: '₦15K', credit: 15000 },
  { orders: 30, label: '₦20K', credit: 20000 },
  { orders: 40, label: '₦25K', credit: 25000 },
] as const;

export const WHEEL_TIERS = [
  { name: 'Starter', minOrders: 5 },
  { name: 'Rising', minOrders: 8 },
  { name: 'Surge', minOrders: 10 },
  { name: 'Ascension', minOrders: 12 },
  { name: 'Zenith', minOrders: 15 },
  { name: 'Jackpot', minOrders: 20 },
] as const;

/**
 * PRD Section 15 prize pool. `weights` is indexed to match WHEEL_TIERS
 * (Starter → Jackpot) and each column sums to 100 — assertWeightsValid()
 * checks that, and the sync endpoint runs it on boot so a typo fails loudly
 * rather than quietly skewing the economics.
 *
 * The array order is a wire contract: the API returns prizeIndex into it and
 * the wheel renders wedges in this order.
 */
export const PRIZES = [
  { label: 'Free Packaging', cash: 0,     weights: [40, 25,  18, 12, 8,  4] },
  { label: 'Branding Kit',   cash: 0,     weights: [25, 25,  20, 15, 10, 6] },
  { label: '₦5K Credit',     cash: 5000,  weights: [20, 20,  18, 15, 12, 8] },
  { label: 'IG Feature',     cash: 0,     weights: [10, 12,  14, 15, 15, 12] },
  { label: '₦10K Credit',    cash: 10000, weights: [4,  10,  15, 18, 20, 20] },
  { label: 'Photography',    cash: 0,     weights: [1,  5,   8,  12, 15, 18] },
  { label: '₦25K Credit',    cash: 25000, weights: [0,  2.5, 6,  11, 16, 24] },
  { label: 'Photo + ₦25K',   cash: 25000, weights: [0,  0.5, 1,  2,  4,  8] },
] as const;

// PRD Section 13 / Open Question 1. Set to false only with Finance sign-off.
export const CREDIT_CAP_ENABLED = true;
export const LIFETIME_CREDIT_CAP = 25000;
export const CHALLENGE_DAYS = 30;

export const PRIZE_LABELS = PRIZES.map((p) => p.label);
export const CREDIT_STEP_LABELS = CREDIT_STEPS.map((s) => ({ orders: s.orders, label: s.label }));

export function assertWeightsValid() {
  WHEEL_TIERS.forEach((tier, t) => {
    const sum = PRIZES.reduce((s, p) => s + p.weights[t], 0);
    if (Math.abs(sum - 100) > 0.001) {
      throw new Error(`PRIZES: ${tier.name} column sums to ${sum}, expected 100`);
    }
  });
}

export function ladderInfo(orders: number) {
  let idx = 0;
  for (let i = CREDIT_STEPS.length - 1; i >= 0; i--) {
    if (orders >= CREDIT_STEPS[i].orders) { idx = i; break; }
  }
  const cur = CREDIT_STEPS[idx];
  const next = CREDIT_STEPS[idx + 1] ?? null;
  const pct = next
    ? Math.min(100, Math.round(((orders - cur.orders) / (next.orders - cur.orders)) * 100))
    : 100;
  return { idx, cur, next, pct };
}

export function wheelTierIdx(orders: number) {
  for (let i = WHEEL_TIERS.length - 1; i >= 0; i--) {
    if (orders >= WHEEL_TIERS[i].minOrders) return i;
  }
  return -1;
}

export function cashForPrizeLabel(label: string) {
  return PRIZES.find((p) => p.label === label)?.cash ?? 0;
}

/**
 * Resolves a spin against the tier's own weight column, then applies the
 * lifetime credit cap: any prize that would push the partner past
 * LIFETIME_CREDIT_CAP is dropped from the pool. Drawing against the reduced
 * total redistributes its weight proportionally across what remains, which
 * is the reweighting PRD Section 13 asks for.
 */
export function resolveSpin(tierIdx: number, lifetimeCredit: number) {
  const pool: { index: number; weight: number }[] = [];

  PRIZES.forEach((prize, i) => {
    const w = prize.weights[tierIdx];
    if (w <= 0) return;
    if (CREDIT_CAP_ENABLED && prize.cash > 0 && lifetimeCredit + prize.cash > LIFETIME_CREDIT_CAP) return;
    pool.push({ index: i, weight: w });
  });

  // Every tier keeps four non-monetary prizes even fully capped, so an empty
  // pool means the table itself is malformed.
  if (!pool.length) throw new Error(`No eligible prizes for tier ${tierIdx}`);

  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return { index: entry.index, label: PRIZES[entry.index].label };
  }
  const last = pool[pool.length - 1];
  return { index: last.index, label: PRIZES[last.index].label };
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
