import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPrinters, createPrinter, deletePrinter, getPrinterHistory,
  getFilaments, createModel, addFilamentReq, copyThumbnailToModel, uploadPrinterImage,
  setPrinterSlot, deletePrinterSlot, setPrinterSlicer,
  Printer, MoonrakerJob, FilamentSpec,
} from '../api/client'
import Modal from '../components/Modal'
import { Plus, Trash2, Printer as PrinterIcon, ChevronDown, ChevronRight, Upload, X, Scissors } from 'lucide-react'

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

function PrinterSlotConfig({ printer, filaments }: { printer: Printer; filaments: FilamentSpec[] }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState<number | null>(null)

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

  return (
    <div className="border-t dark:border-gray-700 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Filament Slots
        </h3>
        <button
          onClick={handleAddSlot}
          className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
        >
          <Plus size={12} /> Add Slot
        </button>
      </div>

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
  )
}

function PrinterSlicerSection({ printer }: { printer: Printer }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    slicer_name: printer.slicer_name ?? '',
    slicer_executable: printer.slicer_executable ?? '',
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  function update(patch: Partial<typeof form>) {
    setForm(f => ({ ...f, ...patch }))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    try {
      await setPrinterSlicer(printer.id, {
        slicer_name: form.slicer_name || null,
        slicer_executable: form.slicer_executable || null,
      })
      qc.invalidateQueries({ queryKey: ['printers'] })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t dark:border-gray-700 px-4 py-3">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Scissors size={11} /> Slicer
      </h3>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-400 block mb-1">Slicer name</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-xs dark:bg-gray-700 dark:border-gray-600"
            placeholder="e.g. Bambu Studio"
            value={form.slicer_name}
            onChange={e => update({ slicer_name: e.target.value })}
          />
        </div>
        <div className="flex-[2]">
          <label className="text-xs text-gray-400 block mb-1">Executable path</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-xs font-mono dark:bg-gray-700 dark:border-gray-600"
            placeholder="e.g. C:\Program Files\Bambu Studio\bambu-studio.exe"
            value={form.slicer_executable}
            onChange={e => update({ slicer_executable: e.target.value })}
          />
        </div>
        {dirty && (
          <div className="flex items-end">
            <button
              onClick={save}
              disabled={saving}
              className="bg-brand-600 text-white px-3 py-1.5 rounded text-xs disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
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
      const model = await createModel({ name: s.modelName, description: s.description, notes: s.notes })
      for (const slot of s.slots) {
        if (!slot.specId) continue
        const grams = parseFloat(slot.grams)
        if (isNaN(grams) || grams <= 0) continue
        const perModel = grams / s.copies
        await addFilamentReq(model.id, {
          filament_spec_id: Number(slot.specId),
          grams: Math.round(perModel * 10) / 10,
        })
      }
      if (s.job.thumbnail_path) {
        try {
          await copyThumbnailToModel(model.id, s.printerId, s.job.thumbnail_path)
        } catch {
          // non-critical — model was created successfully
        }
      }
      qc.invalidateQueries({ queryKey: ['models'] })
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

export default function Printers() {
  const qc = useQueryClient()
  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: getPrinters })
  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })

  const [expanded, setExpanded] = useState<number | null>(null)
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Printers</h1>
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
            <div key={printer.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30"
                onClick={() => setExpanded(isOpen ? null : printer.id)}
              >
                <div className="flex items-center gap-3">
                  {isOpen
                    ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                    : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                  <PrinterAvatar printer={printer} />
                  <span className="font-medium text-sm">{printer.name}</span>
                  <span className="text-xs text-gray-400">{printer.url}</span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); if (confirm('Remove this printer?')) deleteMutation.mutate(printer.id) }}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {isOpen && (
                <>
                  <PrinterSlotConfig printer={printer} filaments={filaments} />
                  <PrinterSlicerSection printer={printer} />
                  <PrinterHistory printer={printer} filaments={filaments} />
                </>
              )}
            </div>
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
