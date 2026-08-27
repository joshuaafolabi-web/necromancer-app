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

// The wheel is always exactly 2 wedges now (2026-08-27 milestone rewrite):
// either [prize, "Try Again"] for a chance draw, or [prize, prize] for a
// guaranteed reveal — see components/Wheel.tsx and the wedgeLabels logic in
// app/arcade/page.tsx.
export const WEDGE_COLORS = [
  '#FFC244', // the prize wedge
  '#6B7280', // "Try Again" / repeated-prize wedge
] as const;

export const RANK_COLOR: Record<string, string> = {
  Archnecromancer: '#B8860B',
  Soulforger: '#6D28D9',
  Wraithbinder: '#00A082',
  Bonecaller: '#9CA3AF',
};
