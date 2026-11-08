import { screen, userEvent, waitFor } from '@testing-library/react-native';
import type { BookRequest } from '@purrshelf/contract';
import { i18n } from '@/i18n';
import { setFetch, useSession } from '@/session/session';
import { apiError, bookRequest, budget, fakeBroker, ok, readers } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { RequestsScreen, statusLine } from './RequestsScreen';
import { REQUEST_POLL_MS } from './useRequests';

jest.setTimeout(15_000);

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

function broker(list: () => unknown[], routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /requests': () => ok({ requests: list() }),
    'GET /readers': () => readers(),
    'GET /budget': () => budget(),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

describe('Requests', () => {
  it('invites a first add when there is nothing on its way', async () => {
    broker(() => []);
    await renderWithProviders(<RequestsScreen />);
    expect(await screen.findByText(/Nothing on its way/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Find a book' })).toBeOnTheScreen();
  });

  it('shows where each request stands, with download progress', async () => {
    broker(() => [
      bookRequest({ id: 'a', status: 'downloading', progress: 42 }),
      bookRequest({
        id: 'b',
        title: 'Max Havelaar',
        authors: ['Multatuli'],
        language: 'nl',
        status: 'pushed',
      }),
      bookRequest({ id: 'c', title: 'The Glass Harbour', status: 'not_found' }),
    ]);
    await renderWithProviders(<RequestsScreen />);
    expect(await screen.findByText('Downloading · 42%')).toBeOnTheScreen();
    expect(screen.getByLabelText('The Salt Road, Downloading · 42%')).toBeOnTheScreen();
    expect(screen.getByText('Multatuli · Nederlands')).toBeOnTheScreen();
    expect(await screen.findByText('On your Kobo after its next sync')).toBeOnTheScreen();
    expect(screen.getByText('Couldn’t sniff this one out')).toBeOnTheScreen();
    expect(screen.getByText('21 / 25 left')).toBeOnTheScreen();
  });

  it('follows a request live until it is on the Kobo', async () => {
    let status = 'searching';
    const b = broker(() => [bookRequest({ status })]);
    await renderWithProviders(<RequestsScreen />);
    expect(await screen.findByText('Sniffing it out…')).toBeOnTheScreen();
    status = 'pushed';
    expect(
      await screen.findByText(
        'On your Kobo after its next sync',
        {},
        { timeout: REQUEST_POLL_MS + 2000 },
      ),
    ).toBeOnTheScreen();
    const polls = b.calls.filter((c) => c.route === 'GET /requests').length;
    await new Promise((r) => setTimeout(r, REQUEST_POLL_MS + 500));
    // Settled: no more polling.
    expect(b.calls.filter((c) => c.route === 'GET /requests').length).toBe(polls);
  });

  it('shows a translated error with Try again', async () => {
    let fail = true;
    broker(() => [], {
      'GET /requests': () => (fail ? apiError(500, 'INTERNAL_ERROR') : ok({ requests: [] })),
    });
    const user = userEvent.setup();
    await renderWithProviders(<RequestsScreen />);
    expect(await screen.findByText('The server had a problem. Try again later.')).toBeOnTheScreen();
    fail = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText(/Nothing on its way/)).toBeOnTheScreen());
  });
});

describe('statusLine', () => {
  const t = i18n.t.bind(i18n);
  const line = (over: Partial<BookRequest>, me?: string) =>
    statusLine({ ...(bookRequest() as BookRequest), ...over }, me, t);

  it('names every status', () => {
    expect(line({ status: 'waiting_budget' })).toMatch(/Waiting for a free search/);
    expect(line({ status: 'downloading', progress: null })).toBe('Downloading · 0%');
    expect(line({ status: 'importing' })).toMatch(/Kobo-friendly/);
    expect(line({ status: 'in_library', pushTo: [] })).toBe('In the library');
    expect(line({ status: 'in_library', pushTo: ['u1'] })).toMatch(/couldn’t go on a Kobo/);
    expect(line({ status: 'pushed', pushTo: ['u2'] }, 'u1')).toBe(
      'On the Kobo after its next sync',
    );
    expect(line({ status: 'pushed', pushTo: ['u1'] }, 'u1')).toBe(
      'On your Kobo after its next sync',
    );
    expect(line({ status: 'pushed', pushTo: ['u1'] })).toBe('On the Kobo after its next sync');
    expect(line({ status: 'cancelled' })).toBe('Cancelled');
  });
});
