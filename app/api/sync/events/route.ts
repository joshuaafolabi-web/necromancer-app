// app/api/sync/events/route.ts
//
// The outbound half of the sync. Apps Script GETs pending spins and
// acceptances, writes them into SpinLog / challenge_accepted_at, emails the
// Account Manager, then DELETEs the ones it handled.
//
// Delete-after-write makes this at-least-once: if the Sheet write succeeds
// but the delete call is lost, the same event is offered again. That's the
// safe direction to fail — a duplicate SpinLog row is visible and fixable,
// a dropped prize is not. Apps Script de-dupes on (said, wheel_tier) before
// appending.
import { NextRequest, NextResponse } from 'next/server';
import { checkSyncAuth } from '@/lib/syncAuth';
import { listEvents, deleteEvents } from '@/lib/blobStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = checkSyncAuth(req);
  if (denied) return denied;

  const pending = await listEvents(200);
  return NextResponse.json({
    events: pending.map((p) => ({ key: p.key, ...p.event })),
  });
}

/**
 * Acknowledgement. This is a POST rather than a DELETE because Apps Script's
 * UrlFetchApp does not reliably send a request body with DELETE, and the
 * list of handled keys has to travel somehow.
 */
export async function POST(req: NextRequest) {
  const denied = checkSyncAuth(req);
  if (denied) return denied;

  let body: { keys?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  if (!Array.isArray(body.keys)) {
    return NextResponse.json({ error: 'Expected { keys: [...] }' }, { status: 400 });
  }

  const keys = (body.keys as unknown[]).map(String).filter((k) => k.startsWith('event/'));
  await deleteEvents(keys);

  return NextResponse.json({ ok: true, deleted: keys.length });
}
