import type { ReactNode } from 'react';

export function Card({ title, actions, children, className = '', note }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; note?: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-paper p-4 shadow-[0_1px_2px_rgba(20,17,14,0.04)] sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          {title && <h3 className="text-[15px] font-semibold">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </section>
  );
}

const MARKER: Record<string, string> = {
  amber: 'bg-amber',
  green: 'bg-signal',
  blue: 'bg-info',
  purple: 'bg-resident',
  orange: 'bg-provider',
};

export function SectionTitle({ children, sub, tone = 'amber' }: { children: ReactNode; sub?: ReactNode; tone?: keyof typeof MARKER }) {
  return (
    <div className="mt-8 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span aria-hidden className={`h-5 w-1.5 rounded-full ${MARKER[tone]}`} />
      <h2 className="text-lg font-semibold">{children}</h2>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}
