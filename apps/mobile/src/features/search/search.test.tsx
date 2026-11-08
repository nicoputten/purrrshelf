import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { i18n } from '@/i18n';
import { usePreferences } from '@/session/preferences';
import { setFetch, useSession } from '@/session/session';
import { apiError, budget, fakeBroker, hit, searchResult } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { libraryBadges } from './badges';
import { SearchScreen } from './SearchScreen';
import { SEARCH_DEBOUNCE_MS } from './useBookSearch';
import { secondLine } from './SearchResult';

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

/** Let the search debounce run out inside act, so it never fires into the next test. */
const settle = () => act(() => new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50)));
afterEach(settle);

const havelaar = hit({
  id: 'hardcover:101',
  title: 'Max Havelaar',
  authors: ['Multatuli'],
  language: 'nl',
  series: null,
  library: {
    itemId: 'item-1',
    owners: [
      { id: 'u1', displayName: 'Reader One', me: true },
      { id: 'u2', displayName: 'Reader Two', me: false },
    ],
    onMyKobo: true,
  },
});

function broker(routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /budget': () => budget(),
    'GET /discover/search': () => searchResult([havelaar, hit()]),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

const searches = (b: ReturnType<typeof broker>) =>
  b.calls.filter((c) => c.route === 'GET /discover/search');

describe('Search (home)', () => {
  it('starts with the heading, the field, language chips, the budget and the cost hint', async () => {
    broker();
    await renderWithProviders(<SearchScreen />);
    expect(screen.getByText('What are we reading next?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Search by title or author')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Any language' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Nederlands' })).not.toBeChecked();
    expect(screen.getByText(/Looking costs nothing, only/)).toBeOnTheScreen();
    expect(
      await screen.findByRole('link', { name: '21 of 25 indexer searches left this hour' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('21 / 25 left')).toBeOnTheScreen();
  });

  it('hides the budget pill when the server has no indexers or no budget yet', async () => {
    broker({ 'GET /budget': () => budget(0, 0) });
    await renderWithProviders(<SearchScreen />);
    await waitFor(() => expect(screen.queryByText(/left$/)).toBeNull());
  });

  it('searches after typing and shows covers, series and badges', async () => {
    const b = broker();
    const user = userEvent.setup();
    await renderWithProviders(<SearchScreen />);
    await user.type(screen.getByLabelText('Search by title or author'), 'salt');

    expect(await screen.findByText('The Salt Road')).toBeOnTheScreen();
    expect(screen.getByText('Ilse Varenkamp · Lantern Keepers #1')).toBeOnTheScreen();
    expect(screen.getByText('Multatuli · Nederlands')).toBeOnTheScreen();
    expect(screen.getByText('On your Kobo')).toBeOnTheScreen();
    expect(screen.getByText('Reader Two has it')).toBeOnTheScreen();
    expect(screen.getByText(/2 books found/)).toBeOnTheScreen();

    const search = searches(b).at(-1)!;
    expect(search.headers.authorization).toBe('Bearer access-1');
    const cover = screen.getByTestId('cover-hardcover:301', { includeHiddenElements: true });
    expect(cover.props.source).toEqual({
      uri: 'https://shelf.example.invalid/api/v1/covers/hardcover%3A301?size=s',
      headers: { authorization: 'Bearer access-1' },
    });
  });

  it('searches right away on the keyboard search key, with the picked language', async () => {
    const queries: string[] = [];
    broker({
      'GET /discover/search': (_b, _h, url) => {
        queries.push(url.search);
        return searchResult([hit()]);
      },
    });
    await renderWithProviders(<SearchScreen />);
    fireEvent.press(screen.getByRole('radio', { name: 'Nederlands' }));
    await userEvent.setup().type(screen.getByLabelText('Search by title or author'), 'de zoutweg', {
      submitEditing: true,
    });
    expect(await screen.findByText(/1 book found/)).toBeOnTheScreen();
    expect(queries[0]).toBe('?q=de+zoutweg&language=nl');
  });

  it('waits for two letters before searching', async () => {
    const b = broker();
    await renderWithProviders(<SearchScreen />);
    await userEvent.setup().type(screen.getByLabelText('Search by title or author'), 'a', {
      submitEditing: true,
    });
    await settle();
    expect(searches(b)).toHaveLength(0);
  });

  it('says so when nothing is found', async () => {
    broker({ 'GET /discover/search': () => searchResult([]) });
    await renderWithProviders(<SearchScreen />);
    await userEvent.setup().type(screen.getByLabelText('Search by title or author'), 'xyzzy', {
      submitEditing: true,
    });
    expect(await screen.findByText('Couldn’t sniff anything out')).toBeOnTheScreen();
  });

  it('shows a translated error with a retry when search is down', async () => {
    let down = true;
    broker({
      'GET /discover/search': () =>
        down ? apiError(502, 'METADATA_UNAVAILABLE') : searchResult([hit()]),
    });
    usePreferences.setState({ language: 'nl' });
    const user = userEvent.setup();
    await renderWithProviders(<SearchScreen />);
    await userEvent.setup().type(screen.getByLabelText('Zoek op titel of schrijver'), 'salt', {
      submitEditing: true,
    });
    expect(
      await screen.findByText('Boeken zoeken lukt even niet. Probeer het zo nog eens.'),
    ).toBeOnTheScreen();
    down = false;
    await user.press(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(await screen.findByText('The Salt Road')).toBeOnTheScreen();
  });

  it('opens a hit when the screen is given a handler', async () => {
    broker();
    const onOpen = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<SearchScreen onOpen={onOpen} />);
    await userEvent.setup().type(screen.getByLabelText('Search by title or author'), 'salt', {
      submitEditing: true,
    });
    await user.press(await screen.findByRole('button', { name: /^The Salt Road/ }));
    expect(onOpen).toHaveBeenCalledWith('hardcover:301');
  });

  it('falls back to the placeholder card when a cover fails to load', async () => {
    broker();
    await renderWithProviders(<SearchScreen />);
    await userEvent.setup().type(screen.getByLabelText('Search by title or author'), 'salt', {
      submitEditing: true,
    });
    const cover = await screen.findByTestId('cover-hardcover:301', { includeHiddenElements: true });
    await act(async () => cover.props.onError());
    await waitFor(() =>
      expect(
        screen.queryByTestId('cover-hardcover:301', { includeHiddenElements: true }),
      ).toBeNull(),
    );
  });
});

describe('badges and second line', () => {
  const t = i18n.getFixedT('en');

  it('says "Yours" when the book is mine but not on my Kobo, and "In library" otherwise', () => {
    const owner = { id: 'u1', displayName: 'Me', me: true };
    expect(libraryBadges({ itemId: 'i', owners: [owner], onMyKobo: false }, t)).toEqual([
      { label: 'Yours', tone: 'mine' },
    ]);
    expect(libraryBadges({ itemId: 'i', owners: [], onMyKobo: false }, t)).toEqual([
      { label: 'In library', tone: 'success' },
    ]);
    expect(libraryBadges(null, t)).toEqual([]);
  });

  it('names the series without a position, an unknown language by code, or nothing', () => {
    const base = hit() as Parameters<typeof secondLine>[0];
    expect(secondLine({ ...base, series: { ...base.series!, position: null } }, t)).toBe(
      'Ilse Varenkamp · Lantern Keepers',
    );
    expect(secondLine({ ...base, series: null, language: 'de' }, t)).toBe('Ilse Varenkamp · DE');
    expect(secondLine({ ...base, series: null, language: null, authors: [] }, t)).toBe('');
  });
});
