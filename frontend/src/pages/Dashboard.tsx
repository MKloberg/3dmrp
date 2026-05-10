import { useQuery } from '@tanstack/react-query'
import { getOrders, getForecast } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { AlertTriangle, Package, ClipboardList, Wifi, WifiOff } from 'lucide-react'

export default function Dashboard() {
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: () => getOrders() })
  const { data: forecast } = useQuery({ queryKey: ['forecast'], queryFn: () => getForecast(4, 4) })

  const pending = orders?.filter(o => o.status === 'pending') ?? []
  const printing = orders?.filter(o => o.status === 'printing') ?? []
  const alerts = forecast?.items.filter(i => i.status !== 'ok') ?? []

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
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Orders', value: pending.length, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Printing Now', value: printing.length, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Stock Alerts', value: alerts.length, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-5 flex items-center gap-4`}>
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">{label}</div>
          </div>
        ))}
      </div>

      {/* Stock alerts */}
      {alerts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <AlertTriangle size={14} /> Filament Alerts
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y dark:divide-gray-700">
            {alerts.map(item => (
              <div key={item.filament_spec.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
                    style={{ backgroundColor: item.filament_spec.color_hex }}
                  />
                  <span className="font-medium text-sm">{item.filament_spec.material} — {item.filament_spec.color_name}</span>
                  {item.filament_spec.brand && <span className="text-xs text-gray-400">{item.filament_spec.brand}</span>}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {item.spoolman_stock_grams}g on hand / {item.total_demand_grams}g needed
                  </span>
                  <StatusBadge status={item.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active orders */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <ClipboardList size={14} /> Active Orders
        </h2>
        {[...pending, ...printing].length === 0 ? (
          <p className="text-sm text-gray-400 italic">No active orders.</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y dark:divide-gray-700">
            {[...printing, ...pending].map(order => (
              <div key={order.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{order.print_model.name}</p>
                  {order.customer_name && <p className="text-xs text-gray-400">{order.customer_name}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">×{order.quantity}</span>
                  <StatusBadge status={order.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
