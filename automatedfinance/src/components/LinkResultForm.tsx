'use client';

import { useState, type ReactNode } from 'react';
import { ActionForm, type ActionResult, type FormAction } from '@/components/ui/ActionForm';

/** Action form whose result carries a one-time link to copy (invites and resets). */
export function LinkResultForm({ action, children, className }: { action: FormAction; children: ReactNode; className?: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <ActionForm action={action} className={className} onResult={(r: ActionResult) => setLink(r?.ok ? ((r.data?.link as string) ?? null) : null)}>
        {children}
      </ActionForm>
      {link && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-ring bg-amber-soft px-3 py-2">
          <code className="min-w-0 flex-1 break-all text-[12px] text-ink">{link}</code>
          <button
            type="button"
            className="rounded-md bg-ink px-2.5 py-1 text-[12px] font-semibold text-white"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}
