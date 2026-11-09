import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { usePreferences } from '@/session/preferences';
import { setFetch, useSession } from '@/session/session';
import {
  apiError,
  bookRequest,
  budget,
  fakeBroker,
  hit,
  me,
  ok,
  recommendation,
  recommendations,
} from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { SearchScreen } from '@/features/search/SearchScreen';
import { SNACKBAR_MS } from '@/components/Snackbar';

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

const partner = { id: 'u2', displayName: 'Reader Two' };

const series = recommendation({
  work: hit({ id: 'hardcover:501', title: 'Harbour Tales 3', authors: ['Ada Quillfeather'] }),
  reason: {
    kind: 'next_in_series',
    series: { name: 'Harbour Tales', position: 3 },
    after: { title: 'Harbour Tales 2', position: 2, basis: 'reading' },
  },
});
const byAuthor = recommendation({ isNew: true });
const fromPartner = recommendation({
  work: hit({
    id: 'hardcover:601',
    title: 'Quiet Rivers',
    authors: ['Bram Inkwell'],
    library: {
      itemId: '00000000-0000-4000-8000-000000000006',
      owners: [{ ...partner, me: false }],
      onMyKobo: false,
      reading: null,
    },
  }),
  reason: { kind: 'partner_shelf', partner, partnerFinished: true },
});

const rows = [
  { kind: 'next_in_series', partner: null, items: [series] },
  { kind: 'author', partner: null, items: [byAuthor] },
  { kind: 'partner_shelf', partner, items: [fromPartner] },
];

function broker(routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /budget': () => budget(),
    'GET /me': me,
    'GET /recommendations': () => recommendations(rows),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

describe('For you (APP-12)', () => {
  it('shows the three rows with reasons and badges under the search bar', async () => {
    broker();
    await renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('For you, Reader One')).toBeOnTheScreen();
    expect(
      screen.getByText('Picked from what you finish. Looking is free; only Add uses a search.'),
    ).toBeOnTheScreen();
    expect(await screen.findByText('Next in your series')).toBeOnTheScreen();
    expect(screen.getByText('More from authors you read')).toBeOnTheScreen();
    expect(screen.getByText('From Reader Two’s shelf')).toBeOnTheScreen();
    expect(screen.getByText('Harbour Tales 3 · you’re reading 2')).toBeOnTheScreen();
    expect(screen.getByText('You finished The Salt Road')).toBeOnTheScreen();
    expect(screen.getByText('Reader Two finished it')).toBeOnTheScreen();
    expect(screen.getByText('New')).toBeOnTheScreen();
    expect(screen.getByText('Instant')).toBeOnTheScreen();
    // Never an "available" badge, nor a Kobo hint when reading data is there.
    expect(screen.queryByText(/available/i)).toBeNull();
    expect(screen.queryByText('Link your Kobo for better picks')).toBeNull();
  });

  it('opens the book page from a card and from the menu', async () => {
    broker();
    const onOpenForYou = jest.fn();
    await renderWithProviders(<SearchScreen onOpenForYou={onOpenForYou} />);
    await fireEvent.press(
      await screen.findByRole('button', { name: /^Quiet Rivers, Bram Inkwell/ }),
    );
    expect(onOpenForYou).toHaveBeenLastCalledWith('hardcover:601');
    await fireEvent.press(screen.getByRole('button', { name: 'More options for Harbour Tales 3' }));
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Open book page' }));
    expect(onOpenForYou).toHaveBeenLastCalledWith('hardcover:501');
  });

  it('hides a book with Not for me and brings it back with Undo', async () => {
    let dismissed = false;
    const b = broker({
      'GET /recommendations': () => recommendations(dismissed ? rows.slice(0, 2) : rows),
      'POST /recommendations/hardcover:601/dismiss': () => {
        dismissed = true;
        return ok({ workId: 'hardcover:601', kind: 'book', author: null, expiresAt: null });
      },
      'DELETE /recommendations/hardcover:601/dismiss': () => {
        dismissed = false;
        return ok({ removed: 1 });
      },
    });
    await renderWithProviders(<SearchScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'More options for Quiet Rivers' }),
    );
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Not for me' }));
    expect(
      await screen.findByText('Hidden “Quiet Rivers”. You won’t see it again.'),
    ).toBeOnTheScreen();
    // The card and its now-empty row leave at once.
    await waitFor(() => expect(screen.queryByText('Quiet Rivers')).toBeNull());
    expect(screen.queryByText('From Reader Two’s shelf')).toBeNull();
    expect(b.calls.find((c) => c.route.startsWith('POST'))?.body).toEqual({ kind: 'book' });

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Quiet Rivers')).toBeOnTheScreen();
    expect(screen.queryByText(/You won’t see it again/)).toBeNull();
    expect(b.calls.some((c) => c.route === 'DELETE /recommendations/hardcover:601/dismiss')).toBe(
      true,
    );
  });

  it('asks for fewer by an author and drops the snackbar after five seconds', async () => {
    jest.useFakeTimers();
    try {
      const b = broker({
        'POST /recommendations/hardcover:401/dismiss': () =>
          ok({
            workId: 'hardcover:401',
            kind: 'author',
            author: 'Ilse Varenkamp',
            expiresAt: '2026-04-01T12:00:00.000Z',
          }),
      });
      await renderWithProviders(<SearchScreen />);
      await fireEvent.press(
        await screen.findByRole('button', { name: 'More options for The Lamp Road' }),
      );
      await fireEvent.press(await screen.findByRole('menuitem', { name: 'Fewer by this author' }));
      expect(
        await screen.findByText('You’ll see fewer books by Ilse Varenkamp for a while.'),
      ).toBeOnTheScreen();
      await waitFor(() =>
        expect(b.calls.find((c) => c.route.startsWith('POST'))?.body).toEqual({ kind: 'author' }),
      );
      await act(async () => {
        jest.advanceTimersByTime(SNACKBAR_MS + 10);
      });
      expect(screen.queryByText(/fewer books by/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('closes the menu without doing anything', async () => {
    const b = broker();
    await renderWithProviders(<SearchScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'More options for Quiet Rivers' }),
    );
    await fireEvent.press(await screen.findByLabelText('Close the menu'));
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    expect(b.calls.some((c) => c.route.startsWith('POST'))).toBe(false);
  });

  it('shows a request status instead of nothing once the book is added', async () => {
    broker({
      'GET /recommendations': () =>
        recommendations([
          {
            kind: 'author',
            partner: null,
            items: [
              recommendation({ request: { id: bookRequest().id, status: 'waiting_budget' } }),
            ],
          },
        ]),
    });
    await renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Added · waiting for a search')).toBeOnTheScreen();
  });

  it('starts with the sleeping cat and a way to search when there is nothing yet', async () => {
    broker({ 'GET /recommendations': () => recommendations([]) });
    await renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Nothing to suggest yet')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Picks come from the books you finish on your Kobo. Finish one and this fills up.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Search for a book' }));
  });

  it('asks to link the Kobo when there is no reading data', async () => {
    broker({
      'GET /recommendations': () =>
        recommendations([{ kind: 'author', partner: null, items: [byAuthor] }], {
          readingData: false,
        }),
    });
    await renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Link your Kobo for better picks')).toBeOnTheScreen();
    expect(screen.getByText('More from books you own')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'How to link it' }));
    expect(screen.getByText(/link your Kobo to the library/)).toBeOnTheScreen();
  });

  it('keeps the last rows when a refresh failed', async () => {
    broker({ 'GET /recommendations': () => recommendations(rows, { stale: true }) });
    await renderWithProviders(<SearchScreen />);
    expect(
      await screen.findByText('Couldn’t refresh, these are your last picks.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Quiet Rivers')).toBeOnTheScreen();
  });

  it('offers Try again when the book sources are down and nothing is cached', async () => {
    let down = true;
    broker({
      'GET /recommendations': () =>
        down ? apiError(503, 'METADATA_UNAVAILABLE') : recommendations(rows),
    });
    await renderWithProviders(<SearchScreen />);
    expect(
      await screen.findByText('Book search is down for a moment. Try again soon.'),
    ).toBeOnTheScreen();
    down = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Quiet Rivers')).toBeOnTheScreen();
  });

  it('sniffs while the first picks of the day are worked out', async () => {
    let release: (() => void) | undefined;
    const b = broker();
    setFetch(async (url, init) => {
      if (String(url).includes('/recommendations')) await new Promise<void>((r) => (release = r));
      return b.fetch(url, init);
    });
    await renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Sniffing out picks for you…')).toBeOnTheScreen();
    await act(async () => release?.());
    expect(await screen.findByText('Quiet Rivers')).toBeOnTheScreen();
  });

  it('speaks Dutch', async () => {
    usePreferences.setState({ language: 'nl' });
    broker();
    await renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Reader Two las het uit')).toBeOnTheScreen();
  });
});
