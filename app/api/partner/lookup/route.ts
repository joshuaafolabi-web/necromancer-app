// app/api/partner/lookup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPartnerBySaid, isSpinAvailable } from '@/lib/sheets';
import { ladderInfo, wheelTierIdx, WHEEL_TIERS } from '@/lib/scoring';

export async function GET(req: NextRequest) {
  const said = req.nextUrl.searchParams.get('said') || '';
  if (!/^\d{6}$/.test(said)) {
    return NextResponse.json({ error: 'SAID must be 6 digits' }, { status: 400 });
  }

  const partner = await getPartnerBySaid(said);
  if (!partner) {
    return NextResponse.json({ error: 'SAID not found' }, { status: 404 });
  }

  const orders = Number(partner.orders_delivered);
  const ladder = ladderInfo(orders);
  const idx = wheelTierIdx(orders);
  const wheelLocked = idx < 0;
  const wheelTier = wheelLocked ? null : WHEEL_TIERS[idx];
  const jackpot = WHEEL_TIERS[WHEEL_TIERS.length - 1];
  const toJackpot = Math.max(jackpot.minOrders - orders, 0);
  const spinAvailable = wheelTier ? await isSpinAvailable(said, wheelTier.name) : false;

  return NextResponse.json({
    partner: {
      storeName: partner.store_name,
      said: partner.said,
      amEmail: partner.am_email,
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
      locked: wheelLocked,
      tierName: wheelTier?.name ?? null,
      ordersToUnlockFirst: wheelLocked ? WHEEL_TIERS[0].minOrders - orders : null,
      ordersToJackpot: toJackpot,
      spinAvailable,
    },
  });
}
