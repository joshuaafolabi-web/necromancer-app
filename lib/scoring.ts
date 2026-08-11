// lib/scoring.ts
// Ported directly from Necromancer_dc.html's Component static fields and
// ladderInfo()/wheelTierIdx() methods. Keep this file as the ONLY place
// these numbers live — both /arcade and /clash and every API route import
// from here, never redefine locally.

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

// Single flat prize pool, same odds regardless of which wheel tier is
// unlocked (per the design file — a simplification from earlier tiered-odds
// drafts). Weights sum to 100.
export const PRIZES = [
  { label: 'Free Packaging', color: '#6B7280', weight: 8 },
  { label: 'Branding Kit', color: '#7C3AED', weight: 10 },
  { label: '₦5K Credit', color: '#00A082', weight: 12 },
  { label: 'IG Feature', color: '#F59E0B', weight: 15 },
  { label: '₦10K Credit', color: '#059669', weight: 20 },
  { label: 'Photography', color: '#374151', weight: 15 },
  { label: '₦25K Credit', color: '#FFC244', weight: 16 },
  { label: 'Photo + ₦25K', color: '#B45309', weight: 4 },
] as const;

export const RANK_TIERS = [
  { rank: 'Bonecaller', minEp: 0, epLabel: '0+' },
  { rank: 'Wraithbinder', minEp: 500, epLabel: '500+' },
  { rank: 'Soulforger', minEp: 1200, epLabel: '1,200+' },
  { rank: 'Archnecromancer', minEp: 2400, epLabel: '2,400+' },
] as const;

// EP formula: base points by original segment x multiplier by highest
// credit tier that segment's partner has reached.
export const SEGMENT_BASE_POINTS: Record<string, number> = {
  'Tier 1': 30, // Sleeper / Low-Hanging Fruit
  'Tier 2': 100, // Leviathan / Churned Whale
  'Tier 3': 70, // Wanderer / Frustrated Casual
  'Tier 4': 50, // Wraith / True Zombie
};

export const CREDIT_MULTIPLIER: Record<number, number> = {
  0: 0, 5000: 1.0, 10000: 1.5, 12500: 2.0, 15000: 2.5, 20000: 3.0, 25000: 4.0,
};

export function ladderInfo(orders: number) {
  const steps = CREDIT_STEPS;
  let idx = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (orders >= steps[i].orders) { idx = i; break; }
  }
  const cur = steps[idx];
  const next = steps[idx + 1] || null;
  const pct = next
    ? Math.min(100, Math.round(((orders - cur.orders) / (next.orders - cur.orders)) * 100))
    : 100;
  return { idx, cur, next, pct };
}

export function wheelTierIdx(orders: number) {
  let idx = -1;
  for (let i = WHEEL_TIERS.length - 1; i >= 0; i--) {
    if (orders >= WHEEL_TIERS[i].minOrders) { idx = i; break; }
  }
  return idx;
}

export function rankForEp(ep: number): string {
  let rank: string = RANK_TIERS[0].rank;
  for (const t of RANK_TIERS) if (ep >= t.minEp) rank = t.rank;
  return rank;
}

export function epForPartner(segment: string, ordersDelivered: number) {
  const { cur } = ladderInfo(ordersDelivered);
  const base = SEGMENT_BASE_POINTS[segment] ?? 0;
  const mult = CREDIT_MULTIPLIER[cur.credit] ?? 0;
  return Math.round(base * mult * 10) / 10;
}

/** Resolve a spin server-side against PRIZES weights. Never expose odds to the client. */
export function resolveSpin(): { index: number; label: string } {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < PRIZES.length; i++) {
    r -= PRIZES[i].weight;
    if (r <= 0) return { index: i, label: PRIZES[i].label };
  }
  const last = PRIZES.length - 1;
  return { index: last, label: PRIZES[last].label };
}
