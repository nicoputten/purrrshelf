import { z } from 'zod';
import { create } from 'zustand';
import { StorageKeys, storage } from '@/lib/storage';

export const ThemePreference = z.enum(['system', 'dark', 'light']);
export type ThemePreference = z.infer<typeof ThemePreference>;
export const LanguagePreference = z.enum(['system', 'en', 'nl']);
export type LanguagePreference = z.infer<typeof LanguagePreference>;

/** The book language last picked in the Add sheet; null until the first add. */
export const BookLanguagePreference = z.enum(['en', 'nl']).nullable();
export type BookLanguagePreference = z.infer<typeof BookLanguagePreference>;

const Stored = z.object({
  theme: ThemePreference.catch('system'),
  language: LanguagePreference.catch('system'),
  bookLanguage: BookLanguagePreference.catch(null).default(null),
});

interface PreferencesState {
  theme: ThemePreference;
  language: LanguagePreference;
  bookLanguage: BookLanguagePreference;
  load: () => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  setLanguage: (language: LanguagePreference) => Promise<void>;
  setBookLanguage: (language: 'en' | 'nl') => Promise<void>;
}

const persist = (s: Pick<PreferencesState, 'theme' | 'language' | 'bookLanguage'>) =>
  storage.set(
    StorageKeys.preferences,
    JSON.stringify({ theme: s.theme, language: s.language, bookLanguage: s.bookLanguage }),
  );

export const usePreferences = create<PreferencesState>((set, get) => ({
  theme: 'system',
  language: 'system',
  bookLanguage: null,
  load: async () => {
    const raw = await storage.get(StorageKeys.preferences);
    if (!raw) return;
    try {
      set(Stored.parse(JSON.parse(raw)));
    } catch {
      // Corrupt preferences are not worth failing start-up over.
    }
  },
  setTheme: async (theme) => {
    set({ theme });
    await persist(get());
  },
  setLanguage: async (language) => {
    set({ language });
    await persist(get());
  },
  setBookLanguage: async (bookLanguage) => {
    set({ bookLanguage });
    await persist(get());
  },
}));
