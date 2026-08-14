'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TopNav from '@/components/TopNav';

type ClashData = {
  leaderboard: { amName: string; amEmail: string; ep: number; reactivations: number; rank: string }[];
  self: { amName: string; amEmail: string; ep: number; reactivations: number; rank: string };
  // rival is nullable: the round-robin pairing gives one AM a bye on an odd
  // roster rather than inventing a phantom opponent.
  duel: { rival: { amName: string; ep: number; rank: string } | null; selfPct: number; rivalPct: number; selfLeading: boolean; weekStart: string };
  // rivalA/rivalB became rivalNames[] for the same reason — a coven can end
  // up with one member, which two fixed fields couldn't represent.
  coven: { mate: string | null; rivalNames: string[]; boss: { name: string; segmentLabel: string; progressPct: number } | null; rivalProgressPct: number };
  quest: { text: string; progress: number; target: number; complete: boolean };
  ams?: { am_name: string; am_email: string }[];
  error?: string;
};

const RANK_COLOR: Record<string, string> = {
  Archnecromancer: '#B8860B', Soulforger: '#6D28D9', Wraithbinder: '#00A082', Bonecaller: '#9CA3AF',
};

export default function ClashPage() {
  const router = useRouter();
  const [data, setData] = useState<ClashData | null>(null);
  const [selectedAm, setSelectedAm] = useState('');
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setAuthorized(params.get('access') === 'manager');
  }, []);

  useEffect(() => {
    if (!authorized) return;
    fetch(`/api/necroclash${selectedAm ? `?am=${encodeURIComponent(selectedAm)}` : ''}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        // Guard the self lookup: an error payload has no `self`, and
        // reading .amEmail off it threw an unhandled TypeError that blanked
        // the page with nothing in the UI to explain why.
        if (!selectedAm && d && d.self) setSelectedAm(d.self.amEmail);
      })
      .catch(() => setData({ error: 'Could not load NECROCLASH.' } as ClashData));
  }, [authorized, selectedAm]);

  if (!authorized) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F5F7' }}>
        <TopNav />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '64px 20px' }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '32px 28px', boxShadow: '0 24px 60px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 999, background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Access restricted
            </div>
            <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 28, margin: '16px 0 10px', color: '#1D1D1F' }}>NECROCLASH is for account managers.</h1>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: '#5A5A63', margin: '0 0 20px' }}>
              Partner stores should stay in Reactivation Arcade. If you are an account manager, enter through the landing page to unlock this view.
            </p>
            <button onClick={() => router.push('/arcade')} style={{ background: '#1D1D1F', color: '#FFC244', border: 'none', borderRadius: 999, padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Open Reactivation Arcade
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div style={{ minHeight: '100vh', background: '#F5F5F7' }}><TopNav /></div>;

  if (data.error || !data.self) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F5F7' }}>
        <TopNav />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '64px 20px', textAlign: 'center', color: '#8E8E93', fontSize: 14, lineHeight: 1.7 }}>
          {data.error || 'NECROCLASH returned no data. Check the AMs tab is populated.'}
        </div>
      </div>
    );
  }

  const { leaderboard, self, duel, coven, quest } = data;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F7' }}>
      <TopNav />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'JetBrains Mono, monospace' }}>NECROCLASH</div>
            <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 22, margin: '2px 0 0', color: '#1D1D1F' }}>{self.amName}</h1>
          </div>
          <select value={selectedAm} onChange={(e) => setSelectedAm(e.target.value)} style={{ border: '1px solid #E5E5EA', borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
            {leaderboard.map((a) => <option key={a.amEmail} value={a.amEmail}>{a.amName}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Soul Duel */}
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#1D1D1F' }}>Soul Duel</div>
                <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>Weekly 1v1 — higher EP by week's end wins</div>
              </div>
              <div style={{ padding: '22px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: '#fff', borderRadius: 18, padding: 16, boxShadow: '14px 8px 32px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: RANK_COLOR[self.rank] }}>{self.amName}</div>
                  <div style={{ fontSize: 10, color: '#8E8E93', marginTop: 2 }}>{self.reactivations} reactivations · {self.rank}</div>
                  <div style={{ height: 7, borderRadius: 4, background: '#F0F0F2', marginTop: 10 }}>
                    <div style={{ width: `${duel.selfPct}%`, height: '100%', borderRadius: 4, background: '#FFC244' }} />
                  </div>
                  <div style={{ marginTop: 10, padding: 7, borderRadius: 10, background: '#F8F8F8', fontSize: 11, fontWeight: 600, color: '#8E8E93' }}>
                    {duel.selfLeading ? 'Leading ↑' : `Trailing by ${Math.max(duel.rivalPct - duel.selfPct, 0)}%`}
                  </div>
                </div>
                <div style={{ background: '#fff', borderRadius: 18, padding: 16, boxShadow: '-14px 8px 32px rgba(0,0,0,0.08)' }}>
                  {duel.rival ? (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 13, color: RANK_COLOR[duel.rival.rank] }}>{duel.rival.amName}</div>
                      <div style={{ fontSize: 10, color: '#8E8E93', marginTop: 2 }}>{duel.rival.rank}</div>
                      <div style={{ height: 7, borderRadius: 4, background: '#F0F0F2', marginTop: 10 }}>
                        <div style={{ width: `${duel.rivalPct}%`, height: '100%', borderRadius: 4, background: '#B0B0B5' }} />
                      </div>
                      <div style={{ marginTop: 10, padding: 7, borderRadius: 10, background: '#F8F8F8', fontSize: 11, fontWeight: 600, color: '#8E8E93' }}>
                        {!duel.selfLeading ? 'Leading ↑' : `Trailing by ${Math.max(duel.selfPct - duel.rivalPct, 0)}%`}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#8E8E93', lineHeight: 1.6 }}>
                      Bye this week — the AM roster has an odd number of managers.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Coven Clash */}
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
              <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1D1D1F' }}>Coven Clash</div>
                  <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>First to 100% claims the target — losing coven resets</div>
                </div>
                <div style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '5px 10px', fontSize: 10, fontWeight: 700 }}>Reckoning</div>
              </div>
              <div style={{ padding: '22px 24px' }}>
                {coven.boss && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#FAFAFA', borderRadius: 14, padding: 12, marginBottom: 18 }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FEF9EC', border: '1px solid rgba(255,194,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flex: 'none' }}>🍢</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: 14.5, color: '#1D1D1F' }}>{coven.boss.name}</div>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#FEF9EC', color: '#B8860B' }}>BOSS</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 3 }}>{coven.boss.segmentLabel}</div>
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ borderRadius: 14, padding: 14, background: '#F0FDF9', border: '1.5px solid rgba(0,160,130,0.2)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#00A082', marginBottom: 10 }}>Your Coven{coven.mate ? ` — with ${coven.mate}` : ' (solo this week)'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#00A082', marginBottom: 5 }}>
                      <span>Progress</span><span style={{ fontWeight: 700 }}>{coven.boss?.progressPct ?? 0}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,160,130,0.12)' }}>
                      <div style={{ width: `${coven.boss?.progressPct ?? 0}%`, height: '100%', borderRadius: 4, background: '#00A082' }} />
                    </div>
                  </div>
                  <div style={{ borderRadius: 14, padding: 14, background: '#FAFAFA', border: '1px solid rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8E8E93', marginBottom: 10 }}>Rival — {coven.rivalNames.length ? coven.rivalNames.join(' & ') : 'none this week'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8E8E93', marginBottom: 5 }}>
                      <span>Progress</span><span style={{ fontWeight: 700 }}>{coven.rivalProgressPct}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.06)' }}>
                      <div style={{ width: `${coven.rivalProgressPct}%`, height: '100%', borderRadius: 4, background: '#D1D5DB' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Weekly Quest</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1D1D1F' }}>{quest.text}</div>
              <div style={{ fontSize: 12, color: '#3A3A3C', marginTop: 10 }}>{quest.progress} of {quest.target} complete</div>
              <div style={{ height: 8, borderRadius: 4, background: '#F0F0F2', marginTop: 8 }}>
                <div style={{ width: `${(quest.progress / quest.target) * 100}%`, height: '100%', borderRadius: 4, background: '#FFC244' }} />
              </div>
              <div style={{ marginTop: 14, background: '#FFFBEC', border: '1px solid rgba(255,194,68,0.25)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#92620C' }}>Completion unlocks 2× EP for the rest of the week.</div>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Your EP</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, fontSize: 24, color: '#B8860B' }}>{self.ep} EP</div>
              <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 4 }}>{self.reactivations} partners reactivated · rank {self.rank}</div>
            </div>
          </div>
        </div>

        {/* Bone Throne */}
        <div style={{ marginTop: 24, borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.1)' }}>
          <div style={{ background: '#111827', padding: '20px 24px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#FFC244', textTransform: 'uppercase', letterSpacing: '0.25em', marginBottom: 8 }}>The Bone Throne</div>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 20, color: '#fff' }}>{leaderboard[0]?.amName} holds the Throne — {leaderboard[0]?.ep} EP</div>
          </div>
          <div style={{ background: '#111827' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 160px 90px 90px', padding: '12px 24px', fontSize: 9, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div>#</div><div>Account Manager</div><div>Rank</div><div style={{ textAlign: 'right' }}>Reactivations</div><div style={{ textAlign: 'right' }}>EP</div>
            </div>
            {leaderboard.map((row, i) => (
              <div key={row.amEmail} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 160px 90px 90px', padding: '13px 24px', alignItems: 'center', background: row.amEmail === self.amEmail ? 'rgba(255,194,68,0.04)' : 'transparent', borderLeft: row.amEmail === self.amEmail ? '3px solid #FFC244' : '3px solid transparent', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14, color: i === 0 ? '#FFC244' : '#6B7280' }}>{i + 1}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: row.amEmail === self.amEmail ? '#FFC244' : '#E2E8F0' }}>{row.amName}{row.amEmail === self.amEmail && <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: '#FFF7E3', color: '#B8860B', marginLeft: 8 }}>YOU</span>}</div>
                <div><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: '#374151', color: RANK_COLOR[row.rank] }}>{row.rank}</span></div>
                <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#B0B0B5' }}>{row.reactivations}</div>
                <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, fontSize: 14, color: i === 0 ? '#D4AF37' : '#9CA3AF' }}>{row.ep}</div>
              </div>
            ))}
            <div style={{ textAlign: 'center', fontSize: 10, color: '#374151', padding: 18 }}>Necromancer Pilot · Glovo Nigeria · 10 AMs · 100 Stores</div>
          </div>
        </div>
      </div>
    </div>
  );
}
