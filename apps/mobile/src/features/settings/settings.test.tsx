import { screen, userEvent } from '@testing-library/react-native';
import { StorageKeys } from '@/lib/storage';
import { usePreferences } from '@/session/preferences';
import { setFetch, useSession } from '@/session/session';
import { fakeBroker, me } from '@/test/fakeBroker';
import { renderWithProviders, resetApp, secureStore } from '@/test/utils';
import { HomeScreen } from '../HomeScreen';
import { SettingsScreen } from './SettingsScreen';

beforeEach(async () => {
  await resetApp();
  secureStore.set(StorageKeys.refreshToken, 'refresh-1');
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'a',
  });
  setFetch(
    fakeBroker({ 'GET /me': me, 'POST /auth/logout': () => ({ status: 200, body: {} }) }).fetch,
  );
});

describe('SettingsScreen', () => {
  it('shows who is logged in and where', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByText('Logged in as Reader One')).toBeOnTheScreen();
    expect(screen.getByText('Server: https://shelf.example.invalid')).toBeOnTheScreen();
  });

  it('switches the UI to Dutch and back', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<SettingsScreen />);
    await user.press(screen.getByRole('radio', { name: 'Nederlands' }));
    expect(await screen.findByText('Instellingen')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Nederlands' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'English' }));
    expect(await screen.findByText('Settings')).toBeOnTheScreen();
    expect(usePreferences.getState().language).toBe('en');
  });

  it('changes the theme', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<SettingsScreen />);
    await user.press(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(usePreferences.getState().theme).toBe('light');
  });

  it('logs out and clears the stored token', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<SettingsScreen />);
    await user.press(screen.getByRole('button', { name: 'Log out' }));
    expect(useSession.getState().status).toBe('needsLogin');
    expect(secureStore.has(StorageKeys.refreshToken)).toBe(false);
  });
});

describe('HomeScreen', () => {
  it('greets the user by name', async () => {
    await renderWithProviders(<HomeScreen />);
    expect(screen.getByText('What are we reading next?')).toBeOnTheScreen();
    expect(await screen.findByText('Hi Reader One!')).toBeOnTheScreen();
  });
});
