import { act, screen, userEvent } from '@testing-library/react-native';
import type { WorkSeries } from '@purrshelf/contract';
import { setFetch, useSession } from '@/session/session';
import { apiError, fakeBroker, hit, ok, work } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { BookDetailScreen } from './BookDetailScreen';
import { positionLabel, seriesStates } from './series';

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

const owners = [
  { id: 'u2', displayName: 'Reader Two', me: false },
  { id: 'u1', displayName: 'Reader One', me: true },
];
const inLibrary = (onMyKobo = false) => ({ itemId: 'item-1', owners, onMyKobo });

const lanternKeepers = {
  series: { id: 'hardcover:77', name: 'Lantern Keepers', total: 3 },
  entries: [
    { position: 1, work: hit() },
    {
      position: 2,
      work: hit({ id: 'hardcover:302', title: 'The Glass Harbour', library: inLibrary() }),
    },
    { position: 3, work: hit({ id: 'hardcover:303', title: 'The Ember Tide' }) },
  ],
};

const similarBooks = {
  works: [
    { reason: 'series', work: hit({ id: 'hardcover:302', title: 'The Glass Harbour' }) },
    {
      reason: 'author',
      work: hit({ id: 'openlibrary:OL902W', title: 'The Ember Tide', series: null }),
    },
    {
      reason: 'subject',
      work: hit({ id: 'openlibrary:OL905W', title: 'Lamps of Kerrow', series: null }),
    },
  ],
};

function render(
  detail = work({ library: inLibrary(true) }),
  series: unknown = lanternKeepers,
  { similar = { works: [] } as unknown, withAdd = false } = {},
) {
  const b = fakeBroker({
    'GET /works/hardcover:301': () => ok(detail),
    'GET /works/hardcover:301/series': () => ok(series),
    'GET /works/hardcover:301/similar': () => ok(similar),
  });
  setFetch(b.fetch);
  const onBack = jest.fn();
  const onOpen = jest.fn();
  const onAdd = jest.fn();
  return {
    b,
    onBack,
    onOpen,
    onAdd,
    view: renderWithProviders(
      <BookDetailScreen
        id="hardcover:301"
        onBack={onBack}
        onOpen={onOpen}
        {...(withAdd ? { onAdd } : {})}
      />,
    ),
  };
}

describe('Book detail', () => {
  it('shows cover, title, author, series position, language, format and owners', async () => {
    const { view } = render();
    await view;
    expect(await screen.findByRole('header', { name: 'The Salt Road' })).toBeOnTheScreen();
    expect(screen.getByText('Ilse Varenkamp')).toBeOnTheScreen();
    expect(screen.getByText('Lantern Keepers · 1/3 · English · EPUB')).toBeOnTheScreen();
    // Mine first, then the other reader's.
    expect(screen.getByText('Yours')).toBeOnTheScreen();
    expect(screen.getByText('Reader Two’s')).toBeOnTheScreen();
    expect(screen.getByText('A lamplighter walks the salt road to the sea.')).toBeOnTheScreen();
    expect(
      screen.getAllByTestId('cover-hardcover:301', { includeHiddenElements: true })[0]!.props.source
        .uri,
    ).toBe('https://shelf.example.invalid/api/v1/covers/hardcover%3A301?size=l');
  });

  it('shows whether the book is on my Kobo', async () => {
    const { view } = render();
    await view;
    expect(await screen.findByText('Your Kobo')).toBeOnTheScreen();
    expect(screen.getByText('On the device')).toBeOnTheScreen();
  });

  it('shows no owners, device or format for a book that is not in the library', async () => {
    const { view } = render(work({ series: null, language: 'nl' }), { series: null, entries: [] });
    await view;
    expect(await screen.findByText('Ilse Varenkamp')).toBeOnTheScreen();
    expect(screen.getByText('Nederlands')).toBeOnTheScreen();
    expect(screen.queryByText('Your Kobo')).toBeNull();
    expect(screen.queryByText('Yours')).toBeNull();
  });

  it('lists the series with This book, In library and Add next, and opens an entry', async () => {
    const { view, onOpen } = render(work({ library: inLibrary(false) }));
    await view;
    expect(await screen.findByText('Lantern Keepers series')).toBeOnTheScreen();
    expect(screen.getByText('Not on the device')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '1 The Salt Road, This book' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '2 The Glass Harbour, In library' }),
    ).toBeOnTheScreen();
    const next = screen.getByRole('button', { name: '3 The Ember Tide, Add next' });
    await userEvent.setup().press(next);
    expect(onOpen).toHaveBeenCalledWith('hardcover:303');
  });

  it('shows similar books with why they are suggested, and opens one', async () => {
    const { view, onOpen } = render(undefined, undefined, { similar: similarBooks });
    await view;
    expect(await screen.findByRole('header', { name: 'Similar books' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'The Glass Harbour, Same series' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'The Ember Tide, Same author' })).toBeOnTheScreen();
    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: 'Lamps of Kerrow, Similar subject' }));
    expect(onOpen).toHaveBeenCalledWith('openlibrary:OL905W');
  });

  it('hides the similar row when there is nothing similar', async () => {
    const { view, b } = render();
    await view;
    expect(await screen.findByText('Lantern Keepers series')).toBeOnTheScreen();
    expect(b.calls.map((c) => c.route)).toContain('GET /works/hardcover:301/similar');
    expect(screen.queryByText('Similar books')).toBeNull();
  });

  it('adds the next book in the series only on an explicit tap', async () => {
    const { view, onAdd, onOpen } = render(work({ library: inLibrary() }), undefined, {
      withAdd: true,
    });
    await view;
    const add = await screen.findByRole('button', {
      name: 'Add next in series: The Ember Tide',
    });
    expect(onAdd).not.toHaveBeenCalled();
    await userEvent.setup().press(add);
    expect(onAdd).toHaveBeenCalledWith('hardcover:303');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('has no Add next button without a way to add', async () => {
    const { view } = render();
    await view;
    expect(await screen.findByText('Lantern Keepers series')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Add next in series/ })).toBeNull();
  });

  it('goes back', async () => {
    const { view, onBack } = render();
    await view;
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows a translated error with a retry', async () => {
    let down = true;
    setFetch(
      fakeBroker({
        'GET /works/hardcover:9': () =>
          down ? apiError(404, 'NOT_FOUND') : ok(work({ id: 'hardcover:9', series: null })),
      }).fetch,
    );
    await renderWithProviders(
      <BookDetailScreen id="hardcover:9" onBack={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(await screen.findByText('Not found.')).toBeOnTheScreen();
    down = false;
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The Salt Road')).toBeOnTheScreen();
    await act(async () => undefined);
  });
});

describe('series states', () => {
  const entry = (id: string, owned = false) => ({
    position: null,
    work: hit({ id, library: owned ? inLibrary() : null }) as WorkSeries['entries'][number]['work'],
  });
  const states = (entries: ReturnType<typeof entry>[], current: string) =>
    seriesStates({ series: { id: null, name: 'S', total: null }, entries }, current);

  it('suggests the first missing book after the last one we have', () => {
    expect(
      states(
        [
          entry('hardcover:1', true),
          entry('hardcover:2'),
          entry('hardcover:3', true),
          entry('hardcover:4'),
          entry('hardcover:5'),
        ],
        'hardcover:2',
      ),
    ).toEqual(['inLibrary', 'thisBook', 'inLibrary', 'addNext', 'add']);
  });

  it('has no Add next when everything after is owned', () => {
    expect(states([entry('hardcover:1'), entry('hardcover:2', true)], 'hardcover:2')).toEqual([
      'add',
      'thisBook',
    ]);
  });

  it('labels positions', () => {
    expect(positionLabel(2, 4)).toBe('2/4');
    expect(positionLabel(2.5, null)).toBe('#2.5');
    expect(positionLabel(null, 4)).toBeNull();
  });
});
