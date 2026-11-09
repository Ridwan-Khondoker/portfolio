'use client';

/** POST JSON to this app's API with the session CSRF token (from <meta name="csrf-token">). */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown, method = 'POST'): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data: T & { error?: string };
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    data = { error: `Request failed (${res.status})` } as T & { error?: string };
  }
  return { ok: res.ok, status: res.status, data };
}
