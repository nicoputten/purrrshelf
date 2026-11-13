import { describe, expect, it } from 'vitest';
import type { BookQuery } from '../src/modules/search/planner.js';
import { detectVolume, isOtherVolume } from '../src/modules/search/volume.js';

// Invented series: the first book carries the series name as its title.
const SERIES = 'The Lantern Keepers';
const first: BookQuery = {
  title: 'Lantern Keepers',
  authors: ['Ada Quill'],
  language: 'en',
  series: { name: SERIES, position: 1 },
};

describe('detectVolume', () => {
  it.each([
    ['Ada Quill - [Lantern Keepers 05] - The Salt Choir (epub)', { kind: 'single', position: 5 }],
    ['Ada Quill - [Lantern Keepers 01] - Lantern Keepers (epub)', { kind: 'single', position: 1 }],
    ['Lantern Keepers #3 - Ember Road.epub', { kind: 'single', position: 3 }],
    ['Ada Quill - The Lantern Keepers, Book 2 - Glass Tide', { kind: 'single', position: 2 }],
    ['Lantern-Keepers_vol.4 retail epub', { kind: 'single', position: 4 }],
    ['Lantern Keepers 2.5 - A Short Night (epub)', { kind: 'single', position: 2.5 }],
    ['Ada Quill - Lantern Keepers 1-7 (epub)', { kind: 'range', from: 1, to: 7 }],
    ['Ada Quill - Lantern Keepers 01 to 03 (epub)', { kind: 'range', from: 1, to: 3 }],
    ['Ada Quill - Ember Road (Book Three) epub', { kind: 'single', position: 3 }],
    ['Ada Quill - Ember Road #4 epub', { kind: 'single', position: 4 }],
    ['Ada Quill - Lantern Keepers (2021) epub', { kind: 'none' }],
    ['Ada Quill - Lantern Keepers 1st edition epub', { kind: 'none' }],
    ['Ada Quill - Lantern Keepers epub', { kind: 'none' }],
  ])('%s', (title, volume) => {
    expect(detectVolume(title, SERIES, 'Lantern Keepers')).toEqual(volume);
  });

  it('reads a number after the series name even when it repeats the title', () => {
    expect(
      detectVolume('Lantern Keepers - Lantern Keepers 02 - Glass Tide', SERIES, 'Lantern Keepers'),
    ).toEqual({ kind: 'single', position: 2 });
  });

  it("ignores a number in the book's own title", () => {
    expect(detectVolume('Ada Quill - Book 2 of Ash epub', 'Ash Saga', 'Book 2 of Ash')).toEqual({
      kind: 'none',
    });
  });

  it('keeps a one-word series name that is only an article', () => {
    expect(detectVolume('The 3 epub', 'The', 'Other')).toEqual({ kind: 'single', position: 3 });
  });

  it('works with an empty series name or title', () => {
    expect(detectVolume('Ember Road Book 6', '', '')).toEqual({ kind: 'single', position: 6 });
  });

  it('treats a backwards range as the first number', () => {
    expect(detectVolume('Lantern Keepers 5-2', SERIES, 'x')).toEqual({
      kind: 'single',
      position: 5,
    });
  });
});

describe('isOtherVolume', () => {
  it('rejects another book of the series', () => {
    expect(isOtherVolume(first, 'Ada Quill - [Lantern Keepers 05] - The Salt Choir (epub)')).toBe(
      true,
    );
  });

  it('keeps the book itself', () => {
    expect(isOtherVolume(first, 'Ada Quill - [Lantern Keepers 01] - Lantern Keepers (epub)')).toBe(
      false,
    );
  });

  it('rejects a bundle of several books', () => {
    expect(isOtherVolume(first, 'Ada Quill - Lantern Keepers 1-7 (epub)')).toBe(true);
  });

  it('keeps a release that names no volume', () => {
    expect(isOtherVolume(first, 'Ada Quill - Lantern Keepers (epub)')).toBe(false);
  });

  it('rules nothing out without a series position', () => {
    const name = 'Ada Quill - [Lantern Keepers 05] - The Salt Choir (epub)';
    expect(isOtherVolume({ ...first, series: undefined }, name)).toBe(false);
    expect(isOtherVolume({ ...first, series: { name: SERIES, position: null } }, name)).toBe(false);
  });
});
