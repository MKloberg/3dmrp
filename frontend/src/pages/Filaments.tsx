import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFilaments, createFilament, updateFilament, deleteFilament,
  FilamentSpec, FilamentSpecInput,
  getSpoolmanFilaments, SpoolmanFilament,
} from '../api/client'
import Modal from '../components/Modal'
import { Plus, Pencil, Trash2, Download, ChevronDown, ChevronRight, ShoppingCart, ExternalLink } from 'lucide-react'

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

export default function Filaments() {
  const qc = useQueryClient()
  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })
  const { data: spoolmanData } = useQuery({ queryKey: ['spoolman-filaments'], queryFn: getSpoolmanFilaments })

  const [expanded, setExpanded] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FilamentSpec | null>(null)
  const [form, setForm] = useState<FilamentSpecInput>(emptyForm())

  const saveMutation = useMutation({
    mutationFn: () => editing ? updateFilament(editing.id, form) : createFilament(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['filaments'] }); closeForm() },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFilament(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['filaments'] }),
  })

  function openCreate() { setEditing(null); setForm(emptyForm()); setShowForm(true) }
  function openEdit(f: FilamentSpec) { setEditing(f); setForm(specToInput(f)); setShowForm(true) }
  function openImport(sf: SpoolmanFilament) { setEditing(null); setForm(spoolmanToInput(sf)); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  const localKeys = new Set(
    filaments.map(f => `${f.material.toLowerCase()}::${f.color_name.toLowerCase()}`)
  )
  const isImported = (sf: SpoolmanFilament) =>
    localKeys.has(`${sf.material.toLowerCase()}::${sf.name.toLowerCase()}`)

  const grouped = filaments.reduce<Record<string, FilamentSpec[]>>((acc, f) => {
    ;(acc[f.material] ??= []).push(f); return acc
  }, {})

  const spoolmanFilaments = spoolmanData?.filaments ?? []
  const notImported = spoolmanFilaments.filter(sf => !isImported(sf))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Filaments</h1>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg">
          <Plus size={15} /> Add Filament
        </button>
      </div>

      {/* Spoolman import */}
      {spoolmanData?.connected && spoolmanFilaments.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Download size={12} /> From Spoolman
            {notImported.length === 0
              ? <span className="font-normal normal-case text-green-600 ml-1">— all imported</span>
              : <span className="font-normal normal-case text-gray-400 ml-1">— {notImported.length} not yet imported</span>}
          </h2>
          {notImported.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl divide-y divide-blue-100 dark:divide-blue-800">
              {notImported.map(sf => (
                <div key={sf.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0"
                      style={{ backgroundColor: normalizeHex(sf.color_hex) }} />
                    <span className="text-sm font-medium">{sf.name}</span>
                    <span className="text-xs text-gray-500">{sf.material}</span>
                    {sf.vendor?.name && <span className="text-xs text-gray-400">{sf.vendor.name}</span>}
                    {sf.weight && <span className="text-xs text-gray-400">{sf.weight}g</span>}
                    {sf.settings_extruder_temp && (
                      <span className="text-xs text-gray-400">{sf.settings_extruder_temp}°C / {sf.settings_bed_temp}°C</span>
                    )}
                  </div>
                  <button onClick={() => openImport(sf)}
                    className="text-xs text-brand-600 hover:text-brand-700 border border-brand-300 px-3 py-1 rounded-lg hover:bg-brand-50">
                    Import
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!spoolmanData?.connected && (
        <p className="text-xs text-gray-400 italic">
          {spoolmanData ? 'Spoolman not connected — configure URL in Settings to import filaments.' : ''}
        </p>
      )}

      {/* Local catalog */}
      <div className="space-y-4">
        {filaments.length > 0 && (
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Local Catalog</h2>
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
                        <div className="w-5 h-5 rounded-full border border-gray-300 shrink-0"
                          style={{ backgroundColor: f.color_hex }} />
                        <span className="font-medium text-sm">{f.color_name}</span>
                        {f.brand && <span className="text-xs text-gray-400">{f.brand}</span>}
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
    </div>
  )
}
