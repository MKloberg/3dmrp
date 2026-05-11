import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSlicers,
  getPrinterTypes, createPrinterType, updatePrinterType, deletePrinterType,
  Slicer, PrinterType,
} from '../api/client'
import { Plus, Trash2, Pencil, Check, X, Cpu, ChevronLeft } from 'lucide-react'

function PrinterTypeRow({ pt, slicers, onDelete }: { pt: PrinterType; slicers: Slicer[]; onDelete: (id: number) => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: pt.name, slicer_id: pt.slicer_id, slot_count: pt.slot_count })

  const updateMutation = useMutation({
    mutationFn: () => updatePrinterType(pt.id, form),
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
    <div className="flex items-center gap-3 py-2 border-b dark:border-gray-700 last:border-0 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{pt.name}</p>
        <p className="text-xs text-gray-400">
          {pt.slicer ? pt.slicer.name : <span className="italic">no slicer</span>}
          {' · '}
          {pt.slot_count} slot{pt.slot_count !== 1 ? 's' : ''}
        </p>
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
  const [ptForm, setPtForm] = useState({ name: '', slicer_id: null as number | null, slot_count: 1 })
  const [showPtForm, setShowPtForm] = useState(false)

  const createPtMutation = useMutation({
    mutationFn: () => createPrinterType(ptForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['printer-types'] })
      setPtForm({ name: '', slicer_id: null, slot_count: 1 })
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
          <Cpu size={22} /> Printer Types
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
            <PrinterTypeRow key={pt.id} pt={pt} slicers={slicers} onDelete={id => {
              if (confirm(`Remove printer type "${pt.name}"?`)) deletePtMutation.mutate(id)
            }} />
          ))
        )}
      </div>
    </div>
  )
}
