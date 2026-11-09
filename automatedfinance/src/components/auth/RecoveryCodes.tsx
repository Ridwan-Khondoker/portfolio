'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/** Shown once, right after two-step verification is turned on. */
export function RecoveryCodes({ codes, continueLabel = 'Continue', onContinue }: { codes: string[]; continueLabel?: string; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Save your recovery codes</h2>
      <p className="text-sm">Each code works once if you lose your phone. They are shown only now: keep them in a password manager.</p>
      <ol className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-kraft p-3 font-mono text-sm text-ink">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          navigator.clipboard?.writeText(codes.join('\n'));
          setCopied(true);
        }}
      >
        {copied ? 'Copied' : 'Copy codes'}
      </Button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved these codes
      </label>
      <Button type="button" variant="brand" className="w-full" disabled={!saved} onClick={onContinue}>
        {continueLabel}
      </Button>
    </div>
  );
}
