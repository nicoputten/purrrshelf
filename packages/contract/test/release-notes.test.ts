import { describe, expect, it } from 'vitest';
import { readableReleaseNotes } from '../src/index.js';

const releasePlease = `## [1.2.1](https://github.com/example/repo/compare/mobile-v1.2.0...mobile-v1.2.1) (2026-11-08)


### Features

* **broker:** serve the latest app release for in-app updates ([4628180](https://github.com/example/repo/commit/4628180))
* **mobile:** update the app from inside the app ([e81e504](https://github.com/example/repo/commit/e81e504))

### Bug Fixes

* **mobile:** show the napping cat when a search finds nothing (DES-02) ([6aa1dd0](https://github.com/example/repo/commit/6aa1dd070affd2dd2ec9eca94e87b8b098aafcde))
* let a check for updates see a new release within minutes (BRK-10, APP-10) ([9f9b788](https://github.com/example/repo/commit/9f9b788))
`;

describe('readableReleaseNotes', () => {
  it('turns release-please notes into short cat-styled text', () => {
    expect(readableReleaseNotes(releasePlease)).toBe(
      [
        'New tricks',
        '• Update the app from inside the app',
        '',
        'Fixed scratches',
        '• Show the napping cat when a search finds nothing',
        '• Let a check for updates see a new release within minutes',
      ].join('\n'),
    );
  });

  it('drops a section that only had server lines', () => {
    expect(readableReleaseNotes('### Features\n\n* **broker:** faster grabs\n')).toBe('');
  });

  it('keeps plain notes and custom headings as they are', () => {
    const plain = 'Faster paws\n• Search answers sooner';
    expect(readableReleaseNotes(plain)).toBe(plain);
    expect(readableReleaseNotes('### Naps\n- A comfier [cat](https://x.example) `bed`')).toBe(
      'Naps\n• A comfier cat bed',
    );
  });

  it('gives an empty string for empty notes', () => {
    expect(readableReleaseNotes('')).toBe('');
  });
});
