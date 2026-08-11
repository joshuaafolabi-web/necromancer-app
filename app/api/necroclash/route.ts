// app/api/necroclash/route.ts
//
// Everything here is DERIVED live from the Partners tab + a static AM
// roster — there's no separate am_matches/coven_raids table yet (that's a
// Phase 2 item from the PRD). Soul Duel and Coven Clash pairings are
// deterministic (adjacent AMs by current EP rank), which is fine for a
// pilot but should move to a real weekly-assignment table once this proves
// out — swap the pairing functions below for a table read at that point.

import { NextRequest, NextResponse } from 'next/server';
import { getAllPartners, getAllAMs } from '@/lib/sheets';
import { epForPartner, rankForEp, ladderInfo } from '@/lib/scoring';

async function buildLeaderboard() {
  const [partners, ams] = await Promise.all([getAllPartners(), getAllAMs()]);

  const rows = ams.map((am) => {
    const mine = partners.filter((p) => p.am_email === am.am_email);
    const totalEp = mine.reduce((s, p) => s + epForPartner(p.segment, Number(p.orders_delivered)), 0);
    const reactivations = mine.filter((p) => ladderInfo(Number(p.orders_delivered)).cur.credit > 0).length;
    return {
      amName: am.am_name,
      amEmail: am.am_email,
      ep: Math.round(totalEp),
      reactivations,
      partnerCount: mine.length,
      rank: rankForEp(totalEp),
    };
  });

  return rows.sort((a, b) => b.ep - a.ep);
}

export async function GET(req: NextRequest) {
  const selfEmail = req.nextUrl.searchParams.get('am') || '';
  const leaderboard = await buildLeaderboard();

  const selfIdx = leaderboard.findIndex((r) => r.amEmail === selfEmail);
  const self = selfIdx >= 0 ? leaderboard[selfIdx] : leaderboard[0];
  const effectiveIdx = selfIdx >= 0 ? selfIdx : 0;

  // Soul Duel: paired against the next AM down the board (wraps to top).
  const rival = leaderboard[(effectiveIdx + 1) % leaderboard.length];
  const maxEp = Math.max(...leaderboard.map((r) => r.ep), 1);
  const selfPct = Math.round((self.ep / maxEp) * 100);
  const rivalPct = Math.round((rival.ep / maxEp) * 100);

  // Coven Clash: self + the AM two spots down, vs the next two after that.
  const mate = leaderboard[(effectiveIdx + 2) % leaderboard.length];
  const oppA = leaderboard[(effectiveIdx + 3) % leaderboard.length];
  const oppB = leaderboard[(effectiveIdx + 4) % leaderboard.length];

  const partners = await getAllPartners();
  // Reckoning target: the Tier 2 (Leviathan) partner with the fewest orders
  // delivered so far among self + mate's combined portfolio — i.e. the
  // hardest Whale still standing.
  const covenPartnerEmails = new Set([self.amEmail, mate.amEmail]);
  const leviathans = partners
    .filter((p) => p.segment === 'Tier 2' && covenPartnerEmails.has(p.am_email))
    .sort((a, b) => Number(a.orders_delivered) - Number(b.orders_delivered));
  const boss = leviathans[0];
  const bossLadder = boss ? ladderInfo(Number(boss.orders_delivered)) : null;

  const rivalCovenEmails = new Set([oppA.amEmail, oppB.amEmail]);
  const rivalLeviathans = partners
    .filter((p) => p.segment === 'Tier 2' && rivalCovenEmails.has(p.am_email))
    .sort((a, b) => Number(a.orders_delivered) - Number(b.orders_delivered));
  const rivalBossLadder = rivalLeviathans[0] ? ladderInfo(Number(rivalLeviathans[0].orders_delivered)) : null;

  // Weekly quest: reactivate 2 Leviathans — progress = how many Tier 2
  // partners in self's own portfolio have reached any paid credit tier.
  const myLeviathansReactivated = partners.filter(
    (p) => p.am_email === self.amEmail && p.segment === 'Tier 2' && ladderInfo(Number(p.orders_delivered)).cur.credit > 0
  ).length;

  return NextResponse.json({
    leaderboard,
    self,
    duel: {
      rival,
      selfPct,
      rivalPct,
      selfLeading: self.ep >= rival.ep,
    },
    coven: {
      mate: mate.amName,
      rivalA: oppA.amName,
      rivalB: oppB.amName,
      boss: boss
        ? { name: boss.store_name, segmentLabel: 'Leviathan · Tier 2', progressPct: bossLadder?.pct ?? 0 }
        : null,
      rivalProgressPct: rivalBossLadder?.pct ?? 0,
    },
    quest: {
      text: 'Reactivate 2 Leviathans this week',
      progress: Math.min(myLeviathansReactivated, 2),
      target: 2,
      complete: myLeviathansReactivated >= 2,
    },
  });
}
