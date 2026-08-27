'use client';
import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';
import Wheel from '@/components/Wheel';
import RewardGallery from '@/components/RewardGallery';

// The milestone list and prize labels now arrive with the lookup response
// rather than being declared here, so this page can't disagree with the
// backend about the rules. amEmail is no longer returned at all — anyone can
// try 6-digit SAIDs, and a lucky guess shouldn't hand back a staff email.
type SpinRecord = { wheelTier: string; prizeLabel: string; won: boolean; at: string };
type MilestoneInfo = { name: string; label: string; minOrders: number; kind: 'guaranteed' | 'chance'; reached: boolean; claimed: boolean };
type CurrentMilestone = { name: string; label: string; kind: 'guaranteed' | 'chance' };
type LookupResponse = {
  partner: { storeName: string; said: string; tier: string; ordersDelivered: number };
  milestones: MilestoneInfo[];
  wheel: { spinAvailable: boolean; current: CurrentMilestone | null; nextMilestoneLabel: string | null; ordersToNextMilestone: number | null };
  credit: { lifetimeEarned: number; cap: number | null; atCap: boolean };
  challenge: { accepted: boolean; acceptedAt: string | null; dayNumber: number | null; daysLeft: number | null; expired?: boolean };
  spins: SpinRecord[];
};

/** All partners are in Nigeria, so every timestamp shown to them renders in
 *  Africa/Lagos regardless of the device's own clock/timezone setting. */
function formatLagosTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ArcadePage() {
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<LookupResponse | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<string | null>(null);
  const [lostNote, setLostNote] = useState<string | null>(null);
  const [notYetRanked, setNotYetRanked] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [acceptNote, setAcceptNote] = useState('');
  const [milestoneNote, setMilestoneNote] = useState<string | null>(null);
  // Snapshot of which milestone is being spun for, held for the duration of
  // the spin animation + reveal so the wheel keeps showing the right wedges
  // even after `data` has refreshed to whatever milestone comes next.
  const [spinningMilestone, setSpinningMilestone] = useState<CurrentMilestone | null>(null);

  // The landing page's "type your SAID to join" box sends partners here as
  // /arcade?said=XXXXXX rather than making them re-type it. Read via
  // window.location instead of useSearchParams so this page doesn't need a
  // Suspense boundary just for a one-time query read on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromQuery = new URLSearchParams(window.location.search).get('said');
    const normalized = (fromQuery || '').replace(/\D/g, '').slice(0, 6);
    if (normalized.length === 6) {
      setSaid(normalized);
      loginWith(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptChallenge() {
    if (!data || accepting) return;
    setAccepting(true);
    setAcceptNote('');
    try {
      const res = await fetch('/api/partner/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ said: data.partner.said }),
      });
      const result = await res.json();
      if (!res.ok) {
        setAcceptNote(result.error || 'That did not go through. Please try again.');
        return;
      }
      setData((d) => (d ? { ...d, challenge: result.challenge } : d));
      // A mail failure still counts as accepted — the clock has started and
      // it's recorded, so don't tell the partner it failed. Ops chases the
      // notification separately.
      setAcceptNote(
        result.alreadyAccepted
          ? 'You had already accepted — your challenge is running.'
          : result.notified
            ? 'You are in. Your Account Manager has been notified.'
            : 'You are in. Your Account Manager will be in touch shortly.'
      );
    } catch {
      setAcceptNote('Connection problem. Please try again.');
    } finally {
      setAccepting(false);
    }
  }

  async function login() {
    await loginWith(said);
  }

  async function loginWith(rawSaid: string) {
    const normalizedSaid = rawSaid.trim();
    if (!normalizedSaid || normalizedSaid.length !== 6) {
      setError('Please enter a valid Store Address ID (SAID) to continue.');
      return;
    }

    setError('');
    try {
      const res = await fetch(`/api/partner/lookup?said=${encodeURIComponent(normalizedSaid)}`);
      const body = await res.json();
      if (!res.ok) {
        // A 502 means the backend is misconfigured, not that the SAID is
        // wrong — telling a partner "SAID not found" in that case sends
        // them to their AM to fix something that isn't broken.
        setError(
          res.status === 404
            ? 'We could not find that Store Address ID (SAID). Please check it with your Account Manager.'
            : body.error || 'Something went wrong. Please try again.'
        );
        return;
      }
      setData(body);
      setWonPrize(null);
      setLostNote(null);
      setNotYetRanked(false);
    } catch {
      setError('Connection problem. Check your internet and try again.');
    }
  }

  /** Silent re-lookup after a spin resolves — the authoritative source for
   *  credit balance and milestone state, rather than trying to patch
   *  lifetimeEarned locally (several milestones share the same prize label,
   *  so re-deriving the won amount client-side would be guesswork). */
  async function refreshLookup(forSaid: string) {
    try {
      const res = await fetch(`/api/partner/lookup?said=${encodeURIComponent(forSaid)}`);
      if (!res.ok) return;
      const body = await res.json();
      setData(body);
    } catch {
      // Best-effort — the reveal panel already has the correct outcome from
      // the spin response itself, this only refreshes balances/milestones.
    }
  }

  async function spin() {
    if (!data || spinning || !data.wheel.current) return;
    const current = data.wheel.current;
    setSpinningMilestone(current);
    setSpinning(true);
    setWonPrize(null);
    setLostNote(null);
    setNotYetRanked(false);
    setError('');

    try {
      const res = await fetch('/api/partner/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ said: data.partner.said }),
      });
      const result = await res.json();

      if (!res.ok) {
        setSpinning(false);
        setSpinningMilestone(null);
        if (res.status === 409) {
          setError('That prize has already been claimed.');
          await refreshLookup(data.partner.said);
        } else {
          setError(result.error || 'That did not go through. Please try again.');
        }
        return;
      }

      // Equal wedges regardless of the real odds, same principle as the old
      // wheel: a chance milestone shows 2 equal wedges (win / try again) so
      // the visual never leaks the actual (much stricter) probability. A
      // guaranteed milestone shows the same label on both wedges — spinning
      // still feels like something, but it's honestly a 100% reveal, not a
      // draw dressed up to look like one.
      const wedgeCount = 2;
      const landIndex = current.kind === 'chance' ? (result.won ? 0 : 1) : 0;
      const step = 360 / wedgeCount;
      const landDeg = landIndex * step + step / 2;
      setRotation((r) => r + 5 * 360 + (360 - landDeg) - (r % 360));

      setTimeout(async () => {
        setSpinning(false);
        if (result.notYetRanked) {
          setNotYetRanked(true);
        } else if (result.won) {
          setWonPrize(result.prizeLabel);
        } else {
          setLostNote(`No prize this time on the ${result.prizeLabel} draw.`);
        }
        setSpinningMilestone(null);
        await refreshLookup(data.partner.said);
      }, 3200);
    } catch {
      setSpinning(false);
      setSpinningMilestone(null);
      setError('Could not reach the server. Your spin was NOT used — please try again.');
    }
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F5F7' }}>
        <TopNav />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '44px 16px 72px' }}>
          {/* auto-fit rather than a fixed two-column split: a fixed
              gridTemplateColumns here squeezed both cards onto a phone
              screen with no fallback. This collapses to one column below
              ~700px and opens to two above it, same pattern as the home
              page. */}
          <div style={{ width: '100%', maxWidth: 1120, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            <div style={{ background: '#fff', borderRadius: 28, padding: '32px 28px', boxShadow: '0 24px 60px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 999, background: '#FFF7E3', color: '#B8860B', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                Store Reactivation
              </div>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 30, margin: '16px 0 10px', color: '#1D1D1F', lineHeight: 1.1 }}>Bring your store back to life.</h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: '#5A5A63', margin: '0 0 24px' }}>
                Check your progress, unlock the spin wheel, and discover the rewards your store can win.
              </p>
              <RewardGallery minColumns={2} />
            </div>

            <div style={{ background: '#fff', borderRadius: 28, padding: '28px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.08)', height: 'fit-content' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: '#FFF7E3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>☠</div>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 21, margin: '0 0 8px', color: '#1D1D1F' }}>Unlock your store</h2>
              <p style={{ fontSize: 13.5, color: '#8E8E93', lineHeight: 1.6, margin: '0 0 18px' }}>
                Enter your 6-digit Store Address ID (SAID) to see your progress and available wheel spin.
              </p>
              <input
                value={said}
                onChange={(e) => { setSaid(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') login(); }}
                maxLength={6}
                placeholder="000000"
                style={{ border: '1.5px solid #E5E5EA', borderRadius: 12, padding: 14, fontSize: 20, letterSpacing: '0.2em', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', outline: 'none', marginBottom: 10, color: '#1D1D1F', width: '100%' }}
              />
              {error && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10 }}>{error}</div>}
              <button onClick={login} style={{ background: '#1D1D1F', color: '#FFC244', border: 'none', borderRadius: 999, padding: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 6, width: '100%' }}>
                Unlock my Arcade
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { partner, milestones, wheel, credit, challenge, spins } = data;
  // The wheel visual reflects whichever milestone is currently being spun
  // for (during the animation) or, at rest, the one that's next up.
  const activeMilestone = spinningMilestone ?? wheel.current;
  const wedgeLabels = activeMilestone
    ? activeMilestone.kind === 'chance'
      ? [activeMilestone.label, 'Try Again']
      : [activeMilestone.label, activeMilestone.label]
    : ['—', '—'];
  // A rough "how close" bar toward the next unclaimed milestone — not
  // anchored to the previous milestone's exact threshold, just orders
  // banked so far as a fraction of orders still needed.
  const progressPct = wheel.ordersToNextMilestone != null
    ? Math.round((partner.ordersDelivered / (partner.ordersDelivered + wheel.ordersToNextMilestone)) * 100)
    : 100;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F7' }}>
      <TopNav />
      <div className="arcade-shell">
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{ borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(245,158,11,0.2)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', flex: 'none', animation: 'pulse-dot 1.6s infinite' }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: '#B45309', flex: 1 }}>Golden Hour — 2× progress on every order delivered</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#D97706', fontFamily: 'JetBrains Mono, monospace' }}>5–8PM</div>
          </div>
        </div>

        <div style={{ padding: '18px 18px 4px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>Store Reactivation</div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 21, margin: '2px 0 0', color: '#1D1D1F' }}>{partner.storeName}</h1>
        </div>

        {/* 30-day challenge. Accepting lives here rather than on the landing
            page because it needs a SAID to know which store accepted and
            which Account Manager to email. */}
        <div style={{ margin: '14px 18px 0' }}>
          {challenge.accepted ? (
            <div style={{ borderRadius: 16, padding: '14px 16px', background: '#fff', border: '1px solid rgba(0,160,130,0.22)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#00786A' }}>
                    {challenge.expired ? 'Challenge complete' : `Day ${challenge.dayNumber} of 30`}
                  </div>
                  <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>
                    {challenge.expired
                      ? 'Your 30 days are up — your Account Manager will be in touch.'
                      : `${challenge.daysLeft} day${challenge.daysLeft === 1 ? '' : 's'} left to hit your next milestone`}
                  </div>
                </div>
                <div style={{ fontSize: 22 }}>{challenge.expired ? '🏁' : '🔥'}</div>
              </div>
              {!challenge.expired && (
                <div style={{ height: 6, borderRadius: 3, background: '#F0F0F2', marginTop: 10 }}>
                  <div style={{ width: `${((challenge.dayNumber ?? 0) / 30) * 100}%`, height: '100%', borderRadius: 3, background: '#00A082' }} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ borderRadius: 16, padding: '16px', background: '#1D1D1F', boxShadow: '0 8px 24px rgba(0,0,0,0.14)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Accept the 30-day challenge</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', margin: '5px 0 14px' }}>
                Start your 30 days and we will let your Account Manager know you are in.
              </div>
              <button
                onClick={acceptChallenge}
                disabled={accepting}
                style={{ width: '100%', border: 'none', borderRadius: 999, padding: 13, fontSize: 13.5, fontWeight: 800, cursor: accepting ? 'default' : 'pointer', background: accepting ? '#4B5563' : '#FFC244', color: accepting ? '#9CA3AF' : '#1D1D1F' }}
              >
                {accepting ? 'Sending…' : 'I’m in — notify my Account Manager'}
              </button>
            </div>
          )}
          {acceptNote && (
            <div style={{ fontSize: 11.5, color: '#00786A', marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>{acceptNote}</div>
          )}
        </div>

        <div style={{ margin: '14px 18px 16px' }}>
          <div style={{ position: 'relative', borderRadius: 24, padding: 22, background: 'linear-gradient(160deg,#FFD584,#FFC244)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(69,26,3,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ads Credit Balance</div>
                {/* Spin-driven only — sum of what's actually been won so
                    far. Stays ₦0 until a claim resolves in the partner's
                    favour, then only changes on a later claim. */}
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 32, fontWeight: 800, color: '#451A03', marginTop: 5, letterSpacing: '-0.02em' }}>₦{credit.lifetimeEarned.toLocaleString()}</div>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flex: 'none' }}>🍽</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'rgba(69,26,3,0.6)', marginBottom: 7 }}>
              <span>{partner.ordersDelivered} orders</span>
              <span>
                {wheel.current
                  ? `Ready to claim: ${wheel.current.label}`
                  : wheel.nextMilestoneLabel
                    ? `${wheel.ordersToNextMilestone} more → ${wheel.nextMilestoneLabel}`
                    : 'All milestones claimed'}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.12)' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 3, background: 'rgba(0,0,0,0.3)' }} />
            </div>
          </div>
        </div>

        <div style={{ margin: '0 18px 16px', background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace', marginBottom: 16 }}>Reward Milestones</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {milestones.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flex: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                  background: m.claimed ? '#00A082' : m.reached ? '#FFC244' : '#F0F0F2',
                  color: m.claimed ? '#fff' : m.reached ? '#451A03' : '#B0B0B5',
                }}>
                  {m.claimed ? '✓' : m.minOrders}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1D1D1F' }}>{m.label}</div>
                  <div style={{ fontSize: 10.5, color: '#8E8E93', marginTop: 1 }}>
                    {m.minOrders} orders · {m.kind === 'chance' ? 'chance draw' : 'guaranteed'}
                  </div>
                </div>
                {m.claimed && <div style={{ fontSize: 10, fontWeight: 700, color: '#00A082', flex: 'none' }}>Claimed</div>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ margin: '0 18px 16px', background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1D1D1F' }}>{wheel.current ? wheel.current.label : 'No prize unlocked'}</div>
              <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>
                {partner.ordersDelivered} orders · {wheel.spinAvailable ? '1 spin available' : 'nothing to claim right now'}
                {credit.atCap && ' · ₦25K credit cap reached'}
              </div>
            </div>
            <div style={{ background: '#FFFBEC', border: '1px solid rgba(255,194,68,0.3)', borderRadius: 8, padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#B8860B', whiteSpace: 'nowrap' }}>
              {wheel.current ? 'Ready' : wheel.nextMilestoneLabel ? `${wheel.ordersToNextMilestone} to next` : 'All claimed'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            {/* Spin Now sits above the wheel and always renders — disabled
                (not hidden) once no spin is available, so tapping it always
                tells the partner what's next rather than just doing
                nothing. */}
            <button
              onClick={() => {
                if (spinning) return;
                if (wheel.spinAvailable) { spin(); return; }
                setMilestoneNote(
                  wheel.ordersToNextMilestone != null
                    ? `${wheel.ordersToNextMilestone} more order${wheel.ordersToNextMilestone === 1 ? '' : 's'} to unlock the next prize: ${wheel.nextMilestoneLabel}.`
                    : `You've claimed every prize available so far — nothing left to unlock right now.`
                );
              }}
              disabled={spinning}
              style={{
                padding: '13px 40px',
                borderRadius: 999,
                border: 'none',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.02em',
                cursor: spinning ? 'default' : wheel.spinAvailable ? 'pointer' : 'not-allowed',
                background: spinning ? '#E5E7EB' : wheel.spinAvailable ? '#FFC244' : '#F0F0F2',
                color: spinning ? '#9CA3AF' : wheel.spinAvailable ? '#1D1D1F' : '#B0B0B5',
                boxShadow: !spinning && wheel.spinAvailable ? '0 4px 16px rgba(255,194,68,0.4)' : 'none',
              }}
            >
              {spinning ? 'Spinning…' : 'Spin Now'}
            </button>
            <Wheel rotationDeg={rotation} locked={!wheel.spinAvailable && !spinning} labels={wedgeLabels} />
            {wonPrize && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>You won</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#B8860B', marginTop: 2 }}>{wonPrize}</div>
                <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 3 }}>Your AM will reach out within 48 hours</div>
              </div>
            )}
            {lostNote && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>No prize this time</div>
                <div style={{ fontSize: 13, color: '#5A5A63', marginTop: 3 }}>Keep growing your orders — your next milestone is still ahead.</div>
              </div>
            )}
            {notYetRanked && (
              <div style={{ textAlign: 'center', maxWidth: 260 }}>
                <div style={{ fontSize: 10, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>Not yet in the top 5</div>
                <div style={{ fontSize: 13, color: '#5A5A63', marginTop: 3, lineHeight: 1.5 }}>You&rsquo;ve hit 100 orders, but you&rsquo;re not in the top 5 by orders delivered yet. Keep growing — you can try again any time.</div>
              </div>
            )}
            {/* Spin failures were previously written to `error`, which only
                the logged-out login card rendered — so a failed spin looked
                like a dead button with no explanation. */}
            {error && (
              <div style={{ fontSize: 12, color: '#DC2626', textAlign: 'center', lineHeight: 1.4 }}>{error}</div>
            )}
          </div>
        </div>

        {/* Prize history — every past claim attempt, not just whatever was
            most recently spun in this browser session. */}
        <div style={{ margin: '0 18px 16px', background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace', marginBottom: 14 }}>
            Your Prizes {spins.length > 0 && `(${spins.length})`}
          </div>
          {spins.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#8E8E93', lineHeight: 1.6 }}>
              No prizes yet — spin the wheel to start winning.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {spins.map((s, i) => {
                const orderCount = s.wheelTier.match(/(\d+)$/)?.[1];
                return (
                  <div
                    key={`${s.wheelTier}-${s.at}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      padding: '10px 4px', borderTop: i > 0 ? '1px solid #F0F0F2' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: s.won ? '#1D1D1F' : '#8E8E93' }}>
                        {s.won ? s.prizeLabel : `No prize — ${s.prizeLabel} draw`}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#8E8E93', marginTop: 1 }}>
                        {orderCount ? `${orderCount}-order milestone` : s.wheelTier} · {formatLagosTime(s.at)}
                      </div>
                    </div>
                    {s.won && <div style={{ fontSize: 10, fontWeight: 700, color: '#00A082', flex: 'none' }}>Won</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: 10, color: '#C7C7CC', padding: '8px 0 16px' }}>Necromancer Pilot · Glovo Nigeria</div>

        <div style={{ padding: '0 18px' }}>
          <button onClick={() => { setData(null); setSaid(''); }} style={{ width: '100%', background: 'transparent', border: '1px solid #E5E5EA', borderRadius: 999, padding: 11, fontSize: 12.5, fontWeight: 600, color: '#8E8E93', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>

      {/* Popup shown when a partner taps a disabled Spin Now — tells them the
          next milestone instead of the button silently doing nothing. */}
      {milestoneNote && (
        <div
          onClick={() => setMilestoneNote(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 20, padding: '26px 24px', maxWidth: 320, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1D1D1F', lineHeight: 1.5, marginBottom: 18 }}>{milestoneNote}</div>
            <button
              onClick={() => setMilestoneNote(null)}
              style={{ background: '#1D1D1F', color: '#FFC244', border: 'none', borderRadius: 999, padding: '11px 26px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
