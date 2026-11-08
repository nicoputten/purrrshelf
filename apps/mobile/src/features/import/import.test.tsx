import type { ImportStatus, LibraryBookEntry, LibraryBooks } from '@purrshelf/contract';
import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { setFetch, useSession } from '@/session/session';
import { apiError, fakeBroker, ok } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { choiceOf, filterBooks, matchedSoFar, NONE, ownerChoices, withOwners } from './assign';
import { ImportScreen, PAGE } from './ImportScreen';

jest.setTimeout(20_000);

const me = { id: 'u1', displayName: 'Reader One', me: true };
const partner = { id: 'u2', displayName: 'Reader Two', me: false };
const third = { id: 'u3', displayName: 'Reader Three', me: false };

let n = 0;
function book(over: Partial<LibraryBookEntry> = {}): LibraryBookEntry {
  n += 1;
  return {
    itemId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    workId: null,
    mediaType: 'ebook',
    title: `Book ${String(n).padStart(3, '0')}`,
    authors: ['Ilse Varenkamp'],
    series: null,
    addedAt: '2026-01-01T12:00:00.000Z',
    owners: [],
    onMyKobo: false,
    reading: null,
    ...over,
  };
}

function status(over: Partial<ImportStatus> = {}): ImportStatus {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    scanned: 0,
    added: 0,
    toMatch: 0,
    matched: 0,
    unmatched: 0,
    failed: 0,
    readers: [me, partner],
    ...over,
  };
}

describe('assigning helpers', () => {
  it('offers me, each other reader and both or everyone', () => {
    expect(ownerChoices([me])).toEqual([
      { key: 'u1', label: { key: 'import.me' }, ownerIds: ['u1'] },
    ]);
    expect(ownerChoices([me, partner]).map((c) => [c.key, c.label.key, c.ownerIds])).toEqual([
      ['u1', 'import.me', ['u1']],
      ['u2', 'import.reader', ['u2']],
      ['everyone', 'import.both', ['u1', 'u2']],
    ]);
    expect(ownerChoices([me, partner, third]).at(-1)?.label.key).toBe('import.everyone');
    expect(ownerChoices([])).toEqual([]);
  });

  it('knows which choice a book is on', () => {
    const choices = ownerChoices([me, partner]);
    expect(choiceOf(book({ owners: [partner, me] }), choices)).toBe('everyone');
    expect(choiceOf(book({ owners: [partner] }), choices)).toBe('u2');
    expect(choiceOf(book(), choices)).toBe(NONE);
    expect(choiceOf(book({ owners: [third] }), choices)).toBe(NONE);
  });

  it('filters to books nobody owns, by title', () => {
    const b = book({ title: 'B' });
    const a = book({ title: 'A' });
    const owned = book({ title: 'C', owners: [me] });
    expect(filterBooks([b, owned, a], 'unassigned')).toEqual([a, b]);
    expect(filterBooks([b, owned, a], 'all')).toEqual([a, b, owned]);
  });

  it('applies an assignment to the saved library', () => {
    const a = book();
    const b = book();
    expect(withOwners({ books: [a, b] }, [a.itemId], ['u2', 'u1'], [me, partner])).toEqual({
      books: [{ ...a, owners: [me, partner] }, b],
    });
    expect(matchedSoFar(status({ matched: 1, unmatched: 2, failed: 3 }))).toBe(6);
  });
});

describe('ImportScreen', () => {
  let library: LibraryBooks;
  let current: ImportStatus;
  let assignReply: () => ReturnType<typeof ok>;

  beforeEach(async () => {
    await resetApp();
    useSession.setState({
      status: 'ready',
      serverUrl: 'https://shelf.example.invalid',
      accessToken: 'access-1',
    });
    library = { books: [] };
    current = status();
    assignReply = () => ok({ updated: 1 });
  });

  function render() {
    const b = fakeBroker({
      'GET /library/books': () => ok(library),
      'GET /admin/import': () => ok(current),
      'POST /admin/import': () => ok(current),
      'PUT /admin/import/owners': (body) => {
        const { itemIds, ownerIds } = body as { itemIds: string[]; ownerIds: string[] };
        const reply = assignReply();
        if (reply.status === 200) library = withOwners(library, itemIds, ownerIds, [me, partner]);
        return reply;
      },
    });
    setFetch(b.fetch);
    const onBack = jest.fn();
    return { b, onBack, view: renderWithProviders(<ImportScreen onBack={onBack} />) };
  }

  it('scans, shows progress while matching and the result when done', async () => {
    const user = userEvent.setup();
    const { b, onBack, view } = render();
    await view;
    expect(await screen.findByText('Not scanned yet.')).toBeOnTheScreen();
    expect(
      await screen.findByText('No books found yet. Scan the library first.'),
    ).toBeOnTheScreen();

    const started = { startedAt: '2026-01-01T12:00:00.000Z', scanned: 3, added: 3, toMatch: 3 };
    current = status({ ...started, running: true, matched: 1 });
    library = { books: [book({ title: 'The Salt Road' }), book(), book()] };
    await user.press(screen.getByRole('button', { name: 'Scan library' }));
    expect(await screen.findByText('Matching books to search results… 1 of 3')).toBeOnTheScreen();
    expect(await screen.findByText('The Salt Road')).toBeOnTheScreen();

    current = status({
      ...started,
      finishedAt: '2026-01-01T12:01:00.000Z',
      matched: 1,
      unmatched: 1,
      failed: 1,
    });
    expect(
      await screen.findByText('Found 3 books, 3 new.', {}, { timeout: 5000 }),
    ).toBeOnTheScreen();
    expect(screen.getByText('1 matched to a book on Search, 1 not.')).toBeOnTheScreen();
    expect(
      screen.getByText('Search did not answer for 1 books. Scan again to try those again.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeOnTheScreen();
    expect(b.calls.filter((c) => c.route === 'POST /admin/import')).toHaveLength(1);

    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('gives every shown book to both readers at once', async () => {
    const user = userEvent.setup();
    const a = book({ title: 'A Map of Quiet Rivers' });
    const c = book({ title: 'Lamps of Kerrow' });
    const owned = book({ title: 'The Glass Harbour', owners: [me] });
    library = { books: [a, owned, c] };
    current = status({ startedAt: '2026-01-01T12:00:00.000Z', scanned: 3 });
    const { b, view } = render();
    await view;

    expect(await screen.findByRole('radio', { name: 'Nobody’s yet · 2' })).toBeChecked();
    expect(screen.queryByText('The Glass Harbour')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Give all 2 shown books to Both' }));
    expect(await screen.findByText('Every book has an owner.')).toBeOnTheScreen();
    expect(b.calls.find((x) => x.route === 'PUT /admin/import/owners')?.body).toEqual({
      itemIds: [a.itemId, c.itemId],
      ownerIds: ['u1', 'u2'],
    });

    await user.press(screen.getByRole('radio', { name: 'All · 3' }));
    const row = screen.getByLabelText('Whose is The Glass Harbour');
    expect(within(row).getByRole('radio', { name: 'Me' })).toBeChecked();
    const both = screen.getByLabelText('Whose is Lamps of Kerrow');
    expect(within(both).getByRole('radio', { name: 'Both' })).toBeChecked();
  });

  it('assigns one book, and says so when the broker refuses', async () => {
    const user = userEvent.setup();
    const a = book({ title: 'A Map of Quiet Rivers' });
    library = { books: [a] };
    const { b, view } = render();
    await view;

    const row = await screen.findByLabelText('Whose is A Map of Quiet Rivers');
    assignReply = () => apiError(503, 'LIBRARY_UNAVAILABLE');
    await user.press(within(row).getByRole('radio', { name: 'Reader Two' }));
    expect(
      await screen.findByText('The library server is not answering. Try again later.'),
    ).toBeOnTheScreen();

    assignReply = () => ok({ updated: 1 });
    await user.press(within(row).getByRole('radio', { name: 'Reader Two' }));
    expect(await screen.findByText('Every book has an owner.')).toBeOnTheScreen();
    expect(b.calls.filter((x) => x.route === 'PUT /admin/import/owners').at(-1)?.body).toEqual({
      itemIds: [a.itemId],
      ownerIds: ['u2'],
    });
  });

  it('shows a big library a page at a time', async () => {
    const user = userEvent.setup();
    library = { books: Array.from({ length: PAGE + 1 }, () => book()) };
    const { view } = render();
    await view;
    expect(await screen.findAllByLabelText(/^Whose is/)).toHaveLength(PAGE);
    await user.press(screen.getByRole('button', { name: 'Show 1 more' }));
    expect(screen.getAllByLabelText(/^Whose is/)).toHaveLength(PAGE + 1);
    expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
  });

  it('explains when the import cannot start or the library cannot load', async () => {
    const user = userEvent.setup();
    const b = fakeBroker({
      'GET /library/books': () => apiError(503, 'LIBRARY_UNAVAILABLE'),
      'GET /admin/import': () => apiError(503, 'LIBRARY_UNAVAILABLE'),
      'POST /admin/import': () => apiError(503, 'LIBRARY_UNAVAILABLE'),
    });
    setFetch(b.fetch);
    await renderWithProviders(<ImportScreen onBack={jest.fn()} />);
    await waitFor(() =>
      expect(
        screen.getAllByText('The library server is not answering. Try again later.').length,
      ).toBeGreaterThanOrEqual(2),
    );
    await user.press(screen.getByRole('button', { name: 'Scan library' }));
    await waitFor(() =>
      expect(
        screen.getAllByText('The library server is not answering. Try again later.'),
      ).toHaveLength(3),
    );
    await user.press(screen.getByRole('button', { name: 'Try again' }));
  });
});
