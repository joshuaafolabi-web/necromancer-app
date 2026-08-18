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

// One color per entry in gameRules.ts's PRIZES, same order. That table is
// now 7 rows (the "Photo + ₦25K" combo was removed and merged into ₦25K
// Credit), so this is 7 too — an 8th unused color here wasn't wrong, just
// silently dead, and its comment still named a prize that no longer exists.
export const WEDGE_COLORS = [
  '#6B7280', // Glovo Branded Merchandise
  '#7C3AED', // Branding Kit
  '#00A082', // ₦5K Credit
  '#F59E0B', // IG Feature
  '#059669', // ₦10K Credit
  '#374151', // Pro Food Photography Session
  '#FFC244', // ₦25K Credit
] as const;

export const RANK_COLOR: Record<string, string> = {
  Archnecromancer: '#B8860B',
  Soulforger: '#6D28D9',
  Wraithbinder: '#00A082',
  Bonecaller: '#9CA3AF',
};
