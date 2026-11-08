import { act, screen, userEvent } from '@testing-library/react-native';
import type { KoboState } from '@purrshelf/contract';
import { setFetch, useSession } from '@/session/session';
import { apiError, fakeBroker, ok } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { KoboCard, koboAction } from './KoboCard';
import { optimisticState } from './useKobos';

// See book.test.tsx: a cold first render can be slow on CI.
jest.setTimeout(15_000);

beforeEach(async () => {
  await resetApp();
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

const kobos = (mine: KoboState, partner: KoboState = 'not_on_device') => ({
  kobos: [
    { userId: 'u1', displayName: 'Reader One', me: true, state: mine },
    { userId: 'u2', displayName: 'Reader Two', me: false, state: partner },
  ],
});

type Reply = ReturnType<typeof ok> | ReturnType<typeof apiError>;

function render(
  initial = kobos('not_on_device'),
  { send, remove }: { send?: () => Reply; remove?: () => Reply } = {},
) {
  let release: (() => void) | undefined;
  const gate = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const b = fakeBroker({
    'GET /library/items/00000000-0000-4000-8000-000000000001/kobos': () => ok(initial),
    'PUT /library/items/00000000-0000-4000-8000-000000000001/kobos/u1': () =>
      (send ?? (() => ok(kobos('sending'))))(),
    'PUT /library/items/00000000-0000-4000-8000-000000000001/kobos/u2': () =>
      (send ?? (() => ok(kobos('not_on_device', 'sending'))))(),
    'DELETE /library/items/00000000-0000-4000-8000-000000000001/kobos/u1': () =>
      (remove ?? (() => ok(kobos('removing'))))(),
  });
  // Hold the broker's answer so the optimistic state can be seen.
  const fetch: typeof b.fetch = async (url, init) => {
    if (init.method !== 'GET') await gate();
    return b.fetch(url, init);
  };
  setFetch(fetch);
  return {
    b,
    view: renderWithProviders(<KoboCard itemId="00000000-0000-4000-8000-000000000001" />),
    answer: () => act(async () => release?.()),
  };
}

describe('KoboCard', () => {
  it('shows each Kobo with its state and one action', async () => {
    const { view } = render(kobos('on_device', 'sending'));
    await view;
    expect(await screen.findByText('Your Kobo')).toBeOnTheScreen();
    expect(screen.getByText('On the device')).toBeOnTheScreen();
    expect(screen.getByText('Reader Two’s Kobo')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for next sync')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove from Your Kobo' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove from Reader Two’s Kobo' })).toBeOnTheScreen();
  });

  it('has no action for a Kobo that is not set up', async () => {
    const { view } = render(kobos('not_on_device', 'not_set_up'));
    await view;
    expect(await screen.findByText('Not set up yet')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Reader Two/ })).toBeNull();
  });

  it('sends to my Kobo, shows waiting for next sync at once, then the broker’s answer', async () => {
    const { view, answer, b } = render();
    await view;
    await userEvent.press(await screen.findByRole('button', { name: 'Send to Your Kobo' }));
    expect(await screen.findByText('Waiting for next sync')).toBeOnTheScreen();
    await answer();
    expect(b.calls.map((c) => c.route)).toContain(
      'PUT /library/items/00000000-0000-4000-8000-000000000001/kobos/u1',
    );
    expect(await screen.findByRole('button', { name: 'Remove from Your Kobo' })).toBeOnTheScreen();
    expect(screen.getByText('Waiting for next sync')).toBeOnTheScreen();
  });

  it('sends to my partner’s Kobo', async () => {
    const { view, answer, b } = render();
    await view;
    await userEvent.press(await screen.findByRole('button', { name: 'Send to Reader Two’s Kobo' }));
    await answer();
    expect(b.calls.map((c) => c.route)).toContain(
      'PUT /library/items/00000000-0000-4000-8000-000000000001/kobos/u2',
    );
    expect(
      await screen.findByRole('button', { name: 'Remove from Reader Two’s Kobo' }),
    ).toBeOnTheScreen();
  });

  it('removes from my Kobo', async () => {
    const { view, answer } = render(kobos('on_device'));
    await view;
    await userEvent.press(await screen.findByRole('button', { name: 'Remove from Your Kobo' }));
    expect(await screen.findByText('Leaves at next sync')).toBeOnTheScreen();
    await answer();
    expect(await screen.findByRole('button', { name: 'Send to Your Kobo' })).toBeOnTheScreen();
  });

  it('rolls back and explains when the broker refuses', async () => {
    const { view, answer } = render(kobos('not_on_device'), {
      send: () => apiError(409, 'KOBO_SYNC_NOT_SET_UP'),
    });
    await view;
    await userEvent.press(await screen.findByRole('button', { name: 'Send to Your Kobo' }));
    expect(await screen.findByText('Waiting for next sync')).toBeOnTheScreen();
    await answer();
    expect(
      await screen.findByText('Kobo sync is not set up for your account yet. Ask the admin.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Waiting for next sync')).toBeNull();
    expect(screen.getAllByText('Not on the device')).toHaveLength(2);
  });

  it('shows a load error with a retry', async () => {
    const b = fakeBroker({
      'GET /library/items/00000000-0000-4000-8000-000000000001/kobos': () =>
        apiError(502, 'LIBRARY_UNAVAILABLE'),
    });
    setFetch(b.fetch);
    await renderWithProviders(<KoboCard itemId="00000000-0000-4000-8000-000000000001" />);
    expect(
      await screen.findByText('The library server is not answering. Try again later.'),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(b.calls.filter((c) => c.route.startsWith('GET'))).toHaveLength(2);
  });
});

describe('Kobo state helpers', () => {
  it.each([
    ['send', 'not_on_device', 'sending'],
    ['send', 'removing', 'on_device'],
    ['remove', 'on_device', 'removing'],
    ['remove', 'sending', 'not_on_device'],
  ] as const)('%s from %s shows %s', (action, from, to) => {
    expect(optimisticState(action, from)).toBe(to);
  });

  it.each([
    ['on_device', 'remove'],
    ['sending', 'remove'],
    ['removing', 'send'],
    ['not_on_device', 'send'],
    ['not_set_up', null],
  ] as const)('%s offers %s', (state, action) => {
    expect(koboAction(state)).toBe(action);
  });
});
