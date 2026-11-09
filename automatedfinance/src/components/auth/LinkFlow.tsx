'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';

/** Invite or reset link: choose a password and you're signed in. */
export function LinkFlow({ kind, token, email }: { kind: 'invite' | 'reset'; token: string; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${kind}/${token}/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: String(f.get('password') ?? ''), confirm: String(f.get('confirm') ?? '') }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; next?: string };
    if (res.ok) {
      // 'done' = signed in. '2fa' / 'enroll' = the login page asks for a code or (if required) sets up 2FA.
      window.location.assign(data.next === 'done' ? '/' : '/login');
      return;
    }
    setError(data.error ?? 'Could not save the password.');
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-xl font-semibold">{kind === 'invite' ? 'Create your password' : 'Choose a new password'}</h1>
      <p className="text-sm">
        For <strong className="text-ink">{email}</strong>.
      </p>
      {error && <Alert>{error}</Alert>}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <PasswordInput id="password" name="password" label="Password" autoComplete="new-password" minLength={12} required autoFocus hint="At least 12 characters. Very common passwords aren't allowed." />
      <PasswordInput id="confirm" name="confirm" label="Repeat password" autoComplete="new-password" minLength={12} required />
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : kind === 'invite' ? 'Create account' : 'Save password'}
      </Button>
    </form>
  );
}
