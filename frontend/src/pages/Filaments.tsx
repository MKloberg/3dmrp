import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFilaments, createFilament, updateFilament, deleteFilament,
  FilamentSpec, FilamentSpecInput,
  getSpoolmanFilaments, SpoolmanFilament,
  spoolmanBulkImport, spoolmanSync,
  getSettings,
} from '../api/client'
import Modal from '../components/Modal'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Download, ChevronDown, ChevronRight, ShoppingCart, ExternalLink, RefreshCw, Disc2, Info } from 'lucide-react'
import { SpoolIcon } from '../components/SpoolIcon'
import { useCurrency } from '../lib/currency'

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'Resin', 'Other']

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex.toLowerCase() : `#${hex}`.toLowerCase()
}

function stableJson(obj: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(obj).sort()))
}

function hasSpoolmanDiff(local: FilamentSpec, sf: SpoolmanFilament): boolean {
  if (sf.material && sf.material !== local.material) return true
  if (sf.name && sf.name !== local.color_name) return true
  if (sf.color_hex) {
    const sfHex = normalizeHex(sf.color_hex)
    if (sfHex !== normalizeHex(local.color_hex)) return true
  }
  const sfBrand = sf.vendor?.name
  if (sfBrand && sfBrand !== local.brand) return true
  const numFields: Array<[keyof SpoolmanFilament, keyof FilamentSpec]> = [
    ['price', 'price'], ['density', 'density'], ['diameter', 'diameter'],
    ['weight', 'weight'], ['spool_weight', 'spool_weight'],
    ['settings_extruder_temp', 'settings_extruder_temp'],
    ['settings_bed_temp', 'settings_bed_temp'],
  ]
  for (const [sfKey, localKey] of numFields) {
    const sfVal = sf[sfKey]
    if (sfVal != null && sfVal !== local[localKey]) return true
  }
  const strFields: Array<[keyof SpoolmanFilament, keyof FilamentSpec]> = [
    ['article_number', 'article_number'], ['comment', 'comment'], ['external_id', 'external_id'],
  ]
  for (const [sfKey, localKey] of strFields) {
    const sfVal = sf[sfKey]
    if (sfVal && sfVal !== local[localKey]) return true
  }
  if (sf.extra && Object.keys(sf.extra).length > 0) {
    const localExtra = local.extra && Object.keys(local.extra).length > 0 ? local.extra : {}
    if (stableJson(sf.extra) !== stableJson(localExtra as Record<string, unknown>)) return true
  }
  return false
}

function TdBadge({ td, colorHex }: { td: number; colorHex: string }) {
  const hex = normalizeHex(colorHex)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return (
    <span
      style={{ backgroundColor: hex, color: luminance > 0.45 ? '#000' : '#fff' }}
      className="inline-flex items-center justify-center w-10 h-6 rounded-md text-[13px] font-black shrink-0 leading-none"
    >
      {td.toFixed(1)}
    </span>
  )
}

function emptyForm(): FilamentSpecInput {
  return {
    material: 'PLA', color_name: '', color_hex: '#888888', brand: '',
    price: null, density: null, diameter: 1.75, weight: null, spool_weight: null,
    settings_extruder_temp: null, settings_bed_temp: null,
    article_number: '', comment: '', external_id: '', extra: null, spoolman_id: null, purchase_url: '',
    quality_rating: null,
  }
}

function spoolmanToInput(sf: SpoolmanFilament): FilamentSpecInput {
  return {
    material: sf.material ?? 'PLA',
    color_name: sf.name ?? '',
    color_hex: normalizeHex(sf.color_hex),
    brand: sf.vendor?.name ?? '',
    price: sf.price,
    density: sf.density,
    diameter: sf.diameter,
    weight: sf.weight,
    spool_weight: sf.spool_weight,
    settings_extruder_temp: sf.settings_extruder_temp,
    settings_bed_temp: sf.settings_bed_temp,
    article_number: sf.article_number ?? '',
    comment: sf.comment ?? '',
    external_id: sf.external_id ?? '',
    extra: Object.keys(sf.extra ?? {}).length ? sf.extra : null,
    spoolman_id: sf.id,
    purchase_url: '',
    quality_rating: null,
  }
}

function specToInput(f: FilamentSpec): FilamentSpecInput {
  const { id: _id, created_at: _ca, ...rest } = f
  return rest
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 dark:text-gray-200">{value}</dd>
    </div>
  )
}

function RatingDisplay({ rating }: { rating: number | null | undefined }) {
  if (!rating) return null
  if (rating > 0) return <span className="text-amber-500 leading-none tracking-tighter text-sm">{'★'.repeat(rating)}</span>
  return <span className="text-red-500 leading-none tracking-tighter text-sm">{'☠'.repeat(-rating)}</span>
}

function RatingPicker({ f, onClose }: { f: FilamentSpec; onClose: () => void }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (r: number | null) => updateFilament(f.id, { ...specToInput(f), quality_rating: r }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['filaments'] }); onClose() },
  })
  const cur = f.quality_rating
  return (
    <div
      className="flex flex-wrap items-center gap-1 px-4 py-2 bg-gray-50 dark:bg-gray-700/40 border-t dark:border-gray-700"
      onClick={e => e.stopPropagation()}
    >
      {([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5] as number[]).map(v => (
        <button key={v} disabled={mut.isPending}
          onClick={() => mut.mutate(cur === v ? null : v)}
          className={[
            'w-8 h-7 text-xs rounded border font-medium transition-colors',
            v < 0
              ? `border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 ${cur === v ? 'bg-red-100 dark:bg-red-900/50' : ''}`
              : `border-amber-300 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 ${cur === v ? 'bg-amber-100 dark:bg-amber-900/50' : ''}`,
          ].join(' ')}
        >
          {v > 0 ? `+${v}` : v}
        </button>
      ))}
      {cur != null && (
        <button disabled={mut.isPending}
          onClick={() => mut.mutate(null)}
          className="w-8 h-7 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 ml-1">
          ✕
        </button>
      )}
      <span className="text-xs text-gray-400 ml-2">
        {cur != null ? `Current: ${cur > 0 ? '+' : ''}${cur}` : 'Unrated'}
      </span>
    </div>
  )
}

function FilamentDetail({ f }: { f: FilamentSpec }) {
  const hasExtra = f.extra && Object.keys(f.extra).length > 0
  const currSym = useCurrency()
  return (
    <div className="px-4 pb-4 pt-1">
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        <Field label="Material" value={f.material} />
        <Field label="Brand" value={f.brand} />
        <Field label="Diameter" value={f.diameter ? `${f.diameter} mm` : null} />
        <Field label="Density" value={f.density ? `${f.density} g/cm³` : null} />
        <Field label="Spool weight" value={f.weight ? `${f.weight} g` : null} />
        <Field label="Empty spool" value={f.spool_weight ? `${f.spool_weight} g` : null} />
        <Field label="Price" value={f.price != null ? `${currSym}${f.price.toFixed(2)}` : null} />
        <Field label="Extruder temp" value={f.settings_extruder_temp ? `${f.settings_extruder_temp} °C` : null} />
        <Field label="Bed temp" value={f.settings_bed_temp ? `${f.settings_bed_temp} °C` : null} />
        <div>
          <dt className="text-xs text-gray-400">TD (Transmissivity)</dt>
          <dd className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {f.extra?.['td'] != null ? `${f.extra['td']} mm` : <span className="text-gray-400 font-normal">—</span>}
          </dd>
        </div>
        <Field label="Article #" value={f.article_number} />
        <Field label="External ID" value={f.external_id} />
        {f.spoolman_id && <Field label="Spoolman ID" value={f.spoolman_id} />}
      </dl>
      {f.purchase_url && (
        <div className="mt-2">
          <dt className="text-xs text-gray-400">Order from</dt>
          <dd className="mt-0.5">
            <a href={f.purchase_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 hover:underline break-all">
              {f.purchase_url}
              <ExternalLink size={12} className="shrink-0" />
            </a>
          </dd>
        </div>
      )}
      {f.comment && (
        <div className="mt-2">
          <dt className="text-xs text-gray-400">Comment</dt>
          <dd className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{f.comment}</dd>
        </div>
      )}
      {hasExtra && Object.entries(f.extra!).filter(([k]) => k !== 'td').length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 mb-1">Extra fields</p>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            {Object.entries(f.extra!).filter(([k]) => k !== 'td').map(([k, v]) => (
              <Field key={k} label={k} value={String(v)} />
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

function FilamentForm({
  form, setForm, onSave, onClose, saving, isEdit,
}: {
  form: FilamentSpecInput
  setForm: React.Dispatch<React.SetStateAction<FilamentSpecInput>>
  onSave: () => void
  onClose: () => void
  saving: boolean
  isEdit: boolean
}) {
  const set = (patch: Partial<FilamentSpecInput>) => setForm(f => ({ ...f, ...patch }))
  const num = (v: string) => v === '' ? null : Number(v)
  const currSym = useCurrency()
  const spoolmanLocked = isEdit && !!form.spoolman_id

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      {spoolmanLocked && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Material and brand are managed by Spoolman. All other edits sync back automatically.
        </div>
      )}
      {/* Core */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 block mb-1">Color name *</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Galaxy Black"
            value={form.color_name} onChange={e => set({ color_name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">
            Material *{spoolmanLocked && <span className="ml-1 text-blue-400">(Spoolman)</span>}
          </label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-700"
            value={form.material} onChange={e => set({ material: e.target.value })}
            disabled={spoolmanLocked}>
            {MATERIALS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">
            Brand{spoolmanLocked && <span className="ml-1 text-blue-400">(Spoolman)</span>}
          </label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-700"
            placeholder="e.g. Bambu" value={form.brand} onChange={e => set({ brand: e.target.value })}
            disabled={spoolmanLocked} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Color</label>
          <div className="flex items-center gap-2">
            <input type="color" className="w-10 h-9 rounded border border-gray-300 cursor-pointer"
              value={form.color_hex} onChange={e => set({ color_hex: e.target.value })} />
            <input className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
              value={form.color_hex} onChange={e => set({ color_hex: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Price ({currSym})</label>
          <input type="number" min="0" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.price ?? ''} onChange={e => set({ price: num(e.target.value) })} />
        </div>
      </div>

      {/* Physical properties */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Physical</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Diameter (mm)</label>
            <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.diameter ?? ''} onChange={e => set({ diameter: num(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Density (g/cm³)</label>
            <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.density ?? ''} onChange={e => set({ density: num(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Spool weight (g)</label>
            <input type="number" step="1" className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. 1000" value={form.weight ?? ''} onChange={e => set({ weight: num(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Empty spool (g)</label>
            <input type="number" step="1" className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. 250" value={form.spool_weight ?? ''} onChange={e => set({ spool_weight: num(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">TD — Transmissivity (mm)</label>
            <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. 0.3"
              value={form.extra?.['td'] != null ? String(form.extra['td']) : ''}
              onChange={e => {
                const next = { ...(form.extra ?? {}) }
                if (e.target.value === '') { delete next['td'] } else { next['td'] = Number(e.target.value) }
                set({ extra: Object.keys(next).length ? next : null })
              }} />
          </div>
        </div>
      </div>

      {/* Print settings */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Print Settings</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Extruder temp (°C)</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.settings_extruder_temp ?? ''} onChange={e => set({ settings_extruder_temp: num(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Bed temp (°C)</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.settings_bed_temp ?? ''} onChange={e => set({ settings_bed_temp: num(e.target.value) })} />
          </div>
        </div>
      </div>

      {/* Meta */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Meta</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Article #</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.article_number} onChange={e => set({ article_number: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">External ID</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              value={form.external_id} onChange={e => set({ external_id: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Purchase URL</label>
            <input type="url" className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="https://www.amazon.com/..."
              value={form.purchase_url} onChange={e => set({ purchase_url: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Comment</label>
            <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.comment} onChange={e => set({ comment: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Quality rating (−5 to +5)</label>
            <input type="number" min="-5" max="5" step="1"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="blank = unrated"
              value={form.quality_rating ?? ''}
              onChange={e => set({ quality_rating: e.target.value === '' ? null : Math.max(-5, Math.min(5, parseInt(e.target.value))) })} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1 sticky bottom-0 bg-white dark:bg-gray-800 py-3 border-t dark:border-gray-700 -mx-1 px-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
        <button disabled={!form.color_name || saving} onClick={onSave}
          className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function SpoolmanImportModal({
  filaments,
  onClose,
  onImport,
  importing,
}: {
  filaments: SpoolmanFilament[]
  onClose: () => void
  onImport: (ids: number[]) => void
  importing: boolean
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(filaments.map(f => f.id)))
  const toggleAll = () =>
    setSelected(s => s.size === filaments.length ? new Set() : new Set(filaments.map(f => f.id)))
  const toggle = (id: number) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <Modal title="Import from Spoolman" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{filaments.length} filament{filaments.length !== 1 ? 's' : ''} available</span>
          <button onClick={toggleAll} className="text-xs text-brand-600 hover:underline">
            {selected.size === filaments.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto border rounded-lg divide-y dark:border-gray-700 dark:divide-gray-700">
          {filaments.map(sf => {
            const hex = sf.color_hex ? (sf.color_hex.startsWith('#') ? sf.color_hex : `#${sf.color_hex}`) : '#888888'
            return (
              <label key={sf.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <input type="checkbox" checked={selected.has(sf.id)} onChange={() => toggle(sf.id)} className="rounded border-gray-300" />
                <span className="w-4 h-4 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: hex }} />
                <span className="text-sm font-medium flex-1 truncate">{sf.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{sf.material}</span>
                {sf.vendor?.name && <span className="text-xs text-gray-400 shrink-0">{sf.vendor.name}</span>}
              </label>
            )
          })}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button
            disabled={selected.size === 0 || importing}
            onClick={() => onImport([...selected])}
            className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${selected.size}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Filaments() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })
  const { data: spoolmanData } = useQuery({ queryKey: ['spoolman-filaments'], queryFn: getSpoolmanFilaments, refetchInterval: 30_000 })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const spoolmanUrl = (settings?.spoolman_url || '').replace(/\/$/, '')

  const [expanded, setExpanded] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FilamentSpec | null>(null)
  const [form, setForm] = useState<FilamentSpecInput>(emptyForm())
  const [showImportModal, setShowImportModal] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [filterMaterial, setFilterMaterial] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterColor, setFilterColor] = useState('')
  const [filterSpoolman, setFilterSpoolman] = useState<'' | 'linked' | 'unlinked'>('')
  const [sortBy, setSortBy] = useState<'color_name' | 'brand' | 'material'>('color_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [ratingPickerOpen, setRatingPickerOpen] = useState<number | null>(null)
  const [warnFilament, setWarnFilament] = useState<FilamentSpec | null>(null)

  function clearFilters() {
    setFilterMaterial(''); setFilterBrand(''); setFilterColor(''); setFilterSpoolman('')
    setSortBy('color_name'); setSortDir('asc')
  }

  const hasActiveFilters = filterMaterial || filterBrand || filterColor || filterSpoolman || sortBy !== 'color_name' || sortDir !== 'asc'

  const saveMutation = useMutation({
    mutationFn: () => editing ? updateFilament(editing.id, form) : createFilament(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['filaments'] }); closeForm() },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFilament(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['filaments'] }),
  })
  const importMutation = useMutation({
    mutationFn: (ids: number[]) => spoolmanBulkImport(ids),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['filaments'] })
      qc.invalidateQueries({ queryKey: ['spoolman-filaments'] })
      setShowImportModal(false)
      setSyncMsg(`Imported ${data.imported} filament${data.imported !== 1 ? 's' : ''} from Spoolman.`)
      setTimeout(() => setSyncMsg(null), 4000)
    },
  })
  const syncMutation = useMutation({
    mutationFn: spoolmanSync,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['filaments'] })
      qc.invalidateQueries({ queryKey: ['spoolman-filaments'] })
      setSyncMsg(`Synced ${data.updated} filament${data.updated !== 1 ? 's' : ''} from Spoolman.`)
      setTimeout(() => setSyncMsg(null), 4000)
    },
  })

  function openCreate() { setEditing(null); setForm(emptyForm()); setShowForm(true) }
  function openEdit(f: FilamentSpec) { setEditing(f); setForm(specToInput(f)); setShowForm(true) }
  function openImport(sf: SpoolmanFilament) { setEditing(null); setForm(spoolmanToInput(sf)); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  const linkedToSpoolman = filaments.filter(f => f.spoolman_id).length
  const spoolmanFilamentMap = new Map((spoolmanData?.filaments ?? []).map(sf => [sf.id, sf]))
  const outOfSyncCount = filaments.filter(f =>
    f.spoolman_id != null && spoolmanFilamentMap.has(f.spoolman_id) &&
    hasSpoolmanDiff(f, spoolmanFilamentMap.get(f.spoolman_id)!)
  ).length
  const importedSpoolmanIds = new Set(filaments.map(f => f.spoolman_id).filter(Boolean))
  const localKeys = new Set(
    filaments.map(f => `${(f.material ?? '').toLowerCase()}::${(f.color_name ?? '').toLowerCase()}`)
  )
  const isImported = (sf: SpoolmanFilament) =>
    importedSpoolmanIds.has(sf.id) ||
    localKeys.has(`${(sf.material ?? '').toLowerCase()}::${(sf.name ?? '').toLowerCase()}`)

  const spoolmanMultiColorMap = new Map(
    (spoolmanData?.filaments ?? [])
      .filter(sf => sf.multi_color_hexes)
      .map(sf => [sf.id, sf.multi_color_hexes!])
  )

  const allMaterials = [...new Set(filaments.map(f => f.material).filter((m): m is string => !!m))].sort()
  const allBrands = [...new Set(filaments.map(f => f.brand).filter((b): b is string => !!b))].sort()

  const filteredFilaments = filaments.filter(f => {
    if (filterMaterial && f.material !== filterMaterial) return false
    if (filterBrand && f.brand !== filterBrand) return false
    if (filterColor && !(f.color_name ?? '').toLowerCase().includes(filterColor.toLowerCase())) return false
    if (filterSpoolman === 'linked' && !f.spoolman_id) return false
    if (filterSpoolman === 'unlinked' && f.spoolman_id) return false
    return true
  })

  const sortedFilaments = [...filteredFilaments].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'color_name') cmp = (a.color_name ?? '').localeCompare(b.color_name ?? '')
    else if (sortBy === 'brand') cmp = (a.brand ?? '').localeCompare(b.brand ?? '')
    else if (sortBy === 'material') cmp = (a.material ?? '').localeCompare(b.material ?? '')
    else if (sortBy === 'spoolman_id') cmp = (a.spoolman_id ?? 0) - (b.spoolman_id ?? 0)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const grouped = sortedFilaments.reduce<Record<string, FilamentSpec[]>>((acc, f) => {
    ;(acc[f.material ?? ''] ??= []).push(f); return acc
  }, {})

  const spoolmanFilaments = (spoolmanData?.filaments ?? []).filter(
    (sf, i, arr) => arr.findIndex(x =>
      x.id === sf.id ||
      (sf.external_id && x.external_id === sf.external_id)
    ) === i
  )
  const notImported = spoolmanFilaments.filter(sf => !isImported(sf))

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3"><Disc2 size={26} className="text-brand-600" />Filaments</h1>
          <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/filaments/spools')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg"
          >
            <SpoolIcon size={14} color="white" /> Spool Inventory
          </button>
          {linkedToSpoolman > 0 && (
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg disabled:opacity-50 transition-colors ${
                outOfSyncCount > 0
                  ? 'bg-amber-50 dark:bg-amber-900/30 border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              title={outOfSyncCount > 0 ? `${outOfSyncCount} filament${outOfSyncCount !== 1 ? 's' : ''} differ from Spoolman` : 'All linked filaments are in sync'}
            >
              <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
              {syncMutation.isPending ? 'Syncing…' : outOfSyncCount > 0 ? `${outOfSyncCount} out of sync` : 'In sync'}
            </button>
          )}
          {spoolmanData?.connected && notImported.length > 0 && (
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 border border-blue-300 text-blue-600 text-sm px-3 py-2 rounded-lg hover:bg-blue-50"
            >
              <Download size={14} /> Import from Spoolman ({notImported.length})
            </button>
          )}
          <button
            onClick={() => spoolmanUrl ? window.open(spoolmanUrl, '_blank') : undefined}
            disabled={!spoolmanUrl}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ExternalLink size={15} /> Add Filament
          </button>
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-500">
          <Info size={11} className="shrink-0" /> These are filament types you stock or purchase — not individual spools. Use Spool Inventory to track what's physically on the shelf.
        </p>
      </div>

      {syncMsg && (
        <p className="text-sm text-green-600 dark:text-green-400">{syncMsg}</p>
      )}

      {!spoolmanData?.connected && spoolmanData && (
        <p className="text-xs text-gray-400 italic">Spoolman not connected — configure URL in Settings to import filaments.</p>
      )}

      {/* Local catalog */}
      <div className="space-y-4">
        {filaments.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Local Catalog
                {filteredFilaments.length !== filaments.length && (
                  <span className="font-normal normal-case text-gray-400 ml-1">— {filteredFilaments.length} of {filaments.length}</span>
                )}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="border rounded-lg px-2 py-1 text-xs dark:bg-gray-800 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                value={filterMaterial}
                onChange={e => setFilterMaterial(e.target.value)}
              >
                <option value="">All materials</option>
                {allMaterials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>

              <select
                className="border rounded-lg px-2 py-1 text-xs dark:bg-gray-800 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                value={filterBrand}
                onChange={e => setFilterBrand(e.target.value)}
              >
                <option value="">All brands</option>
                {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              <input
                type="text"
                placeholder="Color…"
                className="border rounded-lg px-2 py-1 text-xs w-28 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
                value={filterColor}
                onChange={e => setFilterColor(e.target.value)}
              />

              <select
                className="border rounded-lg px-2 py-1 text-xs dark:bg-gray-800 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                value={filterSpoolman}
                onChange={e => setFilterSpoolman(e.target.value as '' | 'linked' | 'unlinked')}
              >
                <option value="">All Spoolman</option>
                <option value="linked">Linked only</option>
                <option value="unlinked">Unlinked only</option>
              </select>

              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-gray-400">Sort:</span>
                <select
                  className="border rounded-lg px-2 py-1 text-xs dark:bg-gray-800 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                >
                  <option value="color_name">Color</option>
                  <option value="brand">Brand</option>
                  <option value="material">Material</option>

                </select>
                <button
                  onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  className="border rounded-lg px-2 py-1 text-xs dark:bg-gray-800 dark:border-gray-600 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                  title="Toggle sort direction"
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-500 px-1">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {filaments.length === 0 && !spoolmanData?.connected && (
          <p className="text-sm text-gray-400 italic">No filaments yet. Add them manually or connect Spoolman to import.</p>
        )}

        {Object.entries(grouped).map(([material, specs]) => (
          <div key={material}>
            <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 ml-1">{material}</h3>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y dark:divide-gray-700">
              {specs.map(f => {
                const isOpen = expanded === f.id
                return (
                  <div key={f.id}>
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      onClick={() => setExpanded(isOpen ? null : f.id)}
                    >
                      <div className="flex items-center gap-3">
                        {isOpen
                          ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                          : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                        <span
                          className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                          style={{ backgroundColor: f.spoolman_id && spoolmanMultiColorMap.has(f.spoolman_id)
                            ? `#${spoolmanMultiColorMap.get(f.spoolman_id)!.split(',')[0].trim()}`
                            : (f.color_hex ?? '#888888') }}
                        />
                        <span className="font-medium text-sm">{f.color_name}</span>
                        {f.brand && <span className="text-xs text-gray-400">{f.brand}</span>}
                        {f.weight && <span className="text-xs text-gray-400">{f.weight}g</span>}
                        {f.settings_extruder_temp && (
                          <span className="text-xs text-gray-400">{f.settings_extruder_temp}°C / {f.settings_bed_temp}°C</span>
                        )}
                        {(() => {
                          const td = Number(f.extra?.['td'] ?? 0)
                          if (td <= 0) return null
                          const hex = f.spoolman_id && spoolmanMultiColorMap.has(f.spoolman_id)
                            ? `#${spoolmanMultiColorMap.get(f.spoolman_id)!.split(',')[0].trim()}`
                            : (f.color_hex ?? '#888888')
                          return <TdBadge td={td} colorHex={hex} />
                        })()}
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => { e.stopPropagation(); setRatingPickerOpen(ratingPickerOpen === f.id ? null : f.id) }}
                          className="focus:outline-none leading-none"
                          title={f.quality_rating != null ? `Rating: ${f.quality_rating > 0 ? '+' : ''}${f.quality_rating}${f.comment ? `\n${f.comment}` : ''} — click to edit` : 'Set quality rating'}
                        >
                          {f.quality_rating
                            ? <RatingDisplay rating={f.quality_rating} />
                            : <span className="text-gray-300 dark:text-gray-600 text-sm">☆</span>}
                        </button>
                        {f.purchase_url && (
                          <button
                            onClick={() => {
                              if (f.quality_rating != null && f.quality_rating < 0) {
                                setWarnFilament(f)
                              } else {
                                window.open(f.purchase_url, '_blank')
                              }
                            }}
                            title="Order"
                            className="text-gray-400 hover:text-green-600">
                            <ShoppingCart size={14} />
                          </button>
                        )}
                        <button onClick={() => openEdit(f)} className="text-gray-400 hover:text-brand-600" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => { if (confirm('Delete this filament?')) deleteMutation.mutate(f.id) }}
                          className="text-gray-400 hover:text-red-500" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {ratingPickerOpen === f.id && (
                      <RatingPicker f={f} onClose={() => setRatingPickerOpen(null)} />
                    )}
                    {isOpen && <FilamentDetail f={f} />}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title={editing ? 'Edit Filament' : 'Add Filament'} onClose={closeForm}>
          <FilamentForm
            form={form}
            setForm={setForm}
            onSave={() => saveMutation.mutate()}
            onClose={closeForm}
            saving={saveMutation.isPending}
            isEdit={!!editing}
          />
        </Modal>
      )}

      {showImportModal && (
        <SpoolmanImportModal
          filaments={notImported}
          onClose={() => setShowImportModal(false)}
          onImport={(ids) => importMutation.mutate(ids)}
          importing={importMutation.isPending}
        />
      )}

      {warnFilament && (
        <Modal title="Low-rated filament" onClose={() => setWarnFilament(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <RatingDisplay rating={warnFilament.quality_rating} />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{warnFilament.color_name}</span>
              {warnFilament.brand && <span className="text-sm text-gray-500">{warnFilament.brand}</span>}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This filament has a negative quality rating ({warnFilament.quality_rating}). Are you sure you want to order it again?
            </p>
            {warnFilament.comment && (
              <p className="text-sm text-gray-700 dark:text-gray-300 italic border-l-2 border-red-300 pl-3">
                "{warnFilament.comment}"
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setWarnFilament(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                Cancel
              </button>
              <button
                onClick={() => { window.open(warnFilament.purchase_url, '_blank'); setWarnFilament(null) }}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm rounded-lg"
              >
                Go anyway
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
