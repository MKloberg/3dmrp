import { useQuery } from '@tanstack/react-query'
import { getOrders, getForecast, getPrinters, getPrinterStatus, PrinterStatus, Printer } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { AlertTriangle, ClipboardList, Wifi, WifiOff, Printer as PrinterIcon, ShoppingCart, Clock } from 'lucide-react'

// ---- helpers ----

function formatEta(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatTemp(t: number | null, target: number | null): string | null {
  if (t == null) return null
  return target ? `${t.toFixed(0)}°/${target.toFixed(0)}°` : `${t.toFixed(0)}°`
}

function dueDateLabel(dateNeeded: string | null): { label: string; cls: string } | null {
  if (!dateNeeded) return null
  const due = new Date(dateNeeded)
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.setHours(0, 0, 0, 0)) / 86_400_000)
  if (diffDays < 0)  return { label: `Overdue by ${-diffDays}d`, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (diffDays === 0) return { label: 'Due today',               cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
  if (diffDays <= 3)  return { label: `Due in ${diffDays}d`,     cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' }
  return null
}

// ---- Printer status card ----

const STATE_DOT: Record<string, string> = {
  printing: 'bg-green-500 animate-pulse',
  paused:   'bg-yellow-400',
  error:    'bg-red-500',
  complete: 'bg-blue-400',
  standby:  'bg-gray-300 dark:bg-gray-600',
  offline:  'bg-gray-300 dark:bg-gray-600',
}

const STATE_LABEL: Record<string, string> = {
  printing: 'Printing',
  paused:   'Paused',
  error:    'Error',
  complete: 'Complete',
  standby:  'Idle',
  offline:  'Offline',
}

function PrinterCard({ printer }: { printer: Printer }) {
  const { data: status } = useQuery<PrinterStatus>({
    queryKey: ['printer-status', printer.id],
    queryFn: () => getPrinterStatus(printer.id),
    refetchInterval: 10_000,
    retry: false,
  })

  const state = status?.state ?? 'offline'
  const dot = STATE_DOT[state] ?? STATE_DOT.offline
  const label = STATE_LABEL[state] ?? state

  const extruder = formatTemp(status?.extruder_temp ?? null, status?.extruder_target ?? null)
  const bed = formatTemp(status?.bed_temp ?? null, status?.bed_target ?? null)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <PrinterIcon size={14} className="text-gray-400 shrink-0" />
        <span className="font-medium text-sm truncate flex-1">{printer.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className={`text-xs font-medium ${state === 'printing' ? 'text-green-600 dark:text-green-400' : state === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
            {label}
          </span>
        </div>
      </div>

      {state === 'printing' && (
        <>
          {status?.filename && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={status.filename}>
              {status.filename.replace(/\.[^/.]+$/, '')}
            </p>
          )}
          {status?.progress != null && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-1000"
                  style={{ width: `${(status.progress * 100).toFixed(1)}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 shrink-0">{(status.progress * 100).toFixed(0)}%</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {status?.time_remaining != null && (
              <span>{formatEta(status.time_remaining)} left</span>
            )}
            {extruder && <span title="Extruder">🌡 {extruder}</span>}
            {bed && <span title="Bed">⬛ {bed}</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ---- Dashboard ----

export default function Dashboard() {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: () => getOrders() })
  const { data: forecast } = useQuery({ queryKey: ['forecast'], queryFn: () => getForecast(4, 4) })
  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: getPrinters })

  const pending  = orders?.filter(o => o.status === 'pending')  ?? []
  const printing = orders?.filter(o => o.status === 'printing') ?? []
  const overdue  = orders?.filter(o => {
    if (!o.date_needed || o.status === 'complete' || o.status === 'cancelled') return false
    return new Date(o.date_needed) < new Date(new Date().setHours(0, 0, 0, 0))
  }) ?? []
  const alerts = forecast?.items.filter(i => i.status !== 'ok') ?? []

  const activeOrders = [...printing, ...pending].sort((a, b) => {
    // sort: overdue first, then by due date, then undated
    const da = a.date_needed ? new Date(a.date_needed).getTime() : Infinity
    const db = b.date_needed ? new Date(b.date_needed).getTime() : Infinity
    return da - db
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm">
          {forecast?.spoolman_connected ? (
            <><Wifi size={14} className="text-green-500" /><span className="text-green-600">Spoolman connected</span></>
          ) : (
            <><WifiOff size={14} className="text-gray-400" /><span className="text-gray-400">Spoolman not connected</span></>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Pending',       value: pending.length,  color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Printing Now',  value: printing.length, color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Overdue',       value: overdue.length,  color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Stock Alerts',  value: alerts.length,   color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-5 flex items-center gap-4`}>
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">{label}</div>
          </div>
        ))}
      </div>

      {/* Printers */}
      {printers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <PrinterIcon size={13} /> Printers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {printers.map(p => <PrinterCard key={p.id} printer={p} />)}
          </div>
        </div>
      )}

      {/* Active orders */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <ClipboardList size={13} /> Active Orders
        </h2>
        {activeOrders.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No active orders.</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y dark:divide-gray-700">
            {activeOrders.map(order => {
              const due = dueDateLabel(order.date_needed)
              return (
                <div key={order.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{order.print_model.name}</p>
                    {order.customer_name && (
                      <p className="text-xs text-gray-400 truncate">{order.customer_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {due && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${due.cls}`}>
                        <Clock size={10} /> {due.label}
                      </span>
                    )}
                    {order.date_needed && !due && (
                      <span className="text-xs text-gray-400">
                        {new Date(order.date_needed).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-sm text-gray-500 dark:text-gray-400">×{order.quantity}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Stock alerts */}
      {alerts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <AlertTriangle size={13} /> Filament Alerts
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y dark:divide-gray-700">
            {alerts.map(item => (
              <div key={item.filament_spec.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"
                    style={{ backgroundColor: item.filament_spec.color_hex }}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {item.filament_spec.material} — {item.filament_spec.color_name}
                    </p>
                    {item.filament_spec.brand && (
                      <p className="text-xs text-gray-400">{item.filament_spec.brand}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                    {item.spoolman_stock_grams}g / {item.total_demand_grams}g needed
                  </span>
                  <StatusBadge status={item.status} />
                  {item.filament_spec.purchase_url && (
                    <a
                      href={item.filament_spec.purchase_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Order filament"
                      className="text-gray-400 hover:text-green-600"
                    >
                      <ShoppingCart size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
