// app/api/partner/lookup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { findPartner, readState } from '@/lib/blobStore';
import {
  MILESTONES, nextClaimable, nextUpcoming, challengeState,
  CREDIT_CAP_ENABLED, LIFETIME_CREDIT_CAP, normalizeSaid,
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
    const claimedNames = new Set(state.spins.map((s) => s.wheelTier));

    // The spin button always targets this one milestone next — the first
    // one orders has already reached but hasn't been claimed yet.
    const current = nextClaimable(orders, claimedNames);
    // Once nothing reached is left unclaimed, "next" becomes the next
    // threshold not yet reached at all, purely for the popup/progress copy.
    const upcoming = current ? null : nextUpcoming(orders);

    // Ads Credit Balance is spin-driven only — sum of what's actually been
    // won so far, not anything implied by order count alone. Stays ₦0 until
    // a claim resolves in the partner's favour.
    const lifetimeCredit = state.spins.reduce((s, spin) => s + spin.credit, 0);

    return NextResponse.json({
      // No amEmail. Anyone can try 6-digit SAIDs, and a lucky guess should
      // not hand back a staff email address.
      partner: {
        storeName: partner.storeName,
        said,
        tier: partner.tier,
        ordersDelivered: orders,
      },
      // Every milestone with its reached/claimed state, for the progress
      // track UI — replaces the old continuous ladder rungs.
      milestones: MILESTONES.map((m) => ({
        name: m.name,
        label: m.label,
        minOrders: m.minOrders,
        kind: m.kind,
        reached: orders >= m.minOrders,
        claimed: claimedNames.has(m.name),
      })),
      wheel: {
        spinAvailable: !!current,
        current: current ? { name: current.name, label: current.label, kind: current.kind } : null,
        nextMilestoneLabel: upcoming?.label ?? null,
        ordersToNextMilestone: upcoming ? Math.max(upcoming.minOrders - orders, 0) : null,
      },
      credit: {
        lifetimeEarned: lifetimeCredit,
        cap: CREDIT_CAP_ENABLED ? LIFETIME_CREDIT_CAP : null,
        atCap: CREDIT_CAP_ENABLED && lifetimeCredit >= LIFETIME_CREDIT_CAP,
      },
      challenge: challengeState(state.acceptedAt),
      // Full win history, most recent first. `won` lets the UI show a loss
      // ("no prize this time") distinctly from an actual claimed prize.
      spins: [...state.spins]
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((s) => ({ wheelTier: s.wheelTier, prizeLabel: s.prizeLabel, won: s.won, at: s.at })),
    });
  } catch (err) {
    console.error('lookup failed', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
