import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSlicers, getPrinters,
  getPrinterTypes, createPrinterType, updatePrinterType, deletePrinterType,
  probePrinterType,
  getSettings,
  Slicer, PrinterType, Printer, PrinterCapabilityProbeResult,
} from '../api/client'
import { Plus, Trash2, Pencil, Check, X, Printer as PrinterIcon, ChevronLeft, ChevronDown, ChevronRight, Layers, LayoutGrid, DollarSign, Zap, Radio, Wifi, CircuitBoard, Info } from 'lucide-react'
import { useCurrency } from '../lib/currency'

function smoothScrollTo(container: HTMLElement, target: number, duration = 700) {
  const start = container.scrollTop
  const distance = target - start
  const startTime = performance.now()
  const ease = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
  function step(now: number) {
    const progress = Math.min((now - startTime) / duration, 1)
    container.scrollTop = start + distance * ease(progress)
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

const CAP_LABELS: Record<string, { label: string; desc: string }> = {
  has_afc:              { label: 'AFC',             desc: 'AFC Lite firmware mod — real-time slot data via lane mapping' },
  has_nfc_detect:       { label: 'NFC Detect',      desc: 'NFC-based filament identification — printer can read spool tags to identify loaded material' },
  has_mainsail_spoolman:{ label: 'Mainsail Spoolman', desc: 'Spoolman integration enabled in Moonraker / Mainsail' },
}

function CapCheckbox({ id, label, desc, checked, onChange }: { id: string; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group" title={desc}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 accent-brand-600" />
      <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-brand-600 select-none">{label}</span>
    </label>
  )
}

function PrinterTypeRow({ pt, slicers, printers, globalRate, isOpen, onToggle, onDelete }: {
  pt: PrinterType
  slicers: Slicer[]
  printers: Printer[]
  globalRate: string
  isOpen: boolean
  onToggle: () => void
  onDelete: (id: number) => void
}) {
  const qc = useQueryClient()
  const currSym = useCurrency()
  const [form, setForm] = useState({
    name: pt.name,
    slicer_id: pt.slicer_id,
    slot_count: pt.slot_count,
    hourly_rate: pt.hourly_rate != null ? String(pt.hourly_rate) : '',
    power_watts: pt.power_watts != null ? String(pt.power_watts) : '',
    has_afc: pt.has_afc,
    has_nfc_detect: pt.has_nfc_detect,
    has_mainsail_spoolman: pt.has_mainsail_spoolman,
  })
  const [probePrinterId, setProbePrinterId] = useState<number | ''>('')
  const [probeUrl, setProbeUrl] = useState('')
  const [probing, setProbing] = useState(false)
  const [probeResult, setProbeResult] = useState<PrinterCapabilityProbeResult | null>(null)

  // Reset form to saved state whenever the accordion closes
  useEffect(() => {
    if (!isOpen) {
      setForm({
        name: pt.name,
        slicer_id: pt.slicer_id,
        slot_count: pt.slot_count,
        hourly_rate: pt.hourly_rate != null ? String(pt.hourly_rate) : '',
        power_watts: pt.power_watts != null ? String(pt.power_watts) : '',
        has_afc: pt.has_afc,
        has_nfc_detect: pt.has_nfc_detect,
        has_mainsail_spoolman: pt.has_mainsail_spoolman,
      })
      setProbePrinterId('')
      setProbeUrl('')
      setProbeResult(null)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const typePrinters = printers.filter(p => p.printer_type_id === pt.id)

  const isDirty =
    form.name !== pt.name ||
    form.slicer_id !== pt.slicer_id ||
    form.slot_count !== pt.slot_count ||
    form.hourly_rate !== (pt.hourly_rate != null ? String(pt.hourly_rate) : '') ||
    form.power_watts !== (pt.power_watts != null ? String(pt.power_watts) : '') ||
    form.has_afc !== pt.has_afc ||
    form.has_nfc_detect !== pt.has_nfc_detect ||
    form.has_mainsail_spoolman !== pt.has_mainsail_spoolman

  const updateMutation = useMutation({
    mutationFn: () => updatePrinterType(pt.id, {
      ...form,
      hourly_rate: form.hourly_rate !== '' ? Number(form.hourly_rate) : null,
      power_watts: form.power_watts !== '' ? Number(form.power_watts) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['printer-types'] })
      qc.invalidateQueries({ queryKey: ['capability-check'] })
      onToggle()
    },
  })

  async function runProbe() {
    if (!probePrinterId && !probeUrl.trim()) return
    setProbing(true)
    setProbeResult(null)
    try {
      const result = probeUrl.trim()
        ? await probePrinterType(pt.id, undefined, probeUrl.trim())
        : await probePrinterType(pt.id, Number(probePrinterId))
      setProbeResult(result)
      setForm(f => ({ ...f, has_afc: result.has_afc, has_nfc_detect: result.has_nfc_detect, has_mainsail_spoolman: result.has_mainsail_spoolman }))
    } finally {
      setProbing(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header — always visible, click to expand/collapse */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${isOpen ? 'rounded-t-xl' : 'rounded-xl'}`}
        onClick={onToggle}
      >
        {isOpen
          ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
          : <ChevronRight size={14} className="text-gray-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium mb-1.5">{pt.name}</p>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
              <Layers size={10} />
              <span className="text-gray-400">Slicer:</span>
              {pt.slicer ? pt.slicer.name : <span className="italic text-gray-400">none</span>}
            </span>
            <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
              <LayoutGrid size={10} />
              {pt.slot_count} slot{pt.slot_count !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
              <DollarSign size={10} />
              {pt.hourly_rate != null ? `${currSym}${pt.hourly_rate.toFixed(2)}/hr` : <span className="italic text-gray-400">{currSym}{globalRate}/hr (default)</span>}
            </span>
            <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
              <Zap size={10} />
              {pt.power_watts != null ? `${pt.power_watts} W` : <span className="italic text-gray-400">150 W (default)</span>}
            </span>
            {pt.has_afc && (
              <span className="flex items-center gap-1 text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded px-2 py-0.5" title={CAP_LABELS.has_afc.desc}>
                <CircuitBoard size={10} />AFC
              </span>
            )}
            {pt.has_nfc_detect && (
              <span className="flex items-center gap-1 text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded px-2 py-0.5" title={CAP_LABELS.has_nfc_detect.desc}>
                <Wifi size={10} />NFC Detect
              </span>
            )}
            {pt.has_mainsail_spoolman && (
              <span className="flex items-center gap-1 text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded px-2 py-0.5" title={CAP_LABELS.has_mainsail_spoolman.desc}>
                <Radio size={10} />Mainsail Spoolman
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onToggle() }}
            className="text-gray-400 hover:text-brand-600 p-1"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(pt.id) }}
            className="text-red-400 hover:text-red-600 p-1"
            title="Delete printer type"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Accordion body — edit form */}
      {isOpen && (
        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
          {/* Top row: fields + save + discard */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="border rounded px-2 py-1 text-sm w-44 dark:bg-gray-700 dark:border-gray-600"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name"
            />
            <select
              className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"
              value={form.slicer_id ?? ''}
              onChange={e => setForm(f => ({ ...f, slicer_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">— no slicer —</option>
              {slicers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Slots</label>
              <input type="number" min="1" className="border rounded px-2 py-1 text-sm w-16 dark:bg-gray-700 dark:border-gray-600"
                value={form.slot_count}
                onChange={e => setForm(f => ({ ...f, slot_count: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">{currSym}/hr</label>
              <input type="number" min="0" step="0.01" className="border rounded px-2 py-1 text-sm w-20 dark:bg-gray-700 dark:border-gray-600"
                placeholder={`${currSym}${globalRate}`}
                value={form.hourly_rate}
                onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Avg. Power Draw</label>
              <input type="number" min="0" step="1" className="border rounded px-2 py-1 text-sm w-20 dark:bg-gray-700 dark:border-gray-600"
                placeholder="150"
                value={form.power_watts}
                onChange={e => setForm(f => ({ ...f, power_watts: e.target.value }))}
              />
              <span className="text-xs text-gray-500">W</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => updateMutation.mutate()}
                disabled={!form.name || updateMutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded font-medium transition-colors disabled:opacity-40 ${
                  isDirty && form.name
                    ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-default'
                }`}
              >
                <Check size={13} />
                {updateMutation.isPending ? 'Saving…' : isDirty ? 'Save changes' : 'No changes'}
              </button>
              <button onClick={onToggle} className="text-gray-400 hover:text-gray-600" title="Discard changes">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Capabilities */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 px-3 py-2.5 space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Printer Capabilities</p>
            <div className="flex flex-wrap gap-4">
              <CapCheckbox id="afc" label="AFC Lite" desc={CAP_LABELS.has_afc.desc}
                checked={form.has_afc} onChange={v => setForm(f => ({ ...f, has_afc: v }))} />
              <CapCheckbox id="nfc" label="NFC Detect" desc={CAP_LABELS.has_nfc_detect.desc}
                checked={form.has_nfc_detect} onChange={v => setForm(f => ({ ...f, has_nfc_detect: v }))} />
              <CapCheckbox id="sm" label="Mainsail Spoolman" desc={CAP_LABELS.has_mainsail_spoolman.desc}
                checked={form.has_mainsail_spoolman} onChange={v => setForm(f => ({ ...f, has_mainsail_spoolman: v }))} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t dark:border-gray-600">
              {typePrinters.length > 0 && (
                <select
                  className="border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 max-w-48"
                  value={probePrinterId}
                  onChange={e => { setProbePrinterId(e.target.value ? Number(e.target.value) : ''); setProbeUrl(''); setProbeResult(null) }}
                >
                  <option value="">Select printer to probe…</option>
                  {typePrinters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {typePrinters.length > 0 && <span className="text-xs text-gray-400">or</span>}
              <input
                type="text"
                className="border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 w-36"
                placeholder="IP / URL to probe"
                value={probeUrl}
                onChange={e => { setProbeUrl(e.target.value); setProbePrinterId(''); setProbeResult(null) }}
              />
              <button
                onClick={runProbe}
                disabled={(!probePrinterId && !probeUrl.trim()) || probing}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded"
              >
                <Radio size={11} />
                {probing ? 'Probing…' : 'Probe'}
              </button>
              {probeResult && (
                <span className="text-xs text-green-600 dark:text-green-400">✓ Capabilities updated from probe</span>
              )}
            </div>
          </div>

          {/* Why capabilities matter */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-3 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Info size={13} className="text-blue-500 dark:text-blue-400 shrink-0" />
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Why these settings matter</p>
            </div>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
              These three flags tell 3DMRP what each printer type is actually capable of. They shape every stage of the job handoff — from how filament slots are verified before a print starts, to how inventory is updated once it finishes. An incorrectly configured type means features are silently unavailable, or the system makes wrong assumptions about your hardware.
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-0.5">AFC Lite</p>
                <p className="text-xs text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                  Marks this type as having an automated multi-filament system. When enabled, 3DMRP unlocks lane coordination during job preparation — it reads which lanes are currently loaded, verifies the right materials are staged for the job, and walks you through any mismatches before the print starts. Without this flag, the printer is treated as single-filament regardless of its physical setup, and none of the multi-slot coordination features are offered.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-0.5">NFC Detect</p>
                <p className="text-xs text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                  Marks this type as being able to identify filament spools by reading their embedded NFC tags. During job setup, 3DMRP can automatically recognise what's physically loaded in each slot and compare it against what the job requires — no manual slot confirmation needed. Without this flag, you confirm slot contents by hand before every run, and any misloads are caught only if you notice them yourself.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-0.5">Mainsail Spoolman</p>
                <p className="text-xs text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                  Marks this type as having Spoolman wired into Moonraker. After a job completes, 3DMRP can report consumed filament weight back to Spoolman automatically, keeping your spool inventory accurate without any manual entry. Without this flag, weight tracking after each run is entirely on you.
                </p>
              </div>
            </div>
            <p className="text-xs text-blue-600/70 dark:text-blue-400/70 italic pt-0.5">
              Use the Probe button above to detect these automatically from a live printer, or set them manually if you already know your setup.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PrinterTypes() {
  const qc = useQueryClient()
  const currSym = useCurrency()
  const { data: slicers = [] } = useQuery({ queryKey: ['slicers'], queryFn: getSlicers })
  const { data: printerTypes = [] } = useQuery({ queryKey: ['printer-types'], queryFn: getPrinterTypes })
  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: getPrinters })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const globalRate = settings?.machine_hourly_rate ?? '2.50'
  const [expanded, setExpanded] = useState<number | null>(null)
  const [ptForm, setPtForm] = useState({ name: '', slicer_id: null as number | null, slot_count: 1, hourly_rate: '', power_watts: '' })
  const [showPtForm, setShowPtForm] = useState(false)

  function toggle(id: number) {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (next !== null) {
      setTimeout(() => {
        const el = document.getElementById(`pt-${next}`)
        const main = el?.closest('main') as HTMLElement | null
        if (el && main) {
          const top = main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top - 24
          smoothScrollTo(main, top)
        }
      }, 50)
    }
  }

  const createPtMutation = useMutation({
    mutationFn: () => createPrinterType({ ...ptForm, hourly_rate: ptForm.hourly_rate !== '' ? Number(ptForm.hourly_rate) : null, power_watts: ptForm.power_watts !== '' ? Number(ptForm.power_watts) : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['printer-types'] })
      setPtForm({ name: '', slicer_id: null, slot_count: 1, hourly_rate: '', power_watts: '' })
      setShowPtForm(false)
    },
  })

  const deletePtMutation = useMutation({
    mutationFn: (id: number) => deletePrinterType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['printer-types'] }),
  })

  return (
    <div className="p-6 space-y-5">
      <div>
        <Link to="/settings" className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-600 mb-3">
          <ChevronLeft size={14} /> Settings
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <PrinterIcon size={22} /> Printer Types
          </h1>
          <button
            onClick={() => setShowPtForm(v => !v)}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={15} /> Add Printer Type
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {showPtForm && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 flex items-center gap-2 flex-wrap">
            <input
              className="border rounded px-2 py-1 text-sm w-44 dark:bg-gray-700 dark:border-gray-600"
              placeholder="Name *"
              autoFocus
              value={ptForm.name}
              onChange={e => setPtForm(f => ({ ...f, name: e.target.value }))}
            />
            <select
              className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"
              value={ptForm.slicer_id ?? ''}
              onChange={e => setPtForm(f => ({ ...f, slicer_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">— no slicer —</option>
              {slicers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Slots</label>
              <input type="number" min="1"
                className="border rounded px-2 py-1 text-sm w-16 dark:bg-gray-700 dark:border-gray-600"
                value={ptForm.slot_count}
                onChange={e => setPtForm(f => ({ ...f, slot_count: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">{currSym}/hr</label>
              <input type="number" min="0" step="0.01"
                className="border rounded px-2 py-1 text-sm w-20 dark:bg-gray-700 dark:border-gray-600"
                placeholder={`${currSym}${globalRate}`}
                value={ptForm.hourly_rate}
                onChange={e => setPtForm(f => ({ ...f, hourly_rate: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Avg. Power Draw</label>
              <input type="number" min="0" step="1"
                className="border rounded px-2 py-1 text-sm w-20 dark:bg-gray-700 dark:border-gray-600"
                placeholder="W"
                value={ptForm.power_watts}
                onChange={e => setPtForm(f => ({ ...f, power_watts: e.target.value }))}
              />
            </div>
            <button onClick={() => createPtMutation.mutate()} disabled={!ptForm.name || createPtMutation.isPending}
              className="text-green-600 hover:text-green-700 disabled:opacity-40">
              <Check size={15} />
            </button>
            <button onClick={() => setShowPtForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={15} />
            </button>
          </div>
        )}
        {printerTypes.length === 0 && !showPtForm ? (
          <p className="py-6 text-sm text-gray-400 italic">No printer types configured yet.</p>
        ) : (
          printerTypes.map(pt => (
            <div key={pt.id} id={`pt-${pt.id}`}>
              <PrinterTypeRow
                pt={pt}
                slicers={slicers}
                printers={printers}
                globalRate={globalRate}
                isOpen={expanded === pt.id}
                onToggle={() => toggle(pt.id)}
                onDelete={id => { if (confirm(`Remove printer type "${pt.name}"?`)) deletePtMutation.mutate(id) }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
