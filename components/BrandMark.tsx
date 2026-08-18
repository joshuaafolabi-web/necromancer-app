/**
 * Placeholder Glovo wordmark.
 *
 * There's no way for me to fetch or verify a real logo asset file from this
 * environment, and shipping a *fabricated* logo graphic would be worse than
 * shipping none. This is a text wordmark built from the PRD's own confirmed
 * tokens (Glovo Yellow #FFC244, `border-radius: 16px`, pill shapes) — your
 * real brand name, your real brand colors, honestly labelled as a stand-in.
 *
 * TO SWAP IN THE REAL LOGO: drop the file at
 * `necromancer-app/public/glovo-logo.svg` (or .png) and replace this
 * component's return with:
 *
 *   <img src="/glovo-logo.svg" alt="Glovo" height={size} />
 *
 * Every call site below already passes a `size`, so no other file needs to
 * change.
 */
export default function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.32,
        fontFamily: 'Manrope, sans-serif',
      }}
    >
      <div
        style={{
          width: size * 1.5,
          height: size * 1.5,
          borderRadius: size * 0.45,
          background: '#FFC244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: size * 0.95,
          color: '#1D1D1F',
          flex: 'none',
        }}
        aria-hidden="true"
      >
        G
      </div>
      <span style={{ fontWeight: 800, fontSize: size * 0.82, color: '#1D1D1F', letterSpacing: '-0.01em' }}>
        glovo
      </span>
    </div>
  );
}
