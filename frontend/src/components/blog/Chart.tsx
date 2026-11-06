import type { BarChartSpec, ChartSpec, LineChartSpec } from '../../content/blog/types'
import { getI18n, type Language } from '../../i18n'
import { formatPercent, formatPrice } from '../../lib/format'

// Графики статей — серверные, без JS. Подсказка при наведении — нативный title,
// у каждого графика есть таблица с теми же данными (для скринридеров и копирования)

/** Цвета серий линейного графика — категориальная палитра сайта (lib/stores.ts), проверена на дальтонизм */
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#4a3aa7']

const countFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

function formatValue(unit: ChartSpec['unit'], value: number): string {
  if (unit === '₸') return formatPrice(value)
  if (unit === '%') return formatPercent(value)
  return countFormatter.format(value)
}

function BarChart({ chart }: { chart: BarChartSpec }) {
  const max = Math.max(...chart.bars.map((bar) => bar.value))
  const min = Math.min(...chart.bars.map((bar) => bar.value))
  return (
    <ul className="flex flex-col gap-2.5" aria-hidden="true">
      {chart.bars.map((bar) => {
        const best = chart.highlightMin && bar.value === min
        return (
          <li key={bar.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
            <span className="truncate text-meta text-ink" title={bar.label}>
              {bar.label}
            </span>
            <span className="flex items-center gap-2" title={`${bar.label}: ${formatValue(chart.unit, bar.value)}`}>
              <span
                className={`h-5 rounded-r-[4px] ${best ? 'bg-accent' : 'bg-[#aab2b8]'}`}
                style={{ width: `${Math.max(2, (bar.value / max) * 78)}%` }}
              />
              <span className={`text-meta tabular font-semibold whitespace-nowrap ${best ? 'text-accent' : 'text-ink'}`}>
                {formatValue(chart.unit, bar.value)}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const W = 400
const H = 230
const PAD = { top: 16, right: 44, bottom: 28, left: 34 }

function LineChart({ chart }: { chart: LineChartSpec }) {
  const values = chart.series.flatMap((s) => s.values)
  const lo = Math.floor(Math.min(...values)) - 1
  const hi = Math.ceil(Math.max(...values)) + 1
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (chart.categories.length === 1 ? plotW / 2 : (i / (chart.categories.length - 1)) * plotW)
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * plotH
  const step = Math.max(1, Math.round((hi - lo) / 4))
  const ticks: number[] = []
  for (let v = lo; v <= hi; v += step) ticks.push(v)

  return (
    <div>
      {chart.series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink" aria-hidden="true">
          {chart.series.map((s, i) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: SERIES_COLORS[i] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[560px]" aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e6e4" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#697178">
              {t}%
            </text>
          </g>
        ))}
        {chart.categories.map((c, i) => (
          <text key={c} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#697178">
            {c}
          </text>
        ))}
        {chart.series.map((s, si) => {
          const color = SERIES_COLORS[si]
          const last = s.values.length - 1
          return (
            <g key={s.name}>
              <polyline
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.values.map((v, i) => (
                <g key={i}>
                  <title>{`${s.name}, ${chart.categories[i]}: ${formatPercent(v)}`}</title>
                  {/* Невидимая зона наведения больше самой точки */}
                  <circle cx={x(i)} cy={y(v)} r={9} fill="transparent" />
                  {i === last && <circle cx={x(i)} cy={y(v)} r={4} fill={color} stroke="#fff" strokeWidth={2} />}
                </g>
              ))}
              <text x={x(last) + 8} y={y(s.values[last])} dy="0.32em" fontSize={12} fontWeight={600} fill="#1a1f24">
                {formatPercent(s.values[last])}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function DataTable({ chart, lang }: { chart: ChartSpec; lang: Language }) {
  const { t } = getI18n(lang)
  return (
    <details className="mt-3 text-meta">
      <summary className="cursor-pointer text-muted hover:text-ink">{t('blog.chartData')}</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left tabular">
          {chart.kind === 'bar' ? (
            <tbody>
              {chart.bars.map((bar) => (
                <tr key={bar.label} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-4 font-normal">{bar.label}</th>
                  <td className="py-1.5">{formatValue(chart.unit, bar.value)}</td>
                </tr>
              ))}
            </tbody>
          ) : (
            <>
              <thead>
                <tr>
                  <th scope="col" className="py-1.5 pr-4 font-medium" />
                  {chart.series.map((s) => (
                    <th key={s.name} scope="col" className="py-1.5 pr-4 font-medium">{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.categories.map((c, i) => (
                  <tr key={c} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-4 font-normal">{c}</th>
                    {chart.series.map((s) => (
                      <td key={s.name} className="py-1.5 pr-4">{formatPercent(s.values[i])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
    </details>
  )
}

/** Текстовое описание для скринридера: что на графике и крайние значения */
function describe(chart: ChartSpec): string {
  if (chart.kind === 'bar') return chart.bars.map((b) => `${b.label}: ${formatValue(chart.unit, b.value)}`).join('; ')
  return chart.series
    .map((s) => `${s.name}: ${chart.categories[0]} ${formatPercent(s.values[0])}, ${chart.categories.at(-1)} ${formatPercent(s.values.at(-1)!)}`)
    .join('; ')
}

export function Chart({ chart, lang }: { chart: ChartSpec; lang: Language }) {
  return (
    <figure className="my-6 rounded-card border border-line bg-card p-4 sm:p-5" role="group" aria-label={chart.title}>
      <p className="mb-3 text-h3">{chart.title}</p>
      <p className="sr-only">{describe(chart)}</p>
      {chart.kind === 'bar' ? <BarChart chart={chart} /> : <LineChart chart={chart} />}
      <figcaption className="mt-3 text-caption text-muted">{chart.source}</figcaption>
      <DataTable chart={chart} lang={lang} />
    </figure>
  )
}
