import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type Interest = {
  id: string;
  label: string;
  icon: IconName;
};

export const INTERESTS: Interest[] = [
  { id: 'gardening', label: 'Gardening', icon: 'leaf-outline' },
  { id: 'cooking', label: 'Cooking', icon: 'restaurant-outline' },
  { id: 'music', label: 'Music', icon: 'musical-notes-outline' },
  { id: 'reading', label: 'Reading', icon: 'book-outline' },
  { id: 'travel', label: 'Travel', icon: 'airplane-outline' },
  { id: 'family', label: 'Family', icon: 'people-outline' },
  { id: 'pets', label: 'Pets', icon: 'paw-outline' },
  { id: 'walking', label: 'Walking', icon: 'walk-outline' },
  { id: 'sports', label: 'Sports', icon: 'football-outline' },
  { id: 'puzzles', label: 'Puzzles', icon: 'extension-puzzle-outline' },
  { id: 'crafts', label: 'Crafts', icon: 'color-palette-outline' },
  { id: 'films', label: 'Films', icon: 'film-outline' },
  { id: 'history', label: 'History', icon: 'library-outline' },
  { id: 'nature', label: 'Nature', icon: 'flower-outline' },
];

const byId = new Map(INTERESTS.map((i) => [i.id, i]));

export function interestById(id: string) {
  return byId.get(id);
}

export function interestLabels(ids: string[]) {
  return ids.map((id) => byId.get(id)?.label).filter((x): x is string => !!x);
}

export function joinWords(words: string[]) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
