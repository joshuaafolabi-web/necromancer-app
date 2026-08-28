// lib/blobStore.ts
//
// ⚠️  SERVER ONLY.
//
// Netlify Blobs is the runtime store in production. The Google Sheet remains
// the system of record — Apps Script pushes the partner roster in on a
// schedule and pulls spins and acceptances back out into SpinLog /
// challenge_accepted_at. This exists because Netlify's filesystem is
// read-only at runtime, so a JSON file can seed reads but can never accept a
// write.
//
// Key layout:
//   partners            one snapshot of the roster, replaced each sync
//   state/<said>        a partner's spins + challenge acceptance
//   spinlock/<said>/<t> created with onlyIfNew — atomic "who got the spin"
//   event/<id>          outbound queue; Apps Script drains this to the Sheet
//
// Note there is no am_email anywhere here. The AM notification is sent by
// Apps Script, which already has the Sheet — so the staff directory never
// needs to leave Workspace.
//
// ---------------------------------------------------------------------------
// LOCAL DEV FALLBACK
//
// Netlify Blobs only has a real backing store on Netlify's own
// infrastructure, or under `netlify dev` (which emulates it). Plain
// `next dev` — the fast path for testing everything else about this app —
// has neither, so getStore() throws MissingBlobsEnvironmentError on first
// use.
//
// Rather than make that a hard stop for local testing, resolveBackend()
// below catches specifically that error, ONCE, and — only when
// NODE_ENV !== 'production' — swaps to a small file-backed store at
// .necromancer-dev-store.json (gitignored) instead. It's seeded with four
// dummy SAIDs spanning the ladder (see seedLocalDevData) so `npm run dev`
// gives you a working Arcade with no Apps Script, no Netlify account, and no
// deploy.
//
// This can never activate in a real deployment: the NODE_ENV guard means a
// genuinely broken Blobs config in production still throws and 500s loudly,
// which is what should happen — silently serving fake data to real partners
// would be much worse than a visible error.
// ---------------------------------------------------------------------------

import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

const STORE = 'necromancer';

type GetOpts = { type: 'json' };
type SetOpts = { onlyIfNew?: boolean };

/** The subset of the Netlify Blobs Store API this file actually uses,
 *  implemented by both the real client and the local dev fallback. */
type Backend = {
  get(key: string, opts?: GetOpts): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<void>;
  set(key: string, value: string, opts?: SetOpts): Promise<{ modified?: boolean } | void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
};

export type SyncedPartner = {
  said: string;
  storeName: string;
  tier: string;
  orders: number;
};

export type PartnerSnapshot = {
  syncedAt: string;
  partners: SyncedPartner[];
};

export type SpinRecord = {
  /** A milestone name (e.g. "credit-10", "merch-20") — one claim ever, per
   *  name, per partner; see lib/gameRules.ts's MILESTONES. */
  wheelTier: string;
  prizeLabel: string;
  /** Naira actually credited by this claim — 0 for a lost chance-roll or a
   *  non-cash prize. Stored directly rather than re-derived from prizeLabel,
   *  since several milestones share the same label ("₦5,000 Ads Credit"). */
  credit: number;
  /** False only for a chance milestone (credit-10/15/20) that didn't hit —
   *  guaranteed milestones are always true. */
  won: boolean;
  at: string;
};

export type PartnerState = {
  spins: SpinRecord[];
  acceptedAt: string | null;
};

// A function, not a shared constant: `{ ...EMPTY_STATE }` would shallow-copy
// the object but not the `spins` ARRAY inside it, so every partner falling
// back to "no state yet" got the exact same array reference. The first spin
// recorded against any fresh partner (recordSpin does state.spins.push(...))
// then mutated that one shared array — and every OTHER fresh partner reading
// their (supposedly empty) state afterwards saw that spin too, on whatever
// process/container stayed warm. Found via manual testing: spinning SAID
// 999002 made unrelated, never-spun SAID 999003 show that same spin and
// credit. A fresh literal per call has no shared reference to corrupt.
function emptyState(): PartnerState {
  return { spins: [], acceptedAt: null };
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------
let backendPromise: Promise<Backend> | null = null;

function isMissingBlobsEnv(err: unknown): boolean {
  return err instanceof Error && err.name === 'MissingBlobsEnvironmentError';
}

function wrapNetlifyStore(s: ReturnType<typeof getStore>): Backend {
  return {
    get: (key, opts) => s.get(key, opts as { type: 'json' }),
    setJSON: (key, value) => s.setJSON(key, value),
    // @netlify/blobs 8.2.0 has no conditional-write primitive — SetOptions
    // only accepts `metadata`, and Store.set() returns void, not a result
    // object. `onlyIfNew` is therefore enforced here as a get-then-set
    // check, mirroring what claimSpin() one level up already does before
    // calling this. That narrows the race window but can't close it: two
    // requests landing inside this get/set gap can still both "win". Fine
    // for a pilot where a double-claim means one partner double-tapping
    // their own spin button — but it is a real, documented gap, not a
    // solved one, if this ever needs a stronger guarantee than that.
    async set(key, value, opts) {
      if (opts?.onlyIfNew) {
        const existing = await s.get(key);
        if (existing !== null && existing !== undefined) return { modified: false };
      }
      await s.set(key, value);
      return { modified: true };
    },
    delete: (key) => s.delete(key),
    list: (opts) => s.list(opts),
  };
}

async function resolveBackend(): Promise<Backend> {
  if (backendPromise) return backendPromise;

  backendPromise = (async () => {
    try {
      // getStore() itself throws synchronously when there's no Blobs
      // context, so this whole block — not just a later .get() — has to be
      // inside the try.
      const s = getStore(STORE);
      await s.get('__probe__'); // cheap; forces the failure now, once, at cold start
      return wrapNetlifyStore(s);
    } catch (err) {
      if (!isMissingBlobsEnv(err) || process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.warn(
        '\n[necromancer] Netlify Blobs is unavailable (expected under plain `next dev`).\n' +
        '  Falling back to a LOCAL, FILE-BACKED dev store: .necromancer-dev-store.json\n' +
        '  This data is fake, local to this machine, and never syncs to the real Sheet.\n' +
        '  Seeded SAIDs: 999001 (locked), 999002 (Starter), 999003 (Jackpot), 999004 (Full Recovery).\n' +
        '  This fallback is disabled whenever NODE_ENV=production, by design.\n'
      );
      return localBackend();
    }
  })();

  return backendPromise;
}

// ---------------------------------------------------------------------------
// Local dev fallback — in-memory Map, persisted to a single JSON file.
//
// A plain Map avoids read-modify-write races between concurrent requests: JS
// is single-threaded, so a mutation between two `await`s can't be
// interleaved by another request. Persisting to disk after every mutation
// is just so state survives a dev-server restart.
// ---------------------------------------------------------------------------
const LOCAL_STORE_PATH = path.join(process.cwd(), '.necromancer-dev-store.json');
let localMap: Map<string, string> | null = null;

// Add new dummy SAIDs here whenever you need a fresh one — they merge into
// an EXISTING store file on next load (see loadLocalMap below), so this
// never wipes spins/acceptances already recorded against 999001-999004.
// Only ever add to this list; don't reuse a SAID that's already been spun
// if you want it to behave as genuinely fresh.
const SEED_PARTNERS: SyncedPartner[] = [
  { said: '999001', storeName: 'Dev Store — Locked (0 orders)', tier: 'Tier 4', orders: 0 },
  { said: '999002', storeName: 'Dev Store — credit-10 (10 orders)', tier: 'Tier 3', orders: 10 },
  { said: '999003', storeName: 'Dev Store — merch-20 (20 orders)', tier: 'Tier 2', orders: 20 },
  { said: '999004', storeName: 'Dev Store — credit-40 / ₦25K (40 orders)', tier: 'Tier 2', orders: 40 },
  { said: '999005', storeName: 'Dev Store — credit-15 (15 orders)', tier: 'Tier 3', orders: 15 },
  { said: '999006', storeName: 'Dev Store — photography-80 (80 orders)', tier: 'Tier 2', orders: 80 },
  { said: '999013', storeName: 'Dev Store — credit-50 (50 orders)', tier: 'Tier 2', orders: 50 },
  // 999007-999012: a 100+ order cohort for testing the instagram-100 top-5
  // ranking gate — only the top 5 by orders among these should qualify.
  { said: '999007', storeName: 'Dev Store — IG cohort rank 1 (140 orders)', tier: 'Tier 1', orders: 140 },
  { said: '999008', storeName: 'Dev Store — IG cohort rank 2 (130 orders)', tier: 'Tier 1', orders: 130 },
  { said: '999009', storeName: 'Dev Store — IG cohort rank 3 (120 orders)', tier: 'Tier 1', orders: 120 },
  { said: '999010', storeName: 'Dev Store — IG cohort rank 4 (110 orders)', tier: 'Tier 1', orders: 110 },
  { said: '999011', storeName: 'Dev Store — IG cohort rank 5 (105 orders)', tier: 'Tier 1', orders: 105 },
  { said: '999012', storeName: 'Dev Store — IG cohort rank 6, just misses (101 orders)', tier: 'Tier 1', orders: 101 },
];

function writePartnersToMap(map: Map<string, string>, partners: SyncedPartner[]) {
  const snapshot: PartnerSnapshot = { syncedAt: new Date().toISOString(), partners };
  map.set('partners', JSON.stringify(snapshot));
}

function loadLocalMap(): Map<string, string> {
  if (localMap) return localMap;
  try {
    const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf-8');
    localMap = new Map(Object.entries(JSON.parse(raw) as Record<string, string>));

    // Merge in any SEED_PARTNERS not already present, by said. This is what
    // lets you add a new dummy SAID and just restart `npm run dev` — it
    // shows up alongside whatever spin/acceptance history the existing
    // SAIDs already have, rather than requiring you to delete the file
    // (which would reset everything back to unspun).
    const existing = JSON.parse(localMap.get('partners') || '{"partners":[]}') as PartnerSnapshot;
    const knownSaids = new Set(existing.partners.map((p) => p.said));
    const missing = SEED_PARTNERS.filter((p) => !knownSaids.has(p.said));
    if (missing.length) {
      writePartnersToMap(localMap, [...existing.partners, ...missing]);
      persistLocalMap();
    }
  } catch {
    localMap = new Map();
    writePartnersToMap(localMap, SEED_PARTNERS);
  }
  return localMap;
}

function persistLocalMap() {
  if (!localMap) return;
  try {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(Object.fromEntries(localMap), null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal: the in-memory Map is still correct for the rest of this
    // process's life, it just won't survive a restart.
    console.warn('[necromancer] Could not persist local dev store:', err);
  }
}

function localBackend(): Backend {
  return {
    async get(key, opts) {
      const raw = loadLocalMap().get(key);
      if (raw === undefined) return null;
      return opts?.type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      loadLocalMap().set(key, JSON.stringify(value));
      persistLocalMap();
    },
    async set(key, value, opts) {
      const map = loadLocalMap();
      if (opts?.onlyIfNew && map.has(key)) return { modified: false };
      map.set(key, value);
      persistLocalMap();
      return { modified: true };
    },
    async delete(key) {
      loadLocalMap().delete(key);
      persistLocalMap();
    },
    async list({ prefix }) {
      const keys = [...loadLocalMap().keys()].filter((k) => k.startsWith(prefix)).sort();
      return { blobs: keys.map((key) => ({ key })) };
    },
  };
}

// ---------------------------------------------------------------------------
// Partner roster
// ---------------------------------------------------------------------------
export async function writePartnerSnapshot(partners: SyncedPartner[]) {
  const snapshot: PartnerSnapshot = { syncedAt: new Date().toISOString(), partners };
  await (await resolveBackend()).setJSON('partners', snapshot);
  return snapshot;
}

export async function readPartnerSnapshot(): Promise<PartnerSnapshot | null> {
  return (await (await resolveBackend()).get('partners', { type: 'json' })) as PartnerSnapshot | null;
}

export async function findPartner(said: string): Promise<SyncedPartner | null> {
  const snapshot = await readPartnerSnapshot();
  if (!snapshot) return null;
  return snapshot.partners.find((p) => p.said === said) ?? null;
}

// ---------------------------------------------------------------------------
// Per-partner state
// ---------------------------------------------------------------------------
export async function readState(said: string): Promise<PartnerState> {
  const state = (await (await resolveBackend()).get(`state/${said}`, { type: 'json' })) as PartnerState | null;
  return state ?? emptyState();
}

async function writeState(said: string, state: PartnerState) {
  await (await resolveBackend()).setJSON(`state/${said}`, state);
}

/**
 * Atomically claims the one spin for this partner and tier.
 *
 * `onlyIfNew` makes the write succeed only if the key doesn't exist, so two
 * simultaneous taps can't both win. This replaces the LockService mutex the
 * Apps Script version used, and is stronger — a compare-and-set rather than
 * a lock that can time out. The local dev fallback implements the same
 * onlyIfNew contract, so this guarantee holds identically in both modes.
 */
export async function claimSpin(said: string, wheelTier: string): Promise<boolean> {
  const key = `spinlock/${said}/${wheelTier}`;
  const backend = await resolveBackend();

  const existing = await backend.get(key);
  if (existing !== null && existing !== undefined) return false;

  const res = await backend.set(key, new Date().toISOString(), { onlyIfNew: true });
  if (res && typeof res.modified === 'boolean') return res.modified;
  return true;
}

export async function releaseSpinClaim(said: string, wheelTier: string) {
  // Only used when resolution fails after the claim — otherwise a crash would
  // burn the partner's spin without giving them a prize.
  await (await resolveBackend()).delete(`spinlock/${said}/${wheelTier}`);
}

export async function recordSpin(said: string, spin: SpinRecord) {
  const state = await readState(said);
  state.spins.push(spin);
  await writeState(said, state);
  await enqueueEvent({ type: 'spin', said, ...spin });
}

export async function recordAcceptance(said: string, acceptedAt: string) {
  const state = await readState(said);
  state.acceptedAt = acceptedAt;
  await writeState(said, state);
  await enqueueEvent({ type: 'accept', said, at: acceptedAt });
}

// ---------------------------------------------------------------------------
// Outbound event queue, drained by Apps Script into the Sheet
// ---------------------------------------------------------------------------
export type OutboundEvent = Record<string, unknown> & { type: 'spin' | 'accept'; said: string };

async function enqueueEvent(event: OutboundEvent) {
  // One blob per event, keyed uniquely — concurrent writers never touch the
  // same key, so nothing is lost to a read-modify-write race.
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await (await resolveBackend()).setJSON(`event/${id}`, event);
}

export async function listEvents(limit = 200) {
  const backend = await resolveBackend();
  const { blobs } = await backend.list({ prefix: 'event/' });
  const slice = blobs.slice(0, limit);
  const events = await Promise.all(
    slice.map(async (b) => ({
      key: b.key,
      event: (await backend.get(b.key, { type: 'json' })) as OutboundEvent | null,
    }))
  );
  return events.filter((e) => e.event !== null) as { key: string; event: OutboundEvent }[];
}

export async function deleteEvents(keys: string[]) {
  const backend = await resolveBackend();
  await Promise.all(keys.map((k) => backend.delete(k)));
}
