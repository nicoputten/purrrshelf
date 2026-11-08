import { screen, userEvent } from '@testing-library/react-native';
import { StorageKeys } from '@/lib/storage';
import { setFetch, useSession } from '@/session/session';
import { apiError, fakeBroker, health, tokens } from '@/test/fakeBroker';
import { renderWithProviders, resetApp, secureStore } from '@/test/utils';
import { getLocales } from 'expo-localization';
import { LoginScreen } from './LoginScreen';
import { ServerScreen } from './ServerScreen';

beforeEach(resetApp);

describe('ServerScreen', () => {
  it('starts with an empty address (no default server)', async () => {
    await renderWithProviders(<ServerScreen />);
    expect(screen.getByLabelText('Server address')).toHaveDisplayValue('');
  });

  it('asks to fill in the address', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ServerScreen />);
    await user.press(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Fill this in')).toBeOnTheScreen();
  });

  it('explains an invalid address', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ServerScreen />);
    await user.type(screen.getByLabelText('Server address'), 'shelf');
    await user.press(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/not a valid address/)).toBeOnTheScreen();
  });

  it('explains an unreachable server', async () => {
    setFetch(fakeBroker({ 'GET /health': () => new TypeError('offline') }).fetch);
    const user = userEvent.setup();
    await renderWithProviders(<ServerScreen />);
    await user.type(screen.getByLabelText('Server address'), 'https://shelf.example.invalid');
    await user.press(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/Can’t reach the server/)).toBeOnTheScreen();
  });

  it('explains a server that is not Purrshelf', async () => {
    setFetch(async () => new Response('<html>', { status: 200 }));
    const user = userEvent.setup();
    await renderWithProviders(<ServerScreen />);
    await user.type(screen.getByLabelText('Server address'), 'https://shelf.example.invalid');
    await user.press(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/not a Purrshelf server/)).toBeOnTheScreen();
  });

  it('moves on to login when the server answers', async () => {
    setFetch(fakeBroker({ 'GET /health': health }).fetch);
    const user = userEvent.setup();
    await renderWithProviders(<ServerScreen />);
    await user.type(screen.getByLabelText('Server address'), 'https://shelf.example.invalid/');
    await user.press(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByLabelText('Server address');
    expect(useSession.getState().status).toBe('needsLogin');
    expect(secureStore.get(StorageKeys.serverUrl)).toBe('https://shelf.example.invalid');
  });

  it('is in Dutch on a Dutch phone', async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'nl' }]);
    await renderWithProviders(<ServerScreen />);
    expect(screen.getByText('Waar woont je boekenkast?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Verbinden' })).toBeOnTheScreen();
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'en' }]);
  });
});

describe('LoginScreen', () => {
  beforeEach(() => {
    useSession.setState({ status: 'needsLogin', serverUrl: 'https://shelf.example.invalid' });
  });

  async function fillIn(username: string, password: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Username'), username);
    await user.type(screen.getByLabelText('Password'), password);
    await user.press(screen.getByRole('button', { name: 'Log in' }));
  }

  it('shows the server it is connected to', async () => {
    await renderWithProviders(<LoginScreen />);
    expect(screen.getByText('Connected to shelf.example.invalid')).toBeOnTheScreen();
  });

  it('requires both fields', async () => {
    const broker = fakeBroker({});
    setFetch(broker.fetch);
    await renderWithProviders(<LoginScreen />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findAllByText('Fill this in')).toHaveLength(2);
    expect(broker.calls).toHaveLength(0);
  });

  it('shows a translated error for a wrong password', async () => {
    setFetch(fakeBroker({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS') }).fetch);
    await renderWithProviders(<LoginScreen />);
    await fillIn('reader', 'nope');
    expect(await screen.findByText('Wrong username or password.')).toBeOnTheScreen();
  });

  it('tells how long to wait when the account is locked', async () => {
    setFetch(
      fakeBroker({
        'POST /auth/login': () => apiError(423, 'ACCOUNT_LOCKED', { retryAfterSeconds: 600 }),
      }).fetch,
    );
    await renderWithProviders(<LoginScreen />);
    await fillIn('reader', 'nope');
    expect(await screen.findByText('Too many tries. Wait 10 min and try again.')).toBeOnTheScreen();
  });

  it('logs in and keeps the refresh token in secure storage', async () => {
    const broker = fakeBroker({ 'POST /auth/login': () => tokens(1) });
    setFetch(broker.fetch);
    await renderWithProviders(<LoginScreen />);
    await fillIn('reader', 'correct horse battery');
    await screen.findByLabelText('Username');
    expect(broker.calls[0]!.body).toEqual({
      username: 'reader',
      password: 'correct horse battery',
    });
    expect(useSession.getState().status).toBe('ready');
    expect(secureStore.get(StorageKeys.refreshToken)).toBe('refresh-1');
  });

  it('can go back and change the server', async () => {
    await renderWithProviders(<LoginScreen />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Change' }));
    expect(useSession.getState()).toMatchObject({ status: 'needsServer', serverUrl: null });
  });
});
