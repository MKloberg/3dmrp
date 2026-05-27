import { useState, useEffect } from 'react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import {
  getPrinterByName,
  getSpoolmanStock,
  setPrinterSpoolmanSlots,
  type Printer,
  type SpoolmanSpool,
} from '../../api/client'
import QrScanner from '../../components/QrScanner'

type LoadPhase = 'printer_scan' | 'loading_printer' | 'slot_select' | 'spool_scan' | 'confirm'

function extractSpoolId(text: string): number | null {
  const trimmed = text.trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  const m = trimmed.match(/\/(\d+)\/?$/)
  if (m) return parseInt(m[1], 10)
  return null
}

function hexColor(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

function weightLabel(g: number | null | undefined): string {
  if (g == null) return '—'
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}

const corners = (
  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
    <div className="relative w-52 h-52">
      <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-400 rounded-tl-lg" />
      <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-400 rounded-tr-lg" />
      <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-400 rounded-bl-lg" />
      <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-400 rounded-br-lg" />
    </div>
  </div>
)

export default function MobileLoadFilament({ onDone }: { onDone: () => void }) {
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('printer_scan')
  const [printer, setPrinter] = useState<Printer | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [slots, setSlots] = useState<(SpoolmanSpool | null)[]>([])
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [spools, setSpools] = useState<SpoolmanSpool[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    getSpoolmanStock()
      .then(res => setSpools((res.spools ?? []).filter(s => !s.archived)))
      .catch(() => setSpools([]))
  }, [])

  async function handlePrinterScan(text: string) {
    setScanError(null)
    const name = text.trim()
    setLoading(true)
    setLoadPhase('loading_printer')
    try {
      const p = await getPrinterByName(name)
      setPrinter(p)
      const count = p.effective_slot_count
      setSlots(Array(count).fill(null))
      if (count <= 1) {
        setSelectedSlot(0)
        setLoadPhase('spool_scan')
      } else {
        setLoadPhase('slot_select')
      }
    } catch {
      setScanError(`Printer "${name}" not found in 3DMRP.`)
      setLoadPhase('printer_scan')
    } finally {
      setLoading(false)
    }
  }

  function handleSlotSelect(idx: number) {
    setSelectedSlot(idx)
    setScanError(null)
    setLoadPhase('spool_scan')
  }

  function handleSpoolScan(text: string) {
    setScanError(null)
    const id = extractSpoolId(text)
    if (id === null) {
      setScanError(`Couldn't read a spool ID from: "${text.slice(0, 40)}"`)
      return
    }
    const found = spools.find(s => s.id === id)
    if (!found) {
      setScanError(`Spool #${id} not found in Spoolman.`)
      return
    }
    if (selectedSlot !== null) {
      setSlots(prev => {
        const next = [...prev]
        next[selectedSlot] = found
        return next
      })
    }
    setLoadPhase('confirm')
  }

  async function handleDone() {
    if (!printer) { onDone(); return }
    setSaving(true)
    setSaveError(null)
    try {
      await setPrinterSpoolmanSlots(
        printer.id,
        slots.map((s, i) => ({ tool_index: i, spool_id: s?.id ?? null })),
      )
      onDone()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to update printer')
      setSaving(false)
    }
  }

  function handleLoadAnother() {
    setSelectedSlot(null)
    setScanError(null)
    const count = printer?.effective_slot_count ?? 1
    if (count <= 1) {
      setSelectedSlot(0)
      setLoadPhase('spool_scan')
    } else {
      setLoadPhase('slot_select')
    }
  }

  // ── Printer scan ──
  if (loadPhase === 'printer_scan' || loadPhase === 'loading_printer') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center gap-3 px-4 pt-safe pt-5 pb-3">
          <button onClick={onDone} className="p-1.5 rounded-lg text-gray-400 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="font-semibold text-white">Load Filament</p>
            <p className="text-xs text-gray-400">Scan the printer's QR code</p>
          </div>
        </div>

        {loadPhase === 'loading_printer' ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={28} className="text-brand-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex-1 relative overflow-hidden mx-4 mb-4 rounded-2xl bg-black">
              <QrScanner onScan={handlePrinterScan} />
              {corners}
            </div>
            {scanError && (
              <p className="text-sm text-red-400 text-center px-4 pb-2">{scanError}</p>
            )}
            <div className="px-4 pb-safe pb-6">
              <button
                onClick={onDone}
                className="w-full py-3 rounded-xl border border-gray-700 text-sm text-gray-400 active:bg-gray-900"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Slot select ──
  if (loadPhase === 'slot_select' && printer) {
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
        <div className="flex items-center gap-3 px-4 pt-safe pt-10 pb-4 border-b border-gray-800">
          <button
            onClick={() => { setScanError(null); setLoadPhase('printer_scan') }}
            className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center shrink-0"
          >
            <ArrowLeft size={16} className="text-gray-300" />
          </button>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Load Filament</p>
            <p className="text-sm font-semibold text-white">{printer.name}</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-6 space-y-3">
          <p className="text-sm text-gray-400 px-1 mb-4">Which lane did you load filament into?</p>
          {slots.map((spool, i) => (
            <button
              key={i}
              onClick={() => handleSlotSelect(i)}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-gray-900 border border-gray-800 hover:border-brand-500/50 hover:bg-gray-800 active:bg-gray-700 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                {spool ? (
                  <span
                    className="w-5 h-5 rounded-full border border-white/10"
                    style={{ backgroundColor: hexColor(spool.filament.color_hex) }}
                  />
                ) : (
                  <span className="text-sm font-bold text-gray-500">{i + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Lane {i + 1}</p>
                {spool ? (
                  <p className="text-xs text-gray-400 truncate">
                    {spool.filament.vendor?.name ? `${spool.filament.vendor.name} ` : ''}
                    {spool.filament.name} · #{spool.id}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">Not yet loaded</p>
                )}
              </div>
              {spool && <Check size={14} className="text-green-400 shrink-0" />}
            </button>
          ))}
        </div>

        <div className="px-4 pb-safe pb-6">
          <button
            onClick={onDone}
            className="w-full py-3 text-sm text-gray-500 active:text-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Spool scan ──
  if (loadPhase === 'spool_scan' && printer) {
    const isSingleLane = printer.effective_slot_count <= 1
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center gap-3 px-4 pt-safe pt-5 pb-3">
          <button
            onClick={() => {
              setScanError(null)
              setLoadPhase(isSingleLane ? 'printer_scan' : 'slot_select')
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="font-semibold text-white">
              {isSingleLane ? 'Scan Spool' : `Scan Spool — Lane ${(selectedSlot ?? 0) + 1}`}
            </p>
            <p className="text-xs text-gray-400">{printer.name} · point camera at Spoolman QR label</p>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden mx-4 mb-4 rounded-2xl bg-black">
          <QrScanner onScan={handleSpoolScan} />
          {corners}
        </div>

        {scanError && (
          <p className="text-sm text-red-400 text-center px-4 pb-2">{scanError}</p>
        )}

        <div className="px-4 pb-safe pb-6">
          <button
            onClick={() => {
              setScanError(null)
              setLoadPhase(isSingleLane ? 'printer_scan' : 'slot_select')
            }}
            className="w-full py-3 rounded-xl border border-gray-700 text-sm text-gray-400 active:bg-gray-900"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Confirm ──
  if (loadPhase === 'confirm' && printer) {
    const assignedCount = slots.filter(Boolean).length
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
        <div className="flex items-center gap-3 px-4 pt-safe pt-10 pb-4 border-b border-gray-800">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <Check size={20} className="text-green-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Load Filament</p>
            <p className="text-sm font-semibold text-white">{printer.name}</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          <p className="text-xs text-gray-500 px-1 pb-1">
            {assignedCount} of {slots.length} lane{slots.length !== 1 ? 's' : ''} assigned
          </p>
          {slots.map((spool, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900 border border-gray-800"
            >
              <span className="text-xs font-bold text-gray-500 w-4 shrink-0">{i + 1}</span>
              {spool ? (
                <>
                  <span
                    className="w-5 h-5 rounded-full shrink-0 border border-white/10"
                    style={{ backgroundColor: hexColor(spool.filament.color_hex) }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {spool.filament.vendor?.name ? `${spool.filament.vendor.name} ` : ''}
                      {spool.filament.name}
                    </p>
                    <p className="text-xs text-gray-400 leading-tight">
                      #{spool.id} · {spool.filament.material} · {weightLabel(spool.remaining_weight)}
                    </p>
                  </div>
                  <Check size={14} className="text-green-400 shrink-0" />
                </>
              ) : (
                <p className="text-sm text-gray-600 flex-1">Not loaded</p>
              )}
            </div>
          ))}

          {saveError && (
            <p className="text-sm text-red-400 text-center px-2 pt-2">{saveError}</p>
          )}
        </div>

        <div className="px-4 pb-safe pb-6 pt-2 space-y-2 border-t border-gray-800">
          {slots.length > 1 && (
            <button
              onClick={handleLoadAnother}
              disabled={saving}
              className="w-full py-3.5 rounded-xl border border-gray-700 text-sm font-medium text-gray-300 hover:bg-gray-900 active:bg-gray-800 transition-colors disabled:opacity-40"
            >
              Load another lane
            </button>
          )}
          <button
            onClick={handleDone}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-sm disabled:opacity-40"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    )
  }

  return null
}
