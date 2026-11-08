import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

/** Identifier scheme the broker writes so it can find the book in Calibre (ADR 0016). */
export const IDENTIFIER_SCHEME = 'kobopush';

export class EpubError extends Error {
  override name = 'EpubError';
}

function packageDocument(files: Record<string, Uint8Array>): { path: string; opf: string } {
  const container = files['META-INF/container.xml'];
  if (!container) throw new EpubError('Not an EPUB: META-INF/container.xml is missing');
  const path = strFromU8(container).match(/<rootfile\b[^>]*\bfull-path="([^"]+)"/)?.[1];
  const data = path ? files[path] : undefined;
  if (!path || !data) throw new EpubError('Not an EPUB: the package document is missing');
  return { path, opf: strFromU8(data) };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Adds `kobopush:<requestId>` as an identifier to the EPUB's package metadata
 * (replacing an earlier one) and returns the new file. The book stays EPUB:
 * the broker never converts to KEPUB.
 */
export function tagEpub(epub: Uint8Array, requestId: string): Buffer {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(epub);
  } catch (cause) {
    throw new EpubError('Not an EPUB: the file is not a zip archive', { cause });
  }
  const mimetype = files.mimetype;
  if (!mimetype || strFromU8(mimetype).trim() !== 'application/epub+zip') {
    throw new EpubError('Not an EPUB: wrong or missing mimetype');
  }
  const doc = packageDocument(files);
  let opf = doc.opf;
  const close = opf.match(/<\/(?:opf:)?metadata\s*>/);
  if (!close) throw new EpubError('Not an EPUB: the package has no metadata');
  const dc = 'dc:';
  const id = escapeXml(requestId);

  // Drop an identifier from an earlier attempt.
  const S = IDENTIFIER_SCHEME;
  opf = opf.replace(
    new RegExp(
      `\\s*<${dc}identifier\\b[^>]*(?:scheme="${S}"[^>]*>[^<]*|>${S}:[^<]*)</${dc}identifier>`,
      'g',
    ),
    '',
  );
  // opf:scheme is the form CWA v4.0.8 is verified to keep (BRK-03 contract test), for EPUB 2 and 3.
  const opfNs = /xmlns:opf=/.test(opf) ? '' : ' xmlns:opf="http://www.idpf.org/2007/opf"';
  const element = `<${dc}identifier${opfNs} opf:scheme="${IDENTIFIER_SCHEME}">${id}</${dc}identifier>`;
  opf = opf.replace(close[0], `  ${element}\n  ${close[0]}`);
  files[doc.path] = strToU8(opf);

  // mimetype must be the first entry and stored uncompressed.
  const out: Zippable = { mimetype: [mimetype, { level: 0 }] };
  for (const [name, data] of Object.entries(files)) if (name !== 'mimetype') out[name] = data;
  return Buffer.from(zipSync(out, { level: 6 }));
}

/** Reads the kobopush identifier back (tests and import checks). */
export function readTag(epub: Uint8Array): string | null {
  const { opf } = packageDocument(unzipSync(epub));
  const m =
    opf.match(new RegExp(`scheme="${IDENTIFIER_SCHEME}"[^>]*>([^<]+)<`)) ??
    opf.match(new RegExp(`>${IDENTIFIER_SCHEME}:([^<]+)<`));
  return m?.[1] ?? null;
}
