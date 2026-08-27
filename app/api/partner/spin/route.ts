// app/api/partner/spin/route.ts
//
// The claim is resolved here, server-side, against the one milestone the
// partner's order count has next made claimable. The client receives only
// win/loss and the label — never the odds (PRD Section 11's spirit, carried
// over from the old weighted wheel).
import { NextRequest, NextResponse } from 'next/server';
import {
  findPartner, readState, readPartnerSnapshot, claimSpin, releaseSpinClaim, recordSpin,
} from '@/lib/blobStore';
import { nextClaimable, resolveMilestone, normalizeSaid } from '@/lib/gameRules';

export const dynamic = 'force-dynamic';

/** True if `said` is among the top 5 by orders delivered, counting only
 *  partners who've also reached `minOrders`. Ties at the boundary resolve by
 *  whatever order the roster happens to sort in — acceptable for a pilot,
 *  not a guarantee worth over-engineering before real data exists. */
function isTopFive(said: string, minOrders: number, partners: { said: string; orders: number }[]): boolean {
  const cohort = partners.filter((p) => p.orders >= minOrders).sort((a, b) => b.orders - a.orders);
  return cohort.slice(0, 5).some((p) => p.said === said);
}

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
    const state = await readState(said);
    const claimedNames = new Set(state.spins.map((s) => s.wheelTier));
    const milestone = nextClaimable(orders, claimedNames);
    if (!milestone) {
      return NextResponse.json({ error: 'No milestone available to claim right now' }, { status: 403 });
    }

    // The Instagram rank gate can change as the roster grows, so a partner
    // who isn't top 5 yet gets to try again later rather than burning their
    // one claim on a permanent "not yet" — nothing is locked on a miss here.
    if (milestone.requiresTopRank) {
      const snapshot = await readPartnerSnapshot();
      const qualifies = isTopFive(said, milestone.minOrders, snapshot?.partners ?? []);
      if (!qualifies) {
        return NextResponse.json({
          wheelTier: milestone.name,
          won: false,
          prizeLabel: milestone.label,
          notYetRanked: true,
        });
      }
    }

    // Atomic claim. Two simultaneous taps both pass the check above; only
    // one wins here, so only one outcome is ever recorded per milestone.
    const claimed = await claimSpin(said, milestone.name);
    if (!claimed) {
      return NextResponse.json({ error: 'This milestone has already been claimed' }, { status: 409 });
    }

    try {
      const lifetimeCredit = state.spins.reduce((s, spin) => s + spin.credit, 0);
      const result = resolveMilestone(milestone, lifetimeCredit);

      await recordSpin(said, {
        wheelTier: milestone.name,
        prizeLabel: result.label,
        credit: result.credit,
        won: result.won,
        at: new Date().toISOString(),
      });

      const nextAfter = nextClaimable(orders, new Set([...claimedNames, milestone.name]));

      return NextResponse.json({
        wheelTier: milestone.name,
        won: result.won,
        prizeLabel: result.label,
        nextAvailable: !!nextAfter,
      });
    } catch (err) {
      // Give the claim back rather than burning it on an error the partner
      // didn't cause.
      await releaseSpinClaim(said, milestone.name);
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
