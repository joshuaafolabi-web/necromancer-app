// app/api/partner/accept/route.ts
//
// Partner accepts the 30-day challenge. The acceptance is recorded here and
// queued as an event; Apps Script picks it up on its next pull, writes
// challenge_accepted_at into the Sheet, and emails the Account Manager with
// MailApp.
//
// The AM's email address never reaches Netlify — Apps Script already has the
// Sheet, so it looks the address up on that side. The staff directory stays
// inside Workspace.
import { NextRequest, NextResponse } from 'next/server';
import { findPartner, readState, recordAcceptance } from '@/lib/blobStore';
import { challengeState, normalizeSaid } from '@/lib/gameRules';

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

    const state = await readState(said);
    if (state.acceptedAt) {
      return NextResponse.json({
        alreadyAccepted: true,
        challenge: challengeState(state.acceptedAt),
      });
    }

    const acceptedAt = new Date().toISOString();
    await recordAcceptance(said, acceptedAt);

    return NextResponse.json({
      accepted: true,
      // The notification is queued, not sent inline — it goes out on the
      // next Apps Script pull, within minutes. The partner's 30 days start
      // now regardless, so this is reported as success either way.
      notified: false,
      queued: true,
      challenge: challengeState(acceptedAt),
    });
  } catch (err) {
    console.error('accept failed', err);
    return NextResponse.json({ error: 'That did not go through. Please try again.' }, { status: 500 });
  }
}
