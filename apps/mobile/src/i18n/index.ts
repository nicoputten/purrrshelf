import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LanguagePreference } from '@/session/preferences';
import { en } from './en';
import { nl } from './nl';

export const supportedLanguages = ['en', 'nl'] as const;
export type Language = (typeof supportedLanguages)[number];

/** Dutch if the phone prefers it, otherwise English. */
export function phoneLanguage(): Language {
  const code = getLocales()[0]?.languageCode?.toLowerCase();
  return code === 'nl' ? 'nl' : 'en';
}

export function resolveLanguage(preference: LanguagePreference): Language {
  return preference === 'system' ? phoneLanguage() : preference;
}

export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, nl: { translation: nl } },
  lng: phoneLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...supportedLanguages],
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
});
