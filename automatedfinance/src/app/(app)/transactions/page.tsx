import Link from 'next/link';
import { requirePageUser } from '@/lib/server/auth';
import { hasRole } from '@/lib/security/roles';
import { queryTransactions } from '@/lib/server/transactions';
import { filterQuery, sp, type SearchParams } from '@/lib/server/filters';
import { firstDataMonth } from '@/lib/finance/dashboard';
import { fmtUsd } from '@/lib/money';
import { monthLabel, todayYmd } from '@/lib/months';
import { FilterBar } from '@/components/FilterBar';
import { Badge, recordTypeTone } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { StatusCell } from '@/components/txn/StatusCell';
import { ManualEntryForm } from '@/components/txn/ManualEntryForm';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { deleteManualAction } from './actions';
import { prisma } from '@/lib/db';

export const metadata = { title: 'Transactions' };
const PAGE = 50;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser();
  const canEdit = hasRole(user.role, 'EDITOR');
  const params = await searchParams;
  const { state, query, rows, batches, categories } = await queryTransactions(params);
  const page = Math.max(1, Number(sp(params, 'page')) || 1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const total = rows.reduce((a, r) => a + (r.amountUsd?.toNumber() ?? 0), 0);
  const current = state.settings.asOf.slice(0, 7);
  const fx = await prisma.fxRate.findMany({ orderBy: { code: 'asc' } });
  const base = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])));
  const link = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(base);
    for (const [k, v] of Object.entries(changes)) (v === null ? q.delete(k) : q.set(k, v));
    return `/transactions?${q}`;
  };
  const sortLink = (key: string) => link({ sort: key, dir: query.sort === key && query.dir === 'desc' ? 'asc' : 'desc', page: null });
  const exportQ = new URLSearchParams(base);
  exportQ.delete('page');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <div className="flex flex-wrap gap-2">
          <a className={buttonClass('ghost', 'sm')} href={`/api/export/transactions?${exportQ}&format=csv`}>
            Export CSV
          </a>
          <a className={buttonClass('ghost', 'sm')} href={`/api/export/transactions?${exportQ}&format=xlsx`}>
            Export XLSX
          </a>
        </div>
      </div>
      <FilterBar
        {...query.filters}
        departments={state.ref.departments}
        categories={categories}
        defaults={{ start: firstDataMonth(state.rows) ?? query.filters.start, end: current }}
        note={`${monthLabel(query.filters.start)} – ${monthLabel(query.filters.end)}`}
      />

      {canEdit && (
        <div className="mt-4">
          <ManualEntryForm departments={state.ref.departments} categories={categories} currencies={fx.map((f) => f.code)} today={todayYmd()} />
        </div>
      )}

      <form method="get" action="/transactions" className="mt-4 flex flex-wrap items-center gap-2">
        {[...base.entries()]
          .filter(([k]) => !['q', 'page', 'all', 'flagged'].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input type="search" name="q" defaultValue={query.q} placeholder="Search description, vendor, category, business, source cell…" aria-label="Search transactions" className={`${inputClass} max-w-xl flex-1`} />
        <label className="flex items-center gap-1.5 text-[13px]">
          <input type="checkbox" name="all" value="1" defaultChecked={query.includeUncounted} /> Include rows not counted in totals
        </label>
        <label className="flex items-center gap-1.5 text-[13px]">
          <input type="checkbox" name="flagged" value="1" defaultChecked={query.flaggedOnly} /> Flagged only
        </label>
        <button className={buttonClass('primary', 'sm')} type="submit">
          Search
        </button>
      </form>

      <p className="mt-3 text-[13px] text-body">
        <strong className="text-ink">{rows.length.toLocaleString()}</strong> rows · <strong className="tabular text-ink">{fmtUsd(total, { cents: true })}</strong>
        {query.includeUncounted ? ' (includes rows not counted in totals; the sum is only indicative)' : ''}
      </p>

      <div className="mt-2 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[1150px] text-[12.5px]">
          <thead className="bg-kraft/60 text-left text-body">
            <tr>
              <Th href={sortLink('month')} active={query.sort === 'month'} dir={query.dir}>
                Date
              </Th>
              <Th href={sortLink('department')} active={query.sort === 'department'} dir={query.dir}>
                Business
              </Th>
              <Th href={sortLink('category')} active={query.sort === 'category'} dir={query.dir}>
                Category
              </Th>
              <th className="px-3 py-2 font-semibold">Description</th>
              <Th href={sortLink('vendor')} active={query.sort === 'vendor'} dir={query.dir}>
                Vendor / payee
              </Th>
              <Th href={sortLink('amount')} active={query.sort === 'amount'} dir={query.dir} right>
                Amount
              </Th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Record</th>
              <Th href={sortLink('status')} active={query.sort === 'status'} dir={query.dir}>
                Status
              </Th>
              <th className="px-3 py-2 font-semibold">Source & batch</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const b = batches.get(r.batchId);
              return (
                <tr key={r.key} className={`border-t border-line-soft align-top ${r.counted ? '' : 'bg-line-soft/40 text-muted'}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="tabular">{r.kind === 'MANUAL' || r.kind === 'TRANSACTION' ? r.txnDate ?? '–' : r.month ? monthLabel(r.month) : '–'}</span>
                    <span className="block text-[11px] text-muted">{r.displayId}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.department ?? '–'}</td>
                  <td className="px-3 py-2">
                    {r.category}
                    {r.sourceCategory && r.sourceCategory !== r.category && <span className="block text-[11px] text-muted">source: {r.sourceCategory}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.description}
                    {r.flags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.flags.map((f) => (
                          <Badge key={f} tone="red">
                            {f}
                          </Badge>
                        ))}
                      </span>
                    )}
                    {r.kind === 'MANUAL' && canEdit && (
                      <span className="mt-1.5 flex flex-wrap items-start gap-2">
                        <ManualEntryForm
                          label="Edit"
                          departments={state.ref.departments}
                          categories={categories}
                          currencies={fx.map((f) => f.code)}
                          today={todayYmd()}
                          defaults={{
                            key: r.key,
                            transactionDate: r.txnDate ?? undefined,
                            department: r.department ?? undefined,
                            category: r.sourceCategory ?? undefined,
                            description: r.description ?? undefined,
                            vendor: r.item ?? undefined,
                            paymentMethod: r.paymentMethod ?? undefined,
                            amount: r.amount ?? undefined,
                            currency: r.currency ?? 'USD',
                            paymentStatus: r.storedStatus,
                            dueDate: r.dueDate ?? undefined,
                            recurring: r.recurringOverride ?? 'One-Time',
                            reference: r.reference ?? undefined,
                            notes: r.notes ?? undefined,
                          }}
                        />
                        <ActionForm action={deleteManualAction}>
                          <input type="hidden" name="key" value={r.key} />
                          <Submit size="sm" variant="danger" confirm="Delete this manual entry?">
                            Delete
                          </Submit>
                        </ActionForm>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.vendor}</td>
                  <td className="tabular px-3 py-2 text-right whitespace-nowrap text-ink">
                    {r.amountUsd ? fmtUsd(r.amountUsd.toNumber(), { cents: true }) : <span className="text-danger">{r.rawValue ?? '–'}</span>}
                    {r.currency && r.currency !== 'USD' && <span className="block text-[11px] text-muted">{`${r.amount} ${r.currency}`}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.expenseType}
                    <span className="block text-[11px] text-muted">{r.recurring}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={recordTypeTone(r.recordType)}>{r.recordType}</Badge>
                    {!r.counted && <span className="mt-1 block text-[11px]">not counted</span>}
                  </td>
                  <td className="px-3 py-2">
                    <StatusCell rowKey={r.key} status={r.status} stored={r.storedStatus} dueDate={r.dueDate} canEdit={canEdit} />
                    {r.dueDate && <span className="mt-1 block text-[11px] text-muted">due {r.dueDate}</span>}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-muted">
                    <span className="block font-mono text-body">{r.cell ?? (r.kind === 'MANUAL' ? 'Manual entry' : '–')}</span>
                    {b ? (
                      hasRole(user.role, 'EDITOR') ? (
                        <Link className="hover:underline" href={`/upload/${b.id}`}>
                          {b.label}
                        </Link>
                      ) : (
                        b.label
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted">
                  No rows match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-3 flex items-center gap-2 text-[13px]">
          {page > 1 && (
            <Link className={buttonClass('ghost', 'sm')} href={link({ page: String(page - 1) })}>
              Previous
            </Link>
          )}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link className={buttonClass('ghost', 'sm')} href={link({ page: String(page + 1) })}>
              Next
            </Link>
          )}
        </nav>
      )}
      <p className="mt-3 text-xs text-muted">
        Imported rows are edited in their source sheet and re-uploaded; payment status and due date are set here and survive re-imports. Filters: <code>{filterQuery(query.filters) || 'default'}</code>
      </p>
    </div>
  );
}

function Th({ href, active, dir, right, children }: { href: string; active: boolean; dir: 'asc' | 'desc'; right?: boolean; children: React.ReactNode }) {
  return (
    <th className={`px-3 py-2 font-semibold ${right ? 'text-right' : ''}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link href={href} className="inline-flex items-center gap-1 hover:text-ink">
        {children}
        <span aria-hidden className="text-[10px] text-muted">
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </Link>
    </th>
  );
}
