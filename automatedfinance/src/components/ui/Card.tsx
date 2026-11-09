import type { ReactNode } from 'react';

export function Card({ title, actions, children, className = '', note }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; note?: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-paper p-4 sm:p-5 ${className}`}>
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

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-lg font-semibold">{children}</h2>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}
