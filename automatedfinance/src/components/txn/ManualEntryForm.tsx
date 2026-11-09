'use client';

import { useState } from 'react';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { saveManualAction } from '@/app/(app)/transactions/actions';

export type ManualDefaults = {
  key?: string;
  transactionDate?: string;
  department?: string;
  category?: string;
  description?: string;
  vendor?: string;
  paymentMethod?: string;
  amount?: string;
  currency?: string;
  paymentStatus?: string;
  dueDate?: string;
  recurring?: string;
  reference?: string;
  notes?: string;
};

export function ManualEntryForm({ departments, categories, currencies, defaults = {}, today, label = 'Add an expense' }: { departments: string[]; categories: string[]; currencies: string[]; defaults?: ManualDefaults; today: string; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" variant={defaults.key ? 'ghost' : 'brand'} size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  const id = (n: string) => `${defaults.key ?? 'new'}-${n}`;
  return (
    <div className="w-full rounded-xl border border-line bg-kraft/50 p-4">
      <ActionForm action={saveManualAction} resetOnSuccess={!defaults.key} onResult={(r) => r?.ok && defaults.key && setOpen(false)} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {defaults.key && <input type="hidden" name="key" value={defaults.key} />}
        <Input id={id('date')} name="transactionDate" type="date" label="Transaction date" defaultValue={defaults.transactionDate ?? today} required />
        <Select id={id('dept')} name="department" label="Department / project" defaultValue={defaults.department ?? departments[0]}>
          {departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
        <Select id={id('cat')} name="category" label="Expense category" defaultValue={defaults.category ?? ''}>
          <option value="" disabled>
            Choose…
          </option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Input id={id('amount')} name="amount" label="Amount" inputMode="decimal" placeholder="1250.00" defaultValue={defaults.amount} required />
        <div className="sm:col-span-2">
          <Input id={id('desc')} name="description" label="Expense description" defaultValue={defaults.description} required maxLength={300} />
        </div>
        <Input id={id('vendor')} name="vendor" label="Vendor / payee" defaultValue={defaults.vendor} maxLength={160} />
        <Select id={id('cur')} name="currency" label="Currency" defaultValue={defaults.currency ?? 'USD'}>
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Input id={id('pm')} name="paymentMethod" label="Payment method" defaultValue={defaults.paymentMethod} maxLength={120} />
        <Select id={id('status')} name="paymentStatus" label="Payment status" defaultValue={defaults.paymentStatus ?? 'Not recorded'}>
          <option>Paid</option>
          <option>Pending</option>
          <option>Overdue</option>
          <option>Not recorded</option>
        </Select>
        <Input id={id('due')} name="dueDate" type="date" label="Due date" defaultValue={defaults.dueDate} />
        <Select id={id('rec')} name="recurring" label="Recurring / one-time" defaultValue={defaults.recurring ?? 'One-Time'}>
          <option>One-Time</option>
          <option>Recurring</option>
        </Select>
        <Input id={id('ref')} name="reference" label="Reference / invoice #" defaultValue={defaults.reference} maxLength={120} />
        <div className="sm:col-span-2 lg:col-span-3">
          <Textarea id={id('notes')} name="notes" label="Notes" rows={1} defaultValue={defaults.notes} maxLength={1000} />
        </div>
        <div className="flex items-end gap-2">
          <Submit variant="primary">{defaults.key ? 'Save changes' : 'Add expense'}</Submit>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </ActionForm>
    </div>
  );
}
