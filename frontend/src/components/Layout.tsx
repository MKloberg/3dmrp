import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Box, ClipboardList, TrendingUp, Layers, Printer, Settings } from 'lucide-react'
import clsx from 'clsx'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/models', label: 'Models', icon: Box },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/filaments', label: 'Filaments', icon: Layers },
  { to: '/forecast', label: 'Forecast', icon: TrendingUp },
  { to: '/printers', label: 'Printers', icon: Printer },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-gray-700">
          <span className="text-lg font-bold tracking-tight text-brand-500">3DMRP</span>
          <p className="text-xs text-gray-400 mt-0.5">3D Print Planning</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <Outlet />
      </main>
    </div>
  )
}
