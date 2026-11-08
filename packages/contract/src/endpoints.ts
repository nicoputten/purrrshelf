import type { z } from 'zod';
import { Budget } from './budget.js';
import { ErrorResponse } from './errors.js';
import {
  Empty,
  Health,
  LoginRequest,
  LogoutRequest,
  Me,
  RefreshRequest,
  TokenPair,
} from './schemas.js';

export const API_PREFIX = '/api/v1';

export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  auth: boolean;
  body?: z.ZodType;
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
    summary: 'Per indexer: searches and grabs left in the rolling hour, and the next free slot',
    auth: true,
    response: Budget,
    status: 200,
  },
} as const satisfies Record<string, Endpoint>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

export { ErrorResponse };
