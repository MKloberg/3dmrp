import { Link } from 'react-router-dom'
import { Settings as SettingsIcon, Scissors, Cpu, Database, ChevronRight } from 'lucide-react'

const cards = [
  {
    to: '/settings/general',
    icon: SettingsIcon,
    title: 'General',
    description: 'Appearance, Spoolman, Square, and purchasing preferences.',
  },
  {
    to: '/settings/slicers',
    icon: Scissors,
    title: 'Slicers',
    description: 'Manage slicer software and executable paths.',
  },
  {
    to: '/settings/printer-types',
    icon: Cpu,
    title: 'Printer Types',
    description: 'Define printer type categories and default slot counts.',
  },
  {
    to: '/settings/database',
    icon: Database,
    title: 'Database',
    description: 'Download a backup or restore from a previous backup file.',
  },
]

export default function Settings() {
  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-sm transition-all group"
          >
            <div className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 group-hover:bg-brand-50 dark:group-hover:bg-brand-900/30 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors shrink-0">
              <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100">{title}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-brand-500 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
