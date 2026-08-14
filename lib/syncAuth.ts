// lib/syncAuth.ts
//
// The sync endpoints are the only inbound surface Apps Script talks to, and
// they carry the whole partner roster — so they're gated on a shared secret
// held in Netlify env and in the Apps Script's Script Properties.
//
// Fails closed: with no SYNC_API_KEY configured, every sync request is
// refused rather than left open.

import { NextRequest, NextResponse } from 'next/server';

export function checkSyncAuth(req: NextRequest): NextResponse | null {
  // Trimmed on both sides. Pasting a key into the Netlify UI very easily
  // carries a trailing newline or space, which produces a 401 that looks
  // identical to a wrong key.
  const expected = (process.env.SYNC_API_KEY || '').trim();

  if (!expected) {
    console.error('SYNC_API_KEY is not set — refusing all sync requests.');
    return NextResponse.json(
      { error: 'Sync disabled — no SYNC_API_KEY configured in Netlify' },
      { status: 503 }
    );
  }

  const header = req.headers.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  // Query fallback: some proxy layers strip Authorization headers, and when
  // that happens the header simply arrives empty with no other signal.
  const query = (req.nextUrl.searchParams.get('key') || '').trim();
  const provided = bearer || query;

  if (provided !== expected) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        // Enough to tell a stripped header apart from a whitespace mismatch
        // without putting either secret in a log. Lengths and presence only.
        diagnostic: {
          authHeaderPresent: header.length > 0,
          keySeenIn: bearer ? 'header' : query ? 'query' : 'neither',
          receivedLength: provided.length,
          expectedLength: expected.length,
          hint:
            provided.length === 0
              ? 'No key reached the server — the Authorization header was stripped, or the query fallback is missing.'
              : provided.length !== expected.length
                ? 'Lengths differ — likely a trailing space or newline on one side, or genuinely different values.'
                : 'Same length, different value — the two secrets do not match.',
        },
      },
      { status: 401 }
    );
  }
  return null;
}
