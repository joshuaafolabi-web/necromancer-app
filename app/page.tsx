import Link from 'next/link';
import RewardGallery from '@/components/RewardGallery';

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
 * Accepting happens inside /arcade rather than here, because it needs a SAID
 * to know which store accepted and which Account Manager to notify.
 */

const LADDER = [
  { orders: '5', reward: '₦5,000', note: 'first spin unlocks' },
  { orders: '10', reward: '₦10,000', note: '' },
  { orders: '15', reward: '₦12,500', note: '' },
  { orders: '20', reward: '₦15,000', note: 'Jackpot wheel unlocks' },
  { orders: '30', reward: '₦20,000', note: '' },
  { orders: '40', reward: '₦25,000', note: 'Full Recovery' },
];

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #FFF9E8 0%, #F5F5F7 100%)', color: '#1D1D1F' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 20px 64px' }}>

        {/* Hero */}
        <div style={{ maxWidth: 720, marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: '#1D1D1F', color: '#FFC244', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            30-day challenge
          </div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 'clamp(30px, 6vw, 50px)', margin: '18px 0 14px', lineHeight: 1.08 }}>
            Bring your store back to life.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: '#5A5A63', margin: 0 }}>
            You have <strong style={{ color: '#1D1D1F' }}>30 days</strong> to get your store moving
            again — and Glovo is paying you to do it. Every delivered order climbs the Ads Credit
            ladder, up to <strong style={{ color: '#1D1D1F' }}>₦25,000</strong>. Hit 5 orders and the
            prize wheel opens too.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>

          {/* What's in it for them */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#fff', borderRadius: 24, padding: '26px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.04)' }}>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 19, margin: '0 0 4px' }}>What you earn</h2>
              <p style={{ fontSize: 13, color: '#8E8E93', margin: '0 0 18px', lineHeight: 1.6 }}>
                Ads Credit is paid automatically as you cross each step. Nothing to claim.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {LADDER.map((step, i) => (
                  <div
                    key={step.orders}
                    style={{
                      display: 'grid', gridTemplateColumns: '76px 1fr auto', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 12,
                      background: i === LADDER.length - 1 ? '#FFFBEC' : 'transparent',
                      border: i === LADDER.length - 1 ? '1px solid rgba(255,194,68,0.35)' : '1px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#8E8E93' }}>{step.orders} orders</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: i === LADDER.length - 1 ? '#B8860B' : '#00A082' }}>{step.reward}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textAlign: 'right' }}>{step.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 24, padding: '26px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.04)' }}>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 19, margin: '0 0 4px' }}>What you can win</h2>
              <p style={{ fontSize: 13, color: '#8E8E93', margin: '0 0 18px', lineHeight: 1.6 }}>
                Every 5 orders opens a better wheel. The higher you climb, the better the odds.
              </p>
              <RewardGallery columns={2} />
            </div>
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#1D1D1F', borderRadius: 24, padding: '30px 26px', boxShadow: '0 24px 60px rgba(0,0,0,0.16)' }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,194,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 18 }}>☠</div>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 22, margin: '0 0 10px', color: '#fff' }}>
                Accept the challenge
              </h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.7)', margin: '0 0 22px' }}>
                Enter your 6-digit Store Address ID to start. We will let your Account Manager know
                you are in, and they will help you get your first orders.
              </p>
              <Link
                href="/arcade"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', background: '#FFC244', color: '#1D1D1F', borderRadius: 999, padding: 15, fontSize: 15, fontWeight: 800 }}
              >
                I&rsquo;m in — let&rsquo;s go
              </Link>
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
