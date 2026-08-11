import Link from 'next/link';

const studioCards = [
  {
    title: 'Reactivation Arcade',
    description: 'A partner-side experience for store teams to unlock Ads Credit, see their progress, and spin for prizes.',
    href: '/arcade',
    accent: '#FFC244',
    badge: 'Partner stores',
    points: ['SAID entry', 'Reward ladder', 'Prize wheel'],
  },
  {
    title: 'NECROCLASH',
    description: 'A manager-only command center for weekly duels, covens, and rank-based competition.',
    href: '/clash?access=manager',
    accent: '#00A082',
    badge: 'Account managers',
    points: ['EP leaderboard', 'Soul Duel', 'Coven Clash'],
  },
];

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #FFF9E8 0%, #F5F5F7 100%)', color: '#1D1D1F' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 20px 80px' }}>
        <div style={{ maxWidth: 760, marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', fontSize: 12, fontWeight: 700, color: '#00A082', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Necromancer pilot
          </div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 'clamp(32px, 6vw, 52px)', margin: '16px 0 14px', lineHeight: 1.08 }}>
            Two standalone experiences for the win-back playbook.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: '#5A5A63', margin: 0 }}>
            Reactivation Arcade gives partner stores a direct path to unlock rewards, while NECROCLASH gives account managers a battle-ready view of EP, rank, and weekly clashes.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {studioCards.map((card) => (
            <Link key={card.title} href={card.href} style={{ textDecoration: 'none' }}>
              <div style={{ background: '#fff', borderRadius: 24, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.04)', height: '100%' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 999, background: `${card.accent}20`, color: card.accent, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  {card.badge}
                </div>
                <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 24, margin: '16px 0 10px', color: '#1D1D1F' }}>{card.title}</h2>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: '#5A5A63', margin: '0 0 16px' }}>{card.description}</p>
                <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {card.points.map((point) => (
                    <li key={point} style={{ color: '#1D1D1F', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: card.accent }} />
                      {point}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 22, fontWeight: 700, color: '#00A082' }}>Open app →</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
