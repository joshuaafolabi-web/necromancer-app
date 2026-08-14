// lib/scoring.ts
//
// Deliberately almost empty now. This app computes NOTHING about the game.
//
// The ladder rungs, prize labels, wheel tiers and EP formula all live in the
// Apps Script backend and arrive with each API response, so there is exactly
// one place the numbers exist. Two independent copies of the rules is how
// the flat-odds bug survived: this file declared "same odds regardless of
// which wheel tier is unlocked", which contradicts the PRD's per-tier table
// and quietly changed the reward economics being piloted.
//
// Prize WEIGHTS must never come back here. PRD Section 11 requires the
// client receive only the resolved outcome, never the odds table — and this
// file used to export every weight to the browser.
//
// What's left is presentation-only: the wheel's wedge colors.

export const WEDGE_COLORS = [
  '#6B7280', // Free Packaging
  '#7C3AED', // Branding Kit
  '#00A082', // ₦5K Credit
  '#F59E0B', // IG Feature
  '#059669', // ₦10K Credit
  '#374151', // Photography
  '#FFC244', // ₦25K Credit
  '#B45309', // Photo + ₦25K
] as const;

export const RANK_COLOR: Record<string, string> = {
  Archnecromancer: '#B8860B',
  Soulforger: '#6D28D9',
  Wraithbinder: '#00A082',
  Bonecaller: '#9CA3AF',
};
