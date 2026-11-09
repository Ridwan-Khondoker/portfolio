import { hash, verify } from '@node-rs/argon2';
import { dictionary } from '@zxcvbn-ts/language-common';

// argon2id with OWASP-recommended cost (64 MiB, 3 passes).
const OPTIONS = { algorithm: 2 as const, memoryCost: 65536, timeCost: 3, parallelism: 1 };

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/** Verify against a throwaway hash so unknown emails take as long as known ones. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hash('automatedfinance-timing-equaliser', OPTIONS);
  await verifyPassword(await dummyHash, password);
}

let common: Set<string> | null = null;
function commonPasswords(): Set<string> {
  if (!common) {
    const list = (dictionary as Record<string, string[]>)['passwords-common'] ?? [];
    common = new Set(list.map((p) => p.toLowerCase()));
  }
  return common;
}

/** Returns a user-facing problem, or null when the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 256) return 'Use at most 256 characters.';
  const lower = password.toLowerCase();
  const list = commonPasswords();
  if (list.has(lower)) return 'That password is on a list of commonly used passwords. Choose another.';
  // "password1234", "Qwerty!!!!!!": a common word padded with digits or symbols.
  const core = lower.replace(/^[\d\W_]+|[\d\W_]+$/g, '');
  if (core.length >= 3 && list.has(core) && core.length / lower.length >= 0.5)
    return 'That password is a common word with a few characters added. Choose something less predictable.';
  if (/^(.)\1+$/.test(password)) return 'That password repeats one character.';
  if (email) {
    const local = email.split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 4 && lower.includes(local)) return 'Do not include your email address in the password.';
  }
  return null;
}
