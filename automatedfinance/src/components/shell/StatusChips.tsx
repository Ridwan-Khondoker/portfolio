/** As-of date, last import and Google sync status as small chips. */
export function StatusChips({ asOf, asOfFixed, imported, sync }: { asOf: string; asOfFixed: boolean; imported: string; sync: { text: string; tone: 'ok' | 'warn' | 'bad' | 'off' } }) {
  const dot = { ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500', off: 'bg-slate-300' }[sync.tone];
  const chip = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-paper px-2.5 py-1 text-[12px] text-body';
  return (
    <>
      <span className={chip} title={asOfFixed ? 'As-of date fixed in Settings' : 'As-of date follows today'}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="text-muted">
          <path d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
        </svg>
        As of <strong className="font-semibold text-ink">{asOf}</strong>
      </span>
      <span className={chip}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="text-muted">
          <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
        </svg>
        Imported {imported}
      </span>
      <span className={chip}>
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        Sync: {sync.text}
      </span>
    </>
  );
}
