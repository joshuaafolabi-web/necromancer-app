// lib/rewards.ts
//
// The prize showcase, shared by the home page and /arcade so the two can't
// drift. These mirror lib/gameRules.ts's PRIZES table exactly — the three
// Ads Credit denominations collapse into one "Ads Credit" tile for display,
// but every other title here matches a real prize label a partner can
// actually win, so what's advertised is what's drawn.
//
// IMAGES: `image` is optional. Leave it empty and the tile renders as a
// branded gradient card with its emoji/glyph, which is the safer default —
// it needs no network request (PRD Section 11 flags low-end tablets on
// flaky kitchen wifi) and it can never show the wrong picture.
//
// An earlier version of this file pointed the Instagram tile at an Unsplash
// photo that turned out to be a circuit board — picked blind, without a way
// to see what the photo ID actually showed. Every tile here uses the
// no-network gradient fallback for the same reason: it's the only option
// that's guaranteed correct without eyes on the image. Swap in a real photo
// URL once you have one you've actually looked at;
// images.unsplash.com is already allow-listed in next.config.js.

export type Reward = {
  title: string;
  blurb: string;
  emoji: string;
  tint: string;
  image?: string;
};

export const REWARDS: Reward[] = [
  {
    title: 'Glovo Branded Merchandise',
    blurb: 'Branded packaging and merch, delivered to your store.',
    emoji: '📦',
    tint: '#6B7280',
  },
  {
    title: 'Store Branding Kit',
    blurb: 'Signage and stickers to make your store stand out.',
    emoji: '🎨',
    tint: '#7C3AED',
  },
  {
    title: 'Pro Food Photography Session',
    blurb: 'A photographer shoots your menu, properly.',
    emoji: '📸',
    tint: '#374151',
  },
  {
    title: 'Instagram Story Feature',
    blurb: 'Your store on the Glovo Nigeria Instagram.',
    emoji: '📱',
    tint: '#F59E0B',
  },
  {
    title: 'Ads Credit',
    // The literal Naira sign, rather than a generic money emoji — the most
    // accurate "image" available for a cash prize without real photography.
    blurb: '₦5,000 up to ₦25,000 to promote your store.',
    emoji: '₦',
    tint: '#00A082',
  },
];
