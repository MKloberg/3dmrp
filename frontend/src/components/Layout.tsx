import { useEffect, useState, useMemo } from 'react'
declare const __APP_VERSION__: string
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Box, ClipboardList, TrendingUp, Disc2, Printer,
  Settings, Users, FileText, ChevronRight, SlidersHorizontal, Layers, Database, X,
} from 'lucide-react'
import clsx from 'clsx'
import { QRCodeSVG } from 'qrcode.react'

type Child = { to: string; label: string; icon?: React.ElementType }
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
  {
    to: '/filaments', label: 'Filaments', icon: Disc2,
    children: [
      { to: '/filaments/spools', label: 'Spool Inventory', icon: Layers },
    ],
  },
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
      { to: '/settings/general', label: 'General', icon: SlidersHorizontal },
      { to: '/settings/slicers', label: 'Slicers', icon: Layers },
      { to: '/settings/printer-types', label: 'Printer Types', icon: Printer },
      { to: '/settings/database', label: 'Database', icon: Database },
      { to: '/settings/mobile', label: 'Mobile Access', icon: Printer },
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

  const onParentExactly = location.pathname === item.to

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
            onParentExactly
              ? 'bg-brand-600 text-white'
              : isOnChildRoute
              ? 'text-white'
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
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-brand-600 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800',
                )
              }
            >
              {child.icon && <child.icon size={13} />}
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function MobileQrWidget() {
  const [expanded, setExpanded] = useState(false)

  const { data: lanIpData } = useQuery({
    queryKey: ['lan-ip'],
    queryFn: () => fetch('/api/settings/lan-ip').then(r => r.json()) as Promise<{ ip: string; https_port: string }>,
    staleTime: Infinity,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/settings').then(r => r.json()) as Promise<Record<string, string>>,
    staleTime: 60_000,
  })

  const url = useMemo(() => {
    const ip = lanIpData?.ip ?? window.location.hostname
    const protocol = settings?.mobile_protocol || 'https'
    if (protocol === 'https') {
      const httpsPort = lanIpData?.https_port ?? '7892'
      return `https://${ip}:${httpsPort}/mobile`
    }
    const httpPort = window.location.port
    return `http://${ip}${httpPort ? `:${httpPort}` : ''}/mobile`
  }, [lanIpData, settings])

  return (
    <>
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex flex-col items-center gap-2 py-4 hover:bg-gray-800 transition-colors rounded-lg mx-1"
        style={{ width: 'calc(100% - 8px)' }}
        title="Open mobile filament loader"
      >
        <QRCodeSVG
          value={url}
          size={96}
          bgColor="transparent"
          fgColor="#ffffff"
          level="M"
        />
        <span className="text-xs text-gray-400 font-medium">Mobile</span>
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <p className="text-sm font-semibold text-gray-800">Mobile Filament Loader</p>
              <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <QRCodeSVG
              value={url}
              size={220}
              bgColor="#ffffff"
              fgColor="#111827"
              level="M"
              includeMargin
            />
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              Scan with your phone to open the filament loading workflow. Works on iOS and Android.
            </p>
            <p className="text-xs text-gray-400 font-mono break-all text-center">{url}</p>
          </div>
        </div>
      )}
    </>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-700 shrink-0">
          <img src="/logo.png" alt="3DMRP" className="h-16 w-auto cursor-pointer" onClick={() => navigate('/')} />
        </div>
        <nav className="px-3 py-4 space-y-1 overflow-y-auto shrink-0">
          {nav.map(item => (
            <NavTreeItem key={item.to} item={item} />
          ))}
        </nav>
        <div className="flex-1 flex items-center justify-center px-3 min-h-[140px]">
          <MobileQrWidget />
        </div>
        <div className="shrink-0 px-4 py-2 border-t border-gray-700/50">
          <p className="text-xs text-gray-600 text-center">v{__APP_VERSION__}</p>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <Outlet />
      </main>
    </div>
  )
}
