import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { BookRequest } from '@purrshelf/contract';
import { i18n } from '@/i18n';
import { setFetch, useSession } from '@/session/session';
import {
  apiError,
  bookRequest,
  budgetWithIndexer,
  fakeBroker,
  ok,
  readers,
} from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { RequestsScreen, statusLine } from './RequestsScreen';
import { formatSize, requestSteps } from './steps';
import { setEventStream, useLiveRequests } from './useRequestEvents';
import { REQUEST_POLL_MS } from './useRequests';

jest.setTimeout(15_000);

const epub = {
  id: 'rel-1',
  title: 'The Salt Road EPUB',
  format: 'epub',
  size: 1_400_000,
  language: 'en',
};

beforeEach(async () => {
  await resetApp();
  useLiveRequests.setState({ live: false });
  // No live stream in these tests: the screen polls instead.
  setEventStream(() => Promise.reject(new Error('offline')));
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

afterEach(() => setEventStream(undefined));

function broker(list: () => unknown[], routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /requests': () => ok({ requests: list() }),
    'GET /readers': () => readers(),
    'GET /budget': () => budgetWithIndexer(),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

const render = (onPick = jest.fn(), onFindBook = jest.fn()) =>
  renderWithProviders(<RequestsScreen onPick={onPick} onFindBook={onFindBook} />);

describe('Requests', () => {
  it('invites a first add when there is nothing on its way', async () => {
    broker(() => [bookRequest({ status: 'cancelled' })]);
    const onFindBook = jest.fn();
    await render(jest.fn(), onFindBook);
    expect(await screen.findByText(/Nothing on its way/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Find a book' }));
    expect(onFindBook).toHaveBeenCalled();
  });

  it('shows each step of a download, with Pick another', async () => {
    broker(() => [
      bookRequest({ status: 'downloading', progress: 42, release: epub, searches: 1 }),
    ]);
    const onPick = jest.fn();
    await render(onPick);
    expect(await screen.findByLabelText('The Salt Road, Downloading · 42%')).toBeOnTheScreen();
    expect(screen.getByText('For your Kobo · English')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Sniffed it out, Found on the first try · 1 search, done'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Picked the best match, EPUB · 1.4 MB · English, done'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Downloading, 42%, now')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Adding to the library, making it Kobo-friendly, still to come'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('On your Kobo after its next sync, still to come'),
    ).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pick another' }));
    expect(onPick).toHaveBeenCalledWith('r1');
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('offers Try again with its cost, and Dismiss, when nothing was found', async () => {
    let status = 'not_found';
    const b = broker(() => [bookRequest({ status, searches: 4 })], {
      'POST /requests/r1/retry': () => {
        status = 'searching';
        return ok(bookRequest({ status }));
      },
      'POST /requests/r1/cancel': () => {
        status = 'cancelled';
        return ok(bookRequest({ status }));
      },
    });
    const user = userEvent.setup();
    await render();
    expect(await screen.findByText('Couldn’t sniff this one out')).toBeOnTheScreen();
    expect(screen.getByText('4 searches on Primary')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again · up to 4' }));
    expect(await screen.findByLabelText('Sniffing it out, now')).toBeOnTheScreen();
    expect(b.calls.map((c) => c.route)).toContain('POST /requests/r1/retry');
  });

  it('dismisses a request', async () => {
    let status = 'not_found';
    broker(() => [bookRequest({ status, searches: 0 })], {
      'POST /requests/r1/cancel': () => {
        status = 'cancelled';
        return ok(bookRequest({ status }));
      },
    });
    await render();
    expect(await screen.findByText('No search was made')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText(/Nothing on its way/)).toBeOnTheScreen();
  });

  it('shows a refused Try again in words', async () => {
    broker(() => [bookRequest({ status: 'download_failed', release: epub })], {
      'POST /requests/r1/retry': () => apiError(409, 'REQUEST_STATE'),
    });
    await render();
    await userEvent
      .setup()
      .press(await screen.findByRole('button', { name: 'Try again · up to 4' }));
    expect(
      await screen.findByText('That can’t be done with this request right now.'),
    ).toBeOnTheScreen();
  });

  it('shows finished requests short', async () => {
    broker(() => [
      bookRequest({ id: 'a', status: 'pushed' }),
      bookRequest({ id: 'b', title: 'Max Havelaar', status: 'pushed', pushTo: ['u2'] }),
      bookRequest({ id: 'c', title: 'The Glass Harbour', status: 'in_library', pushTo: [] }),
    ]);
    await render();
    expect(await screen.findByText('On your Kobo')).toBeOnTheScreen();
    expect(screen.getByText('On the Kobo')).toBeOnTheScreen();
    expect(screen.getByText('For another Kobo · English')).toBeOnTheScreen();
    expect(screen.getByText('In the library')).toBeOnTheScreen();
    expect(screen.getByText('For the library · English')).toBeOnTheScreen();
  });

  it('polls while the live stream is down, and stops once all have settled', async () => {
    let status = 'searching';
    const b = broker(() => [bookRequest({ status })]);
    await render();
    expect(await screen.findByLabelText('Sniffing it out, now')).toBeOnTheScreen();
    status = 'pushed';
    expect(
      await screen.findByText('On your Kobo', {}, { timeout: REQUEST_POLL_MS + 2000 }),
    ).toBeOnTheScreen();
    const polls = b.calls.filter((c) => c.route === 'GET /requests').length;
    await act(() => new Promise((r) => setTimeout(r, REQUEST_POLL_MS + 500)));
    expect(b.calls.filter((c) => c.route === 'GET /requests').length).toBe(polls);
  });

  it('shows a translated error with Try again', async () => {
    let fail = true;
    broker(() => [], {
      'GET /requests': () => (fail ? apiError(500, 'INTERNAL_ERROR') : ok({ requests: [] })),
    });
    await render();
    expect(await screen.findByText('The server had a problem. Try again later.')).toBeOnTheScreen();
    fail = false;
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText(/Nothing on its way/)).toBeOnTheScreen());
  });
});

describe('steps and status lines', () => {
  const t = i18n.t.bind(i18n);
  const req = (over: Partial<BookRequest>) => ({ ...(bookRequest() as BookRequest), ...over });
  const labels = (over: Partial<BookRequest>, me = 'u1') =>
    requestSteps(req(over), me, t).map((s) => `${s.label}:${s.state}`);

  it('walks through the steps', () => {
    expect(labels({ status: 'waiting_budget' })[0]).toBe('Waiting for a free search:current');
    expect(labels({ status: 'choose_release', searches: 3 })).toEqual([
      'Sniffed it out:done',
      'Pick a release:current',
      'Downloading:pending',
      'Adding to the library, making it Kobo-friendly:pending',
      'On your Kobo after its next sync:pending',
    ]);
    expect(requestSteps(req({ status: 'choose_release', searches: 3 }), 'u1', t)[0]?.detail).toBe(
      'Found after 3 searches',
    );
    expect(labels({ status: 'download_failed' })[2]).toBe('Downloading:failed');
    expect(labels({ status: 'import_failed' })[3]).toMatch(/:failed$/);
    expect(labels({ status: 'importing' })[3]).toMatch(/:current$/);
    expect(labels({ status: 'pushed', pushTo: ['u2'] })[4]).toBe(
      'On the Kobo after its next sync:done',
    );
    expect(labels({ status: 'pushed', pushTo: [] })[4]).toBe('In the library:done');
    expect(requestSteps(req({ status: 'downloading', progress: null }), 'u1', t)[2]?.detail).toBe(
      '0%',
    );
    expect(requestSteps(req({ status: 'searching', searches: 0 }), undefined, t)[0]?.detail).toBe(
      undefined,
    );
    expect(requestSteps(req({ status: 'not_found', searches: 0 }), 'u1', t)[0]?.detail).toBe(
      undefined,
    );
  });

  it('names every status', () => {
    const line = (over: Partial<BookRequest>, me?: string) => statusLine(req(over), me, t);
    expect(line({ status: 'waiting_budget' })).toMatch(/Waiting for a free search/);
    expect(line({ status: 'downloading', progress: null })).toBe('Downloading · 0%');
    expect(line({ status: 'in_library', pushTo: [] })).toBe('In the library');
    expect(line({ status: 'in_library', pushTo: ['u1'] })).toMatch(/couldn’t go on a Kobo/);
    expect(line({ status: 'pushed', pushTo: ['u1'] }, 'u1')).toBe(
      'On your Kobo after its next sync',
    );
    expect(line({ status: 'pushed', pushTo: ['u1'] })).toBe('On the Kobo after its next sync');
    expect(line({ status: 'cancelled' })).toBe('Cancelled');
  });

  it('formats sizes', () => {
    expect(formatSize(1_400_000)).toBe('1.4 MB');
    expect(formatSize(820_000)).toBe('820 KB');
    expect(formatSize(12)).toBe('1 KB');
  });
});
