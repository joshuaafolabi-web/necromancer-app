'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RewardGallery from '@/components/RewardGallery';
import BrandMark from '@/components/BrandMark';

/**
 * The partner-facing landing page — the pitch for the 30-day challenge.
 *
 * This used to be a two-card chooser presenting the Reactivation Arcade and
 * NECROCLASH side by side as equals. Wrong shape: this URL goes to 100
 * merchants, and the first thing they saw was a card advertising an internal
 * account-manager tool. Partners get the pitch and the prizes; the manager
 * link is a small footer entry, since AMs should use the Apps Script
 * NECROCLASH deployment anyway (it has real Google identity behind it).
 *
 * The SAID box below hands off to /arcade?said=XXXXXX rather than logging in
 * right here, because accepting the challenge needs a SAID to know which
 * store accepted and which Account Manager to notify — /arcade owns that.
 *
 * The full ₦0→₦25,000 ladder table used to live here too, duplicating the
 * Credit Ladder card already shown inside /arcade once a partner logs in.
 * Removed — the pitch page sells the challenge and the prizes; the ladder
 * detail belongs to the one place a partner can see it against their own
 * actual order count.
 */
export default function Home() {
  const router = useRouter();
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');

  function join() {
    const normalized = said.trim();
    if (normalized.length !== 6) {
      setError('Please enter a valid 6-digit Store Address ID.');
      return;
    }
    router.push(`/arcade?said=${encodeURIComponent(normalized)}`);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #FFF9E8 0%, #F5F5F7 100%)', color: '#1D1D1F' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 20px 64px' }}>

        <div style={{ marginBottom: 28 }}>
          <BrandMark size={24} />
        </div>

        {/* Hero */}
        <div style={{ maxWidth: 720, marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: '#1D1D1F', color: '#FFC244', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            30-day business growth
          </div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 'clamp(30px, 6vw, 50px)', margin: '18px 0 14px', lineHeight: 1.08 }}>
            More orders. Free rewards. Simple.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: '#5A5A63', margin: '0 0 16px' }}>
            For the next 30 days, Glovo is rewarding you for every order you complete.
          </p>
          <ol style={{ margin: 0, padding: '0 0 0 20px', color: '#5A5A63', fontSize: 15.5, lineHeight: 1.9 }}>
            <li>Deliver orders to earn up to <strong style={{ color: '#1D1D1F' }}>₦25,000</strong> in Ads Credit.</li>
            <li>Hit 10 orders to unlock the Prize Wheel.</li>
            <li>Spin to win free Glovo Merchandise, Pro Food Photography Session, and Instagram Story Feature.</li>
          </ol>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>

          {/* What's in it for them */}
          <div style={{ background: '#fff', borderRadius: 24, padding: '26px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 19, margin: '0 0 4px' }}>What you can win</h2>
            <p style={{ fontSize: 13, color: '#8E8E93', margin: '0 0 18px', lineHeight: 1.6 }}>
              Every 5 orders opens a better wheel. The higher you climb, the better the odds.
            </p>
            <RewardGallery minColumns={2} />
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#1D1D1F', borderRadius: 24, padding: '30px 26px', boxShadow: '0 24px 60px rgba(0,0,0,0.16)' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,194,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 18 }}>☠</div>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 22, margin: '0 0 10px', color: '#fff' }}>
                Ready to grow?
              </h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.7)', margin: '0 0 22px' }}>
                Type your 6-digit Store Address ID below to join. Your Account Manager is on
                standby to help you secure your first set of orders.
              </p>
              <input
                value={said}
                onChange={(e) => { setSaid(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
                maxLength={6}
                placeholder="000000"
                style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, fontSize: 20, letterSpacing: '0.2em', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', outline: 'none', marginBottom: 10, color: '#fff' }}
              />
              {error && <div style={{ fontSize: 12, color: '#F87171', marginBottom: 10 }}>{error}</div>}
              <button
                onClick={join}
                style={{ display: 'block', width: '100%', textAlign: 'center', border: 'none', background: '#FFC244', color: '#1D1D1F', borderRadius: 999, padding: 15, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
              >
                I&rsquo;m in — Let&rsquo;s Go
              </button>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)', margin: '14px 0 0', textAlign: 'center' }}>
                Your Account Manager has your SAID if you are not sure of it.
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.65)', borderRadius: 20, padding: '20px 22px', border: '1px solid rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1D1D1F', marginBottom: 10 }}>How it works</div>
              <ol style={{ margin: 0, padding: '0 0 0 18px', color: '#5A5A63', fontSize: 12.5, lineHeight: 2 }}>
                <li>Accept the challenge with your SAID</li>
                <li>Your Account Manager is notified and reaches out</li>
                <li>Take orders — every one moves your ladder</li>
                <li>Spin the wheel each time a new one unlocks</li>
              </ol>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: '#8E8E93', margin: '14px 0 0' }}>
                Ads Credit from the ladder and the wheel combined is capped at ₦25,000 per store.
                Your full ladder and progress are on your Arcade once you log in.
              </p>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 44, fontSize: 11, color: '#B0B0B5' }}>
          Necromancer Pilot · Glovo Nigeria ·{' '}
          <Link href="/clash?access=manager" style={{ color: '#B0B0B5', textDecoration: 'underline' }}>
            Account managers
          </Link>
        </div>
      </div>
    </div>
  );
}
