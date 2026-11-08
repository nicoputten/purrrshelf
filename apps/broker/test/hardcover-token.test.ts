import { describe, expect, it } from 'vitest';
import {
  hardcoverTokenCheck,
  hardcoverTokenExpiry,
} from '../src/modules/discover/hardcover-token.js';
import { fakeJwt } from './metadata-fakes.js';

describe('hardcoverTokenExpiry', () => {
  it('reads exp from a JWT, with or without "Bearer "', () => {
    const exp = new Date('2027-03-01T00:00:00.000Z');
    expect(hardcoverTokenExpiry(fakeJwt(exp))).toEqual(exp);
    expect(hardcoverTokenExpiry(`Bearer ${fakeJwt(exp)}`)).toEqual(exp);
  });

  it.each(['opaque-token', 'a.!!!.c', `a.${Buffer.from('{"sub":1}').toString('base64url')}.c`])(
    'returns null for %j',
    (token) => {
      expect(hardcoverTokenExpiry(token)).toBeNull();
    },
  );

  it('passes for a token without an expiry', () => {
    expect(() => hardcoverTokenCheck('opaque', () => new Date(), 30).check()).not.toThrow();
  });
});
