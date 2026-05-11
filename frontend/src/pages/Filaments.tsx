import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFilaments, createFilament, updateFilament, deleteFilament,
  FilamentSpec, FilamentSpecInput,
  getSpoolmanFilaments, SpoolmanFilament,
  spoolmanBulkImport, spoolmanSync,
} from '../api/client'
import Modal from '../components/Modal'
import { Plus, Pencil, Trash2, Download, ChevronDown, ChevronRight, ShoppingCart, ExternalLink, RefreshCw } from 'lucide-react'

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'Resin', 'Other']

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex.toLowerCase() : `#${hex}`.toLowerCase()
}

function emptyForm(): FilamentSpecInput {
  return {
    material: 'PLA', color_name: '', color_hex: '#888888', brand: '',
    price: null, density: null, diameter: 1.75, weight: null, spool_weight: null,
    settings_extruder_temp: null, settings_bed_temp: null,
    article_number: '', comment: '', external_id: '', extra: null, spoolman_id: null, purchase_url: '',
  }
}

function spoolmanToInput(sf: SpoolmanFilament): FilamentSpecInput {
  return {
    material: sf.material || 'PLA',
    color_name: sf.name,
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

function FilamentDetail({ f }: { f: FilamentSpec }) {
  const hasExtra = f.extra && Object.keys(f.extra).length > 0
  return (
    <div className="px-4 pb-4 pt-1">
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        <Field label="Material" value={f.material} />
        <Field label="Brand" value={f.brand} />
        <Field label="Diameter" value={f.diameter ? `${f.diameter} mm` : null} />
        <Field label="Density" value={f.density ? `${f.density} g/cm³` : null} />
        <Field label="Spool weight" value={f.weight ? `${f.weight} g` : null} />
        <Field label="Empty spool" value={f.spool_weight ? `${f.spool_weight} g` : null} />
        <Field label="Price" value={f.price != null ? `$${f.price.toFixed(2)}` : null} />
        <Field label="Extruder temp" value={f.settings_extruder_temp ? `${f.settings_extruder_temp} °C` : null} />
        <Field label="Bed temp" value={f.settings_bed_temp ? `${f.settings_bed_temp} °C` : null} />
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
      {hasExtra && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 mb-1">Extra fields</p>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            {Object.entries(f.extra!).map(([k, v]) => (
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

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      {/* Core */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 block mb-1">Color name *</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Galaxy Black"
            value={form.color_name} onChange={e => set({ color_name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Material *</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.material} onChange={e => set({ material: e.target.value })}>
            {MATERIALS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Brand</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Bambu"
            value={form.brand} onChange={e => set({ brand: e.target.value })} />
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
          <label className="text-xs text-gray-500 block mb-1">Price ($)</label>
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
                <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" style={{ backgroundColor: hex }} />
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
  const qc = useQueryClient()
  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })
  const { data: spoolmanData } = useQuery({ queryKey: ['spoolman-filaments'], queryFn: getSpoolmanFilaments })

  const [expanded, setExpanded] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FilamentSpec | null>(null)
  const [form, setForm] = useState<FilamentSpecInput>(emptyForm())
  const [showImportModal, setShowImportModal] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [showSpoolmanIds, setShowSpoolmanIds] = useState(
    () => localStorage.getItem('showSpoolmanIds') === 'true'
  )
  const [filterMaterial, setFilterMaterial] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterColor, setFilterColor] = useState('')
  const [filterSpoolman, setFilterSpoolman] = useState<'' | 'linked' | 'unlinked'>('')
  const [sortBy, setSortBy] = useState<'color_name' | 'brand' | 'material' | 'spoolman_id'>('color_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSpoolmanIds() {
    setShowSpoolmanIds(v => {
      localStorage.setItem('showSpoolmanIds', String(!v))
      return !v
    })
  }

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
      setSyncMsg(`Synced ${data.updated} filament${data.updated !== 1 ? 's' : ''} from Spoolman.`)
      setTimeout(() => setSyncMsg(null), 4000)
    },
  })

  function openCreate() { setEditing(null); setForm(emptyForm()); setShowForm(true) }
  function openEdit(f: FilamentSpec) { setEditing(f); setForm(specToInput(f)); setShowForm(true) }
  function openImport(sf: SpoolmanFilament) { setEditing(null); setForm(spoolmanToInput(sf)); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  const linkedToSpoolman = filaments.filter(f => f.spoolman_id).length
  const importedSpoolmanIds = new Set(filaments.map(f => f.spoolman_id).filter(Boolean))
  const localKeys = new Set(
    filaments.map(f => `${f.material.toLowerCase()}::${f.color_name.toLowerCase()}`)
  )
  const isImported = (sf: SpoolmanFilament) =>
    importedSpoolmanIds.has(sf.id) ||
    localKeys.has(`${sf.material.toLowerCase()}::${sf.name.toLowerCase()}`)

  const spoolmanMultiColorMap = new Map(
    (spoolmanData?.filaments ?? [])
      .filter(sf => sf.multi_color_hexes)
      .map(sf => [sf.id, sf.multi_color_hexes!])
  )

  const allMaterials = [...new Set(filaments.map(f => f.material))].sort()
  const allBrands = [...new Set(filaments.map(f => f.brand).filter(Boolean))].sort()

  const filteredFilaments = filaments.filter(f => {
    if (filterMaterial && f.material !== filterMaterial) return false
    if (filterBrand && f.brand !== filterBrand) return false
    if (filterColor && !f.color_name.toLowerCase().includes(filterColor.toLowerCase())) return false
    if (filterSpoolman === 'linked' && !f.spoolman_id) return false
    if (filterSpoolman === 'unlinked' && f.spoolman_id) return false
    return true
  })

  const sortedFilaments = [...filteredFilaments].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'color_name') cmp = a.color_name.localeCompare(b.color_name)
    else if (sortBy === 'brand') cmp = (a.brand || '').localeCompare(b.brand || '')
    else if (sortBy === 'material') cmp = a.material.localeCompare(b.material)
    else if (sortBy === 'spoolman_id') cmp = (a.spoolman_id ?? 0) - (b.spoolman_id ?? 0)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const grouped = sortedFilaments.reduce<Record<string, FilamentSpec[]>>((acc, f) => {
    ;(acc[f.material] ??= []).push(f); return acc
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Filaments</h1>
        <div className="flex items-center gap-2">
          {linkedToSpoolman > 0 && (
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
              {syncMutation.isPending ? 'Syncing…' : `Sync ${linkedToSpoolman}`}
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
          <button onClick={openCreate}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg">
            <Plus size={15} /> Add Filament
          </button>
        </div>
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
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-gray-400">Spoolman IDs</span>
                <span
                  onClick={toggleSpoolmanIds}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showSpoolmanIds ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${showSpoolmanIds ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </span>
              </label>
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
                  <option value="spoolman_id">Spoolman ID</option>
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
                        {f.spoolman_id && spoolmanMultiColorMap.has(f.spoolman_id) ? (
                          <div
                            className="w-5 h-5 rounded-full border border-gray-300 shrink-0"
                            style={{ background: `linear-gradient(to right, ${spoolmanMultiColorMap.get(f.spoolman_id)!.split(',').map(h => `#${h.trim()}`).join(', ')})` }}
                            title={spoolmanMultiColorMap.get(f.spoolman_id)!}
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-gray-300 shrink-0"
                            style={{ backgroundColor: f.color_hex }} />
                        )}
                        <span className="font-medium text-sm">{f.color_name}</span>
                        {f.brand && <span className="text-xs text-gray-400">{f.brand}</span>}
                        {showSpoolmanIds && f.spoolman_id && (
                          <span className="text-xs text-gray-300 dark:text-gray-600 font-mono">#{f.spoolman_id}</span>
                        )}
                        {f.weight && <span className="text-xs text-gray-400">{f.weight}g</span>}
                        {f.settings_extruder_temp && (
                          <span className="text-xs text-gray-400">{f.settings_extruder_temp}°C / {f.settings_bed_temp}°C</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {f.purchase_url && (
                          <a href={f.purchase_url} target="_blank" rel="noopener noreferrer"
                            title="Order"
                            className="text-gray-400 hover:text-green-600">
                            <ShoppingCart size={14} />
                          </a>
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
    </div>
  )
}
