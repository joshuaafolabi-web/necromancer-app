'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandMark from './BrandMark';

export default function TopNav() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const isArcade = pathname?.startsWith('/arcade');
  const isClash = pathname?.startsWith('/clash');
  const btn = (active: boolean): React.CSSProperties => ({
    padding: '10px 18px',
    borderRadius: 12,
    border: 'none',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
    cursor: 'pointer',
    background: active ? '#FFC244' : 'transparent',
    color: active ? '#1D1D1F' : '#9CA3AF',
    boxShadow: active ? '0 2px 8px rgba(255,194,68,0.35)' : 'none',
    textDecoration: 'none',
    display: 'inline-block',
  });

  const showArcade = isHome || isArcade;
  const showClash = isHome || isClash;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        gap: 12,
        flexWrap: 'wrap',
        background: 'rgba(245,245,247,0.88)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <BrandMark size={18} />
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 16, background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
        <Link href="/" style={btn(isHome)}>Home</Link>
        {showArcade && <Link href="/arcade" style={btn(!!isArcade)}>Reactivation Arcade</Link>}
        {showClash && <Link href="/clash?access=manager" style={btn(!!isClash)}>NECROCLASH</Link>}
      </div>
    </div>
  );
}
