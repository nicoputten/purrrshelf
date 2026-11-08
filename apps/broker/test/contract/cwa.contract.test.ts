/**
 * Contract tests against a real CWA v4.0.8 set up by `cwa-fixture.ts`.
 * Skipped unless CWA_STACK_DIR points at a running fixture (CI job "CWA contract").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { CwaWebSession } from '../../src/modules/library/cwa-web.js';
import { FIXTURE_BOOKS } from '../fixtures/epub.js';
import { loadFixture, type CwaFixture } from './fixture-file.js';

const fixture = loadFixture();

describe.skipIf(!fixture)('CwaAdapter against CWA v4.0.8', () => {
  // Collected even when skipped, so give the destructuring something to work on.
  const f = fixture ?? ({ readers: [], bookIds: [] } as unknown as CwaFixture);
  const [readerA, readerB] = f.readers;
  const [bookA, bookB] = f.bookIds;
  let adapter: CwaAdapter;

  beforeAll(() => {
    adapter = new CwaAdapter({
      baseUrl: f.baseUrl,
      serviceUser: f.service.username,
      servicePassword: f.service.password,
      koboShelfName: f.koboShelfName,
      metadataDbPath: f.metadataDbPath,
      appDbPath: f.appDbPath,
    });
  });
  afterAll(() => adapter.close());

  it('logs in as the service account', async () => {
    await expect(adapter.ping()).resolves.toBeUndefined();
  });

  it('rejects a wrong service password', async () => {
    const session = new CwaWebSession({
      baseUrl: f.baseUrl,
      username: f.service.username,
      password: 'Wrong-password-1!',
    });
    await expect(session.login()).rejects.toMatchObject({ code: 'LIBRARY_UNAVAILABLE' });
  });

  it('reads the imported fixture books from metadata.db (EPUB, not KEPUB)', async () => {
    const book = await adapter.getBook(bookA!);
    expect(book).toMatchObject({
      title: FIXTURE_BOOKS[0]!.title,
      authors: [FIXTURE_BOOKS[0]!.author],
      isbns: [FIXTURE_BOOKS[0]!.isbn],
      series: FIXTURE_BOOKS[0]!.series,
      formats: ['EPUB'],
    });
    const byIsbn = await adapter.findBooks({ isbns: [FIXTURE_BOOKS[1]!.isbn] });
    expect(byIsbn.map((b) => b.id)).toEqual([bookB]);
    const byRequest = await adapter.findBooks({
      identifier: { type: 'kobopush', value: FIXTURE_BOOKS[0]!.requestId! },
    });
    expect(byRequest.map((b) => b.id)).toEqual([bookA]);
    const byAuthor = await adapter.findBooks({ author: 'quillfeather' });
    expect(byAuthor.map((b) => b.id)).toEqual([bookA]);
  });

  it('resolves each reader’s own Kobo shelf at runtime', () => {
    const a = adapter.resolveKoboShelf(readerA!);
    const b = adapter.resolveKoboShelf(readerB!);
    expect(a.name).toBe('Kobo');
    expect(b.name).toBe('Kobo');
    expect(a.userId).toBe(readerA!.cwaUserId);
    expect(b.userId).toBe(readerB!.cwaUserId);
    expect(a.id).not.toBe(b.id);
  });

  it('reports a user without a Kobo shelf clearly', () => {
    expect(() => adapter.resolveKoboShelf({ cwaUserId: 1 })).toThrow(
      expect.objectContaining({ code: 'KOBO_SHELF_MISSING' }),
    );
  });

  it('adds to and removes from one reader’s Kobo shelf only', async () => {
    await adapter.addToKoboShelf(readerA!, bookA!);
    await adapter.addToKoboShelf(readerA!, bookA!); // idempotent
    expect(await adapter.getDeviceState(readerA!, bookA!)).toEqual({
      onKoboShelf: true,
      syncedToDevice: false,
    });
    expect((await adapter.getDeviceState(readerB!, bookA!)).onKoboShelf).toBe(false);

    await adapter.addToKoboShelf(readerB!, bookA!);
    await adapter.removeFromKoboShelf(readerA!, bookA!);
    await adapter.removeFromKoboShelf(readerA!, bookA!); // idempotent
    expect((await adapter.getDeviceState(readerA!, bookA!)).onKoboShelf).toBe(false);
    expect((await adapter.getDeviceState(readerB!, bookA!)).onKoboShelf).toBe(true);
    await adapter.removeFromKoboShelf(readerB!, bookA!);
  });

  it('reads an untouched book as unread', async () => {
    expect(await adapter.getReadingState(readerA!, bookA!)).toEqual({
      status: 'unread',
      progressPercent: null,
      spentReadingMinutes: null,
      remainingMinutes: null,
      lastModified: null,
    });
  });

  it('deletes a book through CWA as the service account', async () => {
    await adapter.deleteBook(bookB!);
    expect(await adapter.getBook(bookB!)).toBeNull();
    await expect(adapter.deleteBook(bookB!)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
