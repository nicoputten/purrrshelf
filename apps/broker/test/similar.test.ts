import { afterEach, describe, expect, it } from 'vitest';
import { SimilarWorks, TokenPair } from '@purrshelf/contract';
import { fakeProviders, hardcover, json } from './metadata-fakes.js';
import { login, makeTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

const olDoc = (id: string, title: string, author: string, language: string) => ({
  key: `/works/${id}`,
  title,
  author_name: [author],
  language: [language],
  first_publish_year: 1900,
});

/** Provider replies for author and subject searches; title searches keep the defaults. */
function relatedProviders(overrides: Parameters<typeof fakeProviders>[0] = {}) {
  return fakeProviders({
    // Hardcover's search takes one free-text query: only answer the title search.
    'hardcover:Search': (_u, init) => {
      const { variables } = JSON.parse(String(init?.body)) as { variables: { q: string } };
      return /havelaar/i.test(variables.q)
        ? json(hardcover.search)
        : json({ data: { search: { results: { hits: [] } } } });
    },
    'openlibrary:search': (u) => {
      const p = u.searchParams;
      if (p.get('author') === 'Ilse Varenkamp')
        return json({
          docs: [
            olDoc('OL901W', 'The Salt Road', 'Ilse Varenkamp', 'eng'),
            olDoc('OL902W', 'The Ember Tide', 'Ilse Varenkamp', 'eng'),
            olDoc('OL903W', 'Het Zoutpad', 'Ilse Varenkamp', 'dut'),
          ],
        });
      if (p.get('author') === 'Multatuli')
        return json({ docs: [olDoc('OL904W', 'Woutertje Pieterse', 'Multatuli', 'dut')] });
      if (p.get('subject') === 'Classics')
        return json({
          docs: [
            olDoc('OL905W', 'De Kleine Johannes', 'Frederik van Eeden', 'dut'),
            olDoc('OL906W', 'A Tale of Two Ports', 'Edda Marlow', 'eng'),
            olDoc('OL904W', 'Woutertje Pieterse', 'Multatuli', 'dut'),
          ],
        });
      return json({ docs: [] });
    },
    'googlebooks:search': () => json({ totalItems: 0 }),
    ...overrides,
  });
}

async function setup(fake = relatedProviders()) {
  ctx = await makeTestApp({ config: { HARDCOVER_API_TOKEN: 'fake-token' }, fetch: fake.fetch });
  const { accessToken } = TokenPair.parse((await login(ctx.app)).json());
  const get = (url: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  return { ...fake, get };
}

const summary = (body: SimilarWorks) => body.works.map((w) => [w.reason, w.work.title]);

describe('GET /works/:id/similar', () => {
  it('needs a login', async () => {
    await setup();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/works/hardcover:301/similar' });
    expect(res.statusCode).toBe(401);
  });

  it('lists the rest of the series (next books first), then more by the author', async () => {
    const { get } = await setup();
    const res = await get('/works/hardcover:301/similar');
    expect(res.statusCode).toBe(200);
    expect(summary(SimilarWorks.parse(res.json()))).toEqual([
      ['series', 'The Glass Harbour'],
      // The book itself and the Dutch edition (the book is English) are left out.
      ['author', 'The Ember Tide'],
    ]);
  });

  it('adds books that share a subject, without repeating the author', async () => {
    const { get } = await setup();
    const body = SimilarWorks.parse((await get('/works/hardcover:101/similar')).json());
    expect(summary(body)).toEqual([
      ['author', 'Woutertje Pieterse'],
      ['subject', 'De Kleine Johannes'],
    ]);
    expect(body.works[1]!.work.id).toBe('openlibrary:OL905W');
  });

  it('remembers suggestions so they open as books', async () => {
    const { get } = await setup();
    await get('/works/hardcover:101/similar');
    const res = await get('/works/openlibrary:OL905W');
    expect(res.json()).toMatchObject({ title: 'De Kleine Johannes' });
  });

  it('keeps the series when the related searches fail', async () => {
    const { get } = await setup(
      relatedProviders({
        'openlibrary:search': () => json({}, 500),
        'googlebooks:search': () => json({}, 500),
      }),
    );
    const body = SimilarWorks.parse((await get('/works/hardcover:301/similar')).json());
    expect(body.works.map((w) => w.reason)).toEqual(['series']);
  });

  it('stops at twelve suggestions', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      olDoc(`OL${950 + i}W`, `Classic number ${i}`, `Writer ${i}`, 'dut'),
    );
    const { get } = await setup(
      relatedProviders({
        'openlibrary:search': (u) => json({ docs: u.searchParams.get('subject') ? many : [] }),
      }),
    );
    const body = SimilarWorks.parse((await get('/works/hardcover:101/similar')).json());
    expect(body.works).toHaveLength(12);
    expect(new Set(body.works.map((w) => w.reason))).toEqual(new Set(['subject']));
  });

  it('answers NOT_FOUND for an unknown book', async () => {
    const { get } = await setup();
    expect((await get('/works/hardcover:999/similar')).json()).toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
