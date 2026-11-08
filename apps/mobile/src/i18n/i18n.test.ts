import { getLocales } from 'expo-localization';
import { en } from './en';
import { nl } from './nl';
import { phoneLanguage, resolveLanguage } from './index';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`),
  );
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).sort();
}

describe('translations', () => {
  it('have exactly the same keys in English and Dutch', () => {
    expect(keys(nl).sort()).toEqual(keys(en).sort());
  });

  it('have no empty strings', () => {
    for (const lang of [en, nl]) {
      for (const k of keys(lang)) {
        const value = k
          .split('.')
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], lang);
        expect(String(value).trim()).not.toBe('');
      }
    }
  });

  it('use the same placeholders in both languages', () => {
    for (const k of keys(en)) {
      const get = (o: object) =>
        k.split('.').reduce<unknown>((x, p) => (x as Record<string, unknown>)[p], o) as string;
      expect([k, placeholders(get(nl))]).toEqual([k, placeholders(get(en))]);
    }
  });

  it('translate every API error code', () => {
    const { errorCodes } = jest.requireActual('@purrshelf/contract') as {
      errorCodes: readonly string[];
    };
    for (const code of errorCodes) expect(Object.keys(en.errors)).toContain(code);
  });
});

describe('language selection', () => {
  const mocked = getLocales as jest.Mock;

  it('follows a Dutch phone', () => {
    mocked.mockReturnValueOnce([{ languageCode: 'nl' }]);
    expect(phoneLanguage()).toBe('nl');
  });

  it('falls back to English for other or missing languages', () => {
    mocked.mockReturnValueOnce([{ languageCode: 'de' }]);
    expect(phoneLanguage()).toBe('en');
    mocked.mockReturnValueOnce([]);
    expect(phoneLanguage()).toBe('en');
  });

  it('lets the user override the phone', () => {
    expect(resolveLanguage('nl')).toBe('nl');
    expect(resolveLanguage('en')).toBe('en');
    expect(resolveLanguage('system')).toBe('en');
  });
});
