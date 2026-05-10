import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getForecast } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { Wifi, WifiOff, ShoppingCart } from 'lucide-react'

export default function Forecast() {
  const [forecastWeeks, setForecastWeeks] = useState(4)
  const [lookbackWeeks, setLookbackWeeks] = useState(4)

  const { data, isLoading } = useQuery({
    queryKey: ['forecast', forecastWeeks, lookbackWeeks],
    queryFn: () => getForecast(forecastWeeks, lookbackWeeks),
  })

  const needToBuy = data?.items.filter(i => i.shortfall_grams > 0) ?? []

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Filament Forecast</h1>
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
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5 mb-3">
            <ShoppingCart size={14} /> Purchase List ({forecastWeeks}-week window)
          </h2>
          <div className="space-y-1.5">
            {needToBuy.map(item => (
              <div key={item.filament_spec.id} className="flex items-center gap-3 text-sm">
                <div
                  className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"
                  style={{ backgroundColor: item.filament_spec.color_hex }}
                />
                <span className="font-medium">
                  {item.filament_spec.material} — {item.filament_spec.color_name}
                  {item.filament_spec.brand ? ` (${item.filament_spec.brand})` : ''}
                </span>
                <span className="text-amber-700 dark:text-amber-300 font-semibold">
                  Buy ~{Math.ceil(item.shortfall_grams / 1000 * 10) / 10} kg
                  <span className="font-normal text-amber-600 dark:text-amber-400 ml-1">({item.shortfall_grams}g shortfall)</span>
                </span>
              </div>
            ))}
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
                    {item.shortfall_grams > 0
                      ? <span className="text-red-600 font-semibold">{item.shortfall_grams}g</span>
                      : <span className="text-green-600">—</span>}
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
