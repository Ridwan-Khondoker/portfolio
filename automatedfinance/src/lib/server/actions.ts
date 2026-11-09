import { ForbiddenError } from './auth';
import type { ActionResult } from '@/components/ui/ActionForm';

/** Wraps a server action body: permission errors and validation errors become a friendly result, never a stack trace. */
export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: true, message: 'Saved.' };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    const msg = err instanceof Error ? err.message : 'Something went wrong.';
    if ((err as { digest?: string })?.digest?.startsWith('NEXT_')) throw err; // redirects / notFound
    console.error('[action]', msg);
    return { ok: false, message: msg.length < 300 ? msg : 'Something went wrong.' };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

/** "3" or "3%" -> 0.03 ; "-10" -> -0.1 */
export function pct(fd: FormData, key: string): string {
  const raw = str(fd, key).replace('%', '');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`“${raw || '(blank)'}” is not a percentage.`);
  return String(Number(raw) / 100);
}

export function money(fd: FormData, key: string): string {
  const raw = str(fd, key).replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`“${raw || '(blank)'}” is not an amount.`);
  return raw;
}
