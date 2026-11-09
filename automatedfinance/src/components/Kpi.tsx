import type { ReactNode } from 'react';

export function Kpi({
  label,
  value,
  sub,
  tone,
  wide,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'bad' | 'muted' | 'text';
  wide?: boolean;
  href?: string;
}) {
  const valueCls =
    tone === 'good' ? 'text-signal' : tone === 'bad' ? 'text-danger' : tone === 'muted' ? 'text-muted' : 'text-ink';
  const body = (
    <>
      <p className="text-xs font-semibold text-body">{label}</p>
      <p className={`mt-1 font-display tabular ${tone === 'text' ? 'text-[16px] leading-snug' : 'text-[22px] leading-tight sm:text-[24px]'} font-semibold ${valueCls}`}>{value}</p>
      {sub && <p className="mt-1 text-[11.5px] leading-snug text-muted">{sub}</p>}
    </>
  );
  const cls = `block min-w-0 rounded-xl border border-line bg-paper px-3.5 py-3 ${wide ? 'sm:col-span-2' : ''}`;
  return href ? (
    <a href={href} className={`${cls} hover:border-line-strong`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
