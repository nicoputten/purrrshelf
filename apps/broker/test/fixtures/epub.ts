import { crc32 } from 'node:zlib';

/** Invented books for library tests. No real titles, authors or ISBNs of real books. */
export interface FixtureBook {
  title: string;
  author: string;
  /** A syntactically valid ISBN-13 in the 979-8 range, invented. */
  isbn: string;
  series?: { name: string; index: number };
  /** Written as a `kobopush` identifier, the way the importer tags downloads. */
  requestId?: string;
}

export const FIXTURE_BOOKS: FixtureBook[] = [
  {
    title: 'The Lighthouse Cat',
    author: 'Ada Quillfeather',
    isbn: '9798000000014',
    series: { name: 'Harbour Tales', index: 1 },
    requestId: 'req-fixture-1',
  },
  { title: 'A Map of Quiet Rivers', author: 'Bram Inkwell', isbn: '9798000000021' },
];

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** A store-only zip, enough for an EPUB (mimetype first, uncompressed). */
function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A minimal valid EPUB 2 with title, author, ISBN and optional Calibre series. */
export function makeEpub(book: FixtureBook): Buffer {
  const series = book.series
    ? `<meta name="calibre:series" content="${xml(book.series.name)}"/>
    <meta name="calibre:series_index" content="${book.series.index}"/>`
    : '';
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="isbn">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${xml(book.title)}</dc:title>
    <dc:creator opf:role="aut">${xml(book.author)}</dc:creator>
    <dc:identifier id="isbn" opf:scheme="ISBN">${book.isbn}</dc:identifier>
    ${book.requestId ? `<dc:identifier opf:scheme="kobopush">${xml(book.requestId)}</dc:identifier>` : ''}
    <dc:language>en</dc:language>
    ${series}
  </metadata>
  <manifest>
    <item id="text" href="text.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="text"/></spine>
</package>`;
  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${book.isbn}"/></head>
  <docTitle><text>${xml(book.title)}</text></docTitle>
  <navMap><navPoint id="p1" playOrder="1"><navLabel><text>Start</text></navLabel><content src="text.xhtml"/></navPoint></navMap>
</ncx>`;
  const text = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xml(book.title)}</title></head>
<body><h1>${xml(book.title)}</h1><p>An invented book for Purrshelf tests.</p></body></html>`;
  const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
  return zip([
    { name: 'mimetype', data: Buffer.from('application/epub+zip') },
    { name: 'META-INF/container.xml', data: Buffer.from(container) },
    { name: 'content.opf', data: Buffer.from(opf) },
    { name: 'toc.ncx', data: Buffer.from(ncx) },
    { name: 'text.xhtml', data: Buffer.from(text) },
  ]);
}
