// lib/appsScript.ts
//
// ⚠️  OPTIONAL AND USUALLY UNUSED.
//
// The partner Arcade no longer talks to Apps Script at all. Netlify reads
// and writes Netlify Blobs (lib/blobStore.ts), and Apps Script syncs that to
// the Sheet on a timer with no inbound endpoint — see
// necromancer-standalone/sheet-api-appsscript/Sync.gs.
//
// What remains here serves only the Netlify /clash page, which needs a
// NECROCLASH Apps Script deployment published with "Anyone" access. If your
// Workspace forbids that (it probably does — that constraint is why the
// Arcade was rearchitected), leave NECROCLASH_API_URL unset and send AMs the
// domain-restricted Apps Script dashboard URL instead. That deployment is
// internal-only and needs no special permission.
//
// Optional env vars:
//   NECROCLASH_API_URL   /exec URL of an "Anyone"-access NECROCLASH deployment
//   NECROCLASH_API_KEY   matches the API_KEY script property on that script

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The Netlify /clash page needs a publicly reachable ` +
      `NECROCLASH deployment; if your Workspace does not allow one, use the ` +
      `domain-restricted Apps Script dashboard instead.`
    );
  }
  return value;
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Apps Script returned non-JSON (HTTP ${res.status}). A Google sign-in page here ` +
      `means the deployment is domain-restricted and cannot be called from a server. ` +
      `First 200 chars: ${text.slice(0, 200)}`
    );
  }
}

export async function necroclashData(amEmail: string) {
  const url = new URL(requireEnv('NECROCLASH_API_URL'));
  url.searchParams.set('action', 'necroclash');
  url.searchParams.set('am', amEmail);
  url.searchParams.set('apiKey', requireEnv('NECROCLASH_API_KEY'));
  return parseJson(await fetch(url.toString(), { cache: 'no-store' }));
}

export async function necroclashAms() {
  const url = new URL(requireEnv('NECROCLASH_API_URL'));
  url.searchParams.set('action', 'ams');
  url.searchParams.set('apiKey', requireEnv('NECROCLASH_API_KEY'));
  return parseJson(await fetch(url.toString(), { cache: 'no-store' }));
}
