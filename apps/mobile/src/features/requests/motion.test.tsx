import { act, screen, waitFor } from '@testing-library/react-native';
import type { BookRequest } from '@purrshelf/contract';
import { setFetch, useSession } from '@/session/session';
import { bookRequest, budgetWithIndexer, fakeBroker, ok, readers } from '@/test/fakeBroker';
import { renderWithProviders, resetApp } from '@/test/utils';
import { takeOneShot } from '@/components/motion/useMotion';
import { deliveredEvent, rememberRequest, swatEvent, swatScope } from './motion';
import { RequestsScreen } from './RequestsScreen';
import { setEventStream, useLiveRequests, type EventStream } from './useRequestEvents';

jest.setTimeout(15_000);

const epub = { id: 'rel-1', title: 'Salt EPUB', format: 'epub', size: 1_400_000, language: 'en' };
const other = { ...epub, id: 'rel-2' };

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

/** A live stream the test writes to; the list the broker answers follows each event. */
function live(first: unknown) {
  let current = first;
  const b = fakeBroker({
    'GET /requests': () => ok({ requests: [current] }),
    'GET /readers': () => readers(),
    'GET /budget': () => budgetWithIndexer(),
  });
  setFetch(b.fetch);
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const open: EventStream = async (_url, init) => {
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
    });
    init.signal.addEventListener('abort', () => controller.error(new Error('aborted')));
    return { ok: true, status: 200, body };
  };
  setEventStream(open);
  return {
    send: (r: unknown) => {
      current = r;
      return act(async () =>
        controller.enqueue(encoder.encode(`event: request\ndata: ${JSON.stringify(r)}\n\n`)),
      );
    },
  };
}

const render = () =>
  renderWithProviders(<RequestsScreen onPick={jest.fn()} onFindBook={jest.fn()} />);
const swats = () => screen.queryAllByTestId('swat');
/** Waits for the live event to land: the stream is read outside the test's act(). */
const settle = (label: string | RegExp) => screen.findAllByLabelText(label);
const deliveries = () => screen.queryAllByTestId('delivered');

describe('request card motion', () => {
  it('swats once when a release is grabbed, then collapses into the step list', async () => {
    const stream = live(bookRequest({ status: 'searching' }));
    await render();
    expect(await screen.findByLabelText('Sniffing it out, now')).toBeOnTheScreen();
    expect(swats()).toHaveLength(0);

    await stream.send(bookRequest({ status: 'downloading', progress: 0, release: epub }));
    await waitFor(() => expect(swats()).toHaveLength(1));
    // The step list stays under it, with the trotting cat on the bar.
    expect(screen.getByLabelText('Downloading, 0%, now')).toBeOnTheScreen();
    expect(screen.getByTestId('trot')).toBeOnTheScreen();

    // Progress events re-render the card but never replay the swat.
    await stream.send(bookRequest({ status: 'downloading', progress: 40, release: epub }));
    await settle('Downloading, 40%, now');
    expect(swats()).toHaveLength(1);
    await waitFor(() => expect(swats()).toHaveLength(0), { timeout: 4000 });
    await stream.send(bookRequest({ status: 'downloading', progress: 60, release: epub }));
    await settle('Downloading, 60%, now');
    expect(swats()).toHaveLength(0);

    // Pick another grabs a new release: that is a new event.
    await stream.send(bookRequest({ status: 'downloading', progress: 0, release: other }));
    await waitFor(() => expect(swats()).toHaveLength(1));
  });

  it('does not swat for a download that was already running when the screen opened', async () => {
    live(bookRequest({ status: 'downloading', progress: 30, release: epub }));
    await render();
    expect(await screen.findByLabelText('Downloading, 30%, now')).toBeOnTheScreen();
    expect(swats()).toHaveLength(0);
  });

  it('never replays a swat when coming back to the screen', async () => {
    const stream = live(bookRequest({ status: 'searching' }));
    const first = await render();
    await screen.findByLabelText('Sniffing it out, now');
    await stream.send(bookRequest({ status: 'downloading', progress: 0, release: epub }));
    await waitFor(() => expect(swats()).toHaveLength(1));
    await first.unmount();

    live(bookRequest({ status: 'downloading', progress: 10, release: epub }));
    await render();
    expect(await screen.findByLabelText('Downloading, 10%, now')).toBeOnTheScreen();
    expect(swats()).toHaveLength(0);
  });

  it('plays Delivered once when the push is confirmed', async () => {
    const stream = live(bookRequest({ status: 'importing', release: epub }));
    const first = await render();
    await settle(/Adding to the library/);
    await stream.send(bookRequest({ status: 'pushed', release: epub }));
    expect(await screen.findByText('On your Kobo')).toBeOnTheScreen();
    await waitFor(() => expect(deliveries()).toHaveLength(1));
    await stream.send(bookRequest({ status: 'pushed', release: epub, progress: 100 }));
    expect(deliveries()).toHaveLength(1);
    await first.unmount();

    live(bookRequest({ status: 'pushed', release: epub }));
    await render();
    expect(await screen.findByText('On your Kobo')).toBeOnTheScreen();
    expect(deliveries()).toHaveLength(0);
  });

  it('naps while not found or waiting for the daily budget', async () => {
    const stream = live(bookRequest({ status: 'not_found', searches: 4, searchedOn: ['Primary'] }));
    await render();
    expect(await screen.findByText('Couldn’t sniff this one out')).toBeOnTheScreen();
    expect(screen.getByTestId('nap', { includeHiddenElements: true })).toBeOnTheScreen();
    await stream.send(bookRequest({ status: 'waiting_budget' }));
    await settle(/Waiting for a free search/);
    expect(screen.getByTestId('nap', { includeHiddenElements: true })).toBeOnTheScreen();
    await stream.send(bookRequest({ status: 'searching' }));
    await settle('Sniffing it out, now');
    expect(screen.queryByTestId('nap', { includeHiddenElements: true })).toBeNull();
  });
});

describe('request motion events', () => {
  const r = (over: Partial<BookRequest>) => bookRequest(over) as BookRequest;

  it('names a grab by its release and a push by its status', () => {
    expect(swatEvent(r({ status: 'searching' }))).toBeNull();
    expect(swatEvent(r({ status: 'downloading', release: epub } as Partial<BookRequest>))).toBe(
      'rel-1',
    );
    expect(swatEvent(r({ status: 'downloading', release: null }))).toBe('grabbed');
    expect(deliveredEvent(r({ status: 'in_library' }))).toBeNull();
    expect(deliveredEvent(r({ status: 'pushed' }))).toBe('pushed');
  });

  it('remembers a request the app just added, so its first grab plays', () => {
    const added = r({ status: 'searching' });
    rememberRequest(added);
    const grabbed = r({ status: 'downloading', release: epub } as Partial<BookRequest>);
    expect(takeOneShot(swatScope(grabbed), swatEvent(grabbed))).toBe(true);
  });
});
