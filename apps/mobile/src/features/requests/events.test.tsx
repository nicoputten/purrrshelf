import { QueryClient } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { setFetch, useSession } from '@/session/session';
import { bookRequest, budgetWithIndexer, fakeBroker, ok, readers } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { RequestsScreen } from './RequestsScreen';
import {
  applyRequest,
  parseEvents,
  RECONNECT_MS,
  refreshLibraryOnDelivery,
  setEventStream,
  useLiveRequests,
  type EventStream,
} from './useRequestEvents';

jest.setTimeout(15_000);

beforeEach(async () => {
  await resetApp();
  useLiveRequests.setState({ live: false });
  useSession.setState({
    status: 'ready',
    serverUrl: 'https://shelf.example.invalid',
    accessToken: 'access-1',
  });
});

afterEach(() => setEventStream(undefined));

/** A server-sent-events stream the test writes to. */
function fakeStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const open: EventStream = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
    });
    init.signal.addEventListener('abort', () => controller.error(new Error('aborted')));
    return { ok: true, status: 200, body };
  };
  return {
    open,
    calls,
    send: (text: string) => act(async () => controller.enqueue(encoder.encode(text))),
    end: () => act(async () => controller.close()),
  };
}

function broker(list: unknown[]) {
  const b = fakeBroker({
    'GET /requests': () => ok({ requests: list }),
    'GET /readers': () => readers(),
    'GET /budget': () => budgetWithIndexer(),
  });
  setFetch(b.fetch);
  return b;
}

const render = () =>
  renderWithProviders(<RequestsScreen onPick={jest.fn()} onFindBook={jest.fn()} />);
const event = (r: unknown) => `event: request\ndata: ${JSON.stringify(r)}\n\n`;

describe('live requests', () => {
  it('follows each change as the broker sends it', async () => {
    broker([bookRequest({ status: 'searching' })]);
    const stream = fakeStream();
    setEventStream(stream.open);
    await render();
    expect(await screen.findByLabelText('Sniffing it out, now')).toBeOnTheScreen();
    expect(stream.calls[0]).toEqual({
      url: 'https://shelf.example.invalid/api/v1/requests/events',
      headers: { authorization: 'Bearer access-1', accept: 'text/event-stream' },
    });
    expect(useLiveRequests.getState().live).toBe(true);
    await stream.send(': connected\n\n');
    // An event split over two chunks.
    const text = event(bookRequest({ status: 'downloading', progress: 30 }));
    await stream.send(text.slice(0, 20));
    await stream.send(text.slice(20));
    expect(await screen.findByLabelText('Downloading, 30%, now')).toBeOnTheScreen();
    // A new request appears at the top; unknown events and bad data are ignored.
    await stream.send(event(bookRequest({ id: 'r2', title: 'Max Havelaar', status: 'searching' })));
    await stream.send('event: other\ndata: {}\n\nevent: request\ndata: {"id":1}\n\n');
    expect(await screen.findByText('Max Havelaar')).toBeOnTheScreen();
  });

  it('reconnects after the stream ends, and refreshes an expired token', async () => {
    jest.useFakeTimers();
    try {
      broker([bookRequest({ status: 'searching' })]);
      const stream = fakeStream();
      let replies = 0;
      setEventStream(async (url, init) => {
        replies += 1;
        if (replies === 2) return { ok: false, status: 503, body: null };
        return stream.open(url, init);
      });
      await render();
      await act(async () => undefined);
      expect(replies).toBe(1);
      await stream.end();
      expect(useLiveRequests.getState().live).toBe(false);
      await act(async () => jest.advanceTimersByTime(RECONNECT_MS[0]!));
      expect(replies).toBe(2);
      await act(async () => jest.advanceTimersByTime(RECONNECT_MS[1]!));
      expect(replies).toBe(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks for a fresh token on 401 instead of retrying blindly', async () => {
    const b = broker([]);
    setEventStream(async () => ({ ok: false, status: 401, body: null }));
    await render();
    await act(async () => undefined);
    expect(b.calls.filter((c) => c.route === 'GET /requests').length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseEvents', () => {
  it('splits events and keeps the unfinished rest', () => {
    expect(
      parseEvents(
        'event: request\r\ndata: {"a":1}\r\n\r\n: ping\n\ndata: x\ndata: y\n\nevent: req',
      ),
    ).toEqual({
      events: [
        { event: 'request', data: '{"a":1}' },
        { event: 'message', data: 'x\ny' },
      ],
      rest: 'event: req',
    });
  });
});

describe('library refresh', () => {
  const spyOn = () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
    return { client, invalidate };
  };

  it('reloads the library once a request reaches it', () => {
    const { client, invalidate } = spyOn();
    refreshLibraryOnDelivery(
      client,
      [{ id: 'r1', status: 'importing' }],
      [{ id: 'r1', status: 'pushed' }],
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['library', 'books'] });
  });

  it('leaves the library alone otherwise', () => {
    const { client, invalidate } = spyOn();
    refreshLibraryOnDelivery(
      client,
      [
        { id: 'r1', status: 'in_library' },
        { id: 'r2', status: 'searching' },
      ],
      [
        { id: 'r1', status: 'pushed' },
        { id: 'r2', status: 'downloading' },
        { id: 'r3', status: 'pushed' },
      ],
    );
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('notices delivery in a live event', () => {
    const { client, invalidate } = spyOn();
    client.setQueryData(['requests'], { requests: [bookRequest({ status: 'importing' })] });
    applyRequest(client, bookRequest({ status: 'in_library' }) as never);
    expect(invalidate).toHaveBeenCalledTimes(1);
    // A request seen only on its own page counts too.
    const single = spyOn();
    single.client.setQueryData(['request', 'r1'], bookRequest({ status: 'importing' }));
    applyRequest(single.client, bookRequest({ status: 'pushed' }) as never);
    expect(single.invalidate).toHaveBeenCalledTimes(1);
  });
});
