import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { setFetch, useSession } from '@/session/session';
import { apiError, bookRequest, fakeBroker, ok, releaseOption } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { ReleasePickerScreen } from './ReleasePicker';
import { SearchYourselfScreen, triedOutcome } from './SearchYourself';
import {
  defaultIndexer,
  firstWords,
  searchableIndexers,
  splitTitle,
  suggestWords,
} from './searchWords';

jest.setTimeout(15_000);

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

const counter = (left: number, limit: number) => ({
  limit,
  used: limit - left,
  left,
  nextFreeAt: '2026-01-02T08:30:00.000Z',
  limitReachedUntil: null,
});

const indexer = (id: string, name: string, priority: number, left: number, limit: number) => ({
  indexerId: id,
  name,
  priority,
  searches: counter(left, limit),
  grabs: counter(20, 25),
});

const twoIndexers = (firstLeft = 79, secondLeft = 196) =>
  ok({
    windowMinutes: 1440,
    searches: { limit: 100, left: firstLeft, nextFreeAt: '2026-01-02T08:30:00.000Z' },
    indexers: [
      indexer('first', 'First', 1, firstLeft, 100),
      indexer('second', 'Second', 2, secondLeft, 200),
      indexer('off', 'Off', 3, 0, 0),
    ],
  });

const lantern = bookRequest({
  status: 'not_found',
  title: 'Lantern: The Story of Old Wick',
  authors: ['Ilse Varenkamp'],
  searches: 2,
});

function broker(routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /requests': () => ok({ requests: [lantern] }),
    'GET /budget': () => twoIndexers(),
    'GET /requests/r1/searches': () =>
      ok({
        searches: [
          {
            words: 'Lantern',
            indexerName: 'First',
            resultCount: 100,
            hit: false,
            manual: false,
            failed: false,
            createdAt: '2026-01-01T12:01:00.000Z',
          },
          {
            words: 'Ilse Varenkamp Lantern',
            indexerName: 'First',
            resultCount: 0,
            hit: false,
            manual: false,
            failed: false,
            createdAt: '2026-01-01T12:00:00.000Z',
          },
        ],
      }),
    'POST /requests/r1/search': () =>
      ok({ request: bookRequest({ status: 'choose_release', searches: 3 }), resultCount: 4 }),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

const render = (onResults = jest.fn(), onBack = jest.fn()) =>
  renderWithProviders(
    <SearchYourselfScreen requestId="r1" onBack={onBack} onResults={onResults} />,
  );

describe('search words', () => {
  it('splits a subtitle off the title', () => {
    expect(splitTitle('Lantern: The Story of Old Wick')).toEqual({
      main: 'Lantern',
      subtitle: 'The Story of Old Wick',
    });
    expect(splitTitle('Lantern - Old Wick (Wick Tales #8)')).toEqual({
      main: 'Lantern',
      subtitle: 'Old Wick',
    });
    expect(splitTitle('The Salt Road')).toEqual({ main: 'The Salt Road', subtitle: '' });
  });

  it('suggests the whole title, title plus subtitle words, surname plus title, and the title', () => {
    expect(suggestWords('Lantern: The Story of Old Wick', ['Ilse Varenkamp'])).toEqual([
      'Lantern The Story of Old Wick',
      'Lantern Old Wick',
      'Varenkamp Lantern',
      'Lantern',
    ]);
    expect(suggestWords('The Salt Road', [])).toEqual(['The Salt Road']);
  });

  it('starts with the first suggestion not tried yet', () => {
    expect(firstWords(['a b', 'c'], ['A B'])).toBe('c');
    expect(firstWords(['a b'], ['a b'])).toBe('a b');
    expect(firstWords([], [])).toBe('');
  });

  it('picks the indexer with the most searches left, then by priority', () => {
    const list = [indexer('a', 'A', 1, 5, 10), indexer('b', 'B', 2, 5, 10)];
    expect(defaultIndexer(list)?.indexerId).toBe('a');
    expect(defaultIndexer([...list, indexer('c', 'C', 3, 9, 10)])?.indexerId).toBe('c');
    expect(defaultIndexer([])).toBeNull();
    expect(searchableIndexers(undefined)).toEqual([]);
  });

  it('says how an earlier search went', () => {
    const t = ((key: string, o?: { count: number }) => (o ? `${o.count} ${key}` : key)) as never;
    const s = {
      words: 'x',
      indexerName: 'First',
      resultCount: 3,
      hit: true,
      manual: true,
      failed: false,
      createdAt: '2026-01-01T12:00:00.000Z',
    };
    expect(triedOutcome(s, t)).toBe('3 searchYourself.results');
    expect(triedOutcome({ ...s, resultCount: 0 }, t)).toBe('searchYourself.nothing');
    expect(triedOutcome({ ...s, failed: true }, t)).toBe('searchYourself.failed');
  });
});

describe('Search it yourself', () => {
  it('shows what was tried, suggests words and states the cost before the tap', async () => {
    broker();
    await render();
    expect(await screen.findByText('“Lantern” · First')).toBeOnTheScreen();
    expect(screen.getByText('100 results')).toBeOnTheScreen();
    expect(screen.getByText('nothing')).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.getByLabelText('Search words')).toHaveDisplayValue(
        'Lantern The Story of Old Wick',
      ),
    );
    expect(screen.getByRole('button', { name: 'Lantern Old Wick' })).toBeOnTheScreen();
    // The indexer with the most searches left is picked; a switched-off one is not offered.
    expect(screen.getByRole('radio', { name: 'Second, 196 of 200 left today' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /Off/ })).toBeNull();
    expect(screen.getByText(/on Second\. Nothing is downloaded/)).toBeOnTheScreen();
  });

  it('spends one search with the chosen words and indexer, then shows the results', async () => {
    const b = broker();
    const onResults = jest.fn();
    const user = userEvent.setup();
    await render(onResults);
    await user.press(await screen.findByRole('button', { name: 'Lantern Old Wick' }));
    await user.press(screen.getByRole('radio', { name: /^First/ }));
    await user.press(screen.getByRole('button', { name: 'Sniff with these words' }));
    await waitFor(() =>
      expect(onResults).toHaveBeenCalledWith({ words: 'Lantern Old Wick', indexer: 'First' }),
    );
    const call = b.calls.find((c) => c.route === 'POST /requests/r1/search');
    expect(call?.body).toEqual({ words: 'Lantern Old Wick', indexerId: 'first' });
  });

  it('keeps the words and naps when nothing comes back', async () => {
    broker({
      'POST /requests/r1/search': () => ok({ request: lantern, resultCount: 0 }),
    });
    const onResults = jest.fn();
    const user = userEvent.setup();
    await render(onResults);
    const field = await screen.findByLabelText('Search words');
    await user.clear(field);
    await user.type(field, 'odd words');
    await user.press(screen.getByRole('button', { name: 'Sniff with these words' }));
    expect(await screen.findByText('Nothing for those words')).toBeOnTheScreen();
    expect(field).toHaveDisplayValue('odd words');
    expect(onResults).not.toHaveBeenCalled();
  });

  it('turns the button off when the chosen indexer has no searches left', async () => {
    broker({ 'GET /budget': () => twoIndexers(0, 0) });
    await render();
    const button = await screen.findByRole('button', { name: /No searches left on First until/ });
    expect(button).toBeDisabled();
  });

  it('says why the broker refused', async () => {
    broker({ 'POST /requests/r1/search': () => apiError(502, 'INDEXER_UNAVAILABLE') });
    const user = userEvent.setup();
    await render();
    await waitFor(() =>
      expect(screen.getByLabelText('Search words')).toHaveDisplayValue(
        'Lantern The Story of Old Wick',
      ),
    );
    await user.press(screen.getByRole('button', { name: 'Sniff with these words' }));
    expect(await screen.findByText(/That indexer didn’t answer/)).toBeOnTheScreen();
  });

  it('says when there is no indexer at all', async () => {
    broker({
      'GET /budget': () =>
        ok({
          windowMinutes: 1440,
          searches: { limit: 0, left: 0, nextFreeAt: null },
          indexers: [],
        }),
    });
    await render();
    expect(await screen.findByText(/no indexer to search on/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sniff with these words' })).toBeDisabled();
  });
});

describe('Pick the right one', () => {
  const mineOptions = [
    releaseOption({ id: 'good', title: 'Lantern .The.Story.of.Old.Wick', score: 70 }),
    releaseOption({
      id: 'other',
      title: 'Lantern Repair Manual',
      score: 0,
      rejected: ['title_mismatch'],
      authorMatch: false,
    }),
    releaseOption({
      id: 'pdf',
      title: 'Lantern PDF',
      format: 'pdf',
      score: 0,
      rejected: ['format_excluded'],
    }),
  ];

  function pickerBroker() {
    const b = fakeBroker({
      'GET /requests': () => ok({ requests: [bookRequest({ status: 'choose_release' })] }),
      'GET /requests/r1/releases': () => ok({ releases: mineOptions, acceptThreshold: 60 }),
      'POST /requests/r1/releases/other': () => ok(bookRequest({ status: 'downloading' })),
    });
    setFetch(b.fetch);
    return b;
  }

  it('shows another book with a warning and lets the reader fetch it anyway', async () => {
    const b = pickerBroker();
    const onBack = jest.fn();
    const onSearchMyself = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <ReleasePickerScreen
        requestId="r1"
        mine={{ words: 'Lantern Old Wick', indexer: 'Second' }}
        onBack={onBack}
        onSearchMyself={onSearchMyself}
      />,
    );
    expect(await screen.findByText('“Lantern Old Wick” on Second · 3 results')).toBeOnTheScreen();
    expect(screen.getByText('Pick the right one')).toBeOnTheScreen();
    expect(screen.getByText(/Your words, your pick/)).toBeOnTheScreen();
    expect(screen.getByText('Another book?')).toBeOnTheScreen();
    expect(screen.getByText('1 left out')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Fetch this one' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Fetch anyway' }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(b.calls.map((c) => c.route)).toContain('POST /requests/r1/releases/other');
    await user.press(screen.getByRole('button', { name: 'Other words' }));
    expect(onSearchMyself).toHaveBeenCalled();
  });

  it('offers Search it myself under the normal picker, even when it is empty', async () => {
    setFetch(
      fakeBroker({
        'GET /requests': () => ok({ requests: [bookRequest({ status: 'choose_release' })] }),
        'GET /requests/r1/releases': () => ok({ releases: [], acceptThreshold: 60 }),
      }).fetch,
    );
    const onSearchMyself = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <ReleasePickerScreen requestId="r1" onBack={jest.fn()} onSearchMyself={onSearchMyself} />,
    );
    expect(await screen.findByText('Not in this list?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Search it myself' }));
    expect(onSearchMyself).toHaveBeenCalled();
  });
});
