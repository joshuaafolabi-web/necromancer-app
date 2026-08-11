'use client';
import { PRIZES } from '@/lib/scoring';

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function wedge(cx: number, cy: number, r: number, a: number, b: number) {
  const s = polar(cx, cy, r, b);
  const e = polar(cx, cy, r, a);
  return `M ${cx} ${cy} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
}

function buildSegs() {
  const CX = 140, CY = 140, R = 118;
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let acc = 0;
  return PRIZES.map((p) => {
    const start = (acc / total) * 360;
    acc += p.weight;
    const end = (acc / total) * 360;
    const center = (start + end) / 2;
    const mid = polar(CX, CY, R * 0.63, center);
    const showLabel = end - start > 20;
    return {
      pathD: wedge(CX, CY, R, start, end),
      color: p.color,
      lx: mid.x.toFixed(1),
      ly: mid.y.toFixed(1),
      showLabel,
      textTransform: `rotate(${center.toFixed(1)}, ${mid.x.toFixed(1)}, ${mid.y.toFixed(1)})`,
      labelShort: p.label.length > 10 ? p.label.slice(0, 10) : p.label,
    };
  });
}

export default function Wheel({ rotationDeg, locked }: { rotationDeg: number; locked: boolean }) {
  const segs = buildSegs();
  return (
    <div style={{ position: 'relative', paddingTop: 10 }}>
      <div
        style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
          borderTop: '20px solid #FFC244', zIndex: 2,
        }}
      />
      <div style={{ position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)', width: 150, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', filter: 'blur(8px)' }} />
      <svg
        width={200}
        height={200}
        viewBox="0 0 280 280"
        style={{ transform: `rotate(${rotationDeg}deg)`, transition: 'transform 3.2s cubic-bezier(0.15,0.85,0.25,1)' }}
      >
        <circle cx={140} cy={140} r={125} fill="white" />
        <circle cx={140} cy={140} r={122} fill="rgba(0,0,0,0.04)" />
        {segs.map((seg, i) => (
          <g key={i}>
            <path d={seg.pathD} fill={seg.color} stroke="white" strokeWidth={2} />
            {seg.showLabel && (
              <text x={seg.lx} y={seg.ly} textAnchor="middle" dominantBaseline="middle" transform={seg.textTransform} fontSize={7.5} fontWeight={700} fontFamily="JetBrains Mono, monospace" fill="rgba(255,255,255,0.95)">
                {seg.labelShort}
              </text>
            )}
          </g>
        ))}
        <circle cx={140} cy={140} r={31} fill="rgba(0,0,0,0.06)" />
        <circle cx={140} cy={140} r={29} fill="white" />
        <circle cx={140} cy={140} r={26} fill="#FFC244" />
        <ellipse cx={136} cy={134} rx={10} ry={6} fill="rgba(255,255,255,0.35)" />
        <text x={140} y={141} textAnchor="middle" dominantBaseline="middle" fontSize={16} fill="white">☠</text>
      </svg>
      {locked && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(245,245,247,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#8E8E93', border: '1px solid #E5E5EA', borderRadius: 999, padding: '3px 10px' }}>LOCKED</div>
        </div>
      )}
    </div>
  );
}
