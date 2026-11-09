import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SearchScreen } from '@/features/search/SearchScreen';
import { setFetch, useSession } from '@/session/session';
import {
  budget,
  chart,
  chartEntry,
  charts,
  fakeBroker,
  hit,
  me,
  recommendations,
  searchResult,
} from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

afterEach(() => jest.restoreAllMocks());

function broker(routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /budget': () => budget(),
    'GET /me': me,
    'GET /recommendations': () => recommendations([]),
    'GET /charts': () =>
      charts([
        chart({ region: 'us', genre: 'thriller' }),
        chart({ region: 'us', genre: 'romance' }),
      ]),
    'GET /discover/search': () => searchResult([hit()]),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

describe('Top 10 teaser on Search (APP-15)', () => {
  it('shows the first three thrillers and opens the Top 10 tab on See all', async () => {
    broker();
    const navigate = jest.spyOn(router, 'navigate').mockImplementation(() => undefined);
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    await renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Top 10 thrillers today')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^Rank \d, Lantern Book/ })).toHaveLength(3);
    expect(screen.getByText('Charts from Apple Books')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('link', { name: 'See all of the Top 10 thrillers' }));
    expect(navigate).toHaveBeenLastCalledWith({
      pathname: '/top10',
      params: { genre: 'thriller' },
    });

    await fireEvent.press(screen.getByRole('button', { name: /^Rank 2, Lantern Book 2/ }));
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/book/[id]',
      params: { id: 'hardcover:901' },
    });
  });

  it('searches for an unknown teaser book', async () => {
    broker({
      'GET /charts': () =>
        charts([
          chart({
            items: [
              chartEntry({ rank: 1, title: 'Dark Water', authors: ['Ena Brook'], work: null }),
            ],
          }),
        ]),
    });
    const navigate = jest.spyOn(router, 'navigate').mockImplementation(() => undefined);
    await renderWithProviders(<SearchScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Rank 1, Dark Water, Ena Brook' }),
    );
    expect(navigate).toHaveBeenLastCalledWith({
      pathname: '/',
      params: { q: 'Ena Brook Dark Water' },
    });
  });

  it('stays out of the way when the charts are unavailable', async () => {
    broker({
      'GET /charts': () => ({ status: 502, body: { code: 'METADATA_UNAVAILABLE', message: 'x' } }),
    });
    await renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Nothing to suggest yet')).toBeOnTheScreen();
    expect(screen.queryByText('Top 10 thrillers today')).toBeNull();
  });

  it('runs the search it is given (Search for it)', async () => {
    const b = broker();
    await renderWithProviders(<SearchScreen query="Ena Brook Dark Water" />);
    expect(await screen.findByDisplayValue('Ena Brook Dark Water')).toBeOnTheScreen();
    await waitFor(() => expect(b.calls.some((c) => c.route === 'GET /discover/search')).toBe(true));
    expect(await screen.findByLabelText(/^The Salt Road, Ilse Varenkamp/)).toBeOnTheScreen();
  });
});
