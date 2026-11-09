'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert, Input } from '@/components/ui/Field';

type Props = {
  kind: 'invite' | 'reset';
  token: string;
  email: string;
  step: 'password' | 'totp';
  qrSvg?: string;
  secret?: string;
};

export function LinkFlow({ kind, token, email, step, qrSvg, secret }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  async function post(path: string, body: Record<string, string>) {
    const res = await fetch(`/api/auth/${kind}/${token}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as { error?: string; recoveryCodes?: string[] } };
  }

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const r = await post('password', { password: String(f.get('password') ?? ''), confirm: String(f.get('confirm') ?? '') });
    if (r.ok) window.location.reload();
    else {
      setError(r.data.error ?? 'Could not save the password.');
      setBusy(false);
    }
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post('totp', { code: String(new FormData(e.currentTarget).get('code') ?? '') });
    if (r.ok && r.data.recoveryCodes) setCodes(r.data.recoveryCodes);
    else setError(r.data.error ?? 'That code did not work.');
    setBusy(false);
  }

  if (codes) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Save your recovery codes</h1>
        <p className="text-sm">
          Each code works once, if you lose your phone. They are shown only now. Store them in a password manager.
        </p>
        <ol className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-kraft p-3 font-mono text-sm text-ink">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>
            Copy codes
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved these codes
        </label>
        <Button type="button" variant="brand" className="w-full" disabled={!saved} onClick={() => window.location.assign('/')}>
          Open the dashboard
        </Button>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <form onSubmit={onPassword} className="space-y-4" noValidate>
        <h1 className="text-xl font-semibold">{kind === 'invite' ? 'Set up your account' : 'Reset your password'}</h1>
        <p className="text-sm">
          Signing in as <strong className="text-ink">{email}</strong>. Step 1 of 2: choose a password.
        </p>
        {error && <Alert>{error}</Alert>}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Input id="password" name="password" type="password" label="New password" autoComplete="new-password" minLength={12} required autoFocus hint="At least 12 characters. Common passwords are rejected." />
        <Input id="confirm" name="confirm" type="password" label="Repeat password" autoComplete="new-password" minLength={12} required />
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onCode} className="space-y-4" noValidate>
      <h1 className="text-xl font-semibold">Turn on two-step verification</h1>
      <p className="text-sm">Step 2 of 2: scan this code with Google Authenticator (or any TOTP app), then enter the 6-digit code it shows.</p>
      {error && <Alert>{error}</Alert>}
      {qrSvg && <div className="mx-auto w-48 rounded-xl border border-line bg-paper p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
      {secret && (
        <p className="text-center text-xs text-muted">
          Can&apos;t scan? Enter this key: <span className="break-all font-mono text-ink">{secret.replace(/(.{4})/g, '$1 ').trim()}</span>
        </p>
      )}
      <Input id="code" name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus />
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Verifying…' : 'Turn on 2FA'}
      </Button>
    </form>
  );
}
