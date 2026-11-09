import { Mark } from '@/components/Mark';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-kraft px-4 py-10 sm:items-center">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <Mark size={36} />
          <div>
            <p className="font-display text-lg font-semibold text-ink">Automated Finance</p>
            <p className="text-xs text-muted">Private workspace · invited users only</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-6 shadow-[var(--shadow-card)]">{children}</div>
      </div>
    </main>
  );
}
