export const INTEREST_IDS = [
  'gardening',
  'cooking',
  'music',
  'reading',
  'travel',
  'family',
  'pets',
  'walking',
  'sports',
  'puzzles',
  'crafts',
  'films',
  'history',
  'nature',
] as const;

export type InterestId = (typeof INTEREST_IDS)[number];

const known = new Set<string>(INTEREST_IDS);

export function isInterest(value: unknown): value is InterestId {
  return typeof value === 'string' && known.has(value);
}
