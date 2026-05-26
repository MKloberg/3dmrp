import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, ChevronLeft, Loader2, Check, Sparkles, AlertTriangle, Nfc, Package,
} from 'lucide-react'
import Modal from './Modal'
import {
  parseFilamentListing, createSpoolmanFilament, createSpoolmanSpoolsWizard,
  getSpoolmanLocationOptions, ParsedFilamentSpec, SpoolmanSpool,
} from '../api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilamentMeta {
  type?: string
  color_hex?: string
  brand?: string
  min_temp?: number
  max_temp?: number
  bed_temp?: number
}

interface Props {
  onClose: () => void
  onTagSpools: (spools: SpoolmanSpool[], meta: FilamentMeta) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHex(h: string | null | undefined): string {
  if (!h) return '#888888'
  const clean = h.replace(/^#/, '')
  return clean.length === 6 ? `#${clean}` : '#888888'
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200'

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function FilamentImportWizard({ onClose, onTagSpools }: Props) {
  const qc = useQueryClient()

  const [step, setStep] = useState(0)
  const [pastedText, setPastedText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  // Review form state (populated from AI parse)
  const [form, setForm] = useState<{
    name: string; material: string; brand: string; color_hex: string
    diameter: string; weight: string; spool_weight: string
    extruder_temp: string; bed_temp: string; price: string; asin: string; density: string
  }>({
    name: '', material: '', brand: '', color_hex: '888888',
    diameter: '1.75', weight: '', spool_weight: '',
    extruder_temp: '', bed_temp: '', price: '', asin: '', density: '',
  })

  // Step 3: created filament
  const [creatingFilament, setCreatingFilament] = useState(false)
  const [filamentError, setFilamentError] = useState<string | null>(null)
  const [createdFilamentId, setCreatedFilamentId] = useState<number | null>(null)
  const [createdFilamentName, setCreatedFilamentName] = useState('')

  // Step 4: spool details
  const [spoolCount, setSpoolCount] = useState(1)
  const [spoolPrice, setSpoolPrice] = useState('')
  const [spoolLocation, setSpoolLocation] = useState('')
  const [spoolComment, setSpoolComment] = useState('')
  const [creatingSpools, setCreatingSpools] = useState(false)
  const [spoolError, setSpoolError] = useState<string | null>(null)
  const [createdSpools, setCreatedSpools] = useState<SpoolmanSpool[]>([])

  const { data: locationData } = useQuery({ queryKey: ['spoolman-location-options'], queryFn: getSpoolmanLocationOptions })

  function setField(k: keyof typeof form, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  // ── Step 0 → 1: Parse ────────────────────────────────────────────────────

  async function handleParse() {
    if (!pastedText.trim()) return
    setParseError(null)
    setStep(1)
    try {
      const spec: ParsedFilamentSpec = await parseFilamentListing(pastedText)
      const material = spec.material ?? ''
      const defaultDensity = spec.density != null
        ? String(spec.density)
        : material.toUpperCase() === 'PLA' || material.toUpperCase() === 'PLA+' ? '1.24' : ''
      setForm({
        name: spec.name ?? '',
        material,
        brand: spec.brand ?? '',
        color_hex: spec.color_hex ?? '888888',
        diameter: spec.diameter != null ? String(spec.diameter) : '1.75',
        weight: spec.weight != null ? String(spec.weight) : '',
        spool_weight: spec.spool_weight != null ? String(spec.spool_weight) : '',
        extruder_temp: spec.extruder_temp != null ? String(spec.extruder_temp) : '',
        bed_temp: spec.bed_temp != null ? String(spec.bed_temp) : '',
        price: spec.price != null ? String(spec.price) : '',
        asin: spec.asin ?? '',
        density: defaultDensity,
      })
      setStep(2)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse listing')
      setStep(0)
    }
  }

  // ── Step 2 → 3: Create filament ──────────────────────────────────────────

  async function handleCreateFilament() {
    setCreatingFilament(true)
    setFilamentError(null)
    try {
      const result = await createSpoolmanFilament({
        name: form.name.trim(),
        material: form.material.trim(),
        color_hex: form.color_hex || undefined,
        vendor_name: form.brand.trim() || undefined,
        weight: form.weight ? parseFloat(form.weight) : undefined,
        spool_weight: form.spool_weight ? parseFloat(form.spool_weight) : undefined,
        diameter: form.diameter ? parseFloat(form.diameter) : 1.75,
        density: form.density ? parseFloat(form.density) : undefined,
        price: form.price ? parseFloat(form.price) : undefined,
        settings_extruder_temp: form.extruder_temp ? parseInt(form.extruder_temp) : undefined,
        settings_bed_temp: form.bed_temp ? parseInt(form.bed_temp) : undefined,
        article_number: form.asin.trim() || undefined,
      })
      setCreatedFilamentId(result.id)
      setCreatedFilamentName(result.name || form.name)
      qc.invalidateQueries({ queryKey: ['spoolman-filaments'] })
      setStep(3)
    } catch (e) {
      setFilamentError(e instanceof Error ? e.message : 'Failed to create filament in Spoolman')
    } finally {
      setCreatingFilament(false)
    }
  }

  // ── Step 3 → 4: Create spools ────────────────────────────────────────────

  async function handleCreateSpools() {
    if (!createdFilamentId) return
    setCreatingSpools(true)
    setSpoolError(null)
    try {
      const result = await createSpoolmanSpoolsWizard({
        filament_id: createdFilamentId,
        count: spoolCount,
        price: spoolPrice ? parseFloat(spoolPrice) : undefined,
        location: spoolLocation.trim() || undefined,
        comment: spoolComment.trim() || undefined,
      })
      setCreatedSpools(result.spools)
      qc.invalidateQueries({ queryKey: ['spoolman-stock'] })
      setStep(4)
    } catch (e) {
      setSpoolError(e instanceof Error ? e.message : 'Failed to create spools')
    } finally {
      setCreatingSpools(false)
    }
  }

  function handleTagSpools() {
    const meta: FilamentMeta = {
      type: form.material || undefined,
      color_hex: form.color_hex || undefined,
      brand: form.brand || undefined,
      min_temp: form.extruder_temp ? parseInt(form.extruder_temp) : undefined,
      max_temp: form.extruder_temp ? parseInt(form.extruder_temp) : undefined,
      bed_temp: form.bed_temp ? parseInt(form.bed_temp) : undefined,
    }
    onClose()
    onTagSpools(createdSpools, meta)
  }

  const totalSteps = 5

  return (
    <Modal title="Import Filament from Listing" onClose={onClose}>
      {/* Step dots */}
      <div className="flex items-center gap-1.5 justify-center py-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${
            i < step ? 'w-4 bg-brand-600' : i === step ? 'w-4 bg-brand-400' : 'w-1.5 bg-gray-300 dark:bg-gray-600'
          }`} />
        ))}
      </div>

      {/* ── Step 0: Paste ── */}
      {step === 0 && (
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Paste a filament product listing — from Amazon, a manufacturer's website, or anywhere else.
              The AI will extract the specs automatically.
            </p>
          </div>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 resize-none font-mono"
            rows={10}
            placeholder="Paste product title, description, specs table, or any combination…"
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
          />
          {parseError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 max-h-32 overflow-y-auto">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="break-all">{parseError}</span>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleParse}
              disabled={!pastedText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40"
            >
              <Sparkles size={15} />
              Parse with AI <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Parsing ── */}
      {step === 1 && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 size={36} className="text-brand-500 animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Analyzing product listing…</p>
        </div>
      )}

      {/* ── Step 2: Review & edit ── */}
      {step === 2 && (
        <div className="space-y-4 py-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">Review and correct the extracted data before creating the filament in Spoolman.</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Color / Product Name *">
                <input className={inputCls} value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Silk Green" />
              </Field>
            </div>
            <Field label="Material *">
              <input className={inputCls} value={form.material} onChange={e => {
                const mat = e.target.value
                setField('material', mat)
                if (!form.density && (mat.toUpperCase() === 'PLA' || mat.toUpperCase() === 'PLA+')) {
                  setField('density', '1.24')
                }
              }} placeholder="PLA" />
            </Field>
            <Field label="Brand / Vendor">
              <input className={inputCls} value={form.brand} onChange={e => setField('brand', e.target.value)} placeholder="eSUN" />
            </Field>

            {/* Color swatch + hex */}
            <div className="col-span-2">
              <Field label="Color Hex">
                <div className="flex items-center gap-2">
                  <span
                    className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-600 shrink-0"
                    style={{ backgroundColor: normalizeHex(form.color_hex) }}
                  />
                  <input
                    className={inputCls}
                    value={form.color_hex}
                    onChange={e => setField('color_hex', e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
                    placeholder="3cb371"
                    maxLength={6}
                  />
                </div>
              </Field>
            </div>

            <Field label="Diameter (mm)">
              <select className={inputCls} value={form.diameter} onChange={e => setField('diameter', e.target.value)}>
                <option value="1.75">1.75</option>
                <option value="2.85">2.85</option>
              </select>
            </Field>
            <Field label="Net Weight (g)">
              <input className={inputCls} type="number" min="0" value={form.weight} onChange={e => setField('weight', e.target.value)} placeholder="1000" />
            </Field>
            <Field label="Empty Spool Weight (g)">
              <input className={inputCls} type="number" min="0" value={form.spool_weight} onChange={e => setField('spool_weight', e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Density (g/cm³)">
              <input className={inputCls} type="number" step="0.01" value={form.density} onChange={e => setField('density', e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Extruder Temp (°C)">
              <input className={inputCls} type="number" value={form.extruder_temp} onChange={e => setField('extruder_temp', e.target.value)} placeholder="220" />
            </Field>
            <Field label="Bed Temp (°C)">
              <input className={inputCls} type="number" value={form.bed_temp} onChange={e => setField('bed_temp', e.target.value)} placeholder="60" />
            </Field>
            <Field label="Price (USD)">
              <input className={inputCls} type="number" step="0.01" value={form.price} onChange={e => setField('price', e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="ASIN">
              <input className={inputCls} value={form.asin} onChange={e => setField('asin', e.target.value.toUpperCase())} placeholder="B0XXXXXXXX" />
            </Field>
          </div>

          {filamentError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 max-h-32 overflow-y-auto">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="break-all">{filamentError}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setStep(0)}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <button
              onClick={handleCreateFilament}
              disabled={creatingFilament || !form.name.trim() || !form.material.trim()}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40"
            >
              {creatingFilament && <Loader2 size={14} className="animate-spin" />}
              {creatingFilament ? 'Creating…' : 'Create Filament in Spoolman'}
              {!creatingFilament && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Filament created → spool details ── */}
      {step === 3 && (
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/60 flex items-center justify-center shrink-0">
              <Check size={16} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-200">Filament created in Spoolman</p>
              <p className="text-xs text-green-600 dark:text-green-400">{createdFilamentName} · ID #{createdFilamentId}</p>
            </div>
          </div>

          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Now add spool(s) to inventory:</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Number of spools</label>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={() => setSpoolCount(c => Math.max(1, c - 1))}
                  className="w-9 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center font-bold text-lg"
                >−</button>
                <input
                  type="number" min="1" max="50"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                  value={spoolCount}
                  onChange={e => setSpoolCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <button
                  onClick={() => setSpoolCount(c => Math.min(50, c + 1))}
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
                value={spoolPrice}
                onChange={e => setSpoolPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Storage location</label>
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                value={spoolLocation}
                onChange={e => setSpoolLocation(e.target.value)}
              >
                <option value="">— None —</option>
                {(locationData?.storage_locations ?? []).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Comment</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                placeholder="Optional note"
                value={spoolComment}
                onChange={e => setSpoolComment(e.target.value)}
              />
            </div>
          </div>

          {spoolError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              {spoolError}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={handleCreateSpools}
              disabled={creatingSpools}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40"
            >
              {creatingSpools && <Loader2 size={14} className="animate-spin" />}
              {creatingSpools ? 'Creating spools…' : `Create ${spoolCount} spool${spoolCount !== 1 ? 's' : ''}`}
              {!creatingSpools && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Tag & Weigh ── */}
      {step === 4 && (
        <div className="space-y-5 py-2">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <Check size={24} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {createdSpools.length} spool{createdSpools.length !== 1 ? 's' : ''} created
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{createdFilamentName}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {createdSpools.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                  style={{ backgroundColor: normalizeHex(form.color_hex) }}
                />
                <span className="text-sm font-bold text-brand-600 dark:text-brand-400 w-10">#{s.id}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{s.filament?.name ?? createdFilamentName}</span>
              </div>
            ))}
          </div>

          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center">How would you like to finish?</p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleTagSpools}
              className="flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/30 hover:bg-brand-100 dark:hover:bg-brand-950/50 transition-all"
            >
              <Nfc size={26} className="text-brand-600 dark:text-brand-400" />
              <div className="text-center">
                <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">Tag & Weigh</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">NFC tag, QR label, and weigh via mobile</p>
              </div>
            </button>
            <button
              onClick={onClose}
              className="flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
            >
              <Package size={26} className="text-gray-400" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Done</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">Spools are in inventory, tag later</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
