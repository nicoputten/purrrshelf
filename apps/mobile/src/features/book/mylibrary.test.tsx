import { screen, userEvent } from '@testing-library/react-native';
import { setFetch, useSession } from '@/session/session';
import { apiError, fakeBroker, ok, work } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { BookDetailScreen } from './BookDetailScreen';

// See book.test.tsx: a cold first render can be slow on CI.
jest.setTimeout(15_000);

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

const itemId = '00000000-0000-4000-8000-000000000001';
const me = { id: 'u1', displayName: 'Reader One', me: true };
const partner = { id: 'u2', displayName: 'Reader Two', me: false };
type Owner = typeof me;

function render(start: Owner[], { failRemove = false } = {}) {
  let owners = start;
  const ownership = (deleteAfter: string | null = null) => ok({ itemId, owners, deleteAfter });
  const b = fakeBroker({
    'GET /works/hardcover:301': () =>
      ok(work({ series: null, library: { itemId, owners, onMyKobo: false, reading: null } })),
    'GET /works/hardcover:301/similar': () => ok({ works: [] }),
    [`GET /library/items/${itemId}/kobos`]: () => ok({ kobos: [] }),
    [`DELETE /library/items/${itemId}/owners/me`]: () => {
      if (failRemove) return apiError(503, 'LIBRARY_UNAVAILABLE');
      owners = owners.filter((o) => !o.me);
      return ownership(owners.length ? null : '2026-01-08T00:00:00.000Z');
    },
    [`PUT /library/items/${itemId}/owners/me`]: () => {
      owners = [...owners, me];
      return ownership();
    },
  });
  setFetch(b.fetch);
  const routes = () => b.calls.map((c) => c.route).filter((r) => !r.startsWith('GET'));
  return {
    routes,
    view: renderWithProviders(
      <BookDetailScreen id="hardcover:301" onBack={jest.fn()} onOpen={jest.fn()} />,
    ),
  };
}

describe('My library on the book page', () => {
  it('removes a book I share and offers Undo', async () => {
    const { routes, view } = render([partner, me]);
    await view;
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Remove from my library' }));
    expect(await screen.findByText('Removed from your library and your Kobo.')).toBeOnTheScreen();
    expect(screen.queryByText('Yours')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'Remove from my library' })).toBeOnTheScreen();
    expect(routes()).toEqual([
      `DELETE /library/items/${itemId}/owners/me`,
      `PUT /library/items/${itemId}/owners/me`,
    ]);
  });

  it('warns when nobody owns the book any more', async () => {
    const { view } = render([me]);
    await view;
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Remove from my library' }));
    expect(await screen.findByText(/Nobody owns it now/)).toBeOnTheScreen();
  });

  it('adds a partner’s book to my library', async () => {
    const { routes, view } = render([partner]);
    await view;
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Add to my library' }));
    expect(await screen.findByText('Yours')).toBeOnTheScreen();
    expect(routes()).toEqual([`PUT /library/items/${itemId}/owners/me`]);
  });

  it('shows the broker’s refusal', async () => {
    const { view } = render([me], { failRemove: true });
    await view;
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Remove from my library' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove from my library' })).toBeOnTheScreen();
  });
});
