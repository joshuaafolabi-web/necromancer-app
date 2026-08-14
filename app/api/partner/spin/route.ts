// app/api/partner/spin/route.ts
//
// The spin is resolved here, server-side, against the tier's own weight
// column. The client receives only the resolved index and label — never the
// odds (PRD Section 11).
import { NextRequest, NextResponse } from 'next/server';
import { findPartner, readState, claimSpin, releaseSpinClaim, recordSpin } from '@/lib/blobStore';
import {
  ladderInfo, wheelTierIdx, WHEEL_TIERS, cashForPrizeLabel, resolveSpin,
  PRIZE_LABELS, normalizeSaid,
} from '@/lib/gameRules';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let rawSaid = '';
  try {
    ({ said: rawSaid } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  const said = normalizeSaid(rawSaid);
  if (!/^\d{6}$/.test(said)) {
    return NextResponse.json({ error: 'SAID must be 6 digits' }, { status: 400 });
  }

  try {
    const partner = await findPartner(said);
    if (!partner) return NextResponse.json({ error: 'SAID not found' }, { status: 404 });

    const orders = partner.orders;
    const tierIdx = wheelTierIdx(orders);
    if (tierIdx < 0) {
      return NextResponse.json({ error: 'No wheel tier unlocked yet' }, { status: 403 });
    }
    const tier = WHEEL_TIERS[tierIdx];

    const state = await readState(said);
    if (state.spins.some((s) => s.wheelTier === tier.name)) {
      return NextResponse.json({ error: 'Spin already used for this tier' }, { status: 409 });
    }

    // Atomic claim. Two simultaneous taps both pass the check above; only
    // one wins here, so only one prize is ever awarded per tier.
    const won = await claimSpin(said, tier.name);
    if (!won) {
      return NextResponse.json({ error: 'Spin already used for this tier' }, { status: 409 });
    }

    try {
      const wheelCredit = state.spins.reduce((s, spin) => s + cashForPrizeLabel(spin.prizeLabel), 0);
      const lifetimeCredit = ladderInfo(orders).cur.credit + wheelCredit;

      const result = resolveSpin(tierIdx, lifetimeCredit);
      await recordSpin(said, {
        wheelTier: tier.name,
        prizeIndex: result.index,
        prizeLabel: result.label,
        at: new Date().toISOString(),
      });

      return NextResponse.json({
        wheelTier: tier.name,
        prizeIndex: result.index,
        prizeLabel: result.label,
        prizeLabels: PRIZE_LABELS,
      });
    } catch (err) {
      // Give the spin back rather than burning it on an error the partner
      // didn't cause.
      await releaseSpinClaim(said, tier.name);
      throw err;
    }
  } catch (err) {
    console.error('spin failed', err);
    return NextResponse.json(
      { error: 'That did not go through. Your spin was not used — please try again.' },
      { status: 500 }
    );
  }
}
