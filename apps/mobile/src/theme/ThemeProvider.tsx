import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { usePreferences, type ThemePreference } from '@/session/preferences';
import { palettes, type ColorScheme, type Palette } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
}

const ThemeContext = createContext<Theme>({ scheme: 'dark', colors: palettes.dark });

/** Dark is the designed default, so "system" without a system answer means dark. */
export function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined,
): ColorScheme {
  if (preference !== 'system') return preference;
  return system === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const preference = usePreferences((s) => s.theme);
  const value = useMemo<Theme>(() => {
    const scheme = resolveScheme(preference, system);
    return { scheme, colors: palettes[scheme] };
  }, [preference, system]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
