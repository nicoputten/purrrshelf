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
    expect(screen.getByText('21 of 25 searches left this hour.')).toBeOnTheScreen();
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
        ok(work({ library: { itemId: 'item-1', owners: [], onMyKobo: false } })),
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

describe('defaultLanguage', () => {
  it('prefers the book, then the last pick, then the app language', () => {
    expect(defaultLanguage('nl', 'en', 'en')).toBe('nl');
    expect(defaultLanguage('de', 'nl', 'en')).toBe('nl');
    expect(defaultLanguage(null, null, 'nl')).toBe('nl');
    expect(defaultLanguage(null, null, 'fr')).toBe('en');
  });
});
