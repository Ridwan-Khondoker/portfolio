'use client';

import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { inputClass, Label } from './Field';

/** Password field with a show/hide (eye) button. Keyboard and screen-reader accessible. */
export function PasswordInput({ label, hint, id, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode; hint?: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        <input id={id} {...props} type={shown ? 'text' : 'password'} className={`${inputClass} pr-11 ${className}`} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          aria-controls={id}
          title={shown ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 grid w-10 cursor-pointer place-items-center rounded-r-lg text-muted hover:text-ink focus-visible:text-ink"
        >
          {shown ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c5 0 8.9 4.2 10 7-.4 1-1.2 2.3-2.3 3.5M6.5 6.6C4.4 8 2.9 10 2 12c1.1 2.8 5 7 10 7 1.7 0 3.3-.5 4.6-1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12c1.1-2.8 5-7 10-7s8.9 4.2 10 7c-1.1 2.8-5 7-10 7S3.1 14.8 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
