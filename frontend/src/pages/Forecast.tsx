import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getForecast, getSettings, ForecastItem } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { Wifi, WifiOff, ShoppingCart, ChevronRight, TrendingUp } from 'lucide-react'

const ASIN_RE = /^B[0-9A-Z]{9}$/i

function spoolsNeeded(item: ForecastItem): { count: number; spoolWeight: number } {
  const spoolWeight = item.filament_spec.weight || 1000
  return { count: Math.ceil(item.shortfall_grams / spoolWeight), spoolWeight }
}

function openAmazonTabs(items: ForecastItem[], domain: string) {
  items.forEach(item => {
    const asin = item.filament_spec.article_number.trim().toUpperCase()
    window.open(`https://www.${domain}/dp/${asin}`, '_blank')
  })
}

export default function Forecast() {
  const [forecastWeeks, setForecastWeeks] = useState(4)
  const [lookbackWeeks, setLookbackWeeks] = useState(4)
  const [showDetail, setShowDetail] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['forecast', forecastWeeks, lookbackWeeks],
    queryFn: () => getForecast(forecastWeeks, lookbackWeeks),
  })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const amazonDomain = settings?.amazon_domain || 'amazon.com'

  const needToBuy = data?.items.filter(i => i.shortfall_grams > 0) ?? []
  const asinItems = needToBuy.filter(i => ASIN_RE.test((i.filament_spec.article_number || '').trim()))
  const nonAsinItems = needToBuy.filter(i => !ASIN_RE.test((i.filament_spec.article_number || '').trim()))

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3"><TrendingUp size={26} className="text-brand-600" />Filament Forecast</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            {data?.spoolman_connected ? (
              <><Wifi size={14} className="text-green-500" /><span className="text-green-600">Spoolman live</span></>
            ) : (
              <><WifiOff size={14} className="text-gray-400" /><span className="text-gray-400">Spoolman offline{data?.spoolman_url ? '' : ' — set SPOOLMAN_URL'}</span></>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500 dark:text-gray-400">Lookback</label>
            <select className="border rounded px-2 py-1 text-sm" value={lookbackWeeks} onChange={e => setLookbackWeeks(+e.target.value)}>
              {[1, 2, 4, 8, 12].map(w => <option key={w} value={w}>{w}w</option>)}
            </select>
            <label className="text-gray-500 dark:text-gray-400">Forecast</label>
            <select className="border rounded px-2 py-1 text-sm" value={forecastWeeks} onChange={e => setForecastWeeks(+e.target.value)}>
              {[1, 2, 4, 8, 12, 26].map(w => <option key={w} value={w}>{w}w</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Purchase list */}
      {needToBuy.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <ShoppingCart size={14} /> Purchase List ({forecastWeeks}-week window)
            </h2>
            <div className="flex items-center gap-3">
              {/* Detail toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-amber-700 dark:text-amber-300">
                <span>Order detail</span>
                <button
                  role="switch"
                  aria-checked={showDetail}
                  onClick={() => setShowDetail(v => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showDetail ? 'bg-amber-600' : 'bg-amber-200 dark:bg-amber-800'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${showDetail ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </label>
              {asinItems.length > 0 && (
                <button
                  onClick={() => openAmazonTabs(asinItems, amazonDomain)}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                >
                  <ShoppingCart size={12} />
                  Open {asinItems.length} item{asinItems.length !== 1 ? 's' : ''} on Amazon
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {needToBuy.map(item => {
              const { count, spoolWeight } = spoolsNeeded(item)
              return (
                <div key={item.filament_spec.id}>
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <div
                      className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"
                      style={{ backgroundColor: item.filament_spec.color_hex }}
                    />
                    <span className="font-medium">
                      {item.filament_spec.material} — {item.filament_spec.color_name}
                      {item.filament_spec.brand ? ` (${item.filament_spec.brand})` : ''}
                    </span>
                    <span className="text-amber-700 dark:text-amber-300 font-semibold">
                      {count} spool{count !== 1 ? 's' : ''}
                      <span className="font-normal text-amber-600 dark:text-amber-400 text-xs ml-1">
                        ({spoolWeight}g ea · {item.shortfall_grams}g shortfall)
                      </span>
                    </span>
                    {item.filament_spec.purchase_url && (
                      <span className="inline-flex items-center gap-1.5 shrink-0">
                        <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          Qty: {count}
                        </span>
                        <a
                          href={item.filament_spec.purchase_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-2 py-0.5 rounded-full"
                        >
                          <ShoppingCart size={11} /> Buy
                        </a>
                      </span>
                    )}
                  </div>

                  {/* Order detail rows */}
                  {showDetail && item.contributing_orders.length > 0 && (
                    <div className="mt-1.5 ml-6 space-y-1">
                      {item.contributing_orders.map(o => (
                        <div key={o.order_id} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                          <ChevronRight size={11} className="shrink-0 text-amber-400" />
                          <span className="font-medium">{o.model_name}</span>
                          {o.customer_name && (
                            <span className="text-amber-600 dark:text-amber-500">— {o.customer_name}</span>
                          )}
                          <span className="text-amber-500 dark:text-amber-500">
                            × {o.quantity} &nbsp;·&nbsp; {o.grams_needed}g needed
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                            o.status === 'printing'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          }`}>
                            {o.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          {nonAsinItems.length > 0 && asinItems.length > 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {nonAsinItems.length} item{nonAsinItems.length !== 1 ? 's' : ''} without an Amazon ASIN must be ordered manually.
            </p>
          )}
          </div>
        </div>
      )}

      {/* Full table */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Filament</th>
                <th className="px-4 py-2 text-right">g/week</th>
                <th className="px-4 py-2 text-right">{forecastWeeks}w demand</th>
                <th className="px-4 py-2 text-right">On hand</th>
                <th className="px-4 py-2 text-right">Shortfall</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {data?.items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 italic">No filament data yet. Complete some orders to build demand history.</td></tr>
              )}
              {data?.items.map(item => (
                <tr key={item.filament_spec.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"
                        style={{ backgroundColor: item.filament_spec.color_hex }}
                      />
                      <div>
                        <span className="font-medium">{item.filament_spec.material} — {item.filament_spec.color_name}</span>
                        {item.filament_spec.brand && <span className="ml-1.5 text-xs text-gray-400">{item.filament_spec.brand}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{item.demand_grams_per_week}</td>
                  <td className="px-4 py-3 text-right font-medium">{item.total_demand_grams}g</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {data.spoolman_connected ? `${item.spoolman_stock_grams}g` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.shortfall_grams > 0 ? (() => {
                      const { count, spoolWeight } = spoolsNeeded(item)
                      return (
                        <span className="text-red-600 font-semibold">
                          {count} spool{count !== 1 ? 's' : ''}
                          <span className="font-normal text-xs text-red-400 ml-1">({spoolWeight}g ea)</span>
                        </span>
                      )
                    })() : <span className="text-green-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {data.spoolman_connected
                      ? <StatusBadge status={item.status} />
                      : <span className="text-xs text-gray-400">no stock data</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
