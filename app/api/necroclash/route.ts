// app/api/necroclash/route.ts
//
// Proxies to the NECROCLASH Apps Script, which owns the leaderboard, the
// weekly Soul Duel / Coven Clash pairings, and the quest.
//
// This route used to compute all of that itself, and the pairing logic was
// wrong: each AM was matched against whoever sat one rank below them on a
// live leaderboard, so rank 2's opponent was rank 3 while rank 2 was itself
// rank 1's opponent. No two AMs agreed on who they were duelling, and every
// delivered order reshuffled it mid-week. The Apps Script version uses a
// round-robin rotation over a fixed ordering, which is symmetric and holds
// for the week.
import { NextRequest, NextResponse } from 'next/server';
import { necroclashData, necroclashAms } from '@/lib/appsScript';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const amEmail = req.nextUrl.searchParams.get('am') || '';

  try {
    // With no ?am, hand back the roster so the client can pick one.
    if (!amEmail) {
      const list = await necroclashAms();
      if (list.error) return NextResponse.json(list, { status: 400 });
      const first = (list.ams || [])[0];
      if (!first) {
        return NextResponse.json({ error: 'The AMs tab is empty.' }, { status: 404 });
      }
      const data = await necroclashData(first.am_email);
      return NextResponse.json({ ...data, ams: list.ams });
    }

    const [data, list] = await Promise.all([necroclashData(amEmail), necroclashAms()]);
    if (data.error) return NextResponse.json(data, { status: 400 });
    return NextResponse.json({ ...data, ams: list.ams || [] });
  } catch (err) {
    console.error('necroclash: Apps Script call failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upstream unavailable' },
      { status: 502 }
    );
  }
}
