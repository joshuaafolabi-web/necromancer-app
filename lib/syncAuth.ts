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
  const expected = process.env.SYNC_API_KEY;
  if (!expected) {
    console.error('SYNC_API_KEY is not set — refusing all sync requests.');
    return NextResponse.json({ error: 'Sync disabled — no SYNC_API_KEY configured' }, { status: 503 });
  }

  // Bearer header preferred; query param accepted because Apps Script's
  // UrlFetchApp makes header auth fiddly for GETs in some setups.
  const header = req.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const provided = bearer || req.nextUrl.searchParams.get('key') || '';

  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
