import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'purrshelf-broker';
const AUDIENCE = 'purrshelf-app';

export interface AccessClaims {
  userId: string;
}

export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  get ttl(): number {
    return this.ttlSeconds;
  }

  sign(userId: string, now: Date): Promise<string> {
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.ttlSeconds)
      .sign(this.key);
  }

  /** Returns the claims, or undefined for any invalid or expired token. */
  async verify(token: string, now: Date): Promise<AccessClaims | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
        currentDate: now,
      });
      return payload.sub ? { userId: payload.sub } : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Opaque, high-entropy refresh token. Only its hash is stored. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
