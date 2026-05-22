import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { ChevronRight, ChevronLeft, Check, Loader2, Plus, Search, Nfc, Package, AlertTriangle, QrCode, HelpCircle } from 'lucide-react'
import Modal from './Modal'
import {
  getSpoolmanFilaments,
  getSettings,
  createSpoolmanFilament,
  createSpoolmanSpoolsWizard,
  patchSpoolmanLotNr,
  createNfcSession,
  getNfcSession,
  SpoolmanSpool,
  SpoolmanFilament,
} from '../api/client'

// ─── Types ───────────────────────────────────────────────────────────────────

type Route = 'manual' | 'nfc'
type FilamentTab = 'existing' | 'new'

interface NewFilamentForm {
  name: string
  material: string
  color_hex: string
  vendor_name: string
  weight: string
  price: string
  settings_extruder_temp: string
  settings_bed_temp: string
}

interface SpoolDetails {
  count: number
  price: string
  location: string
  comment: string
}

interface NfcSlotResult {
  card_uid: string
  wrote_tag: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeHex(h: string | null | undefined): string {
  if (!h) return '#888888'
  return h.startsWith('#') ? h : `#${h}`
}

function filamentLabel(f: SpoolmanFilament): string {
  const parts = [f.name || `#${f.id}`, f.material]
  if (f.vendor?.name) parts.push(f.vendor.name)
  return parts.join(' · ')
}

const COMMON_MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PC', 'Nylon', 'HIPS', 'PVA', 'Carbon Fiber']

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center py-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i < current ? 'w-4 bg-brand-600' : i === current ? 'w-4 bg-brand-400' : 'w-1.5 bg-gray-300 dark:bg-gray-600'
          }`}
        />
      ))}
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function SpoolReceiveWizard({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()

  // ── Step state ──
  const [step, setStep] = useState(0)
  const [route, setRoute] = useState<Route | null>(null)

  // ── Step 2: filament ──
  const [filamentTab, setFilamentTab] = useState<FilamentTab>('existing')
  const [selectedFilamentId, setSelectedFilamentId] = useState<number | null>(null)
  const [filamentSearch, setFilamentSearch] = useState('')
  const [newFilament, setNewFilament] = useState<NewFilamentForm>({
    name: '', material: 'PLA', color_hex: '#888888',
    vendor_name: '', weight: '', price: '',
    settings_extruder_temp: '', settings_bed_temp: '',
  })
  const [creatingFilament, setCreatingFilament] = useState(false)
  const [createdFilament, setCreatedFilament] = useState<SpoolmanFilament | null>(null)

  // ── Step 3: spool details ──
  const [details, setDetails] = useState<SpoolDetails>({ count: 1, price: '', location: '', comment: '' })

  // ── Step 4: created spools ──
  const [creatingSpools, setCreatingSpools] = useState(false)
  const [createdSpools, setCreatedSpools] = useState<SpoolmanSpool[]>([])
  const [createError, setCreateError] = useState<string | null>(null)

  // ── NFC tagging loop ──
  const [nfcStarted, setNfcStarted] = useState(false)
  const [currentSpoolIdx, setCurrentSpoolIdx] = useState(0)
  const [nfcToken, setNfcToken] = useState<string | null>(null)
  const [nfcSlot, setNfcSlot] = useState<'A' | 'B'>('A')
  const [nfcPollStatus, setNfcPollStatus] = useState<'waiting' | 'done'>('waiting')
  const [askSecondTag, setAskSecondTag] = useState(false)
  const [spoolResults, setSpoolResults] = useState<Record<number, NfcSlotResult[]>>({})
  const [patchingLot, setPatchingLot] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data queries ──
  const { data: filaments } = useQuery({
    queryKey: ['spoolman-filaments'],
    queryFn: getSpoolmanFilaments,
  })

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  const { data: lanIpData } = useQuery({
    queryKey: ['lan-ip'],
    queryFn: () => fetch('/api/settings/lan-ip').then(r => r.json()) as Promise<{ ip: string; https_port: string }>,
    staleTime: Infinity,
  })

  const mobileBase = useMemo(() => {
    const ip = lanIpData?.ip ?? window.location.hostname
    const protocol = settings?.mobile_protocol ?? 'https'
    if (protocol === 'https') {
      const port = lanIpData?.https_port ?? '7892'
      return `https://${ip}:${port}`
    }
    const port = window.location.port
    return `http://${ip}${port ? `:${port}` : ''}`
  }, [lanIpData, settings])

  // ── Clean up polling on unmount ──
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current) }, [])

  // ── Derived ──
  const filamentList = filaments?.filaments ?? []
  const spoolmanConnected = filaments?.connected ?? false

  const filteredFilaments = useMemo(() => {
    const q = filamentSearch.toLowerCase().trim()
    if (!q) return filamentList
    return filamentList.filter(f =>
      f.name?.toLowerCase().includes(q) ||
      f.material?.toLowerCase().includes(q) ||
      f.vendor?.name?.toLowerCase().includes(q)
    )
  }, [filamentList, filamentSearch])

  const activeFilamentId = createdFilament?.id ?? selectedFilamentId

  function filamentDisplayName(): string {
    if (createdFilament) return filamentLabel(createdFilament)
    const f = filamentList.find(f => f.id === selectedFilamentId)
    return f ? filamentLabel(f) : '—'
  }

  const totalSteps = 5

  // ── Step navigation ──
  function canAdvanceStep2(): boolean {
    if (filamentTab === 'existing') return selectedFilamentId !== null
    return newFilament.name.trim() !== '' && newFilament.material.trim() !== ''
  }

  async function handleAdvanceStep2() {
    if (filamentTab === 'new' && !createdFilament) {
      setCreatingFilament(true)
      try {
        const payload: Parameters<typeof createSpoolmanFilament>[0] = {
          name: newFilament.name.trim(),
          material: newFilament.material.trim(),
        }
        if (newFilament.color_hex) payload.color_hex = newFilament.color_hex
        if (newFilament.vendor_name.trim()) payload.vendor_name = newFilament.vendor_name.trim()
        if (newFilament.weight) payload.weight = parseFloat(newFilament.weight)
        if (newFilament.price) payload.price = parseFloat(newFilament.price)
        if (newFilament.settings_extruder_temp) payload.settings_extruder_temp = parseInt(newFilament.settings_extruder_temp)
        if (newFilament.settings_bed_temp) payload.settings_bed_temp = parseInt(newFilament.settings_bed_temp)
        const created = await createSpoolmanFilament(payload)
        setCreatedFilament(created)
        qc.invalidateQueries({ queryKey: ['spoolman-filaments'] })
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Failed to create filament type')
        return
      } finally {
        setCreatingFilament(false)
      }
    }
    setStep(3)
  }

  async function handleCreateSpools() {
    if (!activeFilamentId) return
    setCreatingSpools(true)
    setCreateError(null)
    try {
      const payload: Parameters<typeof createSpoolmanSpoolsWizard>[0] = {
        filament_id: activeFilamentId,
        count: details.count,
      }
      if (details.price) payload.price = parseFloat(details.price)
      if (details.location.trim()) payload.location = details.location.trim()
      if (details.comment.trim()) payload.comment = details.comment.trim()
      const result = await createSpoolmanSpoolsWizard(payload)
      setCreatedSpools(result.spools)
      qc.invalidateQueries({ queryKey: ['spoolman-stock'] })
      setStep(4)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create spools')
    } finally {
      setCreatingSpools(false)
    }
  }

  // ── NFC session management ──
  const startNfcSession = useCallback(async (spoolId: number, spoolLabel: string, slot: 'A' | 'B', filamentMeta?: { type?: string; color_hex?: string; brand?: string; subtype?: string; min_temp?: number; max_temp?: number; bed_temp?: number }) => {
    const session = await createNfcSession({
      spool_id: spoolId,
      spool_label: spoolLabel,
      slot,
      mode: 'read_write',
      filament_type: filamentMeta?.type,
      color_hex: filamentMeta?.color_hex,
      brand: filamentMeta?.brand,
      subtype: filamentMeta?.subtype,
      min_temp: filamentMeta?.min_temp,
      max_temp: filamentMeta?.max_temp,
      bed_temp: filamentMeta?.bed_temp,
    })
    setNfcToken(session.token)
    setNfcSlot(slot)
    setNfcPollStatus('waiting')

    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const s = await getNfcSession(session.token)
        if (s.status === 'completed' && s.card_uid) {
          clearInterval(pollingRef.current!)
          pollingRef.current = null
          setNfcPollStatus('done')
          setSpoolResults(prev => {
            const existing = prev[spoolId] ?? []
            return { ...prev, [spoolId]: [...existing, { card_uid: s.card_uid!, wrote_tag: s.wrote_tag ?? false }] }
          })
          if (slot === 'A') {
            setAskSecondTag(true)
          }
        }
      } catch { /* ignore poll errors */ }
    }, 1000)
  }, [])

  function getFilamentMeta() {
    const f = createdFilament ?? filamentList.find(f => f.id === selectedFilamentId)
    if (!f) return undefined
    const hex = f.color_hex ? (f.color_hex.startsWith('#') ? f.color_hex.slice(1) : f.color_hex) : undefined
    return {
      type: f.material || undefined,
      color_hex: hex,
      brand: f.vendor?.name || undefined,
      min_temp: f.settings_extruder_temp ?? undefined,
      max_temp: f.settings_extruder_temp ?? undefined,
      bed_temp: f.settings_bed_temp ?? undefined,
    }
  }

  async function beginNfcTagging() {
    setNfcStarted(true)
    const spool = createdSpools[0]
    if (!spool) return
    await startNfcSession(spool.id, `Spool #${spool.id}`, 'A', getFilamentMeta())
  }

  async function handleSecondTag(yes: boolean) {
    setAskSecondTag(false)
    const spool = createdSpools[currentSpoolIdx]
    if (yes && spool) {
      await startNfcSession(spool.id, `Spool #${spool.id}`, 'B', getFilamentMeta())
    } else {
      await finishCurrentSpool()
    }
  }

  async function finishCurrentSpool() {
    const spool = createdSpools[currentSpoolIdx]
    if (!spool) return
    const results = spoolResults[spool.id] ?? []
    const uids = results.map(r => r.card_uid)
    if (uids.length > 0) {
      setPatchingLot(true)
      try { await patchSpoolmanLotNr(spool.id, uids) } catch { /* non-fatal */ }
      setPatchingLot(false)
    }
    setNfcToken(null)
    setNfcPollStatus('waiting')
    const nextIdx = currentSpoolIdx + 1
    if (nextIdx < createdSpools.length) {
      setCurrentSpoolIdx(nextIdx)
      const nextSpool = createdSpools[nextIdx]
      await startNfcSession(nextSpool.id, `Spool #${nextSpool.id}`, 'A', getFilamentMeta())
    } else {
      // All done
      setCurrentSpoolIdx(createdSpools.length) // sentinel
    }
  }

  const allTagged = nfcStarted && currentSpoolIdx >= createdSpools.length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal title="Add Spool(s) to Inventory" onClose={onClose}>
      <StepDots total={totalSteps} current={step} />

      {/* ── Step 0: Spoolman pre-check ── */}
      {step === 0 && (
        <div className="space-y-5 py-2">
          <div className="flex flex-col items-center gap-3 pt-2 pb-1 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <HelpCircle size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">Is this filament in Spoolman?</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Before adding a spool here, its filament type needs to exist in Spoolman. If this is a new filament you haven't registered yet, open Spoolman first to create the filament type — then come back and continue.
              </p>
            </div>
          </div>

          <button
            onClick={() => fetch('/api/settings/open-spoolman')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-teal-400/40 bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-300 text-sm font-medium hover:border-teal-400/70 hover:bg-teal-100 dark:hover:bg-teal-950/40 transition-all"
          >
            <HelpCircle size={15} />
            Open Spoolman to register filament
          </button>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
            >
              Filament is in Spoolman <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Route selection ── */}
      {step === 1 && (
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">How would you like to add spools?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setRoute('manual')}
              className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-left ${
                route === 'manual'
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700'
              }`}
            >
              <Package size={28} className={route === 'manual' ? 'text-brand-600' : 'text-gray-400'} />
              <div>
                <p className={`font-semibold text-sm ${route === 'manual' ? 'text-brand-700 dark:text-brand-300' : 'text-gray-800 dark:text-gray-200'}`}>Manual</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">Enter details, create spools in Spoolman. No NFC required.</p>
              </div>
            </button>
            <button
              onClick={() => setRoute('nfc')}
              className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-left ${
                route === 'nfc'
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700'
              }`}
            >
              <Nfc size={28} className={route === 'nfc' ? 'text-brand-600' : 'text-gray-400'} />
              <div>
                <p className={`font-semibold text-sm ${route === 'nfc' ? 'text-brand-700 dark:text-brand-300' : 'text-gray-800 dark:text-gray-200'}`}>NFC-Assisted</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">Create spools then tag each one using your phone. Android Chrome required.</p>
              </div>
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setStep(2)}
              disabled={!route}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Filament selection ── */}
      {step === 2 && (
        <div className="space-y-4 py-2">
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setFilamentTab('existing')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                filamentTab === 'existing'
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              Pick existing
            </button>
            <button
              onClick={() => setFilamentTab('new')}
              className={`flex-1 px-3 py-2 text-sm font-medium border-l border-gray-200 dark:border-gray-700 transition-colors ${
                filamentTab === 'new'
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Plus size={13} className="inline mr-1" />
              Create new type
            </button>
          </div>

          {filamentTab === 'existing' ? (
            <div className="space-y-2">
              {!spoolmanConnected && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={13} className="shrink-0" />
                  Spoolman is not connected. Configure the URL in Settings.
                </div>
              )}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                  placeholder="Search filaments…"
                  value={filamentSearch}
                  onChange={e => setFilamentSearch(e.target.value)}
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {filteredFilaments.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-6">
                    {spoolmanConnected ? 'No filaments match your search' : 'No filaments available'}
                  </p>
                ) : filteredFilaments.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFilamentId(f.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      selectedFilamentId === f.id
                        ? 'bg-brand-50 dark:bg-brand-950/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full shrink-0 border border-black/10 dark:border-white/10"
                      style={{ backgroundColor: normalizeHex(f.color_hex) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate dark:text-gray-200">{f.name || `#${f.id}`}</p>
                      <p className="text-xs text-gray-400 truncate">{[f.material, f.vendor?.name].filter(Boolean).join(' · ')}</p>
                    </div>
                    {selectedFilamentId === f.id && <Check size={15} className="text-brand-600 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Name *</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    placeholder="e.g. Hyper Speed PLA"
                    value={newFilament.name}
                    onChange={e => setNewFilament(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Material *</label>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    value={newFilament.material}
                    onChange={e => setNewFilament(p => ({ ...p, material: e.target.value }))}
                  >
                    {COMMON_MATERIALS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Color</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-12 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
                      value={newFilament.color_hex}
                      onChange={e => setNewFilament(p => ({ ...p, color_hex: e.target.value }))}
                    />
                    <input
                      className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                      value={newFilament.color_hex}
                      onChange={e => setNewFilament(p => ({ ...p, color_hex: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Brand</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    placeholder="e.g. Bambu"
                    value={newFilament.vendor_name}
                    onChange={e => setNewFilament(p => ({ ...p, vendor_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Spool weight (g)</label>
                  <input
                    type="number" min="0"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    placeholder="1000"
                    value={newFilament.weight}
                    onChange={e => setNewFilament(p => ({ ...p, weight: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Price per spool</label>
                  <input
                    type="number" min="0" step="0.01"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    placeholder="0.00"
                    value={newFilament.price}
                    onChange={e => setNewFilament(p => ({ ...p, price: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Extruder temp (°C)</label>
                  <input
                    type="number"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    placeholder="220"
                    value={newFilament.settings_extruder_temp}
                    onChange={e => setNewFilament(p => ({ ...p, settings_extruder_temp: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Bed temp (°C)</label>
                  <input
                    type="number"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    placeholder="60"
                    value={newFilament.settings_bed_temp}
                    onChange={e => setNewFilament(p => ({ ...p, settings_bed_temp: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <button
              onClick={handleAdvanceStep2}
              disabled={!canAdvanceStep2() || creatingFilament}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40"
            >
              {creatingFilament && <Loader2 size={14} className="animate-spin" />}
              {creatingFilament ? 'Creating…' : 'Next'}
              {!creatingFilament && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Spool details ── */}
      {step === 3 && (
        <div className="space-y-4 py-2">
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Selected filament</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">{filamentDisplayName()}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Number of spools</label>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={() => setDetails(p => ({ ...p, count: Math.max(1, p.count - 1) }))}
                  className="w-9 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center font-bold text-lg"
                >−</button>
                <input
                  type="number" min="1" max="50"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                  value={details.count}
                  onChange={e => setDetails(p => ({ ...p, count: Math.max(1, parseInt(e.target.value) || 1) }))}
                />
                <button
                  onClick={() => setDetails(p => ({ ...p, count: Math.min(50, p.count + 1) }))}
                  className="w-9 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center font-bold text-lg"
                >+</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Price per spool</label>
              <input
                type="number" min="0" step="0.01"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                placeholder="Optional"
                value={details.price}
                onChange={e => setDetails(p => ({ ...p, price: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Storage location</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                placeholder="e.g. Shelf A"
                value={details.location}
                onChange={e => setDetails(p => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Comment</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                placeholder="Optional note"
                value={details.comment}
                onChange={e => setDetails(p => ({ ...p, comment: e.target.value }))}
              />
            </div>
          </div>

          {createError && (
            <p className="text-sm text-red-500 dark:text-red-400">{createError}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <button
              onClick={handleCreateSpools}
              disabled={creatingSpools}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40"
            >
              {creatingSpools && <Loader2 size={14} className="animate-spin" />}
              {creatingSpools ? 'Creating spools…' : `Create ${details.count} spool${details.count !== 1 ? 's' : ''}`}
              {!creatingSpools && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Manual — done ── */}
      {step === 4 && route === 'manual' && (
        <div className="space-y-5 py-2">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <Check size={28} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {createdSpools.length} spool{createdSpools.length !== 1 ? 's' : ''} added
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{filamentDisplayName()}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {createdSpools.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-sm font-bold text-brand-600 dark:text-brand-400 w-10">#{s.id}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{s.filament.name}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              Print QR labels from the spool inventory list.
            </p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: NFC — tagging loop ── */}
      {step === 4 && route === 'nfc' && (
        <div className="space-y-4 py-2">
          {/* All tagged — final done screen */}
          {allTagged ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                  <Check size={28} className="text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">All spools tagged</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{filamentDisplayName()}</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {createdSpools.map(s => {
                  const results = spoolResults[s.id] ?? []
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-sm font-bold text-brand-600 dark:text-brand-400 w-10">#{s.id}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{results.length} tag{results.length !== 1 ? 's' : ''}</p>
                        {results.map((r, i) => (
                          <p key={i} className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate">{r.card_uid}</p>
                        ))}
                      </div>
                      {results.length > 0 && <Check size={14} className="text-green-500 shrink-0" />}
                    </div>
                  )
                })}
              </div>
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
              >
                Done
              </button>
            </div>
          ) : !nfcStarted ? (
            /* Pre-start: show spool list, offer to begin */
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Spools created</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                  {createdSpools.map(s => `#${s.id}`).join(', ')}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 space-y-1 leading-relaxed">
                <p className="font-semibold">How NFC tagging works</p>
                <p>For each spool, a QR code will appear. Scan it with your Android phone to open the NFC writer. Hold a tag to the back of your phone — the desktop will advance automatically when the tag is read.</p>
              </div>
              <button
                onClick={beginNfcTagging}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
              >
                <Nfc size={16} /> Begin tagging
              </button>
            </div>
          ) : (
            /* Active tagging */
            <div className="space-y-4">
              {/* Progress */}
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Spool {currentSpoolIdx + 1} of {createdSpools.length}</span>
                <span className="font-bold text-brand-600 dark:text-brand-400">#{createdSpools[currentSpoolIdx]?.id}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${(currentSpoolIdx / createdSpools.length) * 100}%` }}
                />
              </div>

              {/* Ask second tag */}
              {askSecondTag ? (
                <div className="space-y-4 py-2">
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Tag A scanned</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Is there a tag on the other side of the spool?
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleSecondTag(true)}
                      className="py-3 rounded-xl border-2 border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 font-semibold text-sm hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => handleSecondTag(false)}
                      className="py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      No
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                    Some spool types have an NFC tag on each side.
                  </p>
                </div>
              ) : patchingLot ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 size={18} className="animate-spin text-brand-500" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Updating lot number…</span>
                </div>
              ) : nfcToken ? (
                /* QR code for phone */
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <QRCodeSVG
                        value={`${mobileBase}/mobile/nfc/${nfcToken}`}
                        size={160}
                        bgColor="#ffffff"
                        fgColor="#111827"
                        level="M"
                      />
                    </div>
                    <div className="text-center space-y-1">
                      <div className="flex items-center gap-1.5 justify-center">
                        <QrCode size={13} className="text-gray-400" />
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Scan with your phone</p>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {nfcSlot === 'A' ? 'Hold an NFC tag to the back of your phone' : 'Hold the second tag to the back of your phone'}
                      </p>
                    </div>

                    {nfcPollStatus === 'waiting' ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                        Waiting for tag scan…
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                        <Check size={13} />
                        Tag {nfcSlot} scanned
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                    Tagging spool #{createdSpools[currentSpoolIdx]?.id}
                    {nfcSlot === 'B' ? ' — tag B' : ''}
                  </p>
                </div>
              ) : null}

              {/* Skip button (if user wants to tag manually later) */}
              {!askSecondTag && !patchingLot && nfcPollStatus === 'waiting' && (
                <button
                  onClick={() => finishCurrentSpool()}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1 transition-colors"
                >
                  Skip this spool
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
