// lib/blobStore.ts
//
// ⚠️  SERVER ONLY.
//
// Netlify Blobs is the runtime store. The Google Sheet remains the system of
// record — Apps Script pushes the partner roster in on a schedule and pulls
// spins and acceptances back out into SpinLog / challenge_accepted_at. This
// exists because Netlify's filesystem is read-only at runtime, so a JSON
// file can seed reads but can never accept a write.
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

import { getStore } from '@netlify/blobs';

const STORE = 'necromancer';

function store() {
  return getStore(STORE);
}

export type SyncedPartner = {
  said: string;
  storeName: string;
  segment: string;
  orders: number;
};

export type PartnerSnapshot = {
  syncedAt: string;
  partners: SyncedPartner[];
};

export type SpinRecord = {
  wheelTier: string;
  prizeIndex: number;
  prizeLabel: string;
  at: string;
};

export type PartnerState = {
  spins: SpinRecord[];
  acceptedAt: string | null;
};

const EMPTY_STATE: PartnerState = { spins: [], acceptedAt: null };

// ---------------------------------------------------------------------------
// Partner roster
// ---------------------------------------------------------------------------
export async function writePartnerSnapshot(partners: SyncedPartner[]) {
  const snapshot: PartnerSnapshot = { syncedAt: new Date().toISOString(), partners };
  await store().setJSON('partners', snapshot);
  return snapshot;
}

export async function readPartnerSnapshot(): Promise<PartnerSnapshot | null> {
  return (await store().get('partners', { type: 'json' })) as PartnerSnapshot | null;
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
  const state = (await store().get(`state/${said}`, { type: 'json' })) as PartnerState | null;
  return state ?? { ...EMPTY_STATE };
}

async function writeState(said: string, state: PartnerState) {
  await store().setJSON(`state/${said}`, state);
}

/**
 * Atomically claims the one spin for this partner and tier.
 *
 * `onlyIfNew` makes the write succeed only if the key doesn't exist, so two
 * simultaneous taps can't both win. This replaces the LockService mutex the
 * Apps Script version used, and is stronger — a compare-and-set rather than
 * a lock that can time out.
 *
 * The call is typed structurally rather than against the SDK's own types:
 * `set` returns `{ modified }` on versions that support conditional writes
 * and `void` on ones that don't, and this has to compile either way. If the
 * SDK reports nothing, the read below is the fallback — narrower than a true
 * CAS, but it still closes the window that matters (a partner double-tapping
 * seconds apart) and is no worse than the previous behaviour.
 */
type ConditionalSetStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts?: Record<string, unknown>): Promise<{ modified?: boolean } | void>;
};

export async function claimSpin(said: string, wheelTier: string): Promise<boolean> {
  const key = `spinlock/${said}/${wheelTier}`;
  const s = store() as unknown as ConditionalSetStore;

  const existing = await s.get(key);
  if (existing !== null && existing !== undefined) return false;

  const res = await s.set(key, new Date().toISOString(), { onlyIfNew: true });
  if (res && typeof res.modified === 'boolean') return res.modified;
  return true;
}

export async function releaseSpinClaim(said: string, wheelTier: string) {
  // Only used when resolution fails after the claim — otherwise a crash would
  // burn the partner's spin without giving them a prize.
  await store().delete(`spinlock/${said}/${wheelTier}`);
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
  await store().setJSON(`event/${id}`, event);
}

export async function listEvents(limit = 200) {
  const { blobs } = await store().list({ prefix: 'event/' });
  const slice = blobs.slice(0, limit);
  const events = await Promise.all(
    slice.map(async (b) => ({
      key: b.key,
      event: (await store().get(b.key, { type: 'json' })) as OutboundEvent | null,
    }))
  );
  return events.filter((e) => e.event !== null) as { key: string; event: OutboundEvent }[];
}

export async function deleteEvents(keys: string[]) {
  await Promise.all(keys.map((k) => store().delete(k)));
}
