import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as Reanimated from 'react-native-reanimated';
import { setFetch, useSession } from '@/session/session';
import { bookRequest, budgetWithIndexer, fakeBroker, ok, readers } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { setEventStream, useLiveRequests } from '@/features/requests/useRequestEvents';
import { ActivityHost } from './ActivityHost';
import { useActivity } from './useActivity';
import { whenLine } from './RequestsSheet';
import { i18n } from '@/i18n';

jest.setTimeout(15_000);

const reducedMotion = Reanimated.useReducedMotion as jest.Mock;
const epub = { id: 'rel-1', title: 'Salt EPUB', format: 'epub', size: 1_400_000, language: 'en' };

let push: jest.SpyInstance;

beforeEach(async () => {
  await resetApp();
  reducedMotion.mockReturnValue(false);
  useLiveRequests.setState({ live: true });
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
  // No live stream in these tests: the list comes from GET /requests.
  setEventStream(async () => ({ ok: false, status: 503, body: null }));
  push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
});

afterEach(() => {
  setEventStream(undefined);
  push.mockRestore();
});

function broker(requests: unknown[], extra: Record<string, () => unknown> = {}) {
  const b = fakeBroker({
    'GET /requests': () => ok({ requests }),
    'GET /readers': () => readers(),
    'GET /budget': () => budgetWithIndexer(),
    ...extra,
  });
  setFetch(b.fetch);
  return b;
}

const old = '2026-01-01T12:00:00.000Z';

describe('activity pill', () => {
  it('stays away with nothing on its way', async () => {
    broker([bookRequest({ status: 'pushed', updatedAt: old })]);
    await renderWithProviders(<ActivityHost />);
    await waitFor(() => expect(useActivity.getState().sheetOpen).toBe(false));
    expect(screen.queryByRole('button', { name: /Open requests/ })).toBeNull();
  });

  it('shows what is fetching with its progress and +N, and opens the sheet', async () => {
    broker([
      bookRequest({ id: 'r1', status: 'downloading', progress: 64, release: epub, updatedAt: old }),
      bookRequest({ id: 'r2', title: 'Old Lanterns', status: 'searching', updatedAt: old }),
    ]);
    const user = userEvent.setup();
    await renderWithProviders(<ActivityHost />);
    const pill = await screen.findByRole('button', {
      name: 'Fetching The Salt Road, 64%, 1 more on the way, Open requests',
    });
    expect(screen.getByText('+1')).toBeOnTheScreen();
    await user.press(pill);
    expect(await screen.findByText('NOW')).toBeOnTheScreen();
    expect(screen.getByText('Old Lanterns')).toBeOnTheScreen();
    expect(screen.getByText('21 of 25 left today')).toBeOnTheScreen();
  });

  it('turns pink when a request needs me, until I open the sheet', async () => {
    broker([bookRequest({ id: 'r1', status: 'not_found', searches: 4, updatedAt: old })], {});
    const user = userEvent.setup();
    await renderWithProviders(<ActivityHost />);
    await user.press(
      await screen.findByRole('button', {
        name: 'The Salt Road needs you: couldn’t sniff it out, Open requests',
      }),
    );
    expect(await screen.findByText('Couldn’t sniff this one out · 4 searches')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close requests' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /needs you/ })).toBeNull());
  });

  it('retries a book that was not found from the sheet', async () => {
    const b = broker([bookRequest({ status: 'not_found', updatedAt: old })], {
      'POST /requests/r1/retry': () => ok(bookRequest({ status: 'searching' })),
    });
    const user = userEvent.setup();
    useActivity.getState().openSheet();
    await renderWithProviders(<ActivityHost />);
    await user.press(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(b.calls.some((c) => c.route === 'POST /requests/r1/retry')).toBe(true),
    );
  });

  it('opens Pick another and the full list from the sheet', async () => {
    broker([
      bookRequest({ status: 'choose_release', updatedAt: old }),
      bookRequest({ id: 'r9', title: 'Frankenstein', status: 'pushed', updatedAt: old }),
    ]);
    const user = userEvent.setup();
    useActivity.getState().openSheet();
    await renderWithProviders(<ActivityHost />);
    expect(await screen.findByText('EARLIER')).toBeOnTheScreen();
    expect(screen.getByText(/^On your Kobo · /)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Pick another' }));
    expect(push).toHaveBeenCalledWith({ pathname: '/request/[id]', params: { id: 'r1' } });
    expect(useActivity.getState().sheetOpen).toBe(false);

    await act(async () => useActivity.getState().openSheet());
    await user.press(await screen.findByRole('link', { name: 'See all requests' }));
    expect(push).toHaveBeenLastCalledWith('/requests');
  });

  it('grows into a card that plays Swat once when a release is grabbed', async () => {
    const fresh = new Date().toISOString();
    broker([bookRequest({ status: 'downloading', progress: 0, release: epub, updatedAt: fresh })]);
    await renderWithProviders(<ActivityHost />);
    expect(await screen.findByTestId('swat')).toBeOnTheScreen();
    expect(screen.getByText('EPUB · 1.4 MB · English')).toBeOnTheScreen();
  });

  it('says only "Got it!" in the pill with reduced motion', async () => {
    reducedMotion.mockReturnValue(true);
    const fresh = new Date().toISOString();
    broker([bookRequest({ status: 'downloading', progress: 0, release: epub, updatedAt: fresh })]);
    await renderWithProviders(<ActivityHost />);
    expect(await screen.findByText('Got it!')).toBeOnTheScreen();
    expect(screen.queryByTestId('swat')).toBeNull();
  });

  it('plays Swat in the request row while the sheet is open', async () => {
    const fresh = new Date().toISOString();
    broker([bookRequest({ status: 'downloading', progress: 0, release: epub, updatedAt: fresh })]);
    useActivity.getState().openSheet();
    await renderWithProviders(<ActivityHost />);
    expect(await screen.findByText('NOW')).toBeOnTheScreen();
    expect(await screen.findByTestId('swat')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Open requests/ })).toBeNull();
  });
});

describe('whenLine', () => {
  it('says today, yesterday or n days ago', () => {
    const t = i18n.t.bind(i18n);
    const now = new Date(2026, 0, 5, 10);
    expect(whenLine(new Date(2026, 0, 5, 8).toISOString(), t, now)).toBe('today');
    expect(whenLine(new Date(2026, 0, 4, 8).toISOString(), t, now)).toBe('yesterday');
    expect(whenLine(new Date(2026, 0, 1, 8).toISOString(), t, now)).toBe('4 days ago');
  });
});
