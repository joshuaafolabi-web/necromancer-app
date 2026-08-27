// lib/rewards.ts
//
// The prize showcase, shared by the home page and /arcade so the two can't
// drift. These mirror lib/gameRules.ts's MILESTONES exactly — the ₦5,000
// and ₦25,000 Ads Credit milestones collapse into one "Ads Credit" tile for
// display, but every other title here matches a real prize label a partner
// can actually win, so what's advertised is what's drawn. "Branding Kit"
// was dropped from the reward set entirely (2026-08-27) — removed here too.
//
// IMAGES: `image` is optional. Leave it empty and the tile renders as a
// branded gradient card with its emoji/glyph — the safer default, since it
// needs no network request (PRD Section 11 flags low-end tablets on flaky
// kitchen wifi) and can never show the wrong picture.
//
// An earlier version of this file pointed the Instagram tile at an Unsplash
// photo that turned out to be a circuit board — picked blind, without a way
// to see what the photo ID actually showed. The four images below are real
// files in public/rewards/, each one actually viewed and confirmed to match
// its title before being wired in here — never a guessed external URL.

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
    blurb: 'Branded packaging and merch, delivered to your store — unlocked at 20 orders.',
    emoji: '📦',
    tint: '#6B7280',
    image: '/rewards/merch.jpg',
  },
  {
    title: 'Pro Food Photography Session',
    blurb: 'A photographer shoots your menu, properly — unlocked at 80 orders.',
    emoji: '📸',
    tint: '#374151',
    image: '/rewards/photography.png',
  },
  {
    title: 'Instagram Story Feature',
    blurb: 'Your store on the Glovo Nigeria Instagram — for the top 5 stores past 100 orders.',
    emoji: '📱',
    tint: '#F59E0B',
    image: '/rewards/instagram.jpg',
  },
  {
    title: 'Ads Credit',
    blurb: 'A chance at ₦5,000 at 10, 15 and 20 orders, plus a guaranteed ₦25,000 at 40 orders.',
    emoji: '₦',
    tint: '#00A082',
    image: '/rewards/ads-credit.jpg',
  },
];
