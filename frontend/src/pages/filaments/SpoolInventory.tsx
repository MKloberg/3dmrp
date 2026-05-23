import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getSpoolmanStock, getSettings, setSetting, SpoolmanSpool, createNfcSession, patchSpoolmanLotNr, patchSpoolmanLocation, getSpoolmanLocationOptions, getSpoolWeighLog } from '../../api/client'
import { ArrowLeft, WifiOff, MapPin, LayoutList, LayoutGrid, QrCode, Plus, Nfc, Loader2, Check, Scale, ChevronUp, ChevronDown } from 'lucide-react'
import { SpoolIcon } from '../../components/SpoolIcon'
import { QRCodeSVG } from 'qrcode.react'
import Modal from '../../components/Modal'
import SpoolReceiveWizard from '../../components/SpoolReceiveWizard'
import SpoolTagModal from '../../components/SpoolTagModal'
import SpoolStickerModal from '../../components/SpoolStickerModal'
import SpoolWeighModal from '../../components/SpoolWeighModal'
import { useMobileSession } from '../../contexts/MobileSessionContext'

type View = 'list' | 'details'
type SortKey = 'brand' | 'id' | 'material' | 'color' | 'location' | 'remaining' | 'accuracy'
type SortDir = 'asc' | 'desc'

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

function weightLabel(g: number | null | undefined): string {
  if (g == null) return '—'
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}

function spoolColor(spool: SpoolmanSpool): string {
  const raw = spool.filament.multi_color_hexes
    ? spool.filament.multi_color_hexes.split(/[,;]/)[0]
    : spool.filament.color_hex
  return normalizeHex(raw)
}

function spoolBarStyle(spool: SpoolmanSpool, pct: number): React.CSSProperties {
  const hexes = spool.filament.multi_color_hexes?.split(/[,;]/).map(h => `#${h.replace('#', '')}`)
  if (hexes && hexes.length > 1) {
    return { width: `${pct}%`, backgroundImage: `linear-gradient(to right, ${hexes.join(', ')})` }
  }
  return { width: `${pct}%`, backgroundColor: spoolColor(spool) }
}


type WeighConfidence = 'high' | 'medium' | 'low'

function weighConfidence(spool: SpoolmanSpool, weighLog: Record<number, string>): WeighConfidence {
  const candidates: number[] = []
  if (weighLog[spool.id]) candidates.push(new Date(weighLog[spool.id]).getTime())
  if (spool.last_used) candidates.push(new Date(spool.last_used).getTime())
  if (candidates.length === 0) return 'low'
  const ageMs = Date.now() - Math.max(...candidates)
  const days = ageMs / 86_400_000
  if (days <= 7) return 'high'
  if (days <= 30) return 'medium'
  return 'low'
}

const CONFIDENCE_COLOR: Record<WeighConfidence, string> = {
  high: '#22c55e',
  medium: '#eab308',
  low: '#ef4444',
}

const CONFIDENCE_TITLE: Record<WeighConfidence, string> = {
  high: 'Weight accurate — weighed or used within 7 days',
  medium: 'Weight may have drifted — last updated 7–30 days ago',
  low: 'Weight unknown or stale — never weighed or over 30 days ago',
}

function SpoolRow({ spool, onPrintLabel, onTag, onWeigh, onLocationChange, allLocations, selectWidth, confidence }: {
  spool: SpoolmanSpool; onPrintLabel: () => void; onTag: () => void; onWeigh: () => void
  onLocationChange: (location: string | null) => void; allLocations: string[]; selectWidth: number
  confidence: WeighConfidence
}) {
  const color = spoolColor(spool)
  const pct = spool.filament.weight && spool.remaining_weight != null
    ? Math.min(100, (spool.remaining_weight / spool.filament.weight) * 100)
    : null
  const isLow = pct !== null && pct < 20

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700 last:border-0">
      <SpoolIcon color={color} size={35} />
      <p className="text-xl font-black text-brand-600 dark:text-brand-400 leading-none shrink-0 w-12">
        #{spool.id}
      </p>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{spool.filament.name || '—'}</span>
            {spool.filament.vendor?.name && (
              <span className="text-xs text-gray-400 shrink-0">{spool.filament.vendor.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1">
              <MapPin size={11} className="text-gray-400 shrink-0" />
              <select
                style={{ width: selectWidth }}
                value={spool.location ?? ''}
                onChange={e => { const t = e.target; onLocationChange(t.value || null); requestAnimationFrame(() => t.blur()) }}
                className="text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-gray-800 dark:border-gray-600 text-gray-600 dark:text-gray-300 cursor-pointer"
              >
                <option value="">Unknown</option>
                {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onWeigh}
                title={CONFIDENCE_TITLE[confidence]}
                className="p-0.5 hover:opacity-70 transition-opacity relative"
                style={{ color: CONFIDENCE_COLOR[confidence] }}
              >
                {confidence === 'low' && (
                  <span className="absolute inset-[10%] rounded-full bg-red-500/55 animate-ping" />
                )}
                <Scale size={14} />
              </button>
              <span className={`text-sm font-semibold tabular-nums w-16 ${isLow ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
                {weightLabel(spool.remaining_weight)}
              </span>
              <span className={`text-xs tabular-nums w-7 ${pct !== null && isLow ? 'text-red-400' : 'text-gray-400'}`}>
                {pct !== null ? `${Math.round(pct)}%` : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
            {spool.filament.material}
          </span>
          {spool.lot_nr && <span className="text-xs text-gray-400">Lot: {spool.lot_nr}</span>}
          {spool.comment && (
            <span className="text-xs text-gray-400 italic truncate max-w-40">{spool.comment}</span>
          )}
        </div>
        {pct !== null && (
          <div
            className="mt-2 h-2.5 rounded-full overflow-hidden border border-black/5 dark:border-white/5"
            style={{ backgroundColor: `${color}28` }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={spoolBarStyle(spool, pct)}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onTag}
          title="Tag spool with NFC"
          className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <Nfc size={16} />
        </button>
        <button
          onClick={onPrintLabel}
          title="Print QR label"
          className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <QrCode size={16} />
        </button>
      </div>
    </div>
  )
}

function SpoolCard({ spool, onPrintLabel, onTag, onWeigh, onLocationChange, allLocations, selectWidth, confidence }: {
  spool: SpoolmanSpool; onPrintLabel: () => void; onTag: () => void; onWeigh: () => void
  onLocationChange: (location: string | null) => void; allLocations: string[]; selectWidth: number
  confidence: WeighConfidence
}) {
  const color = spoolColor(spool)
  const pct = spool.filament.weight && spool.remaining_weight != null
    ? Math.min(100, (spool.remaining_weight / spool.filament.weight) * 100)
    : null
  const isLow = pct !== null && pct < 20

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
      <div className="relative flex items-center justify-center py-6" style={{ backgroundColor: `${color}28` }}>
        <SpoolIcon color={color} size={72} />
        <div className="absolute top-2 right-2 flex items-center gap-0.5">
          <button
            onClick={onWeigh}
            title={CONFIDENCE_TITLE[confidence]}
            className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-gray-900/40 hover:opacity-70 transition-opacity relative"
            style={{ color: CONFIDENCE_COLOR[confidence] }}
          >
            {confidence === 'low' && (
              <span className="absolute inset-[10%] rounded-full bg-red-500/70 animate-ping" />
            )}
            <Scale size={15} />
          </button>
          <button
            onClick={onTag}
            title="Tag spool with NFC"
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-white/60 dark:hover:bg-gray-900/40 transition-colors"
          >
            <Nfc size={15} />
          </button>
          <button
            onClick={onPrintLabel}
            title="Print QR label"
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-white/60 dark:hover:bg-gray-900/40 transition-colors"
          >
            <QrCode size={15} />
          </button>
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1 gap-2">
        <p className="text-2xl font-black text-brand-600 dark:text-brand-400 leading-none">#{spool.id}</p>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
            {spool.filament.name || '—'}
          </p>
          {spool.filament.vendor?.name && (
            <p className="text-xs text-gray-400 mt-0.5">{spool.filament.vendor.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
            {spool.filament.material}
          </span>
          {spool.lot_nr && <span className="text-xs text-gray-400">Lot: {spool.lot_nr}</span>}
        </div>
        <div className="mt-auto pt-3 space-y-2">
          <div className="flex items-center gap-1">
            <MapPin size={11} className="text-gray-400 shrink-0" />
            <select
              style={{ width: selectWidth }}
              value={spool.location ?? ''}
              onChange={e => { const t = e.target; onLocationChange(t.value || null); requestAnimationFrame(() => t.blur()) }}
              className="text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-gray-800 dark:border-gray-600 text-gray-600 dark:text-gray-300 cursor-pointer"
            >
              <option value="">Unknown</option>
              {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`text-sm font-semibold ${isLow ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
              {weightLabel(spool.remaining_weight)}
            </span>
            {pct !== null && (
              <span className={`text-xs ${isLow ? 'text-red-400' : 'text-gray-400'}`}>{Math.round(pct)}%</span>
            )}
          </div>
        </div>
      </div>
      {/* Full-width gauge strip at the card bottom */}
      {pct !== null && (
        <div className="h-3 relative" style={{ backgroundColor: `${color}28` }}>
          <div
            className="absolute inset-y-0 left-0 transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  )
}

type TaskFeedback = { spoolId: number; type: 'sending' | 'success' | 'error'; msg?: string }

export default function SpoolInventory() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { phoneConnected, pushTask } = useMobileSession()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('list')
  const [sortKey, setSortKey] = useState<SortKey>('material')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [labelSpool, setLabelSpool] = useState<SpoolmanSpool | null>(null)
  const [tagSpool, setTagSpool] = useState<SpoolmanSpool | null>(null)
  const [weighSpool, setWeighSpool] = useState<SpoolmanSpool | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [taskFeedback, setTaskFeedback] = useState<TaskFeedback | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['spoolman-stock'],
    queryFn: getSpoolmanStock,
    refetchInterval: 15_000,
  })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const { data: locationData } = useQuery({ queryKey: ['spoolman-location-options'], queryFn: getSpoolmanLocationOptions })
  const { data: weighLogData } = useQuery({ queryKey: ['spool-weigh-log'], queryFn: getSpoolWeighLog })

  const { data: webhookData } = useQuery({
    queryKey: ['spoolman-webhook-version'],
    queryFn: () => fetch('/api/webhooks/spoolman/version').then(r => r.json()) as Promise<{ version: number }>,
    refetchInterval: 5_000,
  })
  const prevWebhookVersionRef = useRef<number | null>(null)
  useEffect(() => {
    if (webhookData == null) return
    if (prevWebhookVersionRef.current !== null && webhookData.version !== prevWebhookVersionRef.current) {
      qc.invalidateQueries({ queryKey: ['spoolman-stock'] })
      qc.invalidateQueries({ queryKey: ['spoolman-location-options'] })
    }
    prevWebhookVersionRef.current = webhookData.version
  }, [webhookData, qc])

  const viewSynced = useRef(false)
  useEffect(() => {
    if (settings && !viewSynced.current) {
      viewSynced.current = true
      if (settings.ui_spool_inventory_view === 'list' || settings.ui_spool_inventory_view === 'details') {
        setView(settings.ui_spool_inventory_view)
      }
    }
  }, [settings])

  function changeView(v: View) {
    setView(v)
    setSetting('ui_spool_inventory_view', v)
  }

  async function handleTag(spool: SpoolmanSpool) {
    if (!phoneConnected) {
      setTagSpool(spool)
      return
    }
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    setTaskFeedback({ spoolId: spool.id, type: 'sending' })
    try {
      const spoolLabel = spool.filament.name
        ? `${spool.filament.name} #${spool.id}`
        : `Spool #${spool.id}`
      const colorHex = spool.filament.color_hex
        ? (spool.filament.color_hex.startsWith('#') ? spool.filament.color_hex.slice(1) : spool.filament.color_hex)
        : undefined
      const session = await createNfcSession({
        spool_id: spool.id,
        spool_label: spoolLabel,
        slot: 'A',
        mode: 'read_write',
        filament_type: spool.filament.material || undefined,
        color_hex: colorHex,
        brand: spool.filament.vendor?.name || undefined,
      })
      pushTask({ task_type: 'nfc_write', nfc_token: session.token }, (result) => {
        const uids = [result.card_uid, result.card_uid_b].filter(Boolean) as string[]
        const normalized = uids.map(u => u.replace(/:/g, '').toLowerCase())
        if (normalized.length > 0) {
          patchSpoolmanLotNr(spool.id, normalized)
            .then(() => {
              qc.invalidateQueries({ queryKey: ['spoolman-stock'] })
              setTaskFeedback({ spoolId: spool.id, type: 'success' })
              feedbackTimerRef.current = setTimeout(() => setTaskFeedback(null), 3000)
            })
            .catch((e: Error) => {
              setTaskFeedback({ spoolId: spool.id, type: 'error', msg: e.message })
              feedbackTimerRef.current = setTimeout(() => setTaskFeedback(null), 5000)
            })
        } else {
          setTaskFeedback(null)
        }
      })
    } catch {
      setTaskFeedback(null)
      setTagSpool(spool)
    }
  }

  const spoolmanUrl = (settings?.spoolman_url || '').replace(/\/$/, '')

  const activeSpools = (data?.spools ?? []).filter(s => !s.archived)

  const allLocations = useMemo(() => locationData?.locations ?? [], [locationData])
  const weighLog = useMemo(() => weighLogData?.log ?? {}, [weighLogData])

  const sizerRef = useRef<HTMLSelectElement>(null)
  const [selectWidth, setSelectWidth] = useState(100)
  useEffect(() => {
    if (sizerRef.current) setSelectWidth(sizerRef.current.offsetWidth)
  }, [allLocations])

  async function handleLocationChange(spool: SpoolmanSpool, location: string | null) {
    try {
      await patchSpoolmanLocation(spool.id, location)
      qc.invalidateQueries({ queryKey: ['spoolman-stock'] })
    } catch {
      // leave Spoolman as-is; next refetch will restore the displayed value
    }
  }
  const materialsCount = new Set(activeSpools.map(s => s.filament.material)).size
  const colorsCount = new Set(activeSpools.map(s => s.filament.color_hex ?? 'unknown')).size
  const brandsCount = new Set(activeSpools.map(s => s.filament.vendor?.name ?? '').filter(Boolean)).size
  const totalWeight = activeSpools.reduce((sum, s) => sum + (s.remaining_weight ?? 0), 0)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filteredSpools = activeSpools
    .filter(s => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        String(s.id).includes(q) ||
        s.filament.name?.toLowerCase().includes(q) ||
        s.filament.material?.toLowerCase().includes(q) ||
        s.filament.vendor?.name?.toLowerCase().includes(q) ||
        s.location?.toLowerCase().includes(q) ||
        s.lot_nr?.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'brand') cmp = (a.filament.vendor?.name ?? '').localeCompare(b.filament.vendor?.name ?? '')
      else if (sortKey === 'id') cmp = a.id - b.id
      else if (sortKey === 'material') cmp = (a.filament.material ?? '').localeCompare(b.filament.material ?? '')
      else if (sortKey === 'color') cmp = (a.filament.color_hex ?? '').localeCompare(b.filament.color_hex ?? '')
      else if (sortKey === 'location') cmp = (a.location ?? '').localeCompare(b.location ?? '')
      else if (sortKey === 'remaining') cmp = (a.remaining_weight ?? 0) - (b.remaining_weight ?? 0)
      else if (sortKey === 'accuracy') {
        const order = { high: 2, medium: 1, low: 0 }
        cmp = order[weighConfidence(a, weighLog)] - order[weighConfidence(b, weighLog)]
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  // suppress unused warning — spoolmanUrl kept for potential future use
  void spoolmanUrl

  return (
    <div className="p-6 space-y-6">
      {/* Hidden sizer — measures the width needed to fit the longest location option */}
      <select ref={sizerRef} className="invisible fixed pointer-events-none" style={{ width: 'auto' }} aria-hidden tabIndex={-1}>
        <option value="">Unknown</option>
        {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
      </select>

      {labelSpool && <SpoolStickerModal spool={labelSpool} onClose={() => setLabelSpool(null)} />}
      {tagSpool && <SpoolTagModal spool={tagSpool} onClose={() => setTagSpool(null)} />}
      {weighSpool && (
        <SpoolWeighModal
          spool={weighSpool}
          onClose={() => setWeighSpool(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['spoolman-stock'] })
            qc.invalidateQueries({ queryKey: ['spool-weigh-log'] })
          }}
        />
      )}
      {showWizard && <SpoolReceiveWizard onClose={() => setShowWizard(false)} />}

      {taskFeedback && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${
          taskFeedback.type === 'sending'
            ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            : taskFeedback.type === 'success'
            ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
        }`}>
          {taskFeedback.type === 'sending' && <Loader2 size={14} className="animate-spin shrink-0" />}
          {taskFeedback.type === 'success' && <Check size={14} className="shrink-0" />}
          <span>
            {taskFeedback.type === 'sending'
              ? `Sent to phone — waiting for NFC write on spool #${taskFeedback.spoolId}…`
              : taskFeedback.type === 'success'
              ? `Tags written for spool #${taskFeedback.spoolId}`
              : `Failed to update Spoolman: ${taskFeedback.msg}`}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/filaments')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <SpoolIcon size={40} color="#9ca3af" />
            Spool Inventory
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5 leading-none">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-blink shrink-0 translate-y-px" />
            Live data from Spoolman
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Add Spool(s)
          </button>
          {spoolmanUrl && (
            <button
              onClick={() => fetch('/api/settings/open-spoolman')}
              className="text-xs text-gray-400 hover:text-teal-500 transition-colors"
            >
              New filament type? Add it in Spoolman first →
            </button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400 italic">Loading…</p>}

      {!isLoading && !data?.connected && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <WifiOff size={15} />
          <span>Spoolman not connected — configure the URL in Settings.</span>
        </div>
      )}

      {data?.connected && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-teal-600">{activeSpools.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active spools</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-blue-600">{(totalWeight / 1000).toFixed(2)} kg</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total remaining</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-indigo-600">{materialsCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Materials</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-purple-600">{colorsCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Colors</p>
            </div>
            <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-rose-600">{brandsCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Brands</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="flex-1 min-w-48 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
              placeholder="Filter by ID, name, material, vendor, location, lot…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="flex items-center gap-1 flex-wrap">
              {([['brand', 'Brand'], ['id', 'ID'], ['material', 'Material'], ['color', 'Color'], ['location', 'Location'], ['remaining', 'Remaining'], ['accuracy', 'Accuracy']] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    sortKey === key
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {label}
                  {sortKey === key && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
              <button
                onClick={() => changeView('list')}
                title="List view"
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  view === 'list'
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <LayoutList size={15} /> List
              </button>
              <button
                onClick={() => changeView('details')}
                title="Details view"
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-l border-gray-200 dark:border-gray-700 transition-colors ${
                  view === 'details'
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <LayoutGrid size={15} /> Details
              </button>
            </div>
          </div>

          {filteredSpools.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No spools match your filter.</p>
          ) : view === 'list' ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              {filteredSpools.map(spool => (
                <SpoolRow key={spool.id} spool={spool} onPrintLabel={() => setLabelSpool(spool)} onTag={() => handleTag(spool)} onWeigh={() => setWeighSpool(spool)} onLocationChange={loc => handleLocationChange(spool, loc)} allLocations={allLocations} selectWidth={selectWidth} confidence={weighConfidence(spool, weighLog)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredSpools.map(spool => (
                <SpoolCard key={spool.id} spool={spool} onPrintLabel={() => setLabelSpool(spool)} onTag={() => handleTag(spool)} onWeigh={() => setWeighSpool(spool)} onLocationChange={loc => handleLocationChange(spool, loc)} allLocations={allLocations} selectWidth={selectWidth} confidence={weighConfidence(spool, weighLog)} />
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 text-right">{filteredSpools.length} of {activeSpools.length} spools</p>
        </>
      )}
    </div>
  )
}
