import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { usePreferences } from '@/session/preferences';
import { resetApp } from '@/test/utils';
import { ThemeProvider, resolveScheme, useTheme } from './ThemeProvider';
import { dark, light } from './tokens';

beforeEach(resetApp);

function Probe() {
  const { scheme, colors } = useTheme();
  return <Text>{`${scheme} ${colors.background}`}</Text>;
}

describe('theme', () => {
  it('defaults to dark, the designed theme', () => {
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('uses the canvas colours in dark mode', () => {
    expect(dark).toMatchObject({
      background: '#17141C',
      surface: '#231F2A',
      accent: '#F6A65A',
      text: '#F4EFEA',
    });
  });

  it('has the same tokens in both palettes', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });

  it('follows the preference', async () => {
    usePreferences.setState({ theme: 'light' });
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByText(`light ${light.background}`)).toBeOnTheScreen();
  });
});
