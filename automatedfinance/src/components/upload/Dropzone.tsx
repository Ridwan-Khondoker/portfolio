'use client';

import { useRef, useState } from 'react';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { uploadAction } from '@/app/(app)/upload/actions';

export function Dropzone({ thisYear }: { thisYear: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  return (
    <ActionForm action={uploadAction} className="space-y-3">
      <label
        htmlFor="file"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && input.current) {
            const dt = new DataTransfer();
            dt.items.add(f);
            input.current.files = dt.files;
            setName(f.name);
          }
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
          over ? 'border-amber-strong bg-amber-soft' : 'border-line-strong bg-kraft/50 hover:bg-kraft'
        }`}
      >
        <span className="font-display text-lg font-semibold text-ink">{name ?? 'Drop an .xlsx or .csv file here'}</span>
        <span className="text-sm text-muted">{name ? 'Ready to check. Nothing is saved until you confirm.' : 'or click to choose a file (max 20 MB)'}</span>
        <input ref={input} id="file" name="file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} required />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-body">
          Year for tabs with no year in their name
          <select name="year" defaultValue="" className="mt-1 block rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="">Use each tab’s saved layout year</option>
            {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <Submit variant="brand">Check file</Submit>
      </div>
    </ActionForm>
  );
}
