import type { ButtonHTMLAttributes } from 'react';

type Variant = 'brand' | 'primary' | 'ghost' | 'danger' | 'link';

const STYLES: Record<Variant, string> = {
  brand: 'bg-amber text-amber-ink hover:bg-amber-hover border border-transparent',
  primary: 'bg-ink text-white hover:bg-black border border-transparent',
  ghost: 'bg-paper text-ink border border-line hover:border-line-strong',
  danger: 'bg-paper text-danger border border-line hover:border-danger',
  link: 'bg-transparent text-amber-strong hover:underline border border-transparent px-1!',
};

export function buttonClass(variant: Variant = 'primary', size: 'sm' | 'md' = 'md'): string {
  const sz = size === 'sm' ? 'px-3 py-1.5 text-[13px] rounded-lg' : 'px-4 py-2.5 text-sm rounded-[10px]';
  return `inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sz} ${STYLES[variant]}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return <button {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}
