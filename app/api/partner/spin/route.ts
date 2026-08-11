// app/api/partner/spin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPartnerBySaid, isSpinAvailable, recordSpin } from '@/lib/sheets';
import { wheelTierIdx, WHEEL_TIERS, resolveSpin } from '@/lib/scoring';

export async function POST(req: NextRequest) {
  const { said } = await req.json();
  if (!/^\d{6}$/.test(said || '')) {
    return NextResponse.json({ error: 'SAID must be 6 digits' }, { status: 400 });
  }

  const partner = await getPartnerBySaid(said);
  if (!partner) return NextResponse.json({ error: 'SAID not found' }, { status: 404 });

  const idx = wheelTierIdx(Number(partner.orders_delivered));
  if (idx < 0) return NextResponse.json({ error: 'No wheel tier unlocked yet' }, { status: 403 });

  const wheelTier = WHEEL_TIERS[idx];
  const available = await isSpinAvailable(said, wheelTier.name);
  if (!available) {
    return NextResponse.json({ error: 'Spin already used for this tier' }, { status: 409 });
  }

  // Resolution happens here, server-side, against weights the client never
  // sees — this is the RNG-integrity requirement from the PRD.
  const result = resolveSpin();
  await recordSpin(said, wheelTier.name, result.label);

  return NextResponse.json({ wheelTier: wheelTier.name, prizeIndex: result.index, prizeLabel: result.label });
}
