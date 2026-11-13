/**
 * Contract tests against a real CWA v4.0.8 set up by `cwa-fixture.ts`.
 * Skipped unless CWA_STACK_DIR points at a running fixture (CI job "CWA contract").
 *
 * With CWA_READONLY_DIR set to a read-only bind mount of CWA_STACK_DIR, the
 * adapter reads metadata.db and app.db through that mount, the way the broker
 * container does on the server (ADR 0022).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { CwaWebSession } from '../../src/modules/library/cwa-web.js';
import { FIXTURE_BOOKS } from '../fixtures/epub.js';
import { loadFixture, type CwaFixture } from './fixture-file.js';

const fixture = loadFixture();
const readonlyDir = process.env.CWA_READONLY_DIR;
const stackDir = process.env.CWA_STACK_DIR ?? '';
/** The path as the broker sees it: through the read-only mount when there is one. */
const viaMount = (path: string) =>
  readonlyDir ? join(readonlyDir, relative(stackDir, path)) : path;
const composeFile = fileURLToPath(
  new URL('../../../../test/stack/docker-compose.yml', import.meta.url),
);

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
      metadataDbPath: viaMount(f.metadataDbPath),
      appDbPath: viaMount(f.appDbPath),
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
      deliveredToDevice: false,
    });
    expect((await adapter.getDeviceState(readerB!, bookA!)).onKoboShelf).toBe(false);

    await adapter.addToKoboShelf(readerB!, bookA!);
    await adapter.removeFromKoboShelf(readerA!, bookA!);
    await adapter.removeFromKoboShelf(readerA!, bookA!); // idempotent
    expect((await adapter.getDeviceState(readerA!, bookA!)).onKoboShelf).toBe(false);
    expect((await adapter.getDeviceState(readerB!, bookA!)).onKoboShelf).toBe(true);
    await adapter.removeFromKoboShelf(readerB!, bookA!);
  });

  it('needs off the shelf and back on to resend a book a Kobo never got (ADR 0046)', async () => {
    const token = adapter.appDb.koboToken(readerA!.cwaUserId)!;
    const book = (await adapter.getBook(bookB!))!;
    const kobo = (path: string, headers: Record<string, string> = {}) =>
      fetch(new URL(`/kobo/${token}${path}`, f.baseUrl), { headers });
    // A Kobo sends back the sync token from its last sync, like a real one.
    let syncToken: string | null = null;
    const sync = async (): Promise<string[]> => {
      const res = await kobo(
        '/v1/library/sync',
        syncToken ? { 'x-kobo-synctoken': syncToken } : {},
      );
      expect(res.status).toBe(200);
      syncToken = res.headers.get('x-kobo-synctoken') ?? syncToken;
      const items = (await res.json()) as Record<
        string,
        { BookEntitlement?: { Id: string; IsRemoved?: boolean } }
      >[];
      return items
        .flatMap((i) => [i.NewEntitlement, i.ChangedEntitlement])
        .flatMap((e) =>
          e?.BookEntitlement && !e.BookEntitlement.IsRemoved ? [e.BookEntitlement.Id] : [],
        );
    };
    const state = () => adapter.getDeviceState(readerA!, bookB!);

    await sync();
    await adapter.addToKoboShelf(readerA!, bookB!);
    // This reply is "lost": CWA marks the book synced anyway.
    expect(await sync()).toContain(book.uuid);
    expect(await state()).toEqual({
      onKoboShelf: true,
      syncedToDevice: true,
      deliveredToDevice: false,
    });
    expect(await sync()).not.toContain(book.uuid);

    await adapter.removeFromKoboShelf(readerA!, bookB!);
    await sync(); // clears CWA's mark
    expect((await state()).syncedToDevice).toBe(false);
    await adapter.addToKoboShelf(readerA!, bookB!);
    expect(await sync()).toContain(book.uuid);

    // The Kobo fetches the file: now it counts as delivered.
    const file = await kobo(`/download/${bookB!}/epub`);
    expect(file.status).toBe(200);
    await file.arrayBuffer();
    expect(await state()).toEqual({
      onKoboShelf: true,
      syncedToDevice: true,
      deliveredToDevice: true,
    });
    expect(await adapter.listKoboSync(readerA!)).toContainEqual({
      bookId: bookB!,
      ...(await state()),
    });

    await adapter.removeFromKoboShelf(readerA!, bookB!);
    await sync();
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

  it.skipIf(!readonlyDir)('reads through a mount the broker cannot write to', () => {
    expect(() => writeFileSync(viaMount(join(stackDir, 'config', 'probe')), '')).toThrow(/EROFS/);
  });

  it('keeps up with CWA writing app.db while it reads', async () => {
    for (let i = 0; i < 15; i++) {
      await adapter.addToKoboShelf(readerA!, bookA!);
      expect((await adapter.getDeviceState(readerA!, bookA!)).onKoboShelf).toBe(true);
      await adapter.removeFromKoboShelf(readerA!, bookA!);
      expect((await adapter.getDeviceState(readerA!, bookA!)).onKoboShelf).toBe(false);
    }
  });

  it('deletes a book through CWA as the service account', async () => {
    await adapter.deleteBook(bookB!);
    expect(await adapter.getBook(bookB!)).toBeNull();
    await expect(adapter.deleteBook(bookB!)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('still reads after CWA restarts', { timeout: 240_000 }, async () => {
    execFileSync('docker', ['compose', '-f', composeFile, 'restart', 'cwa'], { stdio: 'ignore' });
    const deadline = Date.now() + 200_000;
    for (;;) {
      const up = await fetch(new URL('/login', f.baseUrl)).then(
        (res) => res.ok,
        () => false,
      );
      if (up) break;
      if (Date.now() > deadline) throw new Error('CWA did not come back');
      await new Promise((r) => setTimeout(r, 2000));
    }
    await adapter.ping();
    expect((await adapter.getBook(bookA!))?.title).toBe(FIXTURE_BOOKS[0]!.title);
    expect(adapter.resolveKoboShelf(readerA!).name).toBe('Kobo');
    await adapter.addToKoboShelf(readerA!, bookA!);
    expect((await adapter.getDeviceState(readerA!, bookA!)).onKoboShelf).toBe(true);
    await adapter.removeFromKoboShelf(readerA!, bookA!);
  });
});
