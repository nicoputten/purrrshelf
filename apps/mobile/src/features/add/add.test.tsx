import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { usePreferences } from '@/session/preferences';
import { setFetch, useSession } from '@/session/session';
import {
  apiError,
  bookRequest,
  budget,
  budgetWithIndexer,
  fakeBroker,
  ok,
  readers,
  work,
} from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { AddSheetHost, defaultLanguage } from './AddSheet';
import { useAddSheet } from './useAddSheet';

jest.setTimeout(15_000);

beforeEach(async () => {
  await resetApp();
  useAddSheet.setState({ workId: null });
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

function broker(routes: Parameters<typeof fakeBroker>[0] = {}) {
  const b = fakeBroker({
    'GET /works/hardcover:301': () => ok(work()),
    'GET /readers': () => readers(),
    'GET /budget': () => budgetWithIndexer(),
    'POST /requests': (body) => ({
      status: 201,
      body: bookRequest(body as Record<string, unknown>),
    }),
    ...routes,
  });
  setFetch(b.fetch);
  return b;
}

async function open(onAdded = jest.fn()) {
  await renderWithProviders(<AddSheetHost onAdded={onAdded} />);
  await act(async () => useAddSheet.getState().open('hardcover:301'));
  await screen.findByText('Fetch this book?');
  return onAdded;
}

describe('Add sheet', () => {
  it('shows the book, its language, the Kobos and what it costs', async () => {
    broker();
    await open();
    expect(screen.getByText('The Salt Road · Ilse Varenkamp')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(await screen.findByRole('checkbox', { name: 'Your Kobo' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Reader Two’s Kobo' })).not.toBeChecked();
    expect(
      await screen.findByText('Uses 1 search, up to 4 if the first sniff misses.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('21 of 25 searches left today.')).toBeOnTheScreen();
  });

  it('fetches with the chosen language and Kobos, and remembers the language', async () => {
    const b = broker();
    const user = userEvent.setup();
    const onAdded = await open();
    await user.press(await screen.findByRole('checkbox', { name: 'Reader Two’s Kobo' }));
    await user.press(screen.getByRole('checkbox', { name: 'Your Kobo' }));
    await user.press(screen.getByRole('checkbox', { name: 'Your Kobo' }));
    await user.press(screen.getByRole('radio', { name: 'Nederlands' }));
    await user.press(screen.getByRole('button', { name: 'Fetch it now' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(b.calls.find((c) => c.route === 'POST /requests')?.body).toEqual({
      workId: 'hardcover:301',
      language: 'nl',
      pushTo: ['u1', 'u2'],
    });
    expect(onAdded.mock.calls[0][0]).toMatchObject({ id: 'r1', language: 'nl' });
    expect(useAddSheet.getState().workId).toBeNull();
    expect(usePreferences.getState().bookLanguage).toBe('nl');
  });

  it('can send it to no Kobo at all', async () => {
    const b = broker();
    const user = userEvent.setup();
    await open();
    await user.press(await screen.findByRole('checkbox', { name: 'Your Kobo' }));
    await user.press(screen.getByRole('button', { name: 'Fetch it now' }));
    await waitFor(() => expect(b.calls.some((c) => c.route === 'POST /requests')).toBe(true));
    expect(b.calls.find((c) => c.route === 'POST /requests')?.body).toMatchObject({ pushTo: [] });
  });

  it('only records ownership for a book already in the library', async () => {
    broker({
      'GET /works/hardcover:301': () =>
        ok(work({ library: { itemId: 'item-1', owners: [], onMyKobo: false, reading: null } })),
    });
    await renderWithProviders(<AddSheetHost onAdded={jest.fn()} />);
    await act(async () => useAddSheet.getState().open('hardcover:301'));
    expect(await screen.findByText('Add to your library?')).toBeOnTheScreen();
    expect(screen.getByText(/costs no search/)).toBeOnTheScreen();
    expect(screen.queryByText(/Uses/)).toBeNull();
    expect(screen.queryByRole('radio', { name: 'English' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to my library' })).toBeOnTheScreen();
  });

  it('says so when no indexer is set up, and does not fetch', async () => {
    broker({ 'GET /budget': () => budget(0, 0) });
    await open();
    expect(await screen.findByText(/No indexer is set up yet/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Fetch it now' })).toBeDisabled();
  });

  it('says when no Kobo is linked', async () => {
    broker({
      'GET /readers': () =>
        readers([{ id: 'u1', displayName: 'Reader One', me: true, kobo: false }]),
    });
    await open();
    expect(await screen.findByText(/No Kobo is linked yet/)).toBeOnTheScreen();
  });

  it('shows a translated error and stays open', async () => {
    broker({ 'POST /requests': () => apiError(400, 'VALIDATION_ERROR') });
    const user = userEvent.setup();
    const onAdded = await open();
    await user.press(screen.getByRole('button', { name: 'Fetch it now' }));
    expect(await screen.findByText('Something in the form is not right.')).toBeOnTheScreen();
    expect(onAdded).not.toHaveBeenCalled();
    expect(useAddSheet.getState().workId).toBe('hardcover:301');
  });

  it('shows why the book could not load', async () => {
    broker({ 'GET /works/hardcover:301': () => apiError(404, 'NOT_FOUND') });
    await renderWithProviders(<AddSheetHost onAdded={jest.fn()} />);
    await act(async () => useAddSheet.getState().open('hardcover:301'));
    expect(await screen.findByText('Not found.')).toBeOnTheScreen();
  });

  it('closes on Not now', async () => {
    broker();
    const user = userEvent.setup();
    await open();
    await user.press(screen.getByRole('button', { name: 'Not now' }));
    expect(useAddSheet.getState().workId).toBeNull();
  });

  it('speaks Dutch', async () => {
    broker();
    usePreferences.setState({ language: 'nl' });
    await renderWithProviders(<AddSheetHost onAdded={jest.fn()} />);
    await act(async () => useAddSheet.getState().open('hardcover:301'));
    expect(await screen.findByText('Dit boek ophalen?')).toBeOnTheScreen();
    expect(await screen.findByRole('checkbox', { name: 'Kobo van Reader Two' })).toBeOnTheScreen();
  });
});

function preview(lowOdds: Record<string, unknown> | null, language = 'en') {
  return ok({
    workId: 'hardcover:301',
    language,
    lowOdds: lowOdds && {
      notFoundAt: null,
      releaseDate: null,
      englishEditionWorkId: null,
      readers: null,
      ...lowOdds,
    },
  });
}

describe('low-odds warning (APP-16)', () => {
  const cases = [
    [
      { code: 'LOW_ODDS_NOT_FOUND', notFoundAt: '2026-11-02T12:00:00.000Z' },
      'Not found last time',
      'We tried on 2 November and found nothing. Chances are low it turned up since.',
    ],
    [
      { code: 'LOW_ODDS_NO_MATCH' },
      'We barely know this book',
      'There’s no ISBN or edition info, so it’s hard to search for well. Expect no result.',
    ],
    [
      { code: 'LOW_ODDS_NEW', releaseDate: '2026-11-05' },
      'This one is very new',
      'New books often take a few weeks to turn up. Trying now may cost searches for nothing.',
    ],
    [
      { code: 'LOW_ODDS_LANGUAGE' },
      'Dutch books are hard to find',
      'Few Dutch ebooks get shared, so this often ends with “couldn’t sniff this one out”. Don’t count on it.',
    ],
    [
      { code: 'LOW_ODDS_RARE', readers: 3 },
      'A rare one',
      'Few people read this, so few copies get shared. It may not be out there.',
    ],
  ] as const;

  it.each(cases)('shows one card for %j', async (lowOdds, title, body) => {
    broker({ 'GET /requests/preview': () => preview(lowOdds) });
    await open();
    expect(await screen.findByText(title)).toBeOnTheScreen();
    expect(screen.getByText(body)).toBeOnTheScreen();
    expect(screen.getAllByTestId('low-odds-warning')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Fetch it anyway' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Try the English edition instead' })).toBeNull();
  });

  it('asks for the work and the chosen language', async () => {
    const b = broker({ 'GET /requests/preview': () => preview(null) });
    await open();
    await waitFor(() =>
      expect(b.calls.some((c) => c.route === 'GET /requests/preview')).toBe(true),
    );
    expect(screen.getByRole('button', { name: 'Fetch it now' })).toBeOnTheScreen();
    expect(screen.queryByTestId('low-odds-warning')).toBeNull();
  });

  it('shows no warning when the preview fails, and Add still works', async () => {
    const b = broker({ 'GET /requests/preview': () => apiError(500, 'INTERNAL_ERROR') });
    const user = userEvent.setup();
    const onAdded = await open();
    await waitFor(() =>
      expect(b.calls.some((c) => c.route === 'GET /requests/preview')).toBe(true),
    );
    expect(screen.queryByTestId('low-odds-warning')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Fetch it now' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
  });

  it('does not ask for a book already in the library', async () => {
    const b = broker({
      'GET /works/hardcover:301': () =>
        ok(work({ library: { itemId: 'item-1', owners: [], onMyKobo: false, reading: null } })),
      'GET /requests/preview': () => preview({ code: 'LOW_ODDS_RARE' }),
    });
    await renderWithProviders(<AddSheetHost onAdded={jest.fn()} />);
    await act(async () => useAddSheet.getState().open('hardcover:301'));
    expect(await screen.findByText('Add to your library?')).toBeOnTheScreen();
    expect(b.calls.some((c) => c.route === 'GET /requests/preview')).toBe(false);
    expect(screen.queryByText('A rare one')).toBeNull();
  });

  it('follows the language picker', async () => {
    const urls: string[] = [];
    broker({
      'GET /requests/preview': (_body, _headers, url) => {
        urls.push(url.search);
        const language = url.searchParams.get('language') ?? 'en';
        return preview(language === 'nl' ? { code: 'LOW_ODDS_LANGUAGE' } : null, language);
      },
    });
    const user = userEvent.setup();
    await open();
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(urls[0]).toBe('?workId=hardcover%3A301&language=en');
    expect(screen.queryByText('Dutch books are hard to find')).toBeNull();
    await user.press(screen.getByRole('radio', { name: 'Nederlands' }));
    expect(await screen.findByText('Dutch books are hard to find')).toBeOnTheScreen();
    expect(urls[1]).toBe('?workId=hardcover%3A301&language=nl');
    expect(screen.getByRole('button', { name: 'Fetch it anyway' })).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(screen.queryByText('Dutch books are hard to find')).toBeNull());
    expect(screen.getByRole('button', { name: 'Fetch it now' })).toBeOnTheScreen();
  });

  it('switches to English when this work has an English edition', async () => {
    broker({
      'GET /works/hardcover:301': () => ok(work({ language: 'nl' })),
      'GET /requests/preview': (_body, _headers, url) =>
        url.searchParams.get('language') === 'nl'
          ? preview({ code: 'LOW_ODDS_LANGUAGE', englishEditionWorkId: 'hardcover:301' }, 'nl')
          : preview(null),
    });
    const user = userEvent.setup();
    await open();
    expect(screen.getByRole('radio', { name: 'Nederlands' })).toBeChecked();
    await user.press(await screen.findByRole('link', { name: 'Try the English edition instead' }));
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    await waitFor(() => expect(screen.queryByText('Dutch books are hard to find')).toBeNull());
    expect(useAddSheet.getState().workId).toBe('hardcover:301');
  });

  it('opens the English edition when it is another work', async () => {
    broker({
      'GET /requests/preview': () =>
        preview({ code: 'LOW_ODDS_LANGUAGE', englishEditionWorkId: 'hardcover:302' }),
      'GET /works/hardcover:302': () =>
        ok(work({ id: 'hardcover:302', title: 'The Salt Road (English)' })),
    });
    const user = userEvent.setup();
    await open();
    await user.press(await screen.findByRole('link', { name: 'Try the English edition instead' }));
    expect(useAddSheet.getState().workId).toBe('hardcover:302');
    expect(await screen.findByText(/The Salt Road \(English\)/)).toBeOnTheScreen();
  });

  it('speaks Dutch, with the date in Dutch', async () => {
    broker({
      'GET /requests/preview': () =>
        preview({ code: 'LOW_ODDS_NOT_FOUND', notFoundAt: '2026-11-02T12:00:00.000Z' }),
    });
    usePreferences.setState({ language: 'nl' });
    await renderWithProviders(<AddSheetHost onAdded={jest.fn()} />);
    await act(async () => useAddSheet.getState().open('hardcover:301'));
    expect(await screen.findByText('Vorige keer niet gevonden')).toBeOnTheScreen();
    expect(screen.getByText(/We zochten op 2 november/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Toch ophalen' })).toBeOnTheScreen();
  });
});

describe('defaultLanguage', () => {
  it('prefers the book, then the last pick, then the app language', () => {
    expect(defaultLanguage('nl', 'en', 'en')).toBe('nl');
    expect(defaultLanguage('de', 'nl', 'en')).toBe('nl');
    expect(defaultLanguage(null, null, 'nl')).toBe('nl');
    expect(defaultLanguage(null, null, 'fr')).toBe('en');
  });
});
