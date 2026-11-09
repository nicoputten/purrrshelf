import type { z } from 'zod';
import { AppRelease } from './app-updates.js';
import { Budget } from './budget.js';
import { ErrorResponse } from './errors.js';
import {
  AddRequest,
  BookRequest,
  Readers,
  ReleaseList,
  RequestList,
  RequestParams,
  RequestReleaseParams,
} from './requests.js';
import {
  DiscoverSearchQuery,
  DiscoverSearchResult,
  Empty,
  Health,
  ItemKoboParams,
  ItemKobos,
  ItemOwnership,
  ItemParams,
  LibraryBooks,
  LoginRequest,
  LogoutRequest,
  Me,
  RefreshRequest,
  SimilarWorks,
  TokenPair,
  WorkDetail,
  WorkParams,
  WorkSeries,
} from './schemas.js';

export const API_PREFIX = '/api/v1';

export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  auth: boolean;
  body?: z.ZodType;
  /** Path parameters, matching the `:name` segments in {@link Endpoint.path}. */
  params?: z.ZodObject;
  /** Query-string parameters. */
  query?: z.ZodObject;
  response: z.ZodType;
  /** HTTP status of a successful response. */
  status: 200 | 201 | 204;
}

/** Every broker endpoint, defined once. Paths are relative to {@link API_PREFIX}. */
export const endpoints = {
  health: {
    method: 'GET',
    path: '/health',
    summary: 'Liveness and dependency checks',
    auth: false,
    response: Health,
    status: 200,
  },
  login: {
    method: 'POST',
    path: '/auth/login',
    summary: 'Username + password → access and refresh token',
    auth: false,
    body: LoginRequest,
    response: TokenPair,
    status: 200,
  },
  refresh: {
    method: 'POST',
    path: '/auth/refresh',
    summary: 'Rotate the refresh token',
    auth: false,
    body: RefreshRequest,
    response: TokenPair,
    status: 200,
  },
  logout: {
    method: 'POST',
    path: '/auth/logout',
    summary: 'Revoke the refresh token',
    auth: false,
    body: LogoutRequest,
    response: Empty,
    status: 200,
  },
  me: {
    method: 'GET',
    path: '/me',
    summary: 'Current user, locale and Kobo state',
    auth: true,
    response: Me,
    status: 200,
  },
  budget: {
    method: 'GET',
    path: '/budget',
    summary: 'Per indexer: searches and grabs left in the rolling 24 hours, and the next free slot',
    auth: true,
    response: Budget,
    status: 200,
  },
  appLatest: {
    method: 'GET',
    path: '/app/latest',
    summary: 'Newest app release, for the in-app updater',
    auth: true,
    response: AppRelease,
    status: 200,
  },
  readers: {
    method: 'GET',
    path: '/readers',
    summary: 'Readers of this server, as Kobo targets for a new book',
    auth: true,
    response: Readers,
    status: 200,
  },
  addRequest: {
    method: 'POST',
    path: '/requests',
    summary:
      'Add a book: owns it right away when the library has it, otherwise starts the paid indexer search. Answers the open request when there is one.',
    auth: true,
    body: AddRequest,
    response: BookRequest,
    status: 201,
  },
  requests: {
    method: 'GET',
    path: '/requests',
    summary: 'My requests, newest first',
    auth: true,
    response: RequestList,
    status: 200,
  },
  request: {
    method: 'GET',
    path: '/requests/:id',
    summary: 'One of my requests',
    auth: true,
    params: RequestParams,
    response: BookRequest,
    status: 200,
  },
  requestReleases: {
    method: 'GET',
    path: '/requests/:id/releases',
    summary: 'The releases the search already found, scored. Free: never searches again.',
    auth: true,
    params: RequestParams,
    response: ReleaseList,
    status: 200,
  },
  pickRelease: {
    method: 'POST',
    path: '/requests/:id/releases/:releaseId',
    summary: 'Download this release instead (one grab from the budget, no search)',
    auth: true,
    params: RequestReleaseParams,
    response: BookRequest,
    status: 200,
  },
  retryRequest: {
    method: 'POST',
    path: '/requests/:id/retry',
    summary: 'Try again: a new, paid search round. Answers before the search ends.',
    auth: true,
    params: RequestParams,
    response: BookRequest,
    status: 200,
  },
  cancelRequest: {
    method: 'POST',
    path: '/requests/:id/cancel',
    summary: 'Stop or dismiss a request',
    auth: true,
    params: RequestParams,
    response: BookRequest,
    status: 200,
  },
  discoverSearch: {
    method: 'GET',
    path: '/discover/search',
    summary:
      'Search book metadata (Hardcover, Open Library, Google Books). Never spends an indexer search.',
    auth: true,
    query: DiscoverSearchQuery,
    response: DiscoverSearchResult,
    status: 200,
  },
  work: {
    method: 'GET',
    path: '/works/:id',
    summary: 'Details of one work, with library state',
    auth: true,
    params: WorkParams,
    response: WorkDetail,
    status: 200,
  },
  workSeries: {
    method: 'GET',
    path: '/works/:id/series',
    summary: 'The series a work belongs to, in reading order',
    auth: true,
    params: WorkParams,
    response: WorkSeries,
    status: 200,
  },
  workSimilar: {
    method: 'GET',
    path: '/works/:id/similar',
    summary: 'Similar books: same series, then same author, then subject. Metadata only.',
    auth: true,
    params: WorkParams,
    response: SimilarWorks,
    status: 200,
  },
  libraryBooks: {
    method: 'GET',
    path: '/library/books',
    summary: 'Every book in the shared library with owners, my Kobo and my reading progress',
    auth: true,
    response: LibraryBooks,
    status: 200,
  },
  keepBook: {
    method: 'PUT',
    path: '/library/items/:itemId/owners/me',
    summary: 'Add a library book to my library, or undo removing it. Cancels a pending deletion.',
    auth: true,
    params: ItemParams,
    response: ItemOwnership,
    status: 200,
  },
  removeBook: {
    method: 'DELETE',
    path: '/library/items/:itemId/owners/me',
    summary:
      'Remove a book from my library and my Kobo. When nobody owns it any more it is deleted after 7 days.',
    auth: true,
    params: ItemParams,
    response: ItemOwnership,
    status: 200,
  },
  itemKobos: {
    method: 'GET',
    path: '/library/items/:itemId/kobos',
    summary: "Every reader's Kobo and whether this library book is on it",
    auth: true,
    params: ItemParams,
    response: ItemKobos,
    status: 200,
  },
  sendToKobo: {
    method: 'PUT',
    path: '/library/items/:itemId/kobos/:userId',
    summary: "Put the book on a reader's Kobo shelf; that reader becomes an owner. Idempotent.",
    auth: true,
    params: ItemKoboParams,
    response: ItemKobos,
    status: 200,
  },
  removeFromKobo: {
    method: 'DELETE',
    path: '/library/items/:itemId/kobos/:userId',
    summary: "Take the book off a reader's Kobo shelf. The book stays in the library. Idempotent.",
    auth: true,
    params: ItemKoboParams,
    response: ItemKobos,
    status: 200,
  },
} as const satisfies Record<string, Endpoint>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

export { ErrorResponse };

/**
 * Cover images are WebP, not JSON, so they are not in {@link endpoints}.
 * `GET /covers/:id?size=s|m|l` needs the bearer token like other endpoints and
 * answers with an ETag; a generated placeholder card when no cover exists.
 */
export const coverPath = '/covers/:id';

/** Full URL of a work's cover, for an image component. */
export function coverUrl(baseUrl: string, workId: string, size: 's' | 'm' | 'l'): string {
  return `${baseUrl.replace(/\/+$/, '')}${API_PREFIX}/covers/${encodeURIComponent(workId)}?size=${size}`;
}
