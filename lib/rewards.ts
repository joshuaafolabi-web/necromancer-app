// lib/rewards.ts
//
// The prize showcase, shared by the home page and /arcade so the two can't
// drift. These are the PRD Section 15 prizes grouped into what a partner
// actually cares about seeing — the three Ads Credit denominations collapse
// into one "Ads Credit" tile rather than three near-identical cards.
//
// IMAGES: `image` is optional. Leave it empty and the tile renders as a
// branded gradient card with its emoji, which is the safer default — it
// needs no network request (PRD Section 11 flags low-end tablets on flaky
// kitchen wifi) and it can never show the wrong picture.
//
// The Instagram tile previously pointed at an Unsplash photo of a circuit
// board. Fill any of these in with a real photo URL when you have one you've
// actually looked at; images.unsplash.com is already allow-listed in
// next.config.js.

export type Reward = {
  title: string;
  blurb: string;
  emoji: string;
  tint: string;
  image?: string;
};

export const REWARDS: Reward[] = [
  {
    title: 'Free Packaging',
    blurb: 'Branded takeaway packs, delivered to your store.',
    emoji: '📦',
    tint: '#6B7280',
    image: 'https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Store Branding Kit',
    blurb: 'Signage and stickers to make your store stand out.',
    emoji: '🎨',
    tint: '#7C3AED',
    image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Pro Photography Session',
    blurb: 'A photographer shoots your menu, properly.',
    emoji: '📸',
    tint: '#374151',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Instagram Story Feature',
    blurb: 'Your store on the Glovo Nigeria Instagram.',
    emoji: '📱',
    tint: '#F59E0B',
  },
  {
    title: 'Ads Credit',
    blurb: '₦5,000 up to ₦25,000 to promote your store.',
    emoji: '💰',
    tint: '#00A082',
  },
  {
    title: 'Photography + ₦25,000',
    blurb: 'The top prize — the full shoot and the full credit.',
    emoji: '👑',
    tint: '#B8860B',
  },
];
