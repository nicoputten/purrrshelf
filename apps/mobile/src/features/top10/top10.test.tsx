import type { ChartEntry } from '@purrshelf/contract';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { i18n } from '@/i18n';
import { usePreferences } from '@/session/preferences';
import { setFetch, useSession } from '@/session/session';
import {
  apiError,
  bookRequest,
  budget,
  chart,
  chartEntry,
  charts,
  fakeBroker,
  hit,
  me,
} from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { Top10Screen } from './Top10Screen';
import { entryChip, searchQueryFor } from './useCharts';

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

const owner = (me: boolean) => ({
  id: me ? 'u1' : 'u2',
  displayName: me ? 'Reader One' : 'Reader Two',
  me,
});
const inLibrary = (owners: ReturnType<typeof owner>[]) => ({
  itemId: '00000000-0000-4000-8000-000000000001',
  owners,
  onMyKobo: false,
  reading: null,
});

const usThrillers = chart({ region: 'us', genre: 'thriller' });
const usRomance = chart({
  region: 'us',
  genre: 'romance',
  items: [chartEntry({ rank: 1, title: 'Harbour Hearts', work: hit({ id: 'hardcover:801' }) })],
});
const nlThrillers = chart({
  region: 'nl',
  genre: 'thriller',
  items: [chartEntry({ rank: 1, title: 'De Zoutweg', work: hit({ id: 'hardcover:701' }) })],
});
const trendingThrillers = chart({
  source: 'hardcover',
  region: null,
  genre: 'thriller',
  items: [chartEntry({ rank: 1, title: 'Quiet Rivers', work: hit({ id: 'hardcover:601' }) })],
});
const all = [usThrillers, usRomance, nlThrillers, trendingThrillers];

function broker(routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /budget': () => budget(),
    'GET /me': me,
    'GET /charts': () => charts(all),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

function renderTop10(props: Partial<Parameters<typeof Top10Screen>[0]> = {}) {
  const handlers = { onOpen: jest.fn(), onSearch: jest.fn(), onOpenRequests: jest.fn() };
  return renderWithProviders(<Top10Screen {...handlers} {...props} />).then(() => handlers);
}

const chartCalls = (b: ReturnType<typeof fakeBroker>) =>
  b.calls.filter((c) => c.route === 'GET /charts').length;

describe('Top 10 (APP-15)', () => {
  it('shows the thriller bestsellers in the reader’s language, ranked, with the credit', async () => {
    const b = broker();
    await renderTop10();
    expect(
      await screen.findByRole('button', { name: /^Rank 1, Lantern Book 1, Ilse Varenkamp$/ }),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^Rank \d+,/ })).toHaveLength(10);
    expect(screen.getByRole('radio', { name: 'Thrillers & crime' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bestsellers' })).toBeChecked();
    // No chip for the whole chart.
    expect(screen.queryByRole('radio', { name: /^all$/i })).toBeNull();
    expect(screen.getByText('English (US)')).toBeOnTheScreen();
    expect(screen.getByText(/^Charts from Apple Books · updated /)).toBeOnTheScreen();
    expect(screen.queryByText(/That’s all/)).toBeNull();
    expect(screen.getByText('21 / 25 left')).toBeOnTheScreen();
    // Looking is free: no availability, prices or "add all".
    expect(screen.queryByText(/available|add all|€|\$/i)).toBeNull();
    expect(b.calls.map((c) => c.route)).not.toContain('POST /requests');
  });

  it('switches genre', async () => {
    broker();
    await renderTop10();
    await screen.findByText('Lantern Book 1');
    await fireEvent.press(screen.getByRole('radio', { name: 'Romance' }));
    expect(await screen.findByText('Harbour Hearts')).toBeOnTheScreen();
    expect(screen.queryByText('Lantern Book 1')).toBeNull();
  });

  it('opens on the genre it is given', async () => {
    broker();
    await renderTop10({ genre: 'romance' });
    expect(await screen.findByText('Harbour Hearts')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Romance' })).toBeChecked();
  });

  it('switches to Trending on Hardcover and back', async () => {
    broker();
    await renderTop10();
    await screen.findByText('Lantern Book 1');
    await fireEvent.press(screen.getByRole('radio', { name: 'Trending' }));
    expect(await screen.findByText('Quiet Rivers')).toBeOnTheScreen();
    expect(screen.getByText(/^Trending on Hardcover · updated /)).toBeOnTheScreen();
    // Hardcover has no language: no chart language line.
    expect(screen.queryByRole('button', { name: 'Switch to Dutch' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Bestsellers' }));
    expect(await screen.findByText('Lantern Book 1')).toBeOnTheScreen();
  });

  it('hides the source switch when the server has no Trending', async () => {
    broker({ 'GET /charts': () => charts([usThrillers, nlThrillers]) });
    await renderTop10();
    await screen.findByText('Lantern Book 1');
    expect(screen.queryByRole('radio', { name: 'Trending' })).toBeNull();
  });

  it('switches the chart language', async () => {
    broker();
    await renderTop10();
    await screen.findByText('Lantern Book 1');
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to Dutch' }));
    expect(await screen.findByText('De Zoutweg')).toBeOnTheScreen();
    expect(screen.getByText('Dutch')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to English' }));
    expect(await screen.findByText('Lantern Book 1')).toBeOnTheScreen();
  });

  it('starts on the Dutch chart for a Dutch reader', async () => {
    usePreferences.setState({ language: 'nl' });
    broker({ 'GET /charts': () => charts([nlThrillers, usThrillers, trendingThrillers]) });
    await renderTop10();
    expect(await screen.findByText('De Zoutweg')).toBeOnTheScreen();
    expect(screen.getByText('Nederlands')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Naar Engels' })).toBeOnTheScreen();
    // Trending is there to pick, but never the default.
    expect(screen.getByRole('radio', { name: 'Bestsellers' })).toBeChecked();
    expect(screen.queryByText('Quiet Rivers')).toBeNull();
  });

  it('shows one state chip per book', async () => {
    const items = [
      chartEntry({ rank: 1, title: 'Plain Book', work: hit({ id: 'hardcover:1' }) }),
      chartEntry({
        rank: 2,
        title: 'Mine Book',
        // Mine and my partner's: mine wins.
        work: hit({ id: 'hardcover:2', library: inLibrary([owner(true), owner(false)]) }),
      }),
      chartEntry({
        rank: 3,
        title: 'Partner Book',
        work: hit({ id: 'hardcover:3', library: inLibrary([owner(false)]) }),
      }),
      chartEntry({
        rank: 4,
        title: 'Fetching Book',
        work: hit({ id: 'hardcover:4' }),
        request: { id: 'r4', status: 'downloading' },
      }),
      chartEntry({
        rank: 5,
        title: 'Waiting Book',
        work: hit({ id: 'hardcover:5' }),
        request: { id: 'r5', status: 'waiting_budget' },
      }),
      chartEntry({
        rank: 6,
        title: 'Done Book',
        work: hit({ id: 'hardcover:6' }),
        request: { id: 'r6', status: 'cancelled' },
      }),
    ];
    broker({ 'GET /charts': () => charts([chart({ items })]) });
    await renderTop10();
    const row = async (rank: number) => within(await screen.findByTestId(`rank-${rank}`));
    expect(
      (await row(1)).getByRole('button', { name: 'Rank 1, Plain Book, Ilse Varenkamp' }),
    ).toBeOnTheScreen();
    expect((await row(2)).getByText('In your library')).toBeOnTheScreen();
    expect((await row(3)).getByText('Instant · on Reader Two’s shelf')).toBeOnTheScreen();
    expect((await row(4)).getByText('Downloading')).toBeOnTheScreen();
    expect((await row(5)).getByText('Added · waiting for a search')).toBeOnTheScreen();
    expect(
      (await row(6)).getByRole('button', { name: 'Rank 6, Done Book, Ilse Varenkamp' }),
    ).toBeOnTheScreen();
  });

  it('shows download progress when the requests list is loaded', () => {
    const t = i18n.t.bind(i18n);
    const entry = chartEntry({ request: { id: 'r1', status: 'downloading' } }) as ChartEntry;
    const requests = [bookRequest({ id: 'r1', status: 'downloading', progress: 64 })];
    expect(entryChip(entry, requests as never, t)).toEqual({
      kind: 'request',
      label: 'Downloading 64%',
    });
    expect(entryChip(entry, undefined, t)).toEqual({ kind: 'request', label: 'Downloading' });
  });

  it('opens the book page from a row and from the ⋯ menu', async () => {
    broker();
    const { onOpen } = await renderTop10();
    await fireEvent.press(await screen.findByRole('button', { name: /^Rank 2, Lantern Book 2/ }));
    expect(onOpen).toHaveBeenLastCalledWith('hardcover:901');
    await fireEvent.press(screen.getByRole('button', { name: 'More options for Lantern Book 3' }));
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Open book page' }));
    expect(onOpen).toHaveBeenLastCalledWith('hardcover:902');
  });

  it('searches for a book nobody knows', async () => {
    const unknown = chartEntry({
      rank: 1,
      title: 'De stille getuige',
      authors: ['Mara Tolhuis'],
      work: null,
    });
    broker({ 'GET /charts': () => charts([chart({ items: [unknown] })]) });
    const { onSearch, onOpen } = await renderTop10();
    const row = await screen.findByRole('button', {
      name: 'Rank 1, De stille getuige, Mara Tolhuis, Search for it',
    });
    expect(screen.getByText('Search for it')).toBeOnTheScreen();
    await fireEvent.press(row);
    expect(onSearch).toHaveBeenLastCalledWith('Mara Tolhuis De stille getuige');
    onSearch.mockClear();
    await fireEvent.press(
      screen.getByRole('button', { name: 'More options for De stille getuige' }),
    );
    expect(screen.queryByRole('menuitem', { name: 'Open book page' })).toBeNull();
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Search for it' }));
    expect(onSearch).toHaveBeenLastCalledWith('Mara Tolhuis De stille getuige');
    expect(onOpen).not.toHaveBeenCalled();
    expect(searchQueryFor({ title: 'Alone', authors: [] })).toBe('Alone');
  });

  it('says so when a list has fewer than 10 books', async () => {
    broker({ 'GET /charts': () => charts([chart({}, 4)]) });
    await renderTop10();
    expect(
      await screen.findByText('That’s all 4 for today. Lists fill up again tomorrow.'),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^Rank \d+,/ })).toHaveLength(4);
  });

  it('offers Trending when a genre has no books today', async () => {
    broker();
    await renderTop10();
    await screen.findByText('Lantern Book 1');
    await fireEvent.press(screen.getByRole('radio', { name: 'Memoir' }));
    expect(await screen.findByText('Nothing in Memoir today')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Show Trending' }));
    // Trending has no memoirs either: no way back to Trending from Trending.
    expect(screen.getByRole('radio', { name: 'Trending' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Show Trending' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Thrillers & crime' }));
    expect(await screen.findByText('Quiet Rivers')).toBeOnTheScreen();
  });

  it('keeps a stale list with Couldn’t refresh, Retry and the real update time', async () => {
    let stale = true;
    const b = broker({ 'GET /charts': () => charts(all, { stale }) });
    await renderTop10();
    expect(
      await screen.findByText('Couldn’t refresh the charts. Showing the last list.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Lantern Book 1')).toBeOnTheScreen();
    expect(screen.getByText(/^Charts from Apple Books · last updated /)).toBeOnTheScreen();
    stale = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.queryByText('Couldn’t refresh the charts. Showing the last list.')).toBeNull(),
    );
    expect(chartCalls(b)).toBe(2);
  });

  it('keeps the last list when a refresh fails', async () => {
    let down = false;
    broker({
      'GET /charts': () =>
        down ? apiError(502, 'METADATA_UNAVAILABLE') : charts(all, { stale: true }),
    });
    await renderTop10();
    await screen.findByText('Lantern Book 1');
    down = true;
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByText(/^Charts from Apple Books · last updated /)).toBeOnTheScreen(),
    );
    expect(screen.getByText('Lantern Book 1')).toBeOnTheScreen();
    expect(
      screen.getByText('Couldn’t refresh the charts. Showing the last list.'),
    ).toBeOnTheScreen();
  });

  it('shows the error with Retry when nothing is cached', async () => {
    let down = true;
    broker({
      'GET /charts': () => (down ? apiError(502, 'METADATA_UNAVAILABLE') : charts(all)),
    });
    await renderTop10();
    expect(
      await screen.findByText('Book search is down for a moment. Try again soon.'),
    ).toBeOnTheScreen();
    down = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Lantern Book 1')).toBeOnTheScreen();
  });

  it('shows the paw loader and skeleton ranks while the charts load', async () => {
    setFetch(() => new Promise<Response>(() => undefined));
    await renderTop10();
    expect(screen.getByText('Fetching today’s charts…')).toBeOnTheScreen();
  });

  it('opens Requests from the budget pill', async () => {
    broker();
    const { onOpenRequests } = await renderTop10();
    await fireEvent.press(
      await screen.findByRole('link', { name: '21 of 25 indexer searches left today' }),
    );
    expect(onOpenRequests).toHaveBeenCalled();
  });
});
