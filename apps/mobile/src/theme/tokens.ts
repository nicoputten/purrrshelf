/**
 * Design tokens from the UX canvas (docs/design/design-choices.md).
 * Dark is the designed theme; light reuses the same token names.
 */
export interface Palette {
  background: string;
  scrim: string;
  surface: string;
  surfaceMuted: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textBody: string;
  textMuted: string;
  accent: string;
  accentPressed: string;
  onAccent: string;
  success: string;
  successBg: string;
  onSuccessBg: string;
  partner: string;
  partnerBg: string;
  mine: string;
  mineBg: string;
  danger: string;
  dangerBg: string;
}

export const dark: Palette = {
  background: '#17141C',
  scrim: '#0E0C11',
  surface: '#231F2A',
  surfaceMuted: '#1C1922',
  surfaceRaised: '#2E2836',
  border: '#4A4254',
  text: '#F4EFEA',
  textBody: '#D9D2E0',
  textMuted: '#B9B0C2',
  accent: '#F6A65A',
  accentPressed: '#FFC48A',
  onAccent: '#2A1606',
  success: '#8FD8C8',
  successBg: '#1F3A35',
  onSuccessBg: '#CDEFE7',
  partner: '#F7B6C2',
  partnerBg: '#3A2530',
  mine: '#F6C38F',
  mineBg: '#3A2E1F',
  danger: '#F7B6C2',
  dangerBg: '#3A2530',
};

/** Not on the canvas yet: derived so the theme switch works. */
export const light: Palette = {
  background: '#FBF7F2',
  scrim: '#2A1606',
  surface: '#FFFFFF',
  surfaceMuted: '#F4EEE7',
  surfaceRaised: '#EFE7DE',
  border: '#D8CCC0',
  text: '#231F2A',
  textBody: '#3A3442',
  textMuted: '#6B6275',
  accent: '#F6A65A',
  accentPressed: '#E8924A',
  onAccent: '#2A1606',
  success: '#1E6B5C',
  successBg: '#DDF3EE',
  onSuccessBg: '#14473D',
  partner: '#9C3550',
  partnerBg: '#FBE3E9',
  mine: '#8A4E12',
  mineBg: '#FCEBD8',
  danger: '#9C3550',
  dangerBg: '#FBE3E9',
};

export const coverColours = [
  '#4A5B3F',
  '#5B3F4F',
  '#3F4A5B',
  '#5B4A3F',
  '#3F5B54',
  '#57503A',
  '#4F3F5B',
  '#5B453F',
  '#3F535B',
] as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const radius = { pill: 999, card: 20, input: 20, button: 16, cover: 12, sheet: 28 } as const;

export const fonts = {
  heading: 'Fredoka_600SemiBold',
  headingMedium: 'Fredoka_500Medium',
  body: 'Nunito_400Regular',
  bodySemiBold: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
} as const;

export const fontSize = {
  display: 30,
  title: 28,
  heading: 22,
  sheetTitle: 20,
  section: 17,
  card: 16,
  body: 15,
  small: 13,
  tiny: 12,
} as const;

/** Minimum touch target and primary button height from the canvas. */
export const sizes = { touch: 44, primaryButton: 56, input: 56 } as const;

export type ColorScheme = 'dark' | 'light';
export const palettes: Record<ColorScheme, Palette> = { dark, light };

/**
 * Fixed colours of the cat animations (canvas boards 9, 9b, 9c). They are the
 * same in light and dark: the scenes are little dark stages of their own.
 */
export const motion = {
  ginger: '#F6A65A',
  pink: '#F7B6C2',
  mint: '#8FD8C8',
  cream: '#F4EFEA',
  nose: '#E88FA0',
  eye: '#17141C',
  stage: '#231F2A',
  table: '#4A4254',
  tableLeg: '#3B3347',
  basket: '#B97A3E',
  basketWeave: '#9A6230',
  basketRim: '#D08C4A',
  reader: '#3B3347',
  badgeText: '#2A1606',
  zzz: '#B9B0C2',
} as const;
