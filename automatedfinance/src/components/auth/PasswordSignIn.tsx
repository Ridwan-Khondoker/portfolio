'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert, Input } from '@/components/ui/Field';

export function PasswordSignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) {
      window.location.reload();
      return;
    }
    setError(data.error ?? 'Sign-in failed.');
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-xl font-semibold">Sign in</h1>
      {error && <Alert>{error}</Alert>}
      <Input id="email" name="email" type="email" label="Email" autoComplete="username" required autoFocus />
      <Input id="password" name="password" type="password" label="Password" autoComplete="current-password" required />
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Checking…' : 'Continue'}
      </Button>
      <p className="text-xs text-muted">No account? Access is by invitation from an admin. Forgot your password? Ask an admin for a reset link.</p>
    </form>
  );
}
