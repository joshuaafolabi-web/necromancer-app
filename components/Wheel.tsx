'use client';
import { WEDGE_COLORS } from '@/lib/scoring';

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(cx: number, cy: number, r: number, a: number, b: number) {
  const s = polar(cx, cy, r, b);
  const e = polar(cx, cy, r, a);
  return `M ${cx} ${cy} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
}

/**
 * The wedges are EQUAL, not sized by probability.
 *
 * They used to be drawn proportional to each prize's weight, which rendered
 * the odds table on screen for anyone to read off with a protractor —
 * exactly what PRD Section 11 forbids. It was also wrong twice over, since
 * the real odds differ per wheel tier and this drew a single flat set.
 * Equal wedges keep the draw server-side and leak nothing.
 */
export default function Wheel({
  rotationDeg,
  locked,
  labels,
}: {
  rotationDeg: number;
  locked: boolean;
  labels: readonly string[];
}) {
  const CX = 140, CY = 140, R = 118;
  const step = labels.length ? 360 / labels.length : 360;

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
        {labels.map((label, i) => {
          const start = i * step;
          const center = start + step / 2;
          const mid = polar(CX, CY, R * 0.63, center);
          return (
            <g key={label}>
              <path d={wedgePath(CX, CY, R, start, start + step)} fill={WEDGE_COLORS[i % WEDGE_COLORS.length]} stroke="white" strokeWidth={2} />
              <text
                x={mid.x.toFixed(1)}
                y={mid.y.toFixed(1)}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${center.toFixed(1)}, ${mid.x.toFixed(1)}, ${mid.y.toFixed(1)})`}
                fontSize={8}
                fontWeight={700}
                fontFamily="JetBrains Mono, monospace"
                fill="rgba(255,255,255,0.95)"
              >
                {label}
              </text>
            </g>
          );
        })}
        <circle cx={140} cy={140} r={31} fill="rgba(0,0,0,0.06)" />
        <circle cx={140} cy={140} r={29} fill="white" />
        <circle cx={140} cy={140} r={26} fill="#FFC244" />
        <ellipse cx={136} cy={134} rx={10} ry={6} fill="rgba(255,255,255,0.35)" />
        <text x={140} y={141} textAnchor="middle" dominantBaseline="middle" fontSize={16} fill="white">☠</text>
      </svg>
      {locked && (
        <div style={{ position: 'absolute', inset: '10px 0 0', borderRadius: '50%', background: 'rgba(245,245,247,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#8E8E93', border: '1px solid #E5E5EA', borderRadius: 999, padding: '3px 10px' }}>LOCKED</div>
        </div>
      )}
    </div>
  );
}
