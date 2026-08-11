'use client';
import { useState } from 'react';
import TopNav from '@/components/TopNav';
import Wheel from '@/components/Wheel';
import { CREDIT_STEPS, PRIZES } from '@/lib/scoring';

type LookupResponse = {
  partner: { storeName: string; said: string; amEmail: string; segment: string; ordersDelivered: number };
  ladder: { currentLabel: string; currentCredit: number; nextLabel: string | null; ordersToNext: number | null; progressPct: number; stepIndex: number };
  wheel: { locked: boolean; tierName: string | null; ordersToUnlockFirst: number | null; ordersToJackpot: number; spinAvailable: boolean };
};

const rewardGallery = [
  { title: 'Free Packaging', image: 'https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=900&q=80' },
  { title: 'Store Branding', image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80' },
  { title: 'Food Photography Session', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80' },
  { title: 'Instagram Story Feature', image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80' },
  { title: 'Ads Credit', image: 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=900&q=80' },
];

export default function ArcadePage() {
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<LookupResponse | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);

  async function login() {
    const normalizedSaid = said.trim();
    if (!normalizedSaid || normalizedSaid.length !== 6) {
      setError('Please enter a valid Store Address ID (SAID) to continue.');
      return;
    }

    setError('');
    const res = await fetch(`/api/partner/lookup?said=${encodeURIComponent(normalizedSaid)}`);
    if (!res.ok) {
      setError('We could not find that Store Address ID (SAID). Please enter a valid SAID and try again.');
      return;
    }
    setData(await res.json());
    setWonPrize(null);
  }

  async function spin() {
    if (!data) return;
    setSpinning(true);
    setWonPrize(null);
    const res = await fetch('/api/partner/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ said: data.partner.said }),
    });
    const result = await res.json();
    if (!res.ok) { setSpinning(false); setError(result.error); return; }

    const total = PRIZES.reduce((s, p) => s + p.weight, 0);
    let acc = 0;
    for (let i = 0; i < result.prizeIndex; i++) acc += PRIZES[i].weight;
    const wedgeStartDeg = (acc / total) * 360;
    const wedgeSizeDeg = (PRIZES[result.prizeIndex].weight / total) * 360;
    const landDeg = wedgeStartDeg + wedgeSizeDeg / 2;
    const spins = 5 * 360;
    setRotation((r) => r + spins + (360 - landDeg) - (r % 360));

    setTimeout(() => {
      setSpinning(false);
      setWonPrize(result.prizeLabel);
      setData({ ...data, wheel: { ...data.wheel, spinAvailable: false } });
    }, 3200);
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                {rewardGallery.map((item) => (
                  <div key={item.title} style={{ borderRadius: 18, overflow: 'hidden', background: '#FAFAFA', border: '1px solid rgba(0,0,0,0.05)' }}>
                    <img src={item.image} alt={item.title} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                    <div style={{ padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: '#1D1D1F' }}>{item.title}</div>
                  </div>
                ))}
              </div>
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

  const { partner, ladder, wheel } = data;

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
              <div style={{ width: `${(ladder.stepIndex / (CREDIT_STEPS.length - 1)) * 100}%`, height: '100%', background: '#00A082' }} />
            </div>
            {CREDIT_STEPS.map((step, i) => {
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
              <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>{partner.ordersDelivered} orders · {wheel.locked ? 'wheel locked' : wheel.spinAvailable ? '1 spin available' : 'spin used'}</div>
            </div>
            <div style={{ background: '#FFFBEC', border: '1px solid rgba(255,194,68,0.3)', borderRadius: 8, padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#B8860B', whiteSpace: 'nowrap' }}>
              {wheel.locked ? `${wheel.ordersToUnlockFirst} to unlock` : wheel.ordersToJackpot > 0 ? `${wheel.ordersToJackpot} to Jackpot` : 'Jackpot unlocked'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <Wheel rotationDeg={rotation} locked={wheel.locked} />
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
