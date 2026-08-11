// lib/sheets.ts
//
// Data access layer. Two modes, chosen by env var — mirrors the
// BIGQUERY_MODE pattern used in the earlier FastAPI build:
//
//   SHEETS_MODE=local (default) — reads/writes data/partners.local.json,
//     a flat-file stand-in for the Sheet. Zero setup, use this until the
//     real Google Sheet + service account are ready.
//   SHEETS_MODE=live — reads/writes the real Google Sheet via a service
//     account. Requires GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
//     GOOGLE_SERVICE_ACCOUNT_KEY (see README for setup).
//
// Sheet schema this expects (see README for the exact tab layout):
//   Partners tab: store_id | store_name | said | am_email | segment | orders_delivered | campaign_start_date
//   SpinLog tab (append-only): said | wheel_tier | prize | timestamp
//   AMs tab: am_name | am_email

import fs from 'fs';
import path from 'path';

export type Partner = {
  store_id: string;
  store_name: string;
  said: string;
  am_email: string;
  segment: string; // 'Tier 1'..'Tier 4'
  orders_delivered: number;
  campaign_start_date: string;
};

export type AM = { am_name: string; am_email: string };

export type SpinLogRow = { said: string; wheel_tier: string; prize: string; timestamp: string };

const MODE = process.env.SHEETS_MODE || 'local';
const LOCAL_PATH = path.join(process.cwd(), 'data', 'partners.local.json');
const APPS_SCRIPT_BASE = process.env.APPS_SCRIPT_BASE_URL || '';
const APPS_SCRIPT_KEY = process.env.APPS_SCRIPT_API_KEY || '';

// ---------------------------------------------------------------------------
// LOCAL MODE — flat JSON file, mutated in place. Good enough for a Vercel
// deploy without a real Sheet yet; swap to 'live' the moment credentials exist.
// ---------------------------------------------------------------------------
type LocalDb = { partners: Partner[]; ams: AM[]; spinLog: SpinLogRow[] };

function readLocalDb(): LocalDb {
  const raw = fs.readFileSync(LOCAL_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeLocalDb(db: LocalDb) {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(db, null, 2));
}

// ---------------------------------------------------------------------------
// LIVE MODE — Google Sheets API v4 via a service account.
// googleapis is dynamically imported so local mode never needs it installed
// as a hard runtime dependency in environments without it configured.
// ---------------------------------------------------------------------------
async function getSheetsClient() {
  const { google } = await import('googleapis');
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SHEET_ID = () => process.env.GOOGLE_SHEETS_ID as string;

function rowsToObjects<T>(rows: string[][]): T[] {
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length && r[0] !== '')
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])) as T);
}

async function readSheetTab<T>(tab: string): Promise<T[]> {
  // If an Apps Script proxy is configured, use it instead of the Google
  // Sheets API — this avoids needing a service account and works for quick
  // pilots where the Apps Script web app runs as the sheet owner.
  if (MODE === 'live' && APPS_SCRIPT_BASE) {
    const url = new URL(APPS_SCRIPT_BASE);
    url.searchParams.set('action', tab === 'Partners' ? 'list_partners' : tab === 'AMs' ? 'get_ams' : 'get_spinlog');
    url.searchParams.set('apiKey', APPS_SCRIPT_KEY);
    const res = await fetch(url.toString());
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    if (tab === 'Partners') return (json.partners || []) as T[];
    if (tab === 'AMs') return (json.ams || []) as T[];
    return (json.spinLog || []) as T[];
  }

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: `${tab}!A1:Z10000`,
  });
  return rowsToObjects<T>((res.data.values as string[][]) || [['']]);
}

async function appendSheetRow(tab: string, row: (string | number)[]) {
  if (MODE === 'live' && APPS_SCRIPT_BASE) {
    const body: any = { apiKey: APPS_SCRIPT_KEY };
    if (tab === 'SpinLog' || tab.toLowerCase() === 'spinlog') {
      // Apps Script expects a spin action
      body.action = 'spin';
      body.said = String(row[0] || '');
      body.prizeLabel = String(row[2] || '');
      body.prizeIndex = row[1] || 0;
      body.method = 'server';
    } else {
      // No generic append implemented; fall back to Sheets API path
      const sheets = await getSheetsClient();
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID(),
        range: `${tab}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
      return;
    }

    const res = await fetch(APPS_SCRIPT_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return;
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

async function updateSheetCell(tab: string, rowIndex1Based: number, colLetter: string, value: string | number) {
  if (MODE === 'live' && APPS_SCRIPT_BASE) {
    // Apps Script supports an increment_orders action; use it for the common
    // case of bumping orders. Direct cell mapping isn't implemented here.
    throw new Error('updateSheetCell not supported via Apps Script proxy. Use incrementOrders instead.');
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID(),
    range: `${tab}!${colLetter}${rowIndex1Based}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

// ---------------------------------------------------------------------------
// Public API — same shape regardless of mode
// ---------------------------------------------------------------------------
export async function getAllPartners(): Promise<Partner[]> {
  if (MODE === 'local') return readLocalDb().partners;
  return readSheetTab<Partner>('Partners');
}

export async function getAllAMs(): Promise<AM[]> {
  if (MODE === 'local') return readLocalDb().ams;
  return readSheetTab<AM>('AMs');
}

export async function getSpinLog(): Promise<SpinLogRow[]> {
  if (MODE === 'local') return readLocalDb().spinLog;
  return readSheetTab<SpinLogRow>('SpinLog');
}

export async function getPartnerBySaid(said: string): Promise<Partner | undefined> {
  if (MODE === 'local') return readLocalDb().partners.find((p) => p.said === said);
  if (MODE === 'live' && APPS_SCRIPT_BASE) {
    const url = new URL(APPS_SCRIPT_BASE);
    url.searchParams.set('action', 'lookup');
    url.searchParams.set('said', said);
    url.searchParams.set('apiKey', APPS_SCRIPT_KEY);
    const res = await fetch(url.toString());
    const json = await res.json();
    if (json.error) return undefined;
    return (json.partner || undefined) as Partner;
  }
  const all = await getAllPartners();
  return all.find((p) => p.said === said);
}

/** True if this partner has not yet spun the given wheel tier. */
export async function isSpinAvailable(said: string, wheelTier: string): Promise<boolean> {
  const log = await getSpinLog();
  // Apps Script may return different key names; normalize when checking
  return !log.some((r) => String((r as any).said || (r as any).SAID || (r as any).Said) === said && String((r as any).wheel_tier || (r as any).wheelTier || (r as any).wheel_tier) === wheelTier);
}

/** Records a spin result. Local mode appends to the JSON array; live mode
 * uses Apps Script proxy when configured, otherwise appends to the sheet. */
export async function recordSpin(said: string, wheelTier: string, prize: string): Promise<void> {
  const timestamp = new Date().toISOString();
  if (MODE === 'local') {
    const db = readLocalDb();
    db.spinLog.push({ said, wheel_tier: wheelTier, prize, timestamp });
    writeLocalDb(db);
    return;
  }

  if (MODE === 'live' && APPS_SCRIPT_BASE) {
    const res = await fetch(APPS_SCRIPT_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'spin', apiKey: APPS_SCRIPT_KEY, said, prizeLabel: prize, prizeIndex: 0, method: 'server' }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return;
  }

  await appendSheetRow('SpinLog', [said, wheelTier, prize, timestamp]);
}

/** Bumps a partner's delivered-order count. Used by the demo "simulate an
 * order" control and by any real order-webhook integration you wire in later. */
export async function incrementOrders(said: string, by = 1): Promise<Partner | undefined> {
  if (MODE === 'local') {
    const db = readLocalDb();
    const p = db.partners.find((x) => x.said === said);
    if (!p) return undefined;
    p.orders_delivered += by;
    writeLocalDb(db);
    return p;
  }

  if (MODE === 'live' && APPS_SCRIPT_BASE) {
    const res = await fetch(APPS_SCRIPT_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'increment_orders', apiKey: APPS_SCRIPT_KEY, said, by }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return undefined; // apps script returns success; if you want updated partner, call getPartnerBySaid after
  }

  const all = await readSheetTab<Partner>('Partners');
  const rowIndex = all.findIndex((p) => p.said === said);
  if (rowIndex === -1) return undefined;
  const updated = { ...all[rowIndex], orders_delivered: Number(all[rowIndex].orders_delivered) + by };
  // Header is row 1, so data row N is at sheet row N+1. orders_delivered is
  // column F per the schema comment at the top of this file — adjust if your
  // sheet's column order differs.
  await updateSheetCell('Partners', rowIndex + 2, 'F', updated.orders_delivered);
  return updated;
}
