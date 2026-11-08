import { describe, expect, it } from 'vitest';
import {
  authorKey,
  blankToNull,
  languageCode,
  normaliseIsbns,
  stripHtml,
  titleKey,
  toIsbn13,
  workKey,
  yearOf,
} from '../src/modules/discover/normalise.js';

describe('ISBNs', () => {
  it('keeps a valid ISBN-13 and strips punctuation', () => {
    expect(toIsbn13('978-0-00-000001-9')).toBe('9780000000019');
  });

  it('converts ISBN-10 (including an X check digit) to ISBN-13', () => {
    expect(toIsbn13('0000000051')).toBe('9780000000057');
    expect(toIsbn13('000000006x')).toBe('9780000000064');
  });

  it.each(['9780000000018', '0000000052', '12345', '', 'abc'])('rejects %j', (raw) => {
    expect(toIsbn13(raw)).toBeNull();
  });

  it('de-duplicates, drops junk and caps the list', () => {
    expect(normaliseIsbns(['0000000051', '9780000000057', 'x', '9780000000019'])).toEqual([
      '9780000000057',
      '9780000000019',
    ]);
    expect(normaliseIsbns(['9780000000019', '9780000000026'], 1)).toHaveLength(1);
  });
});

describe('title and author keys', () => {
  it('ignores case, accents, punctuation, subtitles and leading articles', () => {
    expect(titleKey('The Salt Road')).toBe('salt road');
    expect(titleKey('Max Havelaar: of de koffij-veilingen')).toBe('max havelaar');
    expect(titleKey('Het Café — een verhaal')).toBe('cafe');
    expect(titleKey('Salt & Pepper (Book 1)')).toBe('salt and pepper');
  });

  it('reduces an author to the surname in either name order', () => {
    expect(authorKey('J.R.R. Tolkien')).toBe('tolkien');
    expect(authorKey('Tolkien, J. R. R.')).toBe('tolkien');
    expect(authorKey('Ilse Varenkamp')).toBe('varenkamp');
    expect(authorKey('')).toBe('');
  });

  it('builds a work key from title and first author', () => {
    expect(workKey('The Salt Road', ['Ilse Varenkamp', 'Someone Else'])).toBe(
      'salt road|varenkamp',
    );
    expect(workKey('Anonymous', [])).toBe('anonymous|');
  });
});

describe('small helpers', () => {
  it('maps language codes to ISO 639-1', () => {
    expect(languageCode('eng')).toBe('en');
    expect(languageCode('dut')).toBe('nl');
    expect(languageCode('en-GB')).toBe('en');
    expect(languageCode('xyz')).toBe('xyz');
    expect(languageCode('english')).toBeNull();
    expect(languageCode(null)).toBeNull();
  });

  it('turns HTML into plain text', () => {
    expect(
      stripHtml(
        '<p>Een <b>roman</b>&nbsp;&amp; meer.</p><p>Twee<br/>regels &quot;x&quot; &#39;y&#39; &lt;z&gt;</p>',
      ),
    ).toBe('Een roman & meer.\n\nTwee\nregels "x" \'y\' <z>');
  });

  it('finds a year', () => {
    expect(yearOf('1860-05')).toBe(1860);
    expect(yearOf('May 2001')).toBe(2001);
    expect(yearOf(2019)).toBe(2019);
    expect(yearOf(20.5)).toBeNull();
    expect(yearOf('soon')).toBeNull();
    expect(yearOf(null)).toBeNull();
  });

  it('treats blank strings as missing', () => {
    expect(blankToNull('  ')).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull(' x ')).toBe('x');
  });
});
