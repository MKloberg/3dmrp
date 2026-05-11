import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSlicers, createSlicer, updateSlicer, deleteSlicer, Slicer } from '../api/client'
import { Plus, Trash2, Pencil, Check, X, ChevronLeft } from 'lucide-react'

function SlicerRow({ slicer, onDelete }: { slicer: Slicer; onDelete: (id: number) => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: slicer.name, executable_path: slicer.executable_path })

  const updateMutation = useMutation({
    mutationFn: () => updateSlicer(slicer.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['slicers'] }); setEditing(false) },
  })

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b dark:border-gray-700 last:border-0">
        <input
          className="border rounded px-2 py-1 text-sm w-44 dark:bg-gray-700 dark:border-gray-600"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Name"
        />
        <input
          className="flex-1 border rounded px-2 py-1 text-sm font-mono dark:bg-gray-700 dark:border-gray-600"
          value={form.executable_path}
          onChange={e => setForm(f => ({ ...f, executable_path: e.target.value }))}
          placeholder="Executable path"
        />
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
    <div className="flex items-center gap-3 px-4 py-2.5 border-b dark:border-gray-700 last:border-0 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{slicer.name}</p>
        {slicer.executable_path
          ? <p className="text-xs text-gray-400 font-mono truncate">{slicer.executable_path}</p>
          : <p className="text-xs text-gray-300 dark:text-gray-600 italic">No executable path set</p>
        }
      </div>
      <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100">
        <Pencil size={13} />
      </button>
      <button onClick={() => onDelete(slicer.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export default function Slicers() {
  const qc = useQueryClient()
  const { data: slicers = [] } = useQuery({ queryKey: ['slicers'], queryFn: getSlicers })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', executable_path: '' })

  const createMutation = useMutation({
    mutationFn: () => createSlicer(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slicers'] })
      setForm({ name: '', executable_path: '' })
      setShowForm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSlicer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slicers'] }),
  })

  return (
    <div className="p-6 space-y-5">
      <div>
        <Link to="/settings" className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-600 mb-3">
          <ChevronLeft size={14} /> Settings
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Slicers</h1>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={15} /> Add Slicer
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {showForm && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b dark:border-gray-700">
            <input
              className="border rounded px-2 py-1 text-sm w-44 dark:bg-gray-700 dark:border-gray-600"
              placeholder="Name *"
              value={form.name}
              autoFocus
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && form.name && createMutation.mutate()}
            />
            <input
              className="flex-1 border rounded px-2 py-1 text-sm font-mono dark:bg-gray-700 dark:border-gray-600"
              placeholder="Executable path (optional)"
              value={form.executable_path}
              onChange={e => setForm(f => ({ ...f, executable_path: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && form.name && createMutation.mutate()}
            />
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || createMutation.isPending}
              className="text-green-600 hover:text-green-700 disabled:opacity-40"
            >
              <Check size={15} />
            </button>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={15} />
            </button>
          </div>
        )}
        {slicers.length === 0 && !showForm ? (
          <p className="px-4 py-6 text-sm text-gray-400 italic">No slicers configured yet. Add a slicer to associate it with a printer type.</p>
        ) : (
          slicers.map(s => (
            <SlicerRow key={s.id} slicer={s} onDelete={id => {
              if (confirm(`Remove slicer "${s.name}"?`)) deleteMutation.mutate(id)
            }} />
          ))
        )}
      </div>
    </div>
  )
}
