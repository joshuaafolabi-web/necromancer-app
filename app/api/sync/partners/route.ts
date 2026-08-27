// app/api/sync/partners/route.ts
//
// Apps Script pushes the Partners tab here on a daily trigger, just after
// your 6am refresh. This is a push, not a pull — Netlify never reaches into
// Google, which is what keeps the Apps Script project free of any inbound
// web-app deployment for an admin to approve.
import { NextRequest, NextResponse } from 'next/server';
import { checkSyncAuth } from '@/lib/syncAuth';
import { writePartnerSnapshot, type SyncedPartner } from '@/lib/blobStore';
import { normalizeSaid } from '@/lib/gameRules';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = checkSyncAuth(req);
  if (denied) return denied;

  let body: { partners?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  if (!Array.isArray(body.partners)) {
    return NextResponse.json({ error: 'Expected { partners: [...] }' }, { status: 400 });
  }

  const skipped: string[] = [];
  const partners: SyncedPartner[] = [];

  for (const raw of body.partners as Record<string, unknown>[]) {
    const said = normalizeSaid(raw.said);
    if (!/^\d{6}$/.test(said)) {
      skipped.push(`bad said: ${String(raw.said)}`);
      continue;
    }
    partners.push({
      said,
      storeName: String(raw.storeName ?? '').trim() || 'Your store',
      tier: String(raw.tier ?? '').trim(),
      orders: Number(raw.orders) || 0,
    });
  }

  // Replacing the whole snapshot rather than merging means a partner removed
  // from the Sheet disappears here too, instead of lingering forever.
  const snapshot = await writePartnerSnapshot(partners);

  return NextResponse.json({
    ok: true,
    received: (body.partners as unknown[]).length,
    stored: partners.length,
    skipped,
    syncedAt: snapshot.syncedAt,
  });
}
