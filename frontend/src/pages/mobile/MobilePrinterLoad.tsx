import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUp, ArrowDown, X, RefreshCw, Check, Loader2, ScanLine } from 'lucide-react'
import {
  getPrinterByName,
  getSpoolmanStock,
  setPrinterSpoolmanSlots,
  SpoolmanSpool,
} from '../../api/client'
import QrScanner from '../../components/QrScanner'

function extractSpoolId(text: string): number | null {
  const trimmed = text.trim()
  // Plain integer
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  // URL ending in /number or /spool/number
  const m = trimmed.match(/\/(\d+)\/?$/)
  if (m) return parseInt(m[1], 10)
  return null
}

function weightLabel(g: number | null | undefined): string {
  if (g == null) return '—'
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}

function hexColor(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

interface SlotState {
  spool: SpoolmanSpool | null
}

export default function MobilePrinterLoad() {
  const { printerName } = useParams<{ printerName: string }>()
  const navigate = useNavigate()
  const decodedName = decodeURIComponent(printerName ?? '')

  const { data: printer, isLoading: printerLoading, error: printerError } = useQuery({
    queryKey: ['printer-by-name', decodedName],
    queryFn: () => getPrinterByName(decodedName),
    retry: 1,
  })

  const { data: stockData } = useQuery({
    queryKey: ['spoolman-stock'],
    queryFn: getSpoolmanStock,
  })

  const spools = stockData?.spools ?? []

  const slotCount = printer?.effective_slot_count ?? 0

  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: slotCount }, () => ({ spool: null }))
  )
  const [scanningSlot, setScanningSlot] = useState<number | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sync slots array length when printer loads
  const effectiveCount = printer?.effective_slot_count ?? 0
  const displaySlots = slots.length === effectiveCount
    ? slots
    : Array.from({ length: effectiveCount }, (_, i) => slots[i] ?? { spool: null })

  function setSlot(i: number, spool: SpoolmanSpool | null) {
    setSlots(prev => {
      const next = prev.length === effectiveCount
        ? [...prev]
        : Array.from({ length: effectiveCount }, (_, j) => prev[j] ?? { spool: null })
      next[i] = { spool }
      return next
    })
  }

  function moveUp(i: number) {
    if (i === 0) return
    setSlots(prev => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }

  function moveDown(i: number) {
    if (i >= effectiveCount - 1) return
    setSlots(prev => {
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  function handleScan(text: string) {
    if (scanningSlot === null) return
    setScanError(null)
    const id = extractSpoolId(text)
    if (id === null) {
      setScanError(`Couldn't read a spool ID from: "${text.slice(0, 40)}"`)
      return
    }
    const found = spools.find(s => s.id === id)
    if (!found) {
      setScanError(`Spool #${id} not found in Spoolman inventory.`)
      return
    }
    setSlot(scanningSlot, found)
    setScanningSlot(null)
  }

  async function handleConfirm() {
    if (!printer) return
    setSaving(true)
    try {
      await setPrinterSpoolmanSlots(
        printer.id,
        displaySlots.map((s, i) => ({ tool_index: i, spool_id: s.spool?.id ?? null })),
      )
      setSaved(true)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Failed to update printer')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading / error states ──
  if (printerLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 size={28} className="text-brand-400 animate-spin" />
      </div>
    )
  }

  if (printerError || !printer) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white font-semibold">Printer not found</p>
        <p className="text-sm text-gray-400">
          No printer named <span className="text-white">"{decodedName}"</span> exists in 3DMRP.
        </p>
        <button
          onClick={() => navigate('/mobile')}
          className="mt-2 flex items-center gap-2 text-sm text-brand-400"
        >
          <ArrowLeft size={16} /> Scan again
        </button>
      </div>
    )
  }

  // ── Success ──
  if (saved) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-2">
          <Check size={32} className="text-green-400" />
        </div>
        <p className="text-white text-lg font-semibold">Slots Updated</p>
        <p className="text-sm text-gray-400">
          {printer.name} is ready to print.
        </p>
        <button
          onClick={() => navigate('/mobile')}
          className="mt-4 flex items-center gap-2 text-sm text-brand-400"
        >
          <ArrowLeft size={16} /> Load another printer
        </button>
      </div>
    )
  }

  const assignedCount = displaySlots.filter(s => s.spool !== null).length

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col text-white select-none">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-5 pb-3">
        <button
          onClick={() => navigate('/mobile')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white active:bg-gray-800"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{printer.name}</p>
          <p className="text-xs text-gray-400">{effectiveCount} slot{effectiveCount !== 1 ? 's' : ''} · {assignedCount} assigned</p>
        </div>
      </div>

      {/* Slot list */}
      <div className="flex-1 px-4 pb-4 space-y-2 overflow-y-auto">
        {displaySlots.map((s, i) => (
          <div
            key={i}
            className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden"
          >
            {/* Slot row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs font-bold text-gray-500 w-4 shrink-0">
                {i + 1}
              </span>

              {s.spool ? (
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span
                    className="w-5 h-5 rounded-full shrink-0 border border-white/10"
                    style={{ backgroundColor: hexColor(s.spool.filament.color_hex) }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {s.spool.filament.vendor?.name ? `${s.spool.filament.vendor.name} ` : ''}
                      {s.spool.filament.name}
                    </p>
                    <p className="text-xs text-gray-400 leading-tight">
                      #{s.spool.id} · {s.spool.filament.material} · {weightLabel(s.spool.remaining_weight)}
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setScanError(null); setScanningSlot(i) }}
                  className="flex-1 flex items-center gap-2 text-sm text-gray-500 active:text-brand-400"
                >
                  <ScanLine size={16} />
                  Tap to scan spool
                </button>
              )}

              <div className="flex items-center gap-1 shrink-0">
                {s.spool && (
                  <>
                    <button
                      onClick={() => { setScanError(null); setScanningSlot(i) }}
                      className="p-1.5 text-gray-600 hover:text-brand-400 active:text-brand-300"
                      title="Re-scan"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => setSlot(i, null)}
                      className="p-1.5 text-gray-600 hover:text-red-400 active:text-red-300"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
                <div className="flex flex-col ml-1">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="p-0.5 text-gray-700 hover:text-gray-400 disabled:opacity-20"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i >= effectiveCount - 1}
                    className="p-0.5 text-gray-700 hover:text-gray-400 disabled:opacity-20"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {scanError && (
          <p className="text-sm text-red-400 text-center px-2 py-2">{scanError}</p>
        )}
      </div>

      {/* Confirm button */}
      <div className="px-4 pb-safe pb-6 pt-2 border-t border-gray-800">
        <button
          onClick={handleConfirm}
          disabled={saving || assignedCount === 0}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-sm disabled:opacity-40"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Updating printer…' : `Confirm & Update Printer`}
        </button>
        <button
          onClick={() => navigate('/mobile')}
          className="w-full mt-2 py-2 text-sm text-gray-500 active:text-gray-300"
        >
          Cancel
        </button>
      </div>

      {/* Scanner overlay */}
      {scanningSlot !== null && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center gap-3 px-4 pt-safe pt-5 pb-3">
            <button
              onClick={() => setScanningSlot(null)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <p className="font-semibold text-white">Scan Spool — Slot {scanningSlot + 1}</p>
              <p className="text-xs text-gray-400">Point camera at the Spoolman QR label on the spool</p>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden mx-4 mb-4 rounded-2xl bg-black">
            <QrScanner onScan={handleScan} />

            {/* Corner guides */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-52 h-52">
                <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-400 rounded-tl-lg" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-400 rounded-tr-lg" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-400 rounded-bl-lg" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-400 rounded-br-lg" />
              </div>
            </div>
          </div>

          <div className="px-4 pb-safe pb-6">
            <button
              onClick={() => setScanningSlot(null)}
              className="w-full py-3 rounded-xl border border-gray-700 text-sm text-gray-400 active:bg-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
