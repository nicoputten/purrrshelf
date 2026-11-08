import { hash, verify } from '@node-rs/argon2';

// argon2id (the library default; asserted in tests) with OWASP-recommended
// parameters: 19 MiB memory, 2 iterations, 1 lane.
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Spends the same time as a real check, so unknown usernames can't be told apart by timing. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-password-just-for-timing');
  await verifyPassword(await dummyHash, password);
}
