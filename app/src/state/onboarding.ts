import { create } from 'zustand';
import { deviceLanguage } from '../lib/languages';
import type { PickedPhoto } from '../lib/photo';

type Draft = {
  name: string;
  location: string;
  interests: string[];
  languages: string[];
  photo: PickedPhoto | null;
  set(patch: Partial<Omit<Draft, 'set' | 'reset' | 'toggleInterest' | 'toggleLanguage'>>): void;
  toggleInterest(id: string): void;
  toggleLanguage(code: string): void;
  reset(): void;
};

export const useOnboarding = create<Draft>((set) => ({
  name: '',
  location: '',
  interests: [],
  languages: [deviceLanguage()],
  photo: null,
  set: (patch) => set(patch),
  toggleLanguage: (code) =>
    set((state) => ({
      languages: state.languages.includes(code)
        ? state.languages.filter((l) => l !== code)
        : state.languages.length >= 6
          ? state.languages
          : [...state.languages, code],
    })),
  toggleInterest: (id) =>
    set((state) => ({
      interests: state.interests.includes(id)
        ? state.interests.filter((i) => i !== id)
        : state.interests.length >= 8
          ? state.interests
          : [...state.interests, id],
    })),
  reset: () => set({ name: '', location: '', interests: [], languages: [deviceLanguage()], photo: null }),
}));
