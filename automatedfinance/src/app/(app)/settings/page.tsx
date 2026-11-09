import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/server/auth';
import { loadAppSettings } from '@/lib/server/data';
import { serviceAccountEmail } from '@/lib/server/google-sync';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Alert, inputClass } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { addSheetSource, deleteProfile, saveBudgets, saveCategories, saveFx, saveGeneral, saveMappings, updateSheetSource } from './actions';

export const metadata = { title: 'Settings' };

const TYPES = ['Fixed', 'Variable', 'Non-operating', 'Unclassified'];

export default async function SettingsPage() {
  await requirePageUser('ADMIN');
  const [app, categories, mappings, budgets, departments, fx, profiles, sources] = await Promise.all([
    loadAppSettings(),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.categoryMapping.findMany({ orderBy: { sourceLabel: 'asc' } }),
    prisma.budget.findMany(),
    prisma.department.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.fxRate.findMany({ orderBy: { code: 'asc' } }),
    prisma.layoutProfile.findMany({ orderBy: [{ tabName: 'asc' }, { name: 'asc' }] }),
    prisma.googleSheetSource.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);
  const sa = serviceAccountEmail();
  const budgetOf = (d: string) => budgets.find((b) => b.department === d)?.monthlyAmount.toString() ?? '0';
  const toc = ['General', 'Categories', 'Mappings', 'Budgets', 'Currencies', 'Google sync', 'Layout profiles', 'Export & backups'];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <nav aria-label="Settings sections" className="mt-3 flex flex-wrap gap-2 text-[13px]">
        {toc.map((t) => (
          <a key={t} href={`#${t.toLowerCase().replace(/[^a-z]+/g, '-')}`} className="rounded-lg border border-line px-2.5 py-1 hover:border-line-strong">
            {t}
          </a>
        ))}
      </nav>

      <SectionTitle>
        <span id="general">General</span>
      </SectionTitle>
      <Card>
        <ActionForm action={saveGeneral} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company name" name="companyName" defaultValue={app.companyName} />
          <Field label="As-of date (blank = today)" name="asOfDate" type="date" defaultValue={app.asOfDate ?? ''} hint="Drives current month, YTD, overdue and the projection window." />
          <Field label="Fiscal year start month (1–12)" name="fyStartMonth" type="number" defaultValue={String(app.fyStartMonth)} hint="Assumed January: the source sheets don't state one." />
          <Field label="Recurring threshold (months with spend)" name="recurringThreshold" type="number" defaultValue={String(app.recurringThreshold)} />
          <Field label="Forecast baseline window (months)" name="baselineMonths" type="number" defaultValue={String(app.baselineMonths)} />
          <Field label="Overdue grace (days)" name="graceDays" type="number" defaultValue={String(app.graceDays)} />
          <Field label="Google sync: auto-commit threshold (%)" name="autoCommitThreshold" type="number" defaultValue={String(Math.round(Number(app.autoCommitThreshold) * 100))} hint="Larger changes to any business-month are held for review." />
          <Field label="Google sync interval (minutes)" name="syncIntervalMinutes" type="number" defaultValue={String(app.syncIntervalMinutes)} />
          <Field label="Domain alert (days before renewal)" name="domainAlertDays" type="number" defaultValue={String(app.domainAlertDays)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="syncEnabled" defaultChecked={app.syncEnabled !== false} /> Google sync on
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <Submit>Save general settings</Submit>
          </div>
        </ActionForm>
      </Card>

      <SectionTitle sub="Expense type drives Fixed / Variable / Non-operating totals and the forecast">
        <span id="categories">Categories</span>
      </SectionTitle>
      <Card>
        <ActionForm action={saveCategories}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="text-left text-body">
                <tr className="border-b border-line">
                  <th className="py-1.5 pr-2 font-semibold">Category</th>
                  <th className="py-1.5 pr-2 font-semibold">Type</th>
                  <th className="py-1.5 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-line-soft">
                    <td className="py-1 pr-2 text-ink">{c.name}</td>
                    <td className="py-1 pr-2">
                      <select name={`type:${c.id}`} defaultValue={c.expenseType} aria-label={`${c.name} type`} className={`${inputClass} py-1`}>
                        {TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1">
                      <input name={`desc:${c.id}`} defaultValue={c.description ?? ''} aria-label={`${c.name} description`} className={`${inputClass} py-1`} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-2">
                    <input name="newName" placeholder="New category" aria-label="New category name" className={`${inputClass} py-1`} />
                  </td>
                  <td className="py-2 pr-2">
                    <select name="newType" defaultValue="Variable" aria-label="New category type" className={`${inputClass} py-1`}>
                      {TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Submit>Save categories</Submit>
          </div>
        </ActionForm>
      </Card>

      <SectionTitle sub="Source label in the sheet → standard category. Unmapped labels go to Other / Uncategorized and are flagged.">
        <span id="mappings">Mappings</span>
      </SectionTitle>
      <Card>
        <ActionForm action={saveMappings}>
          <div className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
            {mappings.map((m) => (
              <label key={m.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-2 text-[13px]">
                <span className="truncate text-ink" title={m.sourceLabel}>
                  {m.sourceLabel}
                </span>
                <select name={`map:${m.id}`} defaultValue={m.category} className={`${inputClass} py-1`}>
                  {categories.map((c) => (
                    <option key={c.id}>{c.name}</option>
                  ))}
                  <option value="__delete">— remove this mapping —</option>
                </select>
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto]">
            <input name="newLabel" placeholder="New source label (as typed in the sheet)" aria-label="New source label" className={inputClass} />
            <select name="newCategory" defaultValue="" aria-label="Category for the new label" className={inputClass}>
              <option value="">Category…</option>
              {categories.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
            <Submit>Save mappings</Submit>
          </div>
        </ActionForm>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <SectionTitle sub="Monthly budget per business (default: the October run-rate)">
            <span id="budgets">Budgets</span>
          </SectionTitle>
          <Card>
            <ActionForm action={saveBudgets} className="space-y-2">
              {departments.map((d) => (
                <label key={d.id} className="grid grid-cols-[1fr_160px] items-center gap-3 text-[13px]">
                  {d.name}
                  <input name={`budget:${d.name}`} defaultValue={budgetOf(d.name)} inputMode="decimal" className={`${inputClass} tabular py-1 text-right`} />
                </label>
              ))}
              <Submit>Save budgets</Submit>
            </ActionForm>
          </Card>
        </div>
        <div>
          <SectionTitle sub="Units of currency per 1 USD">
            <span id="currencies">Currencies</span>
          </SectionTitle>
          <Card>
            <ActionForm action={saveFx} className="space-y-2">
              {fx.map((r) => (
                <label key={r.code} className="grid grid-cols-[60px_160px_1fr] items-center gap-3 text-[13px]">
                  <strong className="text-ink">{r.code}</strong>
                  <input name={`fx:${r.code}`} defaultValue={r.unitsPerUsd?.toString() ?? ''} disabled={r.code === 'USD'} placeholder="no rate" inputMode="decimal" className={`${inputClass} tabular py-1 text-right`} />
                  <span className="text-xs text-muted">{r.note}</span>
                </label>
              ))}
              <div className="grid grid-cols-[60px_160px_1fr] gap-3">
                <input name="newCode" placeholder="EUR" aria-label="New currency code" maxLength={3} className={`${inputClass} py-1 uppercase`} />
                <input name="newRate" placeholder="rate" aria-label="New currency rate" inputMode="decimal" className={`${inputClass} py-1 text-right`} />
              </div>
              <Submit>Save currencies</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>

      <SectionTitle sub="Imports the live sheet automatically through the same importer as uploads">
        <span id="google-sync">Google sync</span>
      </SectionTitle>
      <Card>
        {sa ? (
          <Alert tone="info">
            Share each sheet with <strong className="font-mono">{sa}</strong> as <strong>Viewer</strong> (Share → add this email → Viewer). Nothing else needs access.
          </Alert>
        ) : (
          <Alert tone="warn">Google sync is off: set the GOOGLE_SERVICE_ACCOUNT_JSON variable on the server (see README → Enabling Google sync), then reload.</Alert>
        )}
        <ul className="mt-3 divide-y divide-line-soft text-[13px]">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong className="text-ink">{s.label}</strong>
                {s.year ? ` · ${s.year}` : ''} · <span className="font-mono text-[11.5px]">{s.sheetId}</span>
                <span className="block text-muted">
                  {s.lastStatus ? `${s.lastStatus}${s.lastMessage ? `: ${s.lastMessage}` : ''}` : 'Not synced yet'}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <ActionForm action={updateSheetSource} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> enabled
                  </label>
                  <Submit size="sm" variant="ghost">
                    Save
                  </Submit>
                </ActionForm>
                <ActionForm action={updateSheetSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="remove" value="1" />
                  <Submit size="sm" variant="danger" confirm="Stop syncing this sheet? Data already imported stays.">
                    Remove
                  </Submit>
                </ActionForm>
              </span>
            </li>
          ))}
        </ul>
        <ActionForm action={addSheetSource} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[2fr_1fr_120px_auto]">
          <input name="sheet" placeholder="Google Sheet link or ID" aria-label="Google Sheet link or ID" className={inputClass} />
          <input name="label" placeholder="Label, e.g. Expenses 2027" aria-label="Label" className={inputClass} />
          <input name="year" type="number" placeholder="Year (optional)" aria-label="Year for tabs without a year" className={inputClass} />
          <Submit>Add sheet</Submit>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">The year is used for business tabs whose name has no year (e.g. “HTD” in next year’s copy). Add one sheet per year if the company starts a new file each year.</p>
      </Card>

      <SectionTitle sub="How each tab and block is read. Created by the seed and by the mapping step on uploads.">
        <span id="layout-profiles">Layout profiles</span>
      </SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead className="text-left text-body">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-2 font-semibold">Tab</th>
                <th className="py-1.5 pr-2 font-semibold">Layout</th>
                <th className="py-1.5 pr-2 font-semibold">Kind</th>
                <th className="py-1.5 pr-2 font-semibold">Details</th>
                <th className="py-1.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const c = p.config as Record<string, unknown>;
                return (
                  <tr key={p.id} className="border-b border-line-soft align-top">
                    <td className="py-1.5 pr-2 font-semibold text-ink">{p.tabName}</td>
                    <td className="py-1.5 pr-2">
                      {p.name} {p.builtin && <Badge tone="neutral">from seed</Badge>}
                    </td>
                    <td className="py-1.5 pr-2">{c.skip ? 'Not imported' : p.kind}</td>
                    <td className="py-1.5 pr-2 text-muted">
                      {p.kind === 'GRID' && !c.skip ? `${c.department}, ${c.year ?? 'year from file'}, ${c.recordType}, rows +${c.firstOffset}…+${c.lastOffset} below the header` : p.kind === 'IGNORE' ? String(c.reason ?? '') : ''}
                    </td>
                    <td className="py-1.5">
                      <ActionForm action={deleteProfile}>
                        <input type="hidden" name="id" value={p.id} />
                        <Submit size="sm" variant="link" confirm={`Remove the layout “${p.name}”? The next upload of this tab will ask for a mapping again. Rows imported with it keep their values.`}>
                          Remove
                        </Submit>
                      </ActionForm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle>
        <span id="export-backups">Export &amp; backups</span>
      </SectionTitle>
      <Card>
        <p className="text-sm">Download one workbook with every current row, the reference tables, settings and the audit log. Database backups run daily on Railway (see README → Backups).</p>
        <a className={`${buttonClass('primary', 'sm')} mt-3`} href="/api/export/all">
          Export everything (.xlsx)
        </a>
      </Card>
    </div>
  );
}

function Field({ label, name, defaultValue, type = 'text', hint }: { label: string; name: string; defaultValue: string; type?: string; hint?: string }) {
  return (
    <label className="text-xs font-semibold text-body">
      {label}
      <input name={name} type={type} defaultValue={defaultValue} className={`${inputClass} mt-1`} />
      {hint && <span className="mt-1 block font-normal text-muted">{hint}</span>}
    </label>
  );
}
