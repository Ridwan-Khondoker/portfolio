'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonClass } from './Button';

export type ActionResult = { ok: boolean; message: string; data?: Record<string, unknown> } | null;
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

export function Submit({ children, variant = 'primary', size = 'md', confirm, className = '' }: { children: ReactNode; variant?: 'brand' | 'primary' | 'ghost' | 'danger' | 'link'; size?: 'sm' | 'md'; confirm?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass(variant, size)} ${className}`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}

/** A form bound to a server action that reports { ok, message } inline. */
export function ActionForm({
  action,
  children,
  className = '',
  resetOnSuccess = false,
  onResult,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onResult?: (r: ActionResult) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state) onResult?.(state);
  }, [state, resetOnSuccess, onResult]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state && (
        <p role={state.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${state.ok ? 'text-signal' : 'text-danger'}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
