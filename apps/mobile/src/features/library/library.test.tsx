import AsyncStorage from '@react-native-async-storage/async-storage';
import { NetworkError, type LibraryBookEntry } from '@purrshelf/contract';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { setFetch, useSession } from '@/session/session';
import { apiError, fakeBroker, ok } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { readLabel, tabCounts, visibleBooks } from './library';
import { LibraryScreen } from './LibraryScreen';

jest.setTimeout(15_000);

const me = { id: 'u1', displayName: 'Reader One', me: true };
const partner = { id: 'u2', displayName: 'Reader Two', me: false };

let n = 0;
function book(over: Partial<LibraryBookEntry> = {}): LibraryBookEntry {
  n += 1;
  return {
    itemId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    workId: `hardcover:${n}`,
    mediaType: 'ebook',
    title: `Book ${n}`,
    authors: ['Ilse Varenkamp'],
    series: null,
    addedAt: `2026-01-${String(n).padStart(2, '0')}T12:00:00.000Z`,
    owners: [me],
    onMyKobo: false,
    reading: { status: 'unread', progressPercent: null },
    ...over,
  };
}

const salt = book({
  title: 'The Salt Road',
  series: { name: 'Lantern Keepers', position: 1 },
  owners: [me, partner],
  onMyKobo: true,
  reading: { status: 'reading', progressPercent: 42.4 },
});
const harbour = book({
  title: 'The Glass Harbour',
  series: { name: 'Lantern Keepers', position: 2 },
  reading: { status: 'finished', progressPercent: 100 },
});
const rivers = book({ title: 'A Map of Quiet Rivers', owners: [partner], workId: null });
const orphan = book({ title: 'Lamps of Kerrow', owners: [], reading: null });
const library = { books: [orphan, rivers, harbour, salt] };

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

function render(reply: () => ReturnType<typeof ok> | Error = () => ok(library)) {
  const b = fakeBroker({ 'GET /library/books': reply });
  setFetch(b.fetch);
  const onOpen = jest.fn();
  return { b, onOpen, view: renderWithProviders(<LibraryScreen onOpen={onOpen} />) };
}

const titles = () =>
  screen
    .getAllByRole('button', { name: /^(The|A|Lamps)/ })
    .map((b) => String(b.props.accessibilityLabel).split(',')[0]);

describe('Library', () => {
  it('shows my books first, with counts on the tabs', async () => {
    const { view } = render();
    await view;
    expect(await screen.findByRole('radio', { name: 'Mine · 2' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Partner’s · 2' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'All · 4' })).toBeOnTheScreen();
    expect(titles()).toEqual(['The Glass Harbour', 'The Salt Road']);
  });

  it('shows Kobo and Both badges and reading progress', async () => {
    const { view } = render();
    await view;
    expect(
      await screen.findByRole('button', {
        name: 'The Salt Road, Ilse Varenkamp, On your Kobo, Both, 42% read',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Both')).toBeOnTheScreen();
    expect(screen.getByText('Kobo', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Finished')).toBeOnTheScreen();
  });

  it('switches to my partner’s and all books, and opens a book', async () => {
    const { view, onOpen } = render();
    await view;
    await userEvent.press(await screen.findByRole('radio', { name: 'Partner’s · 2' }));
    expect(titles()).toEqual(['A Map of Quiet Rivers', 'The Salt Road']);
    // A Calibre book without a work id has no book page yet.
    expect(screen.getByRole('button', { name: /^A Map of Quiet Rivers/ })).toBeDisabled();
    await userEvent.press(screen.getByRole('radio', { name: 'All · 4' }));
    expect(titles()).toEqual([
      'Lamps of Kerrow',
      'A Map of Quiet Rivers',
      'The Glass Harbour',
      'The Salt Road',
    ]);
    await userEvent.press(screen.getByRole('button', { name: /^The Salt Road/ }));
    expect(onOpen).toHaveBeenCalledWith(salt.workId);
  });

  it('filters unread and on my Kobo, and sorts by series', async () => {
    const { view } = render();
    await view;
    await userEvent.press(await screen.findByRole('radio', { name: 'All · 4' }));
    await userEvent.press(screen.getByRole('radio', { name: 'On my Kobo' }));
    expect(titles()).toEqual(['The Salt Road']);
    await userEvent.press(screen.getByRole('radio', { name: 'Series' }));
    expect(titles()).toEqual(['The Salt Road', 'The Glass Harbour']);
    await userEvent.press(screen.getByRole('radio', { name: 'Unread' }));
    expect(titles()).toEqual(['Lamps of Kerrow', 'A Map of Quiet Rivers']);
  });

  it('says when a tab is empty', async () => {
    const { view } = render(() => ok({ books: [] }));
    await view;
    expect(await screen.findByText('No books of yours yet. Find one on Search.')).toBeOnTheScreen();
    // The napping cat sits over the message (DES-02).
    expect(screen.getByTestId('nap', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('saves a copy of the library on the phone', async () => {
    const { view } = render();
    await view;
    await screen.findByRole('button', { name: /^The Salt Road/ });
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem('purrshelf.offline.library'))!)).toEqual(
        library,
      ),
    );
  });

  it('stays readable offline from the copy saved last time', async () => {
    await AsyncStorage.setItem('purrshelf.offline.library', JSON.stringify(library));
    const { view } = render(() => new TypeError('Network request failed'));
    await view;
    expect(
      await screen.findByText('Offline: showing the library as it was last time.'),
    ).toBeOnTheScreen();
    expect(titles()).toEqual(['The Glass Harbour', 'The Salt Road']);
  });

  it('shows an error with a retry when there is no saved copy', async () => {
    const { view, b } = render(() => apiError(502, 'LIBRARY_UNAVAILABLE'));
    await view;
    expect(
      await screen.findByText('The library server is not answering. Try again later.'),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(b.calls).toHaveLength(2);
  });

  it.each(['{"books": "nope"', '{"books": 1}'])('ignores a damaged saved copy %s', async (raw) => {
    await AsyncStorage.setItem('purrshelf.offline.library', raw);
    const { view } = render(() => new NetworkError('Server not reachable'));
    await view;
    expect(await screen.findByText(/not reachable|reach the server/i)).toBeOnTheScreen();
  });

  it('forgets the saved copy on logout', async () => {
    await AsyncStorage.setItem('purrshelf.offline.library', JSON.stringify(library));
    await useSession.getState().logout();
    expect(await AsyncStorage.getItem('purrshelf.offline.library')).toBeNull();
  });
});

describe('library helpers', () => {
  it('counts tabs', () => {
    expect(tabCounts(library.books)).toEqual({ mine: 2, partner: 2, all: 4 });
  });

  it('puts series books without a position last', () => {
    const a = book({ series: { name: 'S', position: null } });
    const b = book({ series: { name: 'S', position: 3 } });
    expect(visibleBooks([a, b], 'all', 'series')).toEqual([b, a]);
  });

  it.each([
    [{ status: 'reading', progressPercent: 0 }, { key: 'library.reading' }],
    [{ status: 'unread', progressPercent: null }, { key: 'library.unread' }],
    [
      { status: 'reading', progressPercent: 9.6 },
      { key: 'library.percentRead', percent: 10 },
    ],
    [{ status: 'finished', progressPercent: 80 }, { key: 'library.finished' }],
    [null, null],
  ] as const)('labels %j', (reading, label) => {
    expect(readLabel(book({ reading }))).toEqual(label);
  });
});
