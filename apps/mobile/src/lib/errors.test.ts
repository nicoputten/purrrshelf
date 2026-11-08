import { ApiError, NetworkError } from '@purrshelf/contract';
import { i18n } from '@/i18n';
import { errorMessage } from './errors';

const t = i18n.t.bind(i18n);

describe('errorMessage', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  it.each([
    [new ApiError(401, 'INVALID_CREDENTIALS', 'x'), 'Wrong username or password.'],
    [
      new ApiError(423, 'ACCOUNT_LOCKED', 'x', { retryAfterSeconds: 61 }),
      'Too many tries. Wait 2 min and try again.',
    ],
    [new ApiError(423, 'ACCOUNT_LOCKED', 'x'), 'Too many tries. Wait 1 min and try again.'],
    [
      new NetworkError('Server not reachable'),
      'Can’t reach the server. Check the address and your connection.',
    ],
    [
      new NetworkError('Not a Purrshelf server'),
      'That address answers, but it is not a Purrshelf server.',
    ],
    [
      new TypeError('Invalid URL'),
      'That is not a valid address. It starts with https:// or http://',
    ],
    [new Error('boom'), 'Something went wrong. Try again.'],
  ])('%s', (err, message) => {
    expect(errorMessage(err, t)).toBe(message);
  });
});
