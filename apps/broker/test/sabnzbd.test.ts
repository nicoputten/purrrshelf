import { describe, expect, it } from 'vitest';
import { SabnzbdClient, SabnzbdError } from '../src/modules/sabnzbd/client.js';

const config = {
  url: 'http://sabnzbd.example.invalid:8080/',
  apiKey: 'fake-sab-key',
  category: 'kobopush',
};

interface Call {
  url: URL;
  init: RequestInit;
}

function fake(replies: Record<string, unknown | (() => Response)>) {
  const calls: Call[] = [];
  const fetch = async (input: string, init: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, init });
    const reply = replies[url.searchParams.get('mode') ?? ''];
    if (typeof reply === 'function') return (reply as () => Response)();
    return Response.json(reply ?? { status: false, error: 'not faked' });
  };
  return { client: new SabnzbdClient(config, fetch), calls };
}

describe('SabnzbdClient', () => {
  it('uploads an NZB into the category and returns the job id', async () => {
    const { client, calls } = fake({ addfile: { status: true, nzo_ids: ['SABnzbd_nzo_1'] } });
    expect(await client.add(Buffer.from('<nzb/>'), 'request-1')).toBe('SABnzbd_nzo_1');
    const { url, init } = calls[0]!;
    expect(url.origin + url.pathname).toBe('http://sabnzbd.example.invalid:8080/api');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: 'addfile',
      cat: 'kobopush',
      nzbname: 'request-1',
      output: 'json',
      apikey: 'fake-sab-key',
    });
    expect(init.method).toBe('POST');
    const file = (init.body as FormData).get('name') as File;
    expect(file.name).toBe('request-1.nzb');
    expect(await file.text()).toBe('<nzb/>');
  });

  it('keeps a .nzb name as it is', async () => {
    const { client, calls } = fake({ addfile: { status: true, nzo_ids: ['x'] } });
    await client.add(Buffer.from(''), 'a.nzb');
    expect(((calls[0]!.init.body as FormData).get('name') as File).name).toBe('a.nzb');
  });

  it.each([{ status: true, nzo_ids: [] }, { status: true }, { nope: 1 }])(
    'fails when SABnzbd does not accept the NZB (%j)',
    async (reply) => {
      const { client } = fake({ addfile: reply });
      await expect(client.add(Buffer.from(''), 'x')).rejects.toThrow('did not accept');
    },
  );

  it.each([
    ['Downloading', 'downloading'],
    ['Paused', 'paused'],
    ['Queued', 'queued'],
  ])('reports a %s queue slot', async (status, state) => {
    const { client } = fake({
      queue: { queue: { slots: [{ nzo_id: 'n1', status, percentage: '42' }] } },
    });
    expect(await client.status('n1')).toEqual({ state, percentage: 42 });
  });

  it('treats a bad percentage as 0', async () => {
    const { client } = fake({
      queue: { queue: { slots: [{ nzo_id: 'n1', status: 'Downloading', percentage: 'x' }] } },
    });
    expect(await client.status('n1')).toEqual({ state: 'downloading', percentage: 0 });
  });

  it.each([
    [
      { status: 'Completed', storage: '/downloads/kobopush/Book' },
      { state: 'completed', storage: '/downloads/kobopush/Book' },
    ],
    [
      { status: 'Completed', storage: null },
      { state: 'failed', message: 'SABnzbd finished without a download folder' },
    ],
    [
      { status: 'Failed', fail_message: 'Repair failed' },
      { state: 'failed', message: 'Repair failed' },
    ],
    [
      { status: 'Failed', fail_message: '' },
      { state: 'failed', message: 'Download failed' },
    ],
    [{ status: 'Extracting' }, { state: 'processing' }],
    [{ status: 'Weird' }, { state: 'failed', message: 'Unexpected SABnzbd status Weird' }],
  ])('reads history %j', async (slot, expected) => {
    const { client } = fake({
      queue: { queue: { slots: [] } },
      history: { history: { slots: [{ nzo_id: 'n1', ...slot }] } },
    });
    expect(await client.status('n1')).toEqual(expected);
  });

  it('reports a job SABnzbd no longer knows', async () => {
    const { client } = fake({
      queue: { queue: { slots: [] } },
      history: { history: { slots: [] } },
    });
    expect(await client.status('n1')).toEqual({ state: 'missing' });
  });

  it.each([
    [{ queue: { nope: 1 } }, /queue reply/],
    [{ queue: { queue: { slots: [] } }, history: { nope: 1 } }, /history reply/],
  ])('rejects malformed replies', async (replies, message) => {
    const { client } = fake(replies);
    await expect(client.status('n1')).rejects.toThrow(message);
  });

  it('deletes a job and pings', async () => {
    const { client, calls } = fake({ queue: { status: true }, version: { version: '4.4.0' } });
    await client.remove('n1');
    await client.ping();
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toMatchObject({
      mode: 'queue',
      name: 'delete',
      value: 'n1',
    });
    expect(calls[1]!.url.searchParams.get('mode')).toBe('version');
  });

  it.each([
    [
      'an API error',
      { version: { status: false, error: 'API Key Incorrect' } },
      'SABnzbd: API Key Incorrect',
    ],
    ['HTTP errors', { version: () => new Response('no', { status: 503 }) }, 'HTTP 503'],
    ['non-JSON', { version: () => new Response('<html>') }, 'not JSON'],
  ])('reports %s', async (_l, replies, message) => {
    const { client } = fake(replies);
    const err = await client.ping().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SabnzbdError);
    expect((err as Error).message).toContain(message);
  });

  it('reports an unreachable SABnzbd', async () => {
    const client = new SabnzbdClient(config, () => Promise.reject(new Error('ECONNREFUSED')));
    await expect(client.ping()).rejects.toThrow('SABnzbd not reachable');
  });
});
