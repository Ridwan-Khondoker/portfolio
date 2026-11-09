'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert, Input } from '@/components/ui/Field';
import { RecoveryCodes } from './RecoveryCodes';
import type { ActionResult } from '@/components/ui/ActionForm';

/**
 * Two-step verification set-up: scan the QR code, enter the first 6-digit code, save the recovery codes.
 * At sign-in (only when Settings requires 2FA) it posts to /api/auth/enroll; on the Account page it calls a server action.
 */
export function TotpEnroll({
  qrSvg,
  secret,
  action,
  doneHref = '/',
  intro,
}: {
  qrSvg: string;
  secret: string;
  action?: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  doneHref?: string;
  intro?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (action) {
      const r = await action(null, fd);
      if (r?.ok && Array.isArray(r.data?.recoveryCodes)) setCodes(r.data!.recoveryCodes as string[]);
      else setError(r?.message ?? 'That code did not work.');
    } else {
      const res = await fetch('/api/auth/enroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: fd.get('code') }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; recoveryCodes?: string[] };
      if (res.ok && data.recoveryCodes) setCodes(data.recoveryCodes);
      else {
        setError(data.error ?? 'That code did not work.');
        if (res.status === 401) window.location.reload();
      }
    }
    setBusy(false);
  }

  if (codes) return <RecoveryCodes codes={codes} continueLabel="Done" onContinue={() => window.location.assign(doneHref)} />;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {intro && <p className="text-sm">{intro}</p>}
      <p className="text-sm">Scan this code with Google Authenticator (or any authenticator app), then enter the 6-digit code it shows.</p>
      {error && <Alert>{error}</Alert>}
      <div className="mx-auto w-44 rounded-xl border border-line bg-paper p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <p className="text-center text-xs text-muted">
        Can&apos;t scan? Enter this key: <span className="break-all font-mono text-ink">{secret.replace(/(.{4})/g, '$1 ').trim()}</span>
      </p>
      <Input id="enroll-code" name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Checking…' : 'Turn on two-step verification'}
      </Button>
    </form>
  );
}
