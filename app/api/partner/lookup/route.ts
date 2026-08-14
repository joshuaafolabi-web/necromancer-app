// app/api/partner/lookup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { findPartner, readState } from '@/lib/blobStore';
import {
  ladderInfo, wheelTierIdx, WHEEL_TIERS, cashForPrizeLabel, challengeState,
  CREDIT_CAP_ENABLED, LIFETIME_CREDIT_CAP, PRIZE_LABELS, CREDIT_STEP_LABELS, normalizeSaid,
} from '@/lib/gameRules';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const said = normalizeSaid(req.nextUrl.searchParams.get('said'));
  if (!/^\d{6}$/.test(said)) {
    return NextResponse.json({ error: 'SAID must be 6 digits' }, { status: 400 });
  }

  try {
    const partner = await findPartner(said);
    if (!partner) {
      return NextResponse.json({ error: 'SAID not found' }, { status: 404 });
    }

    const state = await readState(said);
    const orders = partner.orders;
    const ladder = ladderInfo(orders);
    const idx = wheelTierIdx(orders);
    const locked = idx < 0;
    const tier = locked ? null : WHEEL_TIERS[idx];
    const jackpot = WHEEL_TIERS[WHEEL_TIERS.length - 1];

    const wheelCredit = state.spins.reduce((s, spin) => s + cashForPrizeLabel(spin.prizeLabel), 0);
    const lifetimeCredit = ladder.cur.credit + wheelCredit;

    return NextResponse.json({
      // No amEmail. Anyone can try 6-digit SAIDs, and a lucky guess should
      // not hand back a staff email address.
      partner: {
        storeName: partner.storeName,
        said,
        segment: partner.segment,
        ordersDelivered: orders,
      },
      ladder: {
        currentLabel: ladder.cur.label,
        currentCredit: ladder.cur.credit,
        nextLabel: ladder.next?.label ?? null,
        ordersToNext: ladder.next ? ladder.next.orders - orders : null,
        progressPct: ladder.pct,
        stepIndex: ladder.idx,
      },
      wheel: {
        locked,
        tierName: tier?.name ?? null,
        ordersToUnlockFirst: locked ? WHEEL_TIERS[0].minOrders - orders : null,
        ordersToJackpot: Math.max(jackpot.minOrders - orders, 0),
        spinAvailable: tier ? !state.spins.some((s) => s.wheelTier === tier.name) : false,
      },
      credit: {
        lifetimeEarned: lifetimeCredit,
        cap: CREDIT_CAP_ENABLED ? LIFETIME_CREDIT_CAP : null,
        atCap: CREDIT_CAP_ENABLED && lifetimeCredit >= LIFETIME_CREDIT_CAP,
      },
      challenge: challengeState(state.acceptedAt),
      // Labels only, never weights — the wheel draws equal wedges so its
      // appearance leaks nothing about the real odds.
      prizeLabels: PRIZE_LABELS,
      creditSteps: CREDIT_STEP_LABELS,
    });
  } catch (err) {
    console.error('lookup failed', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
