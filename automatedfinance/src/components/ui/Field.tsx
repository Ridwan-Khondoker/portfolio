import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export const inputClass =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink placeholder:text-muted/70 hover:border-line-strong focus:border-amber-strong focus:outline-none focus:ring-2 focus:ring-amber-ring disabled:bg-line-soft';

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-body">
      {children}
    </label>
  );
}

export function Input({ label, hint, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <input id={id} {...props} className={`${inputClass} ${props.className ?? ''}`} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Select({ label, id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode }) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <select id={id} {...props} className={`${inputClass} pr-8 ${props.className ?? ''}`}>
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode }) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <textarea id={id} {...props} className={`${inputClass} ${props.className ?? ''}`} />
    </div>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'info' | 'success' | 'warn'; children: ReactNode }) {
  const map = {
    danger: 'border-danger/30 bg-danger-soft text-danger',
    info: 'border-info/25 bg-info-soft text-info',
    success: 'border-signal/25 bg-signal-soft text-signal',
    warn: 'border-amber-ring bg-amber-soft text-amber-ink',
  } as const;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${map[tone]}`}>
      {children}
    </div>
  );
}
