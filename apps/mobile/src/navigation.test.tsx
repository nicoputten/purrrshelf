import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { StorageKeys } from '@/lib/storage';
import { setFetch } from '@/session/session';
import { fakeBroker, health, hit, me, ok, searchResult, tokens, work } from '@/test/fakeBroker';
import { resetApp, secureStore } from '@/test/utils';

// Rendering the whole router is slower than a single screen.
jest.setTimeout(20_000);

beforeEach(resetApp);

describe('app navigation', () => {
  it('walks a new user from server to login to the home screen', async () => {
    setFetch(
      fakeBroker({ 'GET /health': health, 'POST /auth/login': () => tokens(1), 'GET /me': me })
        .fetch,
    );
    const user = userEvent.setup();
    await renderRouter('./src/app');

    await user.type(
      await screen.findByLabelText('Server address'),
      'https://shelf.example.invalid',
    );
    await user.press(screen.getByRole('button', { name: 'Connect' }));

    await user.type(await screen.findByLabelText('Username'), 'reader');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.press(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('What are we reading next?')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Search by title or author')).toBeOnTheScreen();
  });

  it('opens straight on the home screen with a stored session', async () => {
    secureStore.set(StorageKeys.serverUrl, 'https://shelf.example.invalid');
    secureStore.set(StorageKeys.refreshToken, 'refresh-0');
    setFetch(fakeBroker({ 'POST /auth/refresh': () => tokens(1), 'GET /me': me }).fetch);
    await renderRouter('./src/app');
    expect(await screen.findByText('What are we reading next?')).toBeOnTheScreen();
  });

  it('opens a search hit on its own page and comes back', async () => {
    secureStore.set(StorageKeys.serverUrl, 'https://shelf.example.invalid');
    secureStore.set(StorageKeys.refreshToken, 'refresh-0');
    setFetch(
      fakeBroker({
        'POST /auth/refresh': () => tokens(1),
        'GET /discover/search': () => searchResult([hit()]),
        'GET /works/hardcover:301': () => ok(work({ series: null })),
      }).fetch,
    );
    const user = userEvent.setup();
    await renderRouter('./src/app');
    await user.type(await screen.findByLabelText('Search by title or author'), 'salt', {
      submitEditing: true,
    });
    await user.press(await screen.findByRole('button', { name: /^The Salt Road/ }));
    expect(
      await screen.findByText('A lamplighter walks the salt road to the sea.'),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Search by title or author')).toBeOnTheScreen(),
    );
  });

  it('returns to login after logging out from settings', async () => {
    secureStore.set(StorageKeys.serverUrl, 'https://shelf.example.invalid');
    secureStore.set(StorageKeys.refreshToken, 'refresh-0');
    setFetch(
      fakeBroker({
        'POST /auth/refresh': () => tokens(1),
        'GET /me': me,
        'POST /auth/logout': () => ({ status: 200, body: {} }),
      }).fetch,
    );
    const user = userEvent.setup();
    await renderRouter('./src/app', { initialUrl: '/settings' });
    await user.press(await screen.findByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByLabelText('Username')).toBeOnTheScreen());
  });
});
