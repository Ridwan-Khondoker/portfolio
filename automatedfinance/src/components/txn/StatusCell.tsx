'use client';

import { useState } from 'react';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { Badge, statusTone } from '@/components/ui/Badge';
import { setStatusAction } from '@/app/(app)/transactions/actions';

export function StatusCell({ rowKey, status, stored, dueDate, canEdit }: { rowKey: string; status: string; stored: string; dueDate: string | null; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const badge = (
    <Badge tone={statusTone(status)} title={status !== stored ? `Recorded as ${stored}; past its due date` : undefined}>
      {status}
    </Badge>
  );
  if (!canEdit) return badge;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer rounded hover:ring-2 hover:ring-amber-ring" aria-label={`Payment status ${status}. Change`}>
        {badge}
      </button>
    );
  return (
    <ActionForm action={setStatusAction} className="flex min-w-[220px] flex-wrap items-center gap-1.5" onResult={(r) => r?.ok && setOpen(false)}>
      <input type="hidden" name="key" value={rowKey} />
      <select name="status" defaultValue={stored} aria-label="Payment status" className="rounded-md border border-line bg-paper px-1.5 py-1 text-[12px]">
        <option>Paid</option>
        <option>Pending</option>
        <option>Overdue</option>
        <option>Not recorded</option>
      </select>
      <input type="date" name="dueDate" defaultValue={dueDate ?? ''} aria-label="Due date" className="rounded-md border border-line bg-paper px-1.5 py-1 text-[12px]" />
      <Submit size="sm" variant="primary">
        Save
      </Submit>
      <button type="button" className="text-[12px] text-muted hover:underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </ActionForm>
  );
}
