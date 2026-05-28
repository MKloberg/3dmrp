import { useNavigate } from 'react-router-dom'
import { Disc2, FileText, Printer, ListChecks } from 'lucide-react'

const reports = [
  {
    to: '/reports/filament-inventory',
    label: 'Filament Inventory',
    description: 'Live stock levels from Spoolman — spool count and remaining weight per filament.',
    icon: Disc2,
    color: 'text-teal-600',
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    border: 'border-teal-200 dark:border-teal-800',
  },
  {
    to: '/reports/print-jobs',
    label: 'Print Jobs',
    description: 'Full print job history — status, filenames, order attribution, and quantity credits.',
    icon: Printer,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'border-indigo-200 dark:border-indigo-800',
  },
  {
    to: '/reports/order-step-progress',
    label: 'Order Step Progress',
    description: 'Raw order_step_progress table — parts printed and items complete per order per routing step.',
    icon: ListChecks,
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
  },
]

export default function Reports() {
  const navigate = useNavigate()
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3"><FileText size={26} className="text-brand-600" />Reports</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map(({ to, label, description, icon: Icon, color, bg, border }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className={`${bg} border ${border} rounded-xl p-5 text-left hover:brightness-95 transition-all space-y-2`}
          >
            <div className="flex items-center gap-2">
              <Icon size={18} className={color} />
              <span className={`font-semibold text-sm ${color}`}>{label}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
