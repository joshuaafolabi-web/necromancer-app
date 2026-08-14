'use client';
import { useState } from 'react';
import TopNav from '@/components/TopNav';
import Wheel from '@/components/Wheel';
import RewardGallery from '@/components/RewardGallery';

// The ladder rungs and prize labels now arrive with the lookup response
// rather than being declared here, so this page can't disagree with the
// backend about the rules. amEmail is no longer returned at all — anyone can
// try 6-digit SAIDs, and a lucky guess shouldn't hand back a staff email.
type LookupResponse = {
  partner: { storeName: string; said: string; segment: string; ordersDelivered: number };
  ladder: { currentLabel: string; currentCredit: number; nextLabel: string | null; ordersToNext: number | null; progressPct: number; stepIndex: number };
  wheel: { locked: boolean; tierName: string | null; ordersToUnlockFirst: number | null; ordersToJackpot: number; spinAvailable: boolean };
  credit: { lifetimeEarned: number; cap: number | null; atCap: boolean };
  challenge: { accepted: boolean; acceptedAt: string | null; dayNumber: number | null; daysLeft: number | null; expired?: boolean };
  prizeLabels: string[];
  creditSteps: { orders: number; label: string }[];
};

export default function ArcadePage() {
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<LookupResponse | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [acceptNote, setAcceptNote] = useState('');

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
    const normalizedSaid = said.trim();
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
    } catch {
      setError('Connection problem. Check your internet and try again.');
    }
  }

  async function spin() {
    if (!data || spinning) return;
    setSpinning(true);
    setWonPrize(null);
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
        if (res.status === 409) {
          setError('You have already spun this wheel. Keep ordering to unlock the next one.');
          setData({ ...data, wheel: { ...data.wheel, spinAvailable: false } });
        } else {
          setError(result.error || 'That did not go through. Please try again.');
        }
        return;
      }

      // Equal wedges, so landing is pure geometry off the index the server
      // chose — the client has no weights to reason about.
      const step = 360 / data.prizeLabels.length;
      const landDeg = result.prizeIndex * step + step / 2;
      setRotation((r) => r + 5 * 360 + (360 - landDeg) - (r % 360));

      setTimeout(() => {
        setSpinning(false);
        setWonPrize(result.prizeLabel);
        setData((d) => (d ? { ...d, wheel: { ...d.wheel, spinAvailable: false } } : d));
      }, 3200);
    } catch {
      setSpinning(false);
      setError('Could not reach the server. Your spin was NOT used — please try again.');
    }
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F5F7' }}>
        <TopNav />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '44px 16px 72px' }}>
          <div style={{ width: '100%', maxWidth: 1120, display: 'grid', gap: 24, gridTemplateColumns: '1.15fr 0.9fr' }}>
            <div style={{ background: '#fff', borderRadius: 28, padding: '32px 28px', boxShadow: '0 24px 60px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 999, background: '#FFF7E3', color: '#B8860B', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                Reactivation Arcade
              </div>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 30, margin: '16px 0 10px', color: '#1D1D1F', lineHeight: 1.1 }}>Bring your store back to life.</h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: '#5A5A63', margin: '0 0 24px' }}>
                Check your Ads Credit ladder, unlock the spin wheel, and discover the rewards your store can win.
              </p>
              <RewardGallery columns={2} />
            </div>

            <div style={{ background: '#fff', borderRadius: 28, padding: '28px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.08)', height: 'fit-content' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: '#FFF7E3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>☠</div>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 21, margin: '0 0 8px', color: '#1D1D1F' }}>Unlock your store</h2>
              <p style={{ fontSize: 13.5, color: '#8E8E93', lineHeight: 1.6, margin: '0 0 18px' }}>
                Enter your 6-digit Store Address ID (SAID) to see your current credit tier, progress, and available wheel spin.
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

  const { partner, ladder, wheel, credit, prizeLabels, creditSteps, challenge } = data;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F7' }}>
      <TopNav />
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 0 40px' }}>
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{ borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(245,158,11,0.2)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', flex: 'none', animation: 'pulse-dot 1.6s infinite' }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: '#B45309', flex: 1 }}>Golden Hour — 2× progress on every order delivered</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#D97706', fontFamily: 'JetBrains Mono, monospace' }}>5–8PM</div>
          </div>
        </div>

        <div style={{ padding: '18px 18px 4px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>Reactivation Arcade</div>
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
                      : `${challenge.daysLeft} day${challenge.daysLeft === 1 ? '' : 's'} left to climb the ladder`}
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
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 32, fontWeight: 800, color: '#451A03', marginTop: 5, letterSpacing: '-0.02em' }}>₦{ladder.currentCredit.toLocaleString()}</div>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flex: 'none' }}>🍽</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'rgba(69,26,3,0.6)', marginBottom: 7 }}>
              <span>{partner.ordersDelivered} orders</span>
              <span>{ladder.nextLabel ? `${ladder.ordersToNext} more → ${ladder.nextLabel}` : 'Full Recovery reached'}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.12)' }}>
              <div style={{ width: `${ladder.progressPct}%`, height: '100%', borderRadius: 3, background: 'rgba(0,0,0,0.3)' }} />
            </div>
          </div>
        </div>

        <div style={{ margin: '0 18px 16px', background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace', marginBottom: 20 }}>Credit Ladder</div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ position: 'absolute', left: 11, right: 11, top: 11, height: 1, background: '#F0F0F2' }}>
              <div style={{ width: `${(ladder.stepIndex / (creditSteps.length - 1)) * 100}%`, height: '100%', background: '#00A082' }} />
            </div>
            {creditSteps.map((step, i) => {
              const reached = step.orders <= partner.ordersDelivered;
              const current = i === ladder.stepIndex;
              return (
                <div key={step.orders} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, position: 'relative', zIndex: 1 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: reached ? '#00A082' : '#F0F0F2', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: current ? '0 0 0 4px rgba(0,160,130,0.2)' : 'none' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: reached ? '#fff' : '#C7C7CC' }} />
                  </div>
                  <div style={{ fontSize: 9, fontWeight: current ? 700 : 500, color: current ? '#00A082' : '#B0B0B5' }}>{step.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ margin: '0 18px 16px', background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1D1D1F' }}>{wheel.tierName ?? 'Locked'} Wheel</div>
              <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>
                {partner.ordersDelivered} orders · {wheel.locked ? 'wheel locked' : wheel.spinAvailable ? '1 spin available' : 'spin used'}
                {credit.atCap && ' · ₦25K credit cap reached, prizes only'}
              </div>
            </div>
            <div style={{ background: '#FFFBEC', border: '1px solid rgba(255,194,68,0.3)', borderRadius: 8, padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#B8860B', whiteSpace: 'nowrap' }}>
              {wheel.locked ? `${wheel.ordersToUnlockFirst} to unlock` : wheel.ordersToJackpot > 0 ? `${wheel.ordersToJackpot} to Jackpot` : 'Jackpot unlocked'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <Wheel rotationDeg={rotation} locked={wheel.locked} labels={prizeLabels} />
            {wheel.spinAvailable && !wonPrize && (
              <button onClick={spin} disabled={spinning} style={{ padding: '13px 40px', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', cursor: spinning ? 'default' : 'pointer', background: spinning ? '#E5E7EB' : '#FFC244', color: spinning ? '#9CA3AF' : '#1D1D1F', boxShadow: spinning ? 'none' : '0 4px 16px rgba(255,194,68,0.4)' }}>
                {spinning ? 'Spinning…' : 'Spin Now'}
              </button>
            )}
            {wonPrize && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>You won</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#B8860B', marginTop: 2 }}>{wonPrize}</div>
                <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 3 }}>Your AM will reach out within 48 hours</div>
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

        <div style={{ textAlign: 'center', fontSize: 10, color: '#C7C7CC', padding: '8px 0 16px' }}>Necromancer Pilot · Glovo Nigeria</div>

        <div style={{ padding: '0 18px' }}>
          <button onClick={() => { setData(null); setSaid(''); }} style={{ width: '100%', background: 'transparent', border: '1px solid #E5E5EA', borderRadius: 999, padding: 11, fontSize: 12.5, fontWeight: 600, color: '#8E8E93', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
