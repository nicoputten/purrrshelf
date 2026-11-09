import { render as rtlRender, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { Recommendation, Recommendations } from '@purrshelf/contract';
import { AppProviders } from '@/components/AppProviders';
import { recommendationsKey } from '@/features/forYou/useRecommendations';
import { i18n } from '@/i18n';
import { setFetch, useSession } from '@/session/session';
import { fakeBroker, hit, ok, work } from '@/test/fakeBroker';
import { resetApp, testQueryClient } from '@/test/utils';
import { BookDetailScreen } from './BookDetailScreen';
import { bannerText, instantFrom } from './forYou';

jest.setTimeout(15_000);

const ITEM = '00000000-0000-4000-8000-000000000001';
const partner = { id: 'u2', displayName: 'Reader Two' };
const partnerLibrary = {
  itemId: ITEM,
  owners: [{ ...partner, me: false }],
  onMyKobo: false,
  reading: null,
};
const mineLibrary = {
  ...partnerLibrary,
  owners: [
    { ...partner, me: false },
    { id: 'u1', displayName: 'Reader One', me: true },
  ],
};

function rec(over: Partial<Recommendation> = {}): Recommendation {
  return {
    work: hit({ library: partnerLibrary }) as Recommendation['work'],
    reason: { kind: 'partner_shelf', partner, partnerFinished: true },
    isNew: false,
    request: null,
    ...over,
  };
}

function recommendations(item: Recommendation): Recommendations {
  return {
    rows: [{ kind: item.reason.kind, partner: null, items: [item] }],
    readingData: true,
    computedAt: '2026-11-09T12:00:00.000Z',
    stale: false,
  };
}

type Kobo = { userId: string; displayName: string; me: boolean; state: string };
const myKobo = (state = 'not_on_device'): Kobo => ({
  userId: 'u1',
  displayName: 'Reader One',
  me: true,
  state,
});

async function render({
  item = rec(),
  detail = work({ library: partnerLibrary }) as unknown,
  fromForYou = true,
  cached = true,
  kobos = [myKobo()],
  keep = () => ok({ itemId: ITEM, owners: mineLibrary.owners, deleteAfter: null }),
}: {
  item?: Recommendation;
  detail?: unknown;
  fromForYou?: boolean;
  cached?: boolean;
  kobos?: Kobo[];
  keep?: () => { status: number; body: unknown };
} = {}) {
  let current = detail;
  const b = fakeBroker({
    'GET /works/hardcover:301': () => ok(current),
    'GET /works/hardcover:301/series': () => ok({ series: null, entries: [] }),
    'GET /works/hardcover:301/similar': () => ok({ works: [] }),
    [`GET /library/items/${ITEM}/kobos`]: () => ok({ kobos }),
    [`PUT /library/items/${ITEM}/owners/me`]: () => {
      const res = keep();
      if (res.status === 200) current = work({ library: mineLibrary });
      return res;
    },
    [`PUT /library/items/${ITEM}/kobos/u1`]: () => ok({ kobos: [{ ...myKobo('sending') }] }),
  });
  setFetch(b.fetch);
  const client = testQueryClient();
  if (cached) client.setQueryData(recommendationsKey, recommendations(item));
  const onAdd = jest.fn();
  await rtlRender(
    <AppProviders queryClient={client}>
      <BookDetailScreen
        id="hardcover:301"
        onBack={jest.fn()}
        onOpen={jest.fn()}
        onAdd={onAdd}
        fromForYou={fromForYou}
      />
    </AppProviders>,
  );
  return { b, onAdd };
}

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

describe('Book page from For you (APP-13)', () => {
  it('shows the ginger reason banner for a partner’s finished book', async () => {
    await render();
    expect(
      await screen.findByText('For you · From Reader Two’s shelf, Reader Two finished it'),
    ).toBeOnTheScreen();
  });

  it('says only whose shelf it is when the partner hasn’t finished it', async () => {
    await render({
      item: rec({ reason: { kind: 'partner_shelf', partner, partnerFinished: false } }),
    });
    expect(await screen.findByText('For you · From Reader Two’s shelf')).toBeOnTheScreen();
  });

  it('shows no banner when not opened from For you', async () => {
    await render({ fromForYou: false });
    expect(await screen.findByRole('header', { name: 'The Salt Road' })).toBeOnTheScreen();
    expect(screen.queryByText(/^For you/)).toBeNull();
    // The normal card for someone else's library book.
    expect(screen.getByRole('button', { name: 'Add to my library' })).toBeOnTheScreen();
    expect(screen.queryByText(/already has the file/)).toBeNull();
  });

  it('shows no banner when nothing is cached for the book', async () => {
    await render({ cached: false });
    expect(await screen.findByRole('header', { name: 'The Salt Road' })).toBeOnTheScreen();
    expect(screen.queryByText(/^For you/)).toBeNull();
  });

  it('offers the instant add, sending to my Kobo by default', async () => {
    const { b } = await render();
    expect(await screen.findByText(/Reader Two already has the file\./)).toBeOnTheScreen();
    expect(screen.getByText('Uses no searches and no downloads.')).toBeOnTheScreen();
    const toggle = await screen.findByRole('checkbox', { name: 'Also send to your Kobo' });
    expect(toggle).toBeChecked();
    // The Kobo card is replaced by the instant card.
    expect(screen.queryByText('Reader Two’s Kobo')).toBeNull();

    await userEvent.press(screen.getByRole('button', { name: 'Add to my library' }));
    await waitFor(() =>
      expect(b.calls.map((c) => c.route)).toEqual(
        expect.arrayContaining([
          `PUT /library/items/${ITEM}/owners/me`,
          `PUT /library/items/${ITEM}/kobos/u1`,
        ]),
      ),
    );
    const routes = b.calls.map((c) => c.route);
    expect(routes.indexOf(`PUT /library/items/${ITEM}/owners/me`)).toBeLessThan(
      routes.indexOf(`PUT /library/items/${ITEM}/kobos/u1`),
    );
    // Never a search or a request: it's the partner's file.
    expect(
      routes.some((r) => r.startsWith('POST /requests') || r.startsWith('GET /discover')),
    ).toBe(false);
    // Now mine: the normal library card comes back.
    expect(await screen.findByRole('button', { name: 'Remove from my library' })).toBeOnTheScreen();
  });

  it('only keeps the book when I untick the Kobo', async () => {
    const { b } = await render();
    await userEvent.press(await screen.findByRole('checkbox', { name: 'Also send to your Kobo' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await userEvent.press(screen.getByRole('button', { name: 'Add to my library' }));
    await screen.findByRole('button', { name: 'Remove from my library' });
    const routes = b.calls.map((c) => c.route);
    expect(routes).toContain(`PUT /library/items/${ITEM}/owners/me`);
    expect(routes).not.toContain(`PUT /library/items/${ITEM}/kobos/u1`);
  });

  it('hides the Kobo choice when my Kobo is not set up', async () => {
    const { b } = await render({ kobos: [myKobo('not_set_up')] });
    expect(await screen.findByText(/already has the file/)).toBeOnTheScreen();
    await waitFor(() =>
      expect(b.calls.map((c) => c.route)).toContain(`GET /library/items/${ITEM}/kobos`),
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Add to my library' }));
    await screen.findByRole('button', { name: 'Remove from my library' });
    expect(b.calls.map((c) => c.route)).not.toContain(`PUT /library/items/${ITEM}/kobos/u1`);
  });

  it('shows the broker’s error when the add fails', async () => {
    await render({
      keep: () => ({ status: 409, body: { code: 'KOBO_NOT_LINKED', message: 'no' } }),
    });
    await userEvent.press(await screen.findByRole('button', { name: 'Add to my library' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Kobo is not linked to the library yet. Ask the admin.',
    );
  });

  it('keeps the normal Add for a book nobody has yet', async () => {
    const item = rec({
      work: hit() as Recommendation['work'],
      reason: {
        kind: 'author',
        author: 'Ilse Varenkamp',
        basis: 'finished',
        count: 2,
        title: null,
      },
    });
    const { onAdd } = await render({ item, detail: work() });
    expect(await screen.findByText(/^For you · /)).toBeOnTheScreen();
    expect(screen.queryByText(/already has the file/)).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Add to library' }));
    expect(onAdd).toHaveBeenCalledWith('hardcover:301');
  });
});

describe('For you helpers', () => {
  const t = i18n.t.bind(i18n);

  it('builds the banner from the shared reason line for other rows', () => {
    const item = rec({
      reason: {
        kind: 'next_in_series',
        series: { name: 'Lantern Keepers', position: 2 },
        after: { title: 'The Salt Road', position: 1, basis: 'finished' },
      },
    });
    expect(bannerText(item, t)).toMatch(/^For you · .+/);
  });

  it('is instant only for a library book I don’t own yet', () => {
    expect(instantFrom(rec(), partnerLibrary)).toBe('Reader Two');
    expect(instantFrom(rec(), mineLibrary)).toBeNull();
    expect(instantFrom(rec(), null)).toBeNull();
    expect(instantFrom(rec(), { ...partnerLibrary, owners: [] })).toBeNull();
    // Another owner than the suggested partner: name whoever has it.
    const other = {
      ...partnerLibrary,
      owners: [{ id: 'u3', displayName: 'Reader Three', me: false }],
    };
    expect(instantFrom(rec(), other)).toBe('Reader Three');
  });

  it('has Dutch strings', async () => {
    await i18n.changeLanguage('nl');
    expect(bannerText(rec(), t)).toBe(
      'Voor jou · Uit de kast van Reader Two, Reader Two heeft het uit',
    );
  });
});
