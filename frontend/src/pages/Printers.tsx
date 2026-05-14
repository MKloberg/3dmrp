import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPrinters, createPrinter, updatePrinter, deletePrinter, getPrinterHistory, getPrinterStatus, getPrinterWebcams,
  getPrinterFilamentDetect, getMailsailSpoolman,
  getFilaments, createItem, addFilamentReq, copyThumbnailToItem, uploadPrinterImage,
  setPrinterSlot, deletePrinterSlot, setPrinterType,
  getPrinterTypes,
  Printer, MoonrakerJob, FilamentSpec, PrinterStatus, WebcamInfo, FilamentDetectSlot, PrinterType,
} from '../api/client'
import Modal from '../components/Modal'
import { SpoolIcon } from '../components/SpoolIcon'
import { Plus, Trash2, Printer as PrinterIcon, ChevronDown, ChevronRight, Upload, X, Cpu, Video, RefreshCw, Pencil, Check, ExternalLink, QrCode, Info, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(ts: number | null): string {
  if (ts == null) return '—'
  return new Date(ts * 1000).toLocaleDateString()
}

function filamentMmToGrams(mm: number, spec: FilamentSpec | null): number {
  const diameter = spec?.diameter ?? 1.75
  const density = spec?.density ?? 1.24
  const radius = diameter / 2
  return (Math.PI * radius * radius * mm / 1000) * density
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').replace(/\//g, ' / ')
}

interface ImportSlot {
  slotNumber: number
  specId: string
  grams: string
}

interface ImportState {
  job: MoonrakerJob
  printerId: number
  modelName: string
  description: string
  notes: string
  copies: number
  slots: ImportSlot[]
}

function ImportModal({
  state,
  filaments,
  onClose,
  onConfirm,
  saving,
}: {
  state: ImportState
  filaments: FilamentSpec[]
  onClose: () => void
  onConfirm: (s: ImportState) => void
  saving: boolean
}) {
  const [s, setS] = useState(state)
  const set = (patch: Partial<ImportState>) => setS(prev => ({ ...prev, ...patch }))

  const totalMm = s.job.filament_used

  function updateSlot(i: number, patch: Partial<ImportSlot>) {
    const newSlots = s.slots.map((sl, j) => j === i ? { ...sl, ...patch } : sl)
    set({ slots: newSlots })
  }

  function addSlot() {
    const maxSlot = s.slots.length > 0 ? Math.max(...s.slots.map(sl => sl.slotNumber)) : 0
    set({ slots: [...s.slots, { slotNumber: maxSlot + 1, specId: '', grams: '' }] })
  }

  function removeSlot(i: number) {
    set({ slots: s.slots.filter((_, j) => j !== i) })
  }

  return (
    <Modal title="Import Print Job" onClose={onClose}>
      <div className="space-y-4">
        {s.job.thumbnail_path && (
          <img
            src={`/api/printers/${s.printerId}/thumbnail?path=${encodeURIComponent(s.job.thumbnail_path)}`}
            alt="Print preview"
            className="w-full max-h-48 object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
          />
        )}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Model name *</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm"
            value={s.modelName} onChange={e => set({ modelName: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Description</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm"
            value={s.description} onChange={e => set({ description: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm"
            value={s.notes} onChange={e => set({ notes: e.target.value })} />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Copies on plate</label>
          <input
            type="number"
            min="1"
            step="1"
            className="w-24 border rounded-lg px-3 py-2 text-sm"
            value={s.copies}
            onChange={e => set({ copies: Math.max(1, parseInt(e.target.value) || 1) })}
          />
          {s.copies > 1 && (
            <p className="text-xs text-gray-400 mt-1">
              Total grams will be divided by {s.copies} to get per-model usage.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500">Filament slots used</label>
            {totalMm != null && (
              <span className="text-xs text-gray-400">
                Total: {totalMm.toFixed(0)} mm ≈ {filamentMmToGrams(totalMm, null).toFixed(1)} g
              </span>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b dark:border-gray-600">
                <th className="text-left pb-1 pr-2 w-16">Slot</th>
                <th className="text-left pb-1 pr-2">Filament</th>
                <th className="text-left pb-1 pr-2 w-24">Grams (total)</th>
                {s.copies > 1 && <th className="text-left pb-1 pr-2 w-20">Per model</th>}
                <th className="w-5" />
              </tr>
            </thead>
            <tbody>
              {s.slots.map((slot, i) => {
                const gramsNum = parseFloat(slot.grams)
                const perModel = s.copies > 1 && !isNaN(gramsNum) && gramsNum > 0
                  ? gramsNum / s.copies
                  : null
                return (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">#{slot.slotNumber}</span>
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        className="w-full border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        value={slot.specId}
                        onChange={e => updateSlot(i, { specId: e.target.value })}
                      >
                        <option value="">— none —</option>
                        {filaments.map(f => (
                          <option key={f.id} value={f.id}>
                            {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="g"
                        className="w-full border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        value={slot.grams}
                        onChange={e => updateSlot(i, { grams: e.target.value })}
                      />
                    </td>
                    {s.copies > 1 && (
                      <td className="py-1 pr-2">
                        <span className="text-xs text-brand-600 font-medium">
                          {perModel != null ? `${perModel.toFixed(1)} g` : '—'}
                        </span>
                      </td>
                    )}
                    <td className="py-1">
                      <button onClick={() => removeSlot(i)} className="text-gray-400 hover:text-red-500">
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <button
            onClick={addSlot}
            className="mt-2 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            <Plus size={12} /> Add Slot
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button
            disabled={!s.modelName || saving}
            onClick={() => onConfirm(s)}
            className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {saving ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const STATE_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  printing: { dot: 'bg-green-500 animate-pulse', label: 'Printing', text: 'text-green-600 dark:text-green-400' },
  paused:   { dot: 'bg-yellow-400',              label: 'Paused',   text: 'text-yellow-600 dark:text-yellow-400' },
  error:    { dot: 'bg-red-500',                 label: 'Error',    text: 'text-red-600 dark:text-red-400' },
  standby:  { dot: 'bg-gray-300 dark:bg-gray-600', label: 'Idle',   text: 'text-gray-400' },
  complete: { dot: 'bg-blue-400',                label: 'Complete', text: 'text-blue-500' },
  offline:  { dot: 'bg-gray-300 dark:bg-gray-600', label: 'Offline', text: 'text-gray-400' },
}

function PrinterStatusDisplay({ printerId }: { printerId: number }) {
  const { data: status } = useQuery<PrinterStatus>({
    queryKey: ['printer-status', printerId],
    queryFn: () => getPrinterStatus(printerId),
    refetchInterval: 10000,
    retry: false,
  })

  if (!status) return null

  const style = STATE_STYLES[status.state] ?? STATE_STYLES.standby

  return (
    <div className="flex flex-col gap-0.5 min-w-0" onClick={e => e.stopPropagation()}>
      {/* State + temps row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
          <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
        </div>
        {status.state === 'printing' && status.filename && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-40" title={status.filename}>
            {status.filename.replace(/\.[^/.]+$/, '')}
          </span>
        )}
        {(status.extruder_temp != null || status.bed_temp != null) && status.state !== 'offline' && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {status.extruder_temp != null && (
              <span title="Extruder">
                🌡 {status.extruder_temp.toFixed(0)}°
                {status.extruder_target ? `/${status.extruder_target.toFixed(0)}°` : ''}
              </span>
            )}
            {status.bed_temp != null && (
              <span title="Bed">
                ⬛ {status.bed_temp.toFixed(0)}°
                {status.bed_target ? `/${status.bed_target.toFixed(0)}°` : ''}
              </span>
            )}
          </div>
        )}
        {status.state === 'printing' && status.time_remaining != null && (
          <span className="text-xs text-gray-400">{formatTime(status.time_remaining)} left</span>
        )}
      </div>
      {/* Progress bar */}
      {status.state === 'printing' && status.progress != null && (
        <div className="w-48 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-1000"
            style={{ width: `${(status.progress * 100).toFixed(1)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function PrinterAvatar({ printer }: { printer: Printer }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [imgKey, setImgKey] = useState(0)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadPrinterImage(printer.id, file)
      setImgKey(k => k + 1)
      qc.invalidateQueries({ queryKey: ['printers'] })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div
      className="relative group shrink-0 cursor-pointer"
      onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
      title="Click to upload printer image"
    >
      {printer.has_image ? (
        <img
          key={imgKey}
          src={`/api/printers/${printer.id}/image?v=${imgKey}`}
          alt={printer.name}
          className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-600"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
          <PrinterIcon size={18} className="text-gray-400" />
        </div>
      )}
      <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        {uploading
          ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Upload size={12} className="text-white" />}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}

function CameraFeed({ cam, onUnavailable }: { cam: WebcamInfo; onUnavailable: () => void }) {
  const [src, setSrc] = useState('')
  const [error, setError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    setError(false)
    setSrc(`${cam.snapshot_url}${cam.snapshot_url.includes('?') ? '&' : '?'}_t=${Date.now()}`)
    const id = setInterval(() => {
      setSrc(`${cam.snapshot_url}${cam.snapshot_url.includes('?') ? '&' : '?'}_t=${Date.now()}`)
    }, 500)
    return () => clearInterval(id)
  }, [cam.snapshot_url])

  const transform = [
    cam.flip_horizontal ? 'scaleX(-1)' : '',
    cam.flip_vertical ? 'scaleY(-1)' : '',
    cam.rotation ? `rotate(${cam.rotation}deg)` : '',
  ].filter(Boolean).join(' ') || undefined

  if (error) return null

  return (
    <img
      ref={imgRef}
      src={src}
      alt={cam.name}
      style={{ transform }}
      onError={() => { setError(true); onUnavailable() }}
      className="w-full rounded-lg object-contain bg-black max-h-64"
    />
  )
}

function PrinterCamera({ printer }: { printer: Printer }) {
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set())
  const { data: webcams, isLoading } = useQuery({
    queryKey: ['printer-webcams', printer.id],
    queryFn: () => getPrinterWebcams(printer.id),
    staleTime: 60_000,
    retry: false,
  })

  if (isLoading || !webcams?.length) return null

  const visibleCams = webcams.filter(c => !unavailable.has(c.name))
  if (visibleCams.length === 0) return null

  return (
    <div className="border-t dark:border-gray-700 px-4 py-3 space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <Video size={11} /> Camera{visibleCams.length > 1 ? 's' : ''}
      </h3>
      <div className={visibleCams.length > 1 ? 'grid grid-cols-2 gap-3' : ''}>
        {visibleCams.map(cam => (
          <div key={cam.name}>
            {visibleCams.length > 1 && (
              <p className="text-xs text-gray-400 mb-1">{cam.name}</p>
            )}
            <CameraFeed
              cam={cam}
              onUnavailable={() => setUnavailable(prev => new Set([...prev, cam.name]))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function SyncSlotsModal({
  slots,
  filaments,
  onClose,
  onApply,
}: {
  slots: FilamentDetectSlot[]
  filaments: FilamentSpec[]
  onClose: () => void
  onApply: (assignments: { slotIndex: number; specId: number | null }[]) => Promise<void>
}) {
  const [assignments, setAssignments] = useState(
    slots.map(s => ({ slotIndex: s.slot_index, specId: s.suggested_filament_spec_id }))
  )
  const [saving, setSaving] = useState(false)

  function updateAssignment(slotIndex: number, specId: number | null) {
    setAssignments(prev => prev.map(a => a.slotIndex === slotIndex ? { ...a, specId } : a))
  }

  async function handleApply() {
    setSaving(true)
    try { await onApply(assignments) } finally { setSaving(false) }
  }

  const detectedCount = slots.filter(s => s.detected).length

  return (
    <Modal title="Sync Filament Slots from Printer" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {detectedCount} filament{detectedCount !== 1 ? 's' : ''} detected via RFID.
          Review the suggested matches and click Apply to update the slots.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b dark:border-gray-600">
              <th className="text-left pb-1.5 pr-3 w-10">Slot</th>
              <th className="text-left pb-1.5 pr-3">Detected</th>
              <th className="text-left pb-1.5">Match in library</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, i) => (
              <tr key={slot.slot_index} className="border-b dark:border-gray-700 last:border-0">
                <td className="py-2 pr-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">#{slot.slot_index + 1}</span>
                </td>
                <td className="py-2 pr-3">
                  {slot.detected ? (
                    <div className="flex items-center gap-2">
                      <SpoolIcon color={slot.color_hex ?? '#888888'} size={20} />
                      <div>
                        <p className="text-xs font-medium leading-tight">
                          {slot.material}{slot.sub_type ? ` ${slot.sub_type}` : ''}
                        </p>
                        <p className="text-xs text-gray-400 leading-tight">{slot.vendor}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Empty</span>
                  )}
                </td>
                <td className="py-2">
                  <select
                    className="w-full border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    value={assignments[i]?.specId ?? ''}
                    onChange={e => updateAssignment(slot.slot_index, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— none —</option>
                    {filaments.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
          <button
            onClick={handleApply}
            disabled={saving}
            className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {saving ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function PrinterSlotConfig({ printer, filaments }: { printer: Printer; filaments: FilamentSpec[] }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncData, setSyncData] = useState<FilamentDetectSlot[] | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const maxSlot = printer.slots.length > 0 ? Math.max(...printer.slots.map(s => s.slot_number)) : 0

  async function handleSlotChange(slotNumber: number, specId: string) {
    setSaving(slotNumber)
    try {
      await setPrinterSlot(printer.id, slotNumber, specId ? Number(specId) : null)
      qc.invalidateQueries({ queryKey: ['printers'] })
    } finally {
      setSaving(null)
    }
  }

  async function handleAddSlot() {
    const next = maxSlot + 1
    await setPrinterSlot(printer.id, next, null)
    qc.invalidateQueries({ queryKey: ['printers'] })
  }

  async function handleDeleteSlot(slotNumber: number) {
    await deletePrinterSlot(printer.id, slotNumber)
    qc.invalidateQueries({ queryKey: ['printers'] })
  }

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    try {
      const data = await getPrinterFilamentDetect(printer.id)
      setSyncData(data)
    } catch {
      setSyncError('Could not read filament data from printer.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleApply(assignments: { slotIndex: number; specId: number | null }[]) {
    for (const { slotIndex, specId } of assignments) {
      await setPrinterSlot(printer.id, slotIndex + 1, specId)
    }
    qc.invalidateQueries({ queryKey: ['printers'] })
    setSyncData(null)
  }

  return (
    <div className="border-t dark:border-gray-700 px-4 py-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide hover:text-gray-600 dark:hover:text-gray-300 w-full text-left"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Filament Slots
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-xs text-gray-500 hover:text-brand-600 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Reading…' : 'Sync from printer'}
            </button>
            <button
              onClick={handleAddSlot}
              className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              <Plus size={12} /> Add Slot
            </button>
          </div>
          {syncError && (
            <p className="text-xs text-red-500">{syncError}</p>
          )}
          {printer.slots.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No slots configured. Add slots to track which filament is loaded where.</p>
          ) : (
            <div className="space-y-1.5">
              {printer.slots.map(slot => (
                <div key={slot.slot_number} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-14 shrink-0">
                    Slot {slot.slot_number}
                  </span>
                  <select
                    className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-60"
                    value={slot.filament_spec_id ? String(slot.filament_spec_id) : ''}
                    disabled={saving === slot.slot_number}
                    onChange={e => handleSlotChange(slot.slot_number, e.target.value)}
                  >
                    <option value="">— none —</option>
                    {filaments.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDeleteSlot(slot.slot_number)}
                    className="text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {syncData && (
        <SyncSlotsModal
          slots={syncData}
          filaments={filaments}
          onClose={() => setSyncData(null)}
          onApply={handleApply}
        />
      )}
    </div>
  )
}

function PrinterTypeSection({ printer, printerTypes }: { printer: Printer; printerTypes: PrinterType[] }) {
  const qc = useQueryClient()
  const [typeId, setTypeId] = useState<string>(printer.printer_type_id ? String(printer.printer_type_id) : '')
  const [override, setOverride] = useState<string>(printer.slot_count_override != null ? String(printer.slot_count_override) : '')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await setPrinterType(printer.id, {
        printer_type_id: typeId ? Number(typeId) : null,
        slot_count_override: override !== '' ? Number(override) : null,
      })
      qc.invalidateQueries({ queryKey: ['printers'] })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const selectedType = printerTypes.find(pt => pt.id === Number(typeId))

  return (
    <div className="border-t dark:border-gray-700 px-4 py-3">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Cpu size={11} /> Printer Type
      </h3>
      <div className="flex flex-col sm:flex-row gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-400 block mb-1">Type</label>
          <select
            className="w-full border rounded px-2 py-1.5 text-xs dark:bg-gray-700 dark:border-gray-600"
            value={typeId}
            onChange={e => { setTypeId(e.target.value); setDirty(true) }}
          >
            <option value="">— unassigned —</option>
            {printerTypes.map(pt => (
              <option key={pt.id} value={pt.id}>{pt.name}</option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className="text-xs text-gray-400 block mb-1">
            Slot override
            {selectedType && (
              <span className="ml-1 text-gray-300">(default: {selectedType.slot_count})</span>
            )}
          </label>
          <input
            type="number" min="1" placeholder="—"
            className="w-full border rounded px-2 py-1.5 text-xs dark:bg-gray-700 dark:border-gray-600"
            value={override}
            onChange={e => { setOverride(e.target.value); setDirty(true) }}
          />
        </div>
        {dirty && (
          <button
            onClick={save} disabled={saving}
            className="bg-brand-600 text-white px-3 py-1.5 rounded text-xs disabled:opacity-50 shrink-0"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {printer.printer_type && (
        <p className="mt-1.5 text-xs text-gray-400">
          {printer.printer_type.slicer
            ? <>Slicer: <span className="text-gray-500 dark:text-gray-300">{printer.printer_type.slicer.name}</span></>
            : <span className="italic">No slicer configured for this type</span>}
          {' · '}Effective slots: <span className="text-gray-500 dark:text-gray-300">{printer.effective_slot_count}</span>
        </p>
      )}
    </div>
  )
}

function PrinterHistory({ printer, filaments }: { printer: Printer; filaments: FilamentSpec[] }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['printer-history', printer.id],
    queryFn: () => getPrinterHistory(printer.id),
    retry: false,
  })

  const [importState, setImportState] = useState<ImportState | null>(null)
  const [importSaving, setImportSaving] = useState(false)

  function openImport(job: MoonrakerJob) {
    const slots: ImportSlot[] = printer.slots.length > 0
      ? printer.slots.map(s => ({
          slotNumber: s.slot_number,
          specId: s.filament_spec_id ? String(s.filament_spec_id) : '',
          grams: '',
        }))
      : [{ slotNumber: 1, specId: '', grams: '' }]

    setImportState({
      job,
      printerId: printer.id,
      modelName: stripExtension(job.filename),
      description: '',
      notes: '',
      copies: 1,
      slots,
    })
  }

  async function handleImport(s: ImportState) {
    setImportSaving(true)
    try {
      const item = await createItem({ name: s.modelName, sku: '', description: s.description, notes: s.notes })
      for (const slot of s.slots) {
        if (!slot.specId) continue
        const grams = parseFloat(slot.grams)
        if (isNaN(grams) || grams <= 0) continue
        const perItem = grams / s.copies
        await addFilamentReq(item.id, {
          filament_spec_id: Number(slot.specId),
          grams: Math.round(perItem * 10) / 10,
        })
      }
      if (s.job.thumbnail_path) {
        try {
          await copyThumbnailToItem(item.id, s.printerId, s.job.thumbnail_path)
        } catch {
          // non-critical — item was created successfully
        }
      }
      qc.invalidateQueries({ queryKey: ['items'] })
      setImportState(null)
    } finally {
      setImportSaving(false)
    }
  }

  const jobs = data?.jobs ?? []
  const completed = jobs.filter(j => j.status === 'completed')

  return (
    <div className="border-t dark:border-gray-700 px-4 py-3 space-y-2">
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">Could not reach printer. Check the URL and try again.</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No print history found.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-gray-400 mb-2">{completed.length} completed job{completed.length !== 1 ? 's' : ''} (showing up to 50)</p>
          {jobs.map(job => (
            <div key={job.job_id}
              className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                {job.thumbnail_path ? (
                  <img
                    src={`/api/printers/${printer.id}/thumbnail?path=${encodeURIComponent(job.thumbnail_path)}`}
                    alt=""
                    className="w-24 h-24 rounded object-cover shrink-0 border border-gray-200"
                  />
                ) : (
                  <div className="w-24 h-24 rounded bg-gray-100 dark:bg-gray-700 shrink-0 border border-gray-200 dark:border-gray-600" />
                )}
                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                  job.status === 'completed' ? 'bg-green-100 text-green-700' :
                  job.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                  'bg-gray-100 text-gray-500'
                }`}>{job.status}</span>
                <span className="truncate font-medium text-gray-800 dark:text-gray-200">{job.filename}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-3">
                <span className="text-xs text-gray-400">{formatDate(job.end_time)}</span>
                <span className="text-xs text-gray-400">{formatDuration(job.print_duration)}</span>
                {job.filament_used != null && (
                  <span className="text-xs text-gray-400">{(job.filament_used / 1000).toFixed(1)} m</span>
                )}
                {job.status === 'completed' && (
                  <button onClick={() => openImport(job)}
                    className="text-xs text-brand-600 hover:text-brand-700 border border-brand-300 px-2 py-0.5 rounded hover:bg-brand-50">
                    Import
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {importState && (
        <ImportModal
          state={importState}
          filaments={filaments}
          onClose={() => setImportState(null)}
          onConfirm={handleImport}
          saving={importSaving}
        />
      )}
    </div>
  )
}

const LABEL_SIZES = [
  { label: '40mm wide × 25mm tall', w: 40, h: 25, qr: 56 },
  { label: '40mm wide × 30mm tall', w: 40, h: 30, qr: 69 },
  { label: '50mm wide × 30mm tall', w: 50, h: 30, qr: 69 },
  { label: '50mm wide × 40mm tall', w: 50, h: 40, qr: 96 },
  { label: '62mm wide × 29mm tall (Brother)', w: 62, h: 29, qr: 66 },
  { label: '57mm wide × 32mm tall (Dymo)', w: 57, h: 32, qr: 74 },
]

function PrinterStickerModal({ printer, onClose }: { printer: Printer; onClose: () => void }) {
  const qrRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [sizeIndex, setSizeIndex] = useState(() => {
    const saved = localStorage.getItem('printerLabelSizeIndex')
    const n = saved !== null ? Number(saved) : 0
    return n >= 0 && n < LABEL_SIZES.length ? n : 0
  })

  function handlePrint() {
    const svgEl = qrRef.current?.querySelector('svg')
    if (!svgEl) return
    const { w, h, qr } = LABEL_SIZES[sizeIndex]

    const scale = 3
    const cloned = svgEl.cloneNode(true) as SVGElement
    cloned.setAttribute('width', String(qr * scale))
    cloned.setAttribute('height', String(qr * scale))
    const svgBlob = new Blob([new XMLSerializer().serializeToString(cloned)], { type: 'image/svg+xml' })
    const svgUrl = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = qr * scale
      canvas.height = qr * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(svgUrl)
      const pngDataUrl = canvas.toDataURL('image/png')

      const html = `<!DOCTYPE html><html><head><title>${printer.name}</title><style>
        @page { size: ${w}mm ${h}mm; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #f3f4f6; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 20px; }
        .preview { background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        .preview-name { font-size: 13px; font-weight: 700; color: #111; }
        .preview-size { font-size: 10px; color: #6b7280; margin-top: 4px; }
        .btn { background: #0284c7; color: #fff; border: none; border-radius: 8px; padding: 10px 28px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .btn:hover { background: #0369a1; }
        @media print {
          html { height: ${h}mm; }
          html, body { overflow: hidden; }
          body { background: #fff; height: 100%; padding: 2.5mm 1mm 0 1mm; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2px; }
          .btn, .preview-size { display: none; }
          .preview { border: none; box-shadow: none; padding: 0; border-radius: 0; gap: 1px; }
          .label { display: flex; flex-direction: column; align-items: center; gap: 1px; }
          .label-name { font-size: 15px; font-weight: 700; color: #111; text-align: center; max-width: ${w - 4}mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.1; }
        }
      </style></head><body>
        <div class="preview">
          <div class="label" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <img src="${pngDataUrl}" width="${qr}" height="${qr}" />
            <p class="label-name preview-name">${printer.name}</p>
          </div>
          <p class="preview-size">${w} &times; ${h} mm label</p>
        </div>
        <button class="btn" onclick="window.print()">Print</button>
        <script>window.addEventListener('afterprint', function() { window.close(); });<\/script>
      </body></html>`

      const pw = 480, ph = 520
      const left = Math.round((window.screen.width - pw) / 2)
      const top = Math.round((window.screen.height - ph) / 2)
      const blob = new Blob([html], { type: 'text/html' })
      const blobUrl = URL.createObjectURL(blob)
      const win = window.open(blobUrl, '_blank', `width=${pw},height=${ph},left=${left},top=${top}`)
      if (win) win.addEventListener('load', () => URL.revokeObjectURL(blobUrl))
    }
    img.src = svgUrl
  }

  function handleCopyToClipboard() {
    const svgEl = qrRef.current?.querySelector('svg')
    if (!svgEl) return
    const { qr } = LABEL_SIZES[sizeIndex]
    const scale = 5
    const cloned = svgEl.cloneNode(true) as SVGElement
    cloned.setAttribute('width', String(qr * scale))
    cloned.setAttribute('height', String(qr * scale))
    const svgBlob = new Blob([new XMLSerializer().serializeToString(cloned)], { type: 'image/svg+xml' })
    const svgUrl = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const padding = 16
      const textHeight = 28
      const gap = 8
      const qrPx = qr * scale
      const canvasW = qrPx + padding * 2
      const canvasH = qrPx + gap + textHeight + padding * 2
      const canvas = document.createElement('canvas')
      canvas.width = canvasW
      canvas.height = canvasH
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasW, canvasH)
      ctx.drawImage(img, padding, padding, qrPx, qrPx)
      URL.revokeObjectURL(svgUrl)
      ctx.fillStyle = '#111111'
      ctx.font = `bold ${textHeight * 0.75}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(printer.name, canvasW / 2, padding + qrPx + gap)
      canvas.toBlob(async blob => {
        if (!blob) return
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch { /* clipboard API not available */ }
      }, 'image/png')
    }
    img.src = svgUrl
  }

  return (
    <Modal title="Printer QR Sticker" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div ref={qrRef}>
          <QRCodeSVG
            value={printer.name}
            size={100}
            bgColor="#ffffff"
            fgColor="#111827"
            level="M"
          />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-800 dark:text-gray-200">{printer.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Print and affix this label to the printer
          </p>
        </div>
        <div className="flex items-center gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Label size</label>
          <select
            value={sizeIndex}
            onChange={e => { const i = Number(e.target.value); setSizeIndex(i); localStorage.setItem('printerLabelSizeIndex', String(i)) }}
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
          >
            {LABEL_SIZES.map((s, i) => (
              <option key={i} value={i}>{s.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
        >
          Print Sticker
        </button>
        <button
          onClick={handleCopyToClipboard}
          className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <Copy size={12} />
          {copied ? 'Copied!' : 'Copy QR code image to clipboard'}
        </button>
        <div className="w-full flex items-start gap-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-3 py-2.5 text-xs text-green-800 dark:text-green-300 leading-relaxed">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>Print this label and stick it on the printer. When loading filament, scan it with your phone via the <strong>Mobile</strong> QR code in the sidebar — the app will open directly to this printer's slot-loading screen, ready to scan each spool.</span>
        </div>
      </div>
    </Modal>
  )
}

function PrinterCard({
  printer, isOpen, filaments, printerTypes, onToggle, onDelete,
}: {
  printer: Printer
  isOpen: boolean
  filaments: FilamentSpec[]
  printerTypes: PrinterType[]
  onToggle: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: printer.name, url: printer.url })
  const [saving, setSaving] = useState(false)
  const [showSticker, setShowSticker] = useState(false)

  const { data: spoolmanInfo } = useQuery({
    queryKey: ['mainsail-spoolman', printer.id],
    queryFn: () => getMailsailSpoolman(printer.id),
    staleTime: 60_000,
    retry: false,
  })

  async function saveEdit(e: React.MouseEvent) {
    e.stopPropagation()
    if (!editForm.name || !editForm.url) return
    setSaving(true)
    try {
      await updatePrinter(printer.id, editForm)
      qc.invalidateQueries({ queryKey: ['printers'] })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditForm({ name: printer.name, url: printer.url })
    setEditing(true)
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(false)
  }

  return (
    <div id={`printer-${printer.id}`} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30"
        onClick={editing ? undefined : onToggle}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {isOpen
            ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
            : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <PrinterAvatar printer={printer} />
          {editing ? (
            <div className="flex items-center gap-2 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
              <input
                className="border rounded px-2 py-1 text-sm w-40 dark:bg-gray-700 dark:border-gray-600"
                value={editForm.name}
                autoFocus
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
              <input
                className="flex-1 border rounded px-2 py-1 text-sm font-mono dark:bg-gray-700 dark:border-gray-600"
                value={editForm.url}
                onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))}
              />
              <button onClick={saveEdit} disabled={!editForm.name || !editForm.url || saving}
                className="text-green-600 hover:text-green-700 disabled:opacity-40 shrink-0">
                <Check size={15} />
              </button>
              <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={15} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col min-w-0 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm leading-tight">{printer.name}</span>
                  {spoolmanInfo && (
                    spoolmanInfo.configured === true ? (
                      <span
                        title={spoolmanInfo.server_url ? `Spoolman: ${spoolmanInfo.server_url}` : 'Spoolman active in Moonraker'}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400 leading-none"
                      >
                        Spoolman
                        <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                          <Check size={10} strokeWidth={3} className="text-white" />
                        </span>
                      </span>
                    ) : spoolmanInfo.configured === false ? (
                      <span
                        title="Spoolman not configured in Moonraker"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 dark:text-red-400 leading-none"
                      >
                        Spoolman
                        <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                          <X size={10} strokeWidth={3} className="text-white" />
                        </span>
                      </span>
                    ) : null
                  )}
                </div>
                {printer.printer_type ? (
                  <span className="text-xs text-gray-400 leading-tight">
                    {printer.printer_type.name} · {printer.effective_slot_count} slot{printer.effective_slot_count !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 font-mono leading-tight truncate max-w-48">{printer.url}</span>
                )}
              </div>
              <PrinterStatusDisplay printerId={printer.id} />
            </>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={printer.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-gray-400 hover:text-brand-600"
              title="Open Fluidd"
            >
              <ExternalLink size={14} />
            </a>
            <button
              onClick={e => { e.stopPropagation(); setShowSticker(true) }}
              className="text-gray-400 hover:text-brand-600"
              title="Show printer QR sticker"
            >
              <QrCode size={14} />
            </button>
            <button onClick={startEdit} className="text-gray-400 hover:text-gray-600">
              <Pencil size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="text-gray-400 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {isOpen && (
        <>
          <PrinterCamera printer={printer} />
          <PrinterSlotConfig printer={printer} filaments={filaments} />
          <PrinterTypeSection printer={printer} printerTypes={printerTypes} />
          <PrinterHistory printer={printer} filaments={filaments} />
        </>
      )}
      {showSticker && (
        <PrinterStickerModal printer={printer} onClose={() => setShowSticker(false)} />
      )}
    </div>
  )
}

export default function Printers() {
  const qc = useQueryClient()
  const location = useLocation()
  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: getPrinters })
  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })
  const { data: printerTypes = [] } = useQuery({ queryKey: ['printer-types'], queryFn: getPrinterTypes })

  const openPrinterId = (location.state as { openPrinterId?: number } | null)?.openPrinterId ?? null
  const [expanded, setExpanded] = useState<number | null>(openPrinterId)

  useEffect(() => {
    if (openPrinterId) {
      setTimeout(() => {
        document.getElementById(`printer-${openPrinterId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [openPrinterId])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', url: '' })

  const createMutation = useMutation({
    mutationFn: () => createPrinter(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['printers'] }); setShowForm(false); setForm({ name: '', url: '' }) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePrinter(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['printers'] }),
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3"><PrinterIcon size={26} className="text-brand-600" />Printers</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg">
          <Plus size={15} /> Add Printer
        </button>
      </div>

      {printers.length === 0 && (
        <p className="text-sm text-gray-400 italic">No printers configured. Add a Moonraker printer to import print history.</p>
      )}

      <div className="space-y-2">
        {printers.map(printer => {
          const isOpen = expanded === printer.id
          return (
            <PrinterCard
              key={printer.id}
              printer={printer}
              isOpen={isOpen}
              filaments={filaments}
              printerTypes={printerTypes}
              onToggle={() => setExpanded(isOpen ? null : printer.id)}
              onDelete={() => { if (confirm('Remove this printer?')) deleteMutation.mutate(printer.id) }}
            />
          )
        })}
      </div>

      {showForm && (
        <Modal title="Add Printer" onClose={() => setShowForm(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Snapmaker U1"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Moonraker URL *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="http://192.168.1.100"
                value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button
                disabled={!form.name || !form.url || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
