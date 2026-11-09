'use client';

// All dashboard/projection charts. Chart.js with the validated HTD palette (src/lib/palette.ts):
// thin bars (≤ 24px, 4px rounded data-end, square at the baseline), 2px lines, 2px surface gaps,
// hairline solid grid, one y-axis, a legend for 2+ series, tooltips on every mark, text in ink tokens.
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
  type Plugin,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { BODY, FOLD, GRID, INK, MUTED, SERIES, SURFACE } from '@/lib/palette';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);
ChartJS.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = BODY;

const usd = (v: number, cents = false) =>
  (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${v < 0 ? '−' : ''}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 10_000) return `${v < 0 ? '−' : ''}$${Math.round(a / 1000)}K`;
  return usd(v);
};

const tooltip = {
  backgroundColor: INK,
  titleColor: '#fff',
  bodyColor: '#fff',
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
  usePointStyle: true,
};

const legend = {
  position: 'bottom' as const,
  labels: { usePointStyle: true, pointStyle: 'rectRounded' as const, boxWidth: 10, boxHeight: 10, padding: 14, color: BODY },
};

const moneyAxis = { ticks: { callback: (v: string | number) => compact(Number(v)), color: MUTED }, grid: { color: GRID, lineWidth: 1 }, border: { display: false } };
const catAxis = { ticks: { color: MUTED, autoSkip: true, maxRotation: 0 }, grid: { display: false }, border: { color: GRID } };

/** Value at the tip of horizontal bars (text tokens, never the series colour). */
const tipLabels: Plugin<'bar'> = {
  id: 'tipLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      const v = chart.data.datasets[0]!.data[i] as number;
      if (!v) return;
      const { x, y } = bar.getProps(['x', 'y'], true) as { x: number; y: number };
      const text = compact(v);
      const w = ctx.measureText(text).width;
      const room = chart.chartArea.right - x;
      ctx.textAlign = room > w + 10 ? 'left' : 'right';
      ctx.fillStyle = room > w + 10 ? INK : '#fff';
      ctx.fillText(text, room > w + 10 ? x + 6 : x - 6, y);
    });
    ctx.restore();
  },
};

function ChartBox({ height = 300, label, children }: { height?: number; label: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className="relative w-full" style={{ height }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ 1. trend

export function TrendChart({ months, labels, expenses, revenue, firstProjected }: { months: string[]; labels: string[]; expenses: number[]; revenue: number[]; firstProjected: number }) {
  const options: ChartOptions<'line'> = {
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: { y: { ...moneyAxis, beginAtZero: true }, x: catAxis },
    plugins: {
      legend,
      tooltip: {
        ...tooltip,
        callbacks: {
          label: (c) => ` ${c.dataset.label}: ${usd(c.parsed.y ?? 0, true)}${c.datasetIndex === 1 && c.dataIndex >= firstProjected ? ' (projected)' : ''}`,
        },
      },
    },
    elements: { line: { borderWidth: 2, tension: 0, borderCapStyle: 'round', borderJoinStyle: 'round' }, point: { radius: 4, hoverRadius: 6, borderWidth: 2, borderColor: SURFACE } },
  };
  return (
    <ChartBox label={`Monthly expenses and revenue, ${labels[0]} to ${labels[labels.length - 1]}`}>
      <Line
        options={options}
        data={{
          labels,
          datasets: [
            { label: 'Expenses', data: expenses, borderColor: SERIES[0], backgroundColor: SERIES[0], pointBackgroundColor: SERIES[0] },
            {
              label: 'Revenue',
              data: revenue,
              borderColor: SERIES[2],
              backgroundColor: SERIES[2],
              pointBackgroundColor: SERIES[2],
              segment: { borderDash: (ctx) => (ctx.p1DataIndex >= firstProjected ? [6, 4] : undefined) },
            },
          ],
        }}
        key={months.join()}
      />
    </ChartBox>
  );
}

// ------------------------------------------------------------------ 2. categories

export function CategoryDonut({ slices }: { slices: { name: string; amount: number; color: string }[] }) {
  const total = slices.reduce((a, s) => a + s.amount, 0);
  return (
    <div className="grid gap-4">
      <div className="mx-auto w-full max-w-[220px]">
      <ChartBox height={200} label="Expense breakdown by category">
        <Doughnut
          options={{
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: { display: false },
              tooltip: { ...tooltip, callbacks: { label: (c) => ` ${c.label}: ${usd(c.parsed, true)} (${total ? ((c.parsed / total) * 100).toFixed(1) : 0}%)` } },
            },
          }}
          data={{ labels: slices.map((s) => s.name), datasets: [{ data: slices.map((s) => s.amount), backgroundColor: slices.map((s) => s.color), borderColor: SURFACE, borderWidth: 2, hoverOffset: 4 }] }}
        />
      </ChartBox>
      </div>
      <table className="w-full text-[12.5px]">
        <caption className="sr-only">Category totals</caption>
        <tbody>
          {slices.map((s) => (
            <tr key={s.name} className="border-b border-line-soft last:border-0">
              <td className="py-1 pr-3">
                <span className="inline-flex items-start gap-2">
                  <span aria-hidden className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                  {s.name}
                </span>
              </td>
              <td className="tabular py-1 pr-3 text-right whitespace-nowrap text-ink">{usd(s.amount)}</td>
              <td className="tabular w-10 py-1 text-right whitespace-nowrap text-muted">{total ? `${((s.amount / total) * 100).toFixed(0)}%` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ 3 & 5. horizontal bars (single series)

export function HBarChart({ labels, values, label, height }: { labels: string[]; values: number[]; label: string; height?: number }) {
  const h = height ?? Math.max(160, labels.length * 34 + 30);
  return (
    <ChartBox height={h} label={label}>
      <Bar
        plugins={[tipLabels]}
        options={{
          indexAxis: 'y',
          maintainAspectRatio: false,
          layout: { padding: { right: 56 } },
          scales: { x: { ...moneyAxis, beginAtZero: true }, y: { ...catAxis, ticks: { color: BODY, autoSkip: false } } },
          plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (c) => ` ${usd(c.parsed.x ?? 0, true)}` } } },
        }}
        data={{ labels, datasets: [{ label, data: values, backgroundColor: SERIES[0], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }] }}
      />
    </ChartBox>
  );
}

// ------------------------------------------------------------------ 4. stacked by business

export function StackedChart({ labels, series, label }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; label: string }) {
  const topIdx = labels.map((_, i) => {
    let top = -1;
    series.forEach((s, j) => {
      if ((s.values[i] ?? 0) > 0) top = j;
    });
    return top;
  });
  return (
    <ChartBox label={label} height={320}>
      <Bar
        options={{
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: { x: { ...catAxis, stacked: true }, y: { ...moneyAxis, stacked: true, beginAtZero: true } },
          plugins: {
            legend,
            tooltip: {
              ...tooltip,
              filter: (item) => (item.parsed.y ?? 0) !== 0,
              callbacks: {
                label: (c) => ` ${c.dataset.label}: ${usd(c.parsed.y ?? 0, true)}`,
                footer: (items) => `Total: ${usd(items.reduce((a, i) => a + (i.parsed.y ?? 0), 0), true)}`,
              },
            },
          },
        }}
        data={{
          labels,
          datasets: series.map((s, j) => ({
            label: s.name,
            data: s.values,
            backgroundColor: s.color,
            borderColor: SURFACE,
            borderWidth: { top: 2, bottom: 0, left: 0, right: 0 },
            borderSkipped: 'start' as const,
            borderRadius: (ctx: { dataIndex: number }) => (topIdx[ctx.dataIndex] === j ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0),
            maxBarThickness: 24,
          })),
        }}
      />
    </ChartBox>
  );
}

// ------------------------------------------------------------------ 6. clustered columns (actual vs budget)

export function ClusteredChart({ labels, series, label }: { labels: (string | string[])[]; series: { name: string; color: string; values: number[] }[]; label: string }) {
  return (
    <ChartBox label={label} height={300}>
      <Bar
        options={{
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: { x: { ...catAxis, ticks: { ...catAxis.ticks, autoSkip: false } }, y: { ...moneyAxis, beginAtZero: true } },
          plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (c) => ` ${c.dataset.label}: ${usd(c.parsed.y ?? 0, true)}` } } },
        }}
        data={{
          labels,
          datasets: series.map((s) => ({ label: s.name, data: s.values, backgroundColor: s.color, borderRadius: 4, borderSkipped: 'start' as const, maxBarThickness: 24, categoryPercentage: 0.6, barPercentage: 0.9 })),
        }}
      />
    </ChartBox>
  );
}

// ------------------------------------------------------------------ projections

export function ProjectionChart({ labels, series, reference }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; reference: { name: string; values: number[] } }) {
  return (
    <ChartBox label="Projected monthly operating expenses by scenario" height={320}>
      <Line
        options={{
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: { y: { ...moneyAxis }, x: catAxis },
          plugins: { legend, tooltip: { ...tooltip, callbacks: { label: (c) => ` ${c.dataset.label}: ${usd(c.parsed.y ?? 0, true)}` } } },
          elements: { line: { borderWidth: 2, tension: 0 }, point: { radius: 0, hoverRadius: 5, borderWidth: 2, borderColor: SURFACE } },
        }}
        data={{
          labels,
          datasets: [
            ...series.map((s) => ({ label: s.name, data: s.values, borderColor: s.color, backgroundColor: s.color, pointBackgroundColor: s.color })),
            { label: reference.name, data: reference.values, borderColor: MUTED, backgroundColor: MUTED, borderDash: [6, 4], borderWidth: 1.5, pointBackgroundColor: MUTED },
          ],
        }}
      />
    </ChartBox>
  );
}

export { FOLD };
