'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert, Input } from '@/components/ui/Field';

export function CodeSignIn({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get('code') ?? '');
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) {
      window.location.assign(next);
      return;
    }
    setError(data.error ?? 'That code did not work.');
    setBusy(false);
    if (res.status === 401 && /expired/i.test(data.error ?? '')) window.location.reload();
  }

  async function startOver() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-xl font-semibold">Two-step verification</h1>
      <p className="text-sm">
        {recovery ? 'Enter one of your one-time recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}
      </p>
      {error && <Alert>{error}</Alert>}
      <Input
        id="code"
        name="code"
        label={recovery ? 'Recovery code' : 'Authentication code'}
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        pattern={recovery ? undefined : '[0-9 ]*'}
        maxLength={recovery ? 20 : 7}
        required
        autoFocus
        key={recovery ? 'r' : 't'}
      />
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Verifying…' : 'Verify'}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <button type="button" className="text-amber-strong hover:underline" onClick={() => setRecovery((r) => !r)}>
          {recovery ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
        <button type="button" className="text-muted hover:underline" onClick={startOver}>
          Start over
        </button>
      </div>
    </form>
  );
}
