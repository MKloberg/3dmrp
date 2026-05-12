import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSlicers,
  getPrinterTypes, createPrinterType, updatePrinterType, deletePrinterType,
  getSettings,
  Slicer, PrinterType,
} from '../api/client'
import { Plus, Trash2, Pencil, Check, X, Printer, ChevronLeft, Layers, LayoutGrid, DollarSign, Zap } from 'lucide-react'

function PrinterTypeRow({ pt, slicers, globalRate, onDelete }: { pt: PrinterType; slicers: Slicer[]; globalRate: string; onDelete: (id: number) => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: pt.name, slicer_id: pt.slicer_id, slot_count: pt.slot_count, hourly_rate: pt.hourly_rate != null ? String(pt.hourly_rate) : '', power_watts: pt.power_watts != null ? String(pt.power_watts) : '' })

  const updateMutation = useMutation({
    mutationFn: () => updatePrinterType(pt.id, { ...form, hourly_rate: form.hourly_rate !== '' ? Number(form.hourly_rate) : null, power_watts: form.power_watts !== '' ? Number(form.power_watts) : null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['printer-types'] }); setEditing(false) },
  })

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2 border-b dark:border-gray-700 last:border-0 flex-wrap">
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
          <input
            type="number" min="1" className="border rounded px-2 py-1 text-sm w-16 dark:bg-gray-700 dark:border-gray-600"
            value={form.slot_count}
            onChange={e => setForm(f => ({ ...f, slot_count: Math.max(1, parseInt(e.target.value) || 1) }))}
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">$/hr</label>
          <input
            type="number" min="0" step="0.01" className="border rounded px-2 py-1 text-sm w-20 dark:bg-gray-700 dark:border-gray-600"
            placeholder={`$${globalRate}`}
            value={form.hourly_rate}
            onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Avg. Power Draw</label>
          <input
            type="number" min="0" step="1" className="border rounded px-2 py-1 text-sm w-20 dark:bg-gray-700 dark:border-gray-600"
            placeholder="150"
            value={form.power_watts}
            onChange={e => setForm(f => ({ ...f, power_watts: e.target.value }))}
          />
          <span className="text-xs text-gray-500">W</span>
        </div>
        <button onClick={() => updateMutation.mutate()} disabled={!form.name || updateMutation.isPending}
          className="text-green-600 hover:text-green-700 disabled:opacity-40">
          <Check size={15} />
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <X size={15} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b dark:border-gray-700 last:border-0 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium mb-1.5">{pt.name}</p>
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
            <Layers size={10} />
            <span className="text-gray-400">Default Slicer:</span>
            {pt.slicer ? pt.slicer.name : <span className="italic text-gray-400">none</span>}
          </span>
          <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
            <LayoutGrid size={10} />
            {pt.slot_count} slot{pt.slot_count !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
            <DollarSign size={10} />
            {pt.hourly_rate != null ? `$${pt.hourly_rate.toFixed(2)}/hr rate` : <span className="italic text-gray-400">${globalRate}/hr rate (default)</span>}
          </span>
          <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-0.5">
            <Zap size={10} />
            {pt.power_watts != null ? `${pt.power_watts} W` : <span className="italic text-gray-400">150 W (default)</span>}
          </span>
        </div>
      </div>
      <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100">
        <Pencil size={13} />
      </button>
      <button onClick={() => onDelete(pt.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export default function PrinterTypes() {
  const qc = useQueryClient()
  const { data: slicers = [] } = useQuery({ queryKey: ['slicers'], queryFn: getSlicers })
  const { data: printerTypes = [] } = useQuery({ queryKey: ['printer-types'], queryFn: getPrinterTypes })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const globalRate = settings?.machine_hourly_rate ?? '2.50'
  const [ptForm, setPtForm] = useState({ name: '', slicer_id: null as number | null, slot_count: 1, hourly_rate: '', power_watts: '' })
  const [showPtForm, setShowPtForm] = useState(false)

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
          <Printer size={22} /> Printer Types
        </h1>
        <button
          onClick={() => setShowPtForm(v => !v)}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          <Plus size={15} /> Add Printer Type
        </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4">
        {showPtForm && (
          <div className="flex items-center gap-2 py-2.5 border-b dark:border-gray-700 flex-wrap">
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
              <input
                type="number" min="1"
                className="border rounded px-2 py-1 text-sm w-16 dark:bg-gray-700 dark:border-gray-600"
                value={ptForm.slot_count}
                onChange={e => setPtForm(f => ({ ...f, slot_count: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">$/hr</label>
              <input
                type="number" min="0" step="0.01"
                className="border rounded px-2 py-1 text-sm w-20 dark:bg-gray-700 dark:border-gray-600"
                placeholder={`$${globalRate}`}
                value={ptForm.hourly_rate}
                onChange={e => setPtForm(f => ({ ...f, hourly_rate: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Avg. Power Draw</label>
              <input
                type="number" min="0" step="1"
                className="border rounded px-2 py-1 text-sm w-20 dark:bg-gray-700 dark:border-gray-600"
                placeholder="W"
                value={ptForm.power_watts}
                onChange={e => setPtForm(f => ({ ...f, power_watts: e.target.value }))}
              />
            </div>
            <button
              onClick={() => createPtMutation.mutate()}
              disabled={!ptForm.name || createPtMutation.isPending}
              className="text-green-600 hover:text-green-700 disabled:opacity-40"
            >
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
            <PrinterTypeRow key={pt.id} pt={pt} slicers={slicers} globalRate={globalRate} onDelete={id => {
              if (confirm(`Remove printer type "${pt.name}"?`)) deletePtMutation.mutate(id)
            }} />
          ))
        )}
      </div>
    </div>
  )
}
