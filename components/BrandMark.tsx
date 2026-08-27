/**
 * Real Glovo wordmark — public/glovo-logo.png, viewed and confirmed to
 * match before being wired in here (2026-08-27). The source file is a solid
 * yellow rectangle (no transparency), so it's clipped to a small radius
 * rather than placed bare — otherwise it reads as a stray yellow box on the
 * white/cream backgrounds every call site actually uses it against.
 */
export default function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/glovo-logo.png"
      alt="Glovo"
      style={{ height: size * 1.7, width: 'auto', borderRadius: size * 0.3, display: 'block' }}
    />
  );
}
