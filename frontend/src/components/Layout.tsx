import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Box, ClipboardList, TrendingUp, Layers, Printer,
  Settings, Users, FileText, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'

type Child = { to: string; label: string }
type NavItemDef = {
  to: string
  label: string
  icon: React.ElementType
  children?: Child[]
}

const nav: NavItemDef[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/forecast', label: 'Forecast', icon: TrendingUp },
  { to: '/items', label: 'Items', icon: Box },
  { to: '/filaments', label: 'Filaments', icon: Layers },
  { to: '/printers', label: 'Printers', icon: Printer },
  {
    to: '/reports', label: 'Reports', icon: FileText,
    children: [
      { to: '/reports/filament-inventory', label: 'Filament Inventory' },
    ],
  },
  {
    to: '/settings', label: 'Settings', icon: Settings,
    children: [
      { to: '/settings/general', label: 'General' },
      { to: '/settings/slicers', label: 'Slicers' },
      { to: '/settings/printer-types', label: 'Printer Types' },
      { to: '/settings/database', label: 'Database' },
    ],
  },
]

function NavTreeItem({ item }: { item: NavItemDef }) {
  const location = useLocation()
  const hasChildren = !!item.children?.length

  const isOnChildRoute = hasChildren
    ? item.children!.some(c => location.pathname.startsWith(c.to))
    : false

  const [open, setOpen] = useState(isOnChildRoute)

  useEffect(() => {
    if (isOnChildRoute) setOpen(true)
  }, [isOnChildRoute])

  if (!hasChildren) {
    return (
      <NavLink
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
            isActive
              ? 'bg-brand-600 text-white'
              : 'text-gray-300 hover:bg-gray-800 hover:text-white',
          )
        }
      >
        <item.icon size={16} />
        {item.label}
      </NavLink>
    )
  }

  const parentActive = location.pathname === item.to || isOnChildRoute

  return (
    <div>
      <NavLink
        to={item.to}
        onClick={e => {
          // toggle open; let the NavLink handle navigation
          setOpen(o => !o)
          // if already open and on the parent, don't re-navigate (just toggle)
          if (open && location.pathname === item.to) e.preventDefault()
        }}
        className={() =>
          clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full',
            parentActive
              ? 'bg-brand-600 text-white'
              : 'text-gray-300 hover:bg-gray-800 hover:text-white',
          )
        }
      >
        <item.icon size={16} />
        <span className="flex-1">{item.label}</span>
        <ChevronRight
          size={13}
          className={clsx('transition-transform duration-150', open ? 'rotate-90' : '')}
        />
      </NavLink>

      {open && (
        <div className="mt-0.5 ml-6 pl-3 border-l border-gray-700 space-y-0.5">
          {item.children!.map(child => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                clsx(
                  'block px-3 py-1.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800',
                )
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-700">
          <img src="/logo.png" alt="3DMRP" className="h-16 w-auto cursor-pointer" onClick={() => navigate('/')} />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(item => (
            <NavTreeItem key={item.to} item={item} />
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <Outlet />
      </main>
    </div>
  )
}
