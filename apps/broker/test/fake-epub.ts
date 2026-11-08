import { strToU8, zipSync, type Zippable } from 'fflate';

/** A tiny invented EPUB (EPUB 2 or 3) for importer tests. */
export function makeEpub(
  opts: {
    version?: '2.0' | '3.0';
    opfPath?: string;
    extraMetadata?: string;
    mimetype?: string | null;
  } = {},
): Buffer {
  const { version = '3.0', opfPath = 'OEBPS/content.opf', extraMetadata = '' } = opts;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="uid">urn:uuid:00000000-0000-4000-8000-000000000001</dc:identifier>
    <dc:title>The Lighthouse Cartographer</dc:title>
    <dc:creator>Ada Quill</dc:creator>
    <dc:language>en</dc:language>${extraMetadata}
  </metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;
  const files: Zippable = {};
  if (opts.mimetype !== null)
    files.mimetype = [strToU8(opts.mimetype ?? 'application/epub+zip'), { level: 0 }];
  files['META-INF/container.xml'] = strToU8(
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  files['OEBPS/content.opf'] = strToU8(opf);
  files['OEBPS/c1.xhtml'] = strToU8('<html><body><p>Once upon a tide.</p></body></html>');
  return Buffer.from(zipSync(files));
}
