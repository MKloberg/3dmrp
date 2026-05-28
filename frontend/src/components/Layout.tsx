import { useEffect, useState, useMemo } from 'react'
declare const __APP_VERSION__: string
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Box, ClipboardList, TrendingUp, Printer,
  Settings, Users, FileText, ChevronRight, SlidersHorizontal, Layers, Database, X, Disc2, Wrench, Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import { QRCodeSVG } from 'qrcode.react'
import { usePrinterWebSocket } from '../hooks/usePrinterWebSocket'
import { useWsMode } from '../hooks/useWsMode'
import { getPrinters, getSpoolmanStock, getSettings, type Printer as PrinterType } from '../api/client'
import { useMobileSession } from '../contexts/MobileSessionContext'
import { SpoolIcon } from './SpoolIcon'

type Child = { to: string; label: string; icon?: React.ElementType; isSection?: boolean; badge?: string }
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
      { to: '/reports/print-jobs', label: 'Print Jobs' },
      { to: '/reports/order-step-progress', label: 'Order Step Progress' },
    ],
  },
  {
    to: '/tools', label: 'Tools', icon: Wrench,
    children: [
      { to: '', label: 'Advanced', isSection: true, badge: '$' },
      { to: '/tools', label: 'Import Filament from Listing' },
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
      { to: '/settings/ai', label: 'AI', icon: Sparkles },
    ],
  },
]

function NavTreeItem({ item }: { item: NavItemDef }) {
  const location = useLocation()
  const hasChildren = !!item.children?.length

  const isOnChildRoute = hasChildren
    ? item.children!.filter(c => !c.isSection && c.to).some(c => location.pathname.startsWith(c.to))
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
          {item.children!.map((child, idx) =>
            child.isSection ? (
              <div key={`section-${idx}`} className="flex items-center gap-1.5 px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 select-none">
                {child.label}
                {child.badge && <span className="text-amber-400">{child.badge}</span>}
              </div>
            ) : (
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
            )
          )}
        </div>
      )}
    </div>
  )
}

function SpoolmanBadge() {
  const { data } = useQuery({
    queryKey: ['spoolman-ping'],
    queryFn: () => fetch('/api/spoolman/ping').then(r => r.json()) as Promise<{ connected: boolean; url?: string }>,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (!data?.connected || !data.url) return null

  return (
    <button
      onClick={() => fetch('/api/settings/open-spoolman')}
      title="Open Spoolman"
      className="absolute bottom-4 right-6 flex items-center gap-1.5 opacity-75 hover:opacity-100 transition-all duration-200 group"
    >
      <span className="inline-flex items-center group-hover:drop-shadow-[0_0_5px_rgba(251,146,60,0.6)] transition-all duration-200">
        <SpoolIcon size={14} color="#fb923c" />
      </span>
      <span className="text-[11px] font-semibold tracking-widest uppercase text-green-400 group-hover:text-teal-400 transition-colors duration-200">
        Spoolman
      </span>
    </button>
  )
}

function MobileQrWidget() {
  const [expanded, setExpanded] = useState(false)
  const { token, phoneConnected, phoneName } = useMobileSession()

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
    if (!token) return null
    if (settings?.mobile_base_url) {
      const base = settings.mobile_base_url.replace(/\/$/, '')
      return `${base}/mobile/app/${token}`
    }
    const ip = lanIpData?.ip ?? window.location.hostname
    const protocol = settings?.mobile_protocol || 'https'
    if (protocol === 'https') {
      const httpsPort = lanIpData?.https_port ?? '7892'
      return `https://${ip}:${httpsPort}/mobile/app/${token}`
    }
    const httpPort = window.location.port
    return `http://${ip}${httpPort ? `:${httpPort}` : ''}/mobile/app/${token}`
  }, [lanIpData, settings, token])

  return (
    <>
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex flex-col items-center gap-2 py-4 hover:bg-gray-800 transition-colors rounded-lg mx-1"
        style={{ width: 'calc(100% - 8px)' }}
        title="Open 3DMRP mobile app"
      >
        {url ? (
          <div className="relative">
            <QRCodeSVG
              value={url}
              size={96}
              bgColor="transparent"
              fgColor="#ffffff"
              level="M"
            />
            {phoneConnected && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 border-2 border-gray-900" />
            )}
          </div>
        ) : (
          <div className="w-24 h-24 rounded bg-gray-800 animate-pulse" />
        )}
        <span className={`text-xs font-medium ${phoneConnected ? 'text-green-400' : 'text-gray-400'}`}>
          {phoneConnected ? `${phoneName ?? 'Phone'} · Connected` : 'Mobile'}
        </span>
      </button>

      {expanded && url && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800">3DMRP Mobile</p>
                {phoneConnected && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {phoneName ? `${phoneName} · Connected` : 'Connected'}
                  </span>
                )}
              </div>
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
              Scan once to open the 3DMRP mobile app. Your phone stays connected for the whole session.
            </p>
            <p className="text-xs text-gray-400 font-mono break-all text-center">{url}</p>
          </div>
        </div>
      )}
    </>
  )
}

function PrinterWsNode({ printer }: { printer: PrinterType }) {
  usePrinterWebSocket(printer.id, printer.url, true)
  return null
}

function PrinterWsManager() {
  const wsMode = useWsMode()
  const { data: printers = [] } = useQuery({
    queryKey: ['printers'],
    queryFn: getPrinters,
    staleTime: 60_000,
    enabled: wsMode === 'all',
  })
  if (wsMode !== 'all') return null
  return <>{printers.map(p => <PrinterWsNode key={p.id} printer={p} />)}</>
}

function PrintLabelHandler() {
  const { pendingPrint, clearPendingPrint } = useMobileSession()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  useEffect(() => {
    if (!pendingPrint) return
    const sizeIndex = Number(settings?.ui_printer_label_size_index ?? 0)
    const labelPrinter = settings?.label_printer_name ?? ''
    const qty = Number(settings?.label_print_quantity ?? 1)
    clearPendingPrint()

    if (labelPrinter) {
      fetch(`/api/print/spool/${pendingPrint.spool_id}?size=${sizeIndex}&qty=${qty}`, { method: 'POST' })
        .catch(() => {
          const url = `${window.location.origin}/print/spool/${pendingPrint.spool_id}?size=${sizeIndex}`
          fetch(`/api/settings/open-browser?url=${encodeURIComponent(url)}`).catch(() => window.open(url, '_blank'))
        })
    } else {
      const url = `${window.location.origin}/print/spool/${pendingPrint.spool_id}?size=${sizeIndex}`
      fetch(`/api/settings/open-browser?url=${encodeURIComponent(url)}`).catch(() => window.open(url, '_blank'))
    }
  }, [pendingPrint]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function Layout() {
  const navigate = useNavigate()
  return (
    <div className="flex h-screen overflow-hidden">
      <PrinterWsManager />
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="relative px-4 py-3 border-b border-gray-700 shrink-0">
          <img src="/logo.png" alt="3DMRP" className="h-16 w-auto cursor-pointer" onClick={() => navigate('/')} />
          <SpoolmanBadge />
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
      <PrintLabelHandler />
    </div>
  )
}
