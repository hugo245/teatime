import { create } from 'zustand';
import type { PickedPhoto } from '../lib/photo';

type Draft = {
  name: string;
  location: string;
  interests: string[];
  photo: PickedPhoto | null;
  set(patch: Partial<Omit<Draft, 'set' | 'reset' | 'toggleInterest'>>): void;
  toggleInterest(id: string): void;
  reset(): void;
};

export const useOnboarding = create<Draft>((set) => ({
  name: '',
  location: '',
  interests: [],
  photo: null,
  set: (patch) => set(patch),
  toggleInterest: (id) =>
    set((state) => ({
      interests: state.interests.includes(id)
        ? state.interests.filter((i) => i !== id)
        : state.interests.length >= 8
          ? state.interests
          : [...state.interests, id],
    })),
  reset: () => set({ name: '', location: '', interests: [], photo: null }),
}));
