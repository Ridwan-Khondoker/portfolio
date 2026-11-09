import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'amber' | 'green' | 'blue' | 'purple' | 'orange' | 'red';

const TONES: Record<Tone, string> = {
  neutral: 'bg-line-soft text-body border-line',
  amber: 'bg-amber-soft text-amber-strong border-amber-ring',
  green: 'bg-signal-soft text-signal border-[#c3ded2]',
  blue: 'bg-info-soft text-info border-[#c7d9fb]',
  purple: 'bg-resident-soft text-resident border-[#ddd0fb]',
  orange: 'bg-provider-soft text-provider border-[#f6d5bd]',
  red: 'bg-danger-soft text-danger border-[#f4c7c2]',
};

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'Paid':
      return 'green';
    case 'Pending':
      return 'amber';
    case 'Overdue':
      return 'red';
    default:
      return 'neutral';
  }
}

export function recordTypeTone(recordType: string): Tone {
  if (recordType.startsWith('Estimate')) return 'purple';
  if (recordType.startsWith('Actual')) return 'green';
  if (recordType.startsWith('Summary')) return 'blue';
  if (recordType.startsWith('Manual')) return 'orange';
  return 'neutral';
}
