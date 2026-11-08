import type { Clock } from '../../clock.js';
import type { HealthCheck } from '../health/routes.js';
import { bareToken } from './providers/hardcover.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Expiry of a Hardcover API token (a JWT), or `null` if it carries none we can read. */
export function hardcoverTokenExpiry(token: string): Date | null {
  const payload = bareToken(token).split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof claims.exp === 'number' ? new Date(claims.exp * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Hardcover tokens expire after a year (ADR 0007). This health check fails,
 * turning /health "degraded", from `warnDays` before the expiry date, so the
 * owner renews the token before search loses its best provider.
 */
export function hardcoverTokenCheck(token: string, clock: Clock, warnDays: number): HealthCheck {
  return {
    name: 'hardcover-token',
    check: () => {
      const expiry = hardcoverTokenExpiry(token);
      if (!expiry) return;
      const date = expiry.toISOString().slice(0, 10);
      const daysLeft = Math.floor((expiry.getTime() - clock().getTime()) / DAY_MS);
      if (expiry <= clock()) {
        throw new Error(`Hardcover token expired on ${date}; create a new one`);
      }
      if (daysLeft < warnDays) {
        throw new Error(`Hardcover token expires on ${date} (${daysLeft} days); renew it`);
      }
    },
  };
}
