import { REWARDS } from '@/lib/rewards';

/**
 * The prize showcase. A tile with an `image` renders the photo; a tile
 * without renders a branded gradient card carrying its emoji/glyph — so a
 * missing or unavailable image degrades to something deliberate rather than
 * a broken image icon on a partner's tablet.
 *
 * Grid columns are `auto-fit`, not a fixed count — the browser fits as many
 * ~150px tiles as the container allows, so this reflows correctly at phone,
 * tablet, and desktop widths with no breakpoints to maintain by hand.
 * `minColumns` only sets a floor for very wide containers (it caps how far
 * the grid stretches on desktop, since past 3-4 columns the tiles start
 * looking sparse rather than dense).
 */
export default function RewardGallery({ minColumns = 2 }: { minColumns?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(clamp(130px, ${100 / minColumns}%, 220px), 1fr))`,
        gap: 14,
      }}
    >
      {REWARDS.map((item) => (
        <div
          key={item.title}
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            background: '#FAFAFA',
            border: '1px solid rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image}
              alt={item.title}
              style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                height: 120,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: item.emoji.length === 1 ? 44 : 40,
                fontWeight: item.emoji.length === 1 ? 800 : 400,
                color: item.emoji.length === 1 ? item.tint : undefined,
                background: `linear-gradient(150deg, ${item.tint}22, ${item.tint}0D)`,
                borderBottom: `1px solid ${item.tint}1A`,
              }}
              aria-hidden="true"
            >
              {item.emoji}
            </div>
          )}
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1D1D1F' }}>{item.title}</div>
            <div style={{ fontSize: 11, lineHeight: 1.5, color: '#8E8E93', marginTop: 3 }}>{item.blurb}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
