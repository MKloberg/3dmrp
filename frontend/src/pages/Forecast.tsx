import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getForecast, getSettings, createSpoolmanSpools, ForecastItem, SpoolmanSpool } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { SpoolIcon } from '../components/SpoolIcon'
import { Wifi, WifiOff, ShoppingCart, ChevronRight, TrendingUp, PackageCheck, Printer } from 'lucide-react'

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

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

interface WizardState {
  item: ForecastItem
  step: 1 | 2 | 3
  qty: number
  creating: boolean
  error: string | null
  createdSpools: SpoolmanSpool[]
  spoolmanUrl: string
}

function ReceiptWizard({
  state,
  spoolmanConnected,
  onChange,
  onClose,
}: {
  state: WizardState
  spoolmanConnected: boolean
  onChange: (patch: Partial<WizardState>) => void
  onClose: () => void
}) {
  const { item, step, qty, creating, error, createdSpools, spoolmanUrl } = state
  const { spoolWeight } = spoolsNeeded(item)
  const canSpoolman = spoolmanConnected && !!item.filament_spec.spoolman_id

  async function handleCreate() {
    onChange({ creating: true, error: null })
    try {
      const result = await createSpoolmanSpools(item.filament_spec.spoolman_id!, qty)
      onChange({ creating: false, createdSpools: result.spools, spoolmanUrl: result.spoolman_url, step: 3 })
    } catch (e: any) {
      onChange({ creating: false, error: e.message || 'Failed to create spools in Spoolman' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(n => (
              <span key={n} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${step === n ? 'bg-brand-600 text-white' : step > n ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'}`}>
                {n}
              </span>
            ))}
            <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100 text-sm">
              {step === 1 ? 'Confirm Receipt' : step === 2 ? 'Register in Spoolman' : 'Spools Ready'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Step 1: Confirm quantity ── */}
          {step === 1 && (
            <>
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <SpoolIcon color={normalizeHex(item.filament_spec.color_hex)} size={52} />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {item.filament_spec.material} — {item.filament_spec.color_name}
                  </p>
                  {item.filament_spec.brand && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.filament_spec.brand}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{spoolWeight}g per spool</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">How many spools did you receive?</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => onChange({ qty: Math.max(1, qty - 1) })}
                    className="w-9 h-9 rounded-full border border-gray-300 dark:border-gray-600 text-lg font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >−</button>
                  <span className="text-3xl font-black text-gray-900 dark:text-gray-100 w-12 text-center">{qty}</span>
                  <button
                    onClick={() => onChange({ qty: qty + 1 })}
                    className="w-9 h-9 rounded-full border border-gray-300 dark:border-gray-600 text-lg font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >+</button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Suggested {spoolsNeeded(item).count} based on {item.shortfall_grams}g shortfall
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                <button
                  onClick={() => onChange({ step: 2 })}
                  className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Register in Spoolman ── */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <SpoolIcon color={normalizeHex(item.filament_spec.color_hex)} size={40} />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {qty} × {item.filament_spec.material} — {item.filament_spec.color_name}
                  </p>
                  {item.filament_spec.brand && <p className="text-sm text-gray-500">{item.filament_spec.brand}</p>}
                </div>
              </div>

              {canSpoolman ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Create {qty} new spool{qty !== 1 ? 's' : ''} in Spoolman? This registers them so you can track remaining filament and use QR scanning in Mainsail.
                </p>
              ) : (
                <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                  {!spoolmanConnected
                    ? 'Spoolman is not connected. Spools cannot be created automatically.'
                    : 'This filament has no Spoolman link. Import it from Spoolman first to enable auto-registration.'}
                </div>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex justify-between gap-2 pt-1">
                <button onClick={() => onChange({ step: 1, error: null })} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">← Back</button>
                <div className="flex gap-2">
                  <button
                    onClick={() => onChange({ step: 3 })}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Skip
                  </button>
                  {canSpoolman && (
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      {creating && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {creating ? 'Creating…' : `Yes, Create ${qty} Spool${qty !== 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Step 3: Results ── */}
          {step === 3 && (
            <>
              {createdSpools.length > 0 ? (
                <>
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    ✓ {createdSpools.length} spool{createdSpools.length !== 1 ? 's' : ''} created in Spoolman
                  </p>
                  <div className="space-y-2">
                    {createdSpools.map(spool => (
                      <div key={spool.id} className="flex items-center gap-4 p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700/40">
                        <SpoolIcon color={normalizeHex(spool.filament.color_hex)} size={40} />
                        <div className="flex-1 min-w-0">
                          <p className="text-2xl font-black text-brand-600 dark:text-brand-400 leading-none">#{spool.id}</p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">
                            {spool.filament.material} — {spool.filament.name}
                          </p>
                          {spool.filament.vendor?.name && (
                            <p className="text-xs text-gray-400">{spool.filament.vendor.name}</p>
                          )}
                        </div>
                        <a
                          href={`${spoolmanUrl}/spool/show/${spool.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 shrink-0"
                        >
                          <Printer size={12} /> Print QR Label
                        </a>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                  Spools not registered in Spoolman. Remember to add them manually.
                </p>
              )}
              <div className="flex justify-end pt-1">
                <button
                  onClick={onClose}
                  className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
                >
                  Done
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

export default function Forecast() {
  const [forecastDays, setForecastDays] = useState(28)
  const [lookbackDays, setLookbackDays] = useState(28)
  const [showDetail, setShowDetail] = useState(false)
  const [wizard, setWizard] = useState<WizardState | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['forecast', forecastDays, lookbackDays],
    queryFn: () => getForecast(forecastDays, lookbackDays),
  })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const amazonDomain = settings?.amazon_domain || 'amazon.com'

  const needToBuy = data?.items.filter(i => i.shortfall_grams > 0) ?? []
  const asinItems = needToBuy.filter(i => ASIN_RE.test((i.filament_spec.article_number || '').trim()))
  const nonAsinItems = needToBuy.filter(i => !ASIN_RE.test((i.filament_spec.article_number || '').trim()))

  function openWizard(item: ForecastItem) {
    const { count } = spoolsNeeded(item)
    setWizard({ item, step: 1, qty: count, creating: false, error: null, createdSpools: [], spoolmanUrl: '' })
  }

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
            <select className="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300" value={lookbackDays} onChange={e => setLookbackDays(+e.target.value)}>
              {([1, 7, 14, 28, 56, 84] as const).map(d => (
                <option key={d} value={d}>{d === 1 ? '1d' : `${d / 7}w`}</option>
              ))}
            </select>
            <label className="text-gray-500 dark:text-gray-400">Forecast</label>
            <select className="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300" value={forecastDays} onChange={e => setForecastDays(+e.target.value)}>
              {([1, 7, 14, 28, 56, 84, 182] as const).map(d => (
                <option key={d} value={d}>{d === 1 ? '1d' : `${d / 7}w`}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Purchase list */}
      {needToBuy.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <ShoppingCart size={14} /> Purchase List ({forecastDays === 1 ? '1-day' : `${forecastDays / 7}-week`} window)
            </h2>
            <div className="flex items-center gap-3">
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
                    <SpoolIcon color={item.filament_spec.color_hex ?? '#888888'} size={18} />
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
                    <button
                      onClick={() => openWizard(item)}
                      className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                    >
                      <PackageCheck size={11} /> Confirm Receipt
                    </button>
                  </div>

                  {showDetail && item.contributing_orders.length > 0 && (
                    <div className="mt-1.5 ml-6 space-y-1">
                      {item.contributing_orders.map(o => (
                        <div key={o.order_id} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                          <ChevronRight size={11} className="shrink-0 text-amber-400" />
                          <span className="font-medium">{o.model_name}</span>
                          {o.customer_name && <span className="text-amber-600 dark:text-amber-500">— {o.customer_name}</span>}
                          <span className="text-amber-500 dark:text-amber-500">× {o.quantity} &nbsp;·&nbsp; {o.grams_needed}g needed</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                            o.status === 'printing'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          }`}>{o.status}</span>
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
                <th className="px-4 py-2 text-right">{forecastDays === 1 ? '1d' : `${forecastDays / 7}w`} demand</th>
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
                      <SpoolIcon color={item.filament_spec.color_hex ?? '#888888'} size={18} />
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

      {wizard && (
        <ReceiptWizard
          state={wizard}
          spoolmanConnected={data?.spoolman_connected ?? false}
          onChange={patch => setWizard(w => w ? { ...w, ...patch } : null)}
          onClose={() => setWizard(null)}
        />
      )}
    </div>
  )
}
