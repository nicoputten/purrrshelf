import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { EpubError, readTag, tagEpub } from '../src/modules/importer/epub.js';
import { makeEpub } from './fake-epub.js';

function opfOf(epub: Uint8Array): string {
  return strFromU8(unzipSync(epub)['OEBPS/content.opf']!);
}

describe('tagEpub', () => {
  it('adds the kobopush identifier to an EPUB 3 and keeps it an EPUB', () => {
    const tagged = tagEpub(makeEpub(), 'req-1');
    expect(opfOf(tagged)).toContain('<dc:identifier opf:scheme="kobopush">req-1</dc:identifier>');
    expect(readTag(tagged)).toBe('req-1');
    // mimetype first and stored, so readers (and CWA) accept it.
    expect(tagged.subarray(30, 38).toString()).toBe('mimetype');
    expect(tagged.readUInt16LE(8)).toBe(0);
    expect(strFromU8(unzipSync(tagged)['OEBPS/c1.xhtml']!)).toContain('Once upon a tide');
  });

  it('uses opf:scheme in an EPUB 2', () => {
    const tagged = tagEpub(makeEpub({ version: '2.0' }), 'req-2');
    expect(opfOf(tagged)).toContain('<dc:identifier opf:scheme="kobopush">req-2</dc:identifier>');
    expect(readTag(tagged)).toBe('req-2');
  });

  it('replaces an identifier from an earlier attempt, in either form', () => {
    const both =
      '\n    <dc:identifier>kobopush:old</dc:identifier>\n    <dc:identifier opf:scheme="kobopush">older</dc:identifier>';
    const tagged = tagEpub(makeEpub({ extraMetadata: both }), 'new');
    const opf = opfOf(tagged);
    expect(opf).not.toContain('old');
    expect(opf.match(/kobopush/g)).toHaveLength(1);
    expect(opf).toContain('urn:uuid:00000000');
  });

  it('declares the opf namespace when the package does not', () => {
    const files = unzipSync(makeEpub());
    files['OEBPS/content.opf'] = strToU8(
      strFromU8(files['OEBPS/content.opf']!).replace(
        ' xmlns:opf="http://www.idpf.org/2007/opf"',
        '',
      ),
    );
    const { mimetype, ...rest } = files;
    const tagged = tagEpub(zipSync({ mimetype: [mimetype!, { level: 0 }], ...rest }), 'r');
    expect(opfOf(tagged)).toContain(
      '<dc:identifier xmlns:opf="http://www.idpf.org/2007/opf" opf:scheme="kobopush">r</dc:identifier>',
    );
    expect(readTag(tagged)).toBe('r');
  });

  it('reads an EPUB 3 kobopush:<id> identifier too', () => {
    expect(readTag(makeEpub({ extraMetadata: '<dc:identifier>kobopush:x1</dc:identifier>' }))).toBe(
      'x1',
    );
  });

  it('escapes the id', () => {
    expect(opfOf(tagEpub(makeEpub(), 'a<b'))).toContain('>a&#60;b<');
  });

  it('finds no tag in an untagged EPUB', () => {
    expect(readTag(makeEpub())).toBeNull();
  });

  it.each([
    ['not a zip', Buffer.from('hello'), /not a zip/],
    ['a zip without mimetype', makeEpub({ mimetype: null }), /mimetype/],
    ['the wrong mimetype', makeEpub({ mimetype: 'application/zip' }), /mimetype/],
    ['a missing package document', makeEpub({ opfPath: 'nope.opf' }), /package document/],
    [
      'a missing container',
      Buffer.from(zipSync({ mimetype: strToU8('application/epub+zip') })),
      /container.xml/,
    ],
    [
      'a package without metadata',
      Buffer.from(
        zipSync({
          mimetype: strToU8('application/epub+zip'),
          'META-INF/container.xml': strToU8('<rootfile full-path="a.opf"/>'),
          'a.opf': strToU8('<package version="3.0"></package>'),
        }),
      ),
      /no metadata/,
    ],
  ])('rejects %s', (_l, file, message) => {
    expect(() => tagEpub(file, 'x')).toThrow(EpubError);
    expect(() => tagEpub(file, 'x')).toThrow(message);
  });
});
