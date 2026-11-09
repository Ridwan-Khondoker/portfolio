import type { ReactNode } from 'react';

export type Accent = 'gold' | 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'sky' | 'gray';

// Accent bar + tinted icon chip per tile, from Happy To Deliver's palette. Figures stay in ink for readability.
const ACCENTS: Record<Accent, { bar: string; chip: string }> = {
  gold: { bar: 'bg-gold', chip: 'bg-gold-soft text-gold' },
  blue: { bar: 'bg-info', chip: 'bg-info-soft text-info' },
  green: { bar: 'bg-signal', chip: 'bg-signal-soft text-signal' },
  purple: { bar: 'bg-resident', chip: 'bg-resident-soft text-resident' },
  orange: { bar: 'bg-provider', chip: 'bg-provider-soft text-provider' },
  red: { bar: 'bg-danger', chip: 'bg-danger-soft text-danger' },
  sky: { bar: 'bg-sky', chip: 'bg-sky-soft text-sky' },
  gray: { bar: 'bg-line-strong', chip: 'bg-line-soft text-muted' },
};

const ICONS: Record<string, ReactNode> = {
  wallet: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 1 3 7.5zM16.5 13.5h1" />,
  calendar: <path d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h6" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2" />,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  bars: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  anchor: <path d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 7v14M5 13a7 7 0 0 0 14 0M8 11H5M19 11h-3" />,
  wave: <path d="M2 12c2.5-4 5-4 7.5 0s5 4 7.5 0 3.5-2.5 5-2" />,
  repeat: <path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />,
  card: <path d="M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM2 10h20M6 15h4" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />,
  share: <path d="M16 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10.6 13.5l2.8 1.8M13.4 6.7l-2.8 1.8" />,
  coins: <path d="M9 13c3.9 0 7-1.3 7-3s-3.1-3-7-3-7 1.3-7 3 3.1 3 7 3zM2 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M9 17v4M16 9.2c3.4.3 6 1.5 6 2.8 0 1.7-3.1 3-7 3M22 12v4c0 1.7-3.1 3-7 3" />,
  receipt: <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zM9 8h6M9 12h6" />,
  spark: <path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4L12 3z" />,
  percent: <path d="M19 5L5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  pie: <path d="M21 12A9 9 0 1 1 12 3v9h9zM15 3.5A9 9 0 0 1 20.5 9H15V3.5z" />,
};

export type IconName = keyof typeof ICONS;

export function Kpi({
  label,
  value,
  sub,
  tone,
  wide,
  href,
  accent = 'gold',
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'bad' | 'muted' | 'text';
  wide?: boolean;
  href?: string;
  accent?: Accent;
  icon?: IconName;
}) {
  const a = ACCENTS[accent];
  const valueCls = tone === 'good' ? 'text-signal' : tone === 'bad' ? 'text-danger' : tone === 'muted' ? 'text-muted' : 'text-ink';
  const body = (
    <>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${a.bar}`} />
      <div className="flex items-center gap-2">
        {icon && (
          <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${a.chip}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[icon]}
            </svg>
          </span>
        )}
        <p className="text-[12.5px] leading-tight font-medium text-body">{label}</p>
      </div>
      <p className={`tabular mt-2 ${tone === 'text' ? 'text-[16px] leading-snug' : 'text-[22px] leading-tight sm:text-[23px]'} font-semibold tracking-[-0.01em] ${valueCls}`}>{value}</p>
      {sub && <p className="mt-1 text-[11.5px] leading-snug text-muted">{sub}</p>}
    </>
  );
  const cls = `relative block min-w-0 overflow-hidden rounded-xl border border-line bg-paper py-3 pr-3.5 pl-4 shadow-[0_1px_2px_rgba(20,17,14,0.04)] ${wide ? 'sm:col-span-2' : ''}`;
  return href ? (
    <a href={href} className={`${cls} transition-shadow hover:shadow-[var(--shadow-card)]`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
