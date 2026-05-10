import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getModels, createModel, updateModel, deleteModel,
  getFilaments, getPrinters, addFilamentReq, updateFilamentReq, removeFilamentReq, reorderFilaments,
  uploadModelImage, deleteModelImage, setSlicerFile, deleteSlicerFile, openInSlicer,
  PrintModel, FilamentSpec, Printer,
} from '../api/client'
import Modal from '../components/Modal'
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check, X, Upload, ShoppingCart, Play, Scissors, GripVertical } from 'lucide-react'

function FilamentDot({ hex }: { hex: string }) {
  return <span className="inline-block w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0" style={{ backgroundColor: hex }} />
}

function ModelDetail({ model, filaments, printers }: { model: PrintModel; filaments: FilamentSpec[]; printers: Printer[] }) {
  const qc = useQueryClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [editingReq, setEditingReq] = useState<{ reqId: number; specId: string; grams: string } | null>(null)
  const [reqForm, setReqForm] = useState<{ specId: string; grams: string } | null>(null)
  const [slicerPaths, setSlicerPaths] = useState<Record<number, string>>(() =>
    Object.fromEntries(model.slicer_files.map(sf => [sf.printer_id, sf.file_path]))
  )
  const [launchError, setLaunchError] = useState<string | null>(null)
  const dragSrc = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const reorderMutation = useMutation({
    mutationFn: (items: { id: number; sort_order: number }[]) =>
      reorderFilaments(model.id, items),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ['models'] })
      const previous = qc.getQueryData<PrintModel[]>(['models'])
      qc.setQueryData<PrintModel[]>(['models'], (old = []) =>
        old.map(m => {
          if (m.id !== model.id) return m
          const sorted = [...m.filament_requirements].sort((a, b) => {
            const ai = items.find(x => x.id === a.id)?.sort_order ?? 0
            const bi = items.find(x => x.id === b.id)?.sort_order ?? 0
            return ai - bi
          })
          return { ...m, filament_requirements: sorted }
        })
      )
      return { previous }
    },
    onError: (_err, _items, context) => {
      if (context?.previous) qc.setQueryData(['models'], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })

  function clearDrag() { dragSrc.current = null; setDragIndex(null); setOverIndex(null) }

  function handleDrop(dropIndex: number) {
    const from = dragSrc.current
    if (from === null || from === dropIndex) { clearDrag(); return }
    const reqs = [...model.filament_requirements]
    const [moved] = reqs.splice(from, 1)
    reqs.splice(dropIndex, 0, moved)
    reorderMutation.mutate(reqs.map((r, i) => ({ id: r.id, sort_order: i })))
    clearDrag()
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      await uploadModelImage(model.id, file)
      qc.invalidateQueries({ queryKey: ['models'] })
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: number) => deleteModelImage(model.id, imageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })

  const removeReqMutation = useMutation({
    mutationFn: (reqId: number) => removeFilamentReq(model.id, reqId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })

  const updateReqMutation = useMutation({
    mutationFn: ({ reqId, grams, filament_spec_id }: { reqId: number; grams: number; filament_spec_id: number }) =>
      updateFilamentReq(model.id, reqId, { grams, filament_spec_id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setEditingReq(null) },
  })

  const addReqMutation = useMutation({
    mutationFn: (data: { filament_spec_id: number; grams: number }) =>
      addFilamentReq(model.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setReqForm(null) },
  })

  const saveSlicerFileMutation = useMutation({
    mutationFn: ({ printerId, filePath }: { printerId: number; filePath: string }) =>
      setSlicerFile(model.id, printerId, filePath),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })

  const deleteSlicerFileMutation = useMutation({
    mutationFn: (printerId: number) => deleteSlicerFile(model.id, printerId),
    onSuccess: (_data, printerId) => {
      setSlicerPaths(p => { const n = { ...p }; delete n[printerId]; return n })
      qc.invalidateQueries({ queryKey: ['models'] })
    },
  })

  async function handleLaunch(printerId: number) {
    setLaunchError(null)
    try {
      await openInSlicer(model.id, printerId)
    } catch (e: unknown) {
      setLaunchError(e instanceof Error ? e.message : 'Failed to open slicer')
    }
  }

  function confirmEdit(reqId: number, specId: string, gramsStr: string) {
    const g = parseFloat(gramsStr)
    if (!isNaN(g) && g > 0 && specId) updateReqMutation.mutate({ reqId, grams: g, filament_spec_id: Number(specId) })
  }

  return (
    <div className="border-t dark:border-gray-700 px-4 py-3 space-y-4">
      {model.notes && <p className="text-sm text-gray-500 dark:text-gray-400 italic">{model.notes}</p>}

      {/* Slicers */}
      {printers.some(p => p.slicer_name || p.slicer_executable) && (
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Scissors size={11} /> Slicers
          </p>
          {launchError && (
            <p className="text-xs text-red-500 mb-2">{launchError}</p>
          )}
          <div className="space-y-2">
            {printers.filter(p => p.slicer_name || p.slicer_executable).map(printer => {
              const savedPath = model.slicer_files.find(sf => sf.printer_id === printer.id)?.file_path ?? ''
              const currentPath = slicerPaths[printer.id] ?? savedPath
              const isDirty = currentPath !== savedPath
              return (
                <div key={printer.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-28 shrink-0 truncate" title={printer.name}>
                    {printer.slicer_name || printer.name}
                  </span>
                  <input
                    className="flex-1 border rounded px-2 py-1 text-xs font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    placeholder="Path to .3mf file…"
                    value={currentPath}
                    onChange={e => setSlicerPaths(p => ({ ...p, [printer.id]: e.target.value }))}
                  />
                  {isDirty && currentPath && (
                    <button
                      onClick={() => saveSlicerFileMutation.mutate({ printerId: printer.id, filePath: currentPath })}
                      disabled={saveSlicerFileMutation.isPending}
                      className="text-xs bg-brand-600 text-white px-2 py-1 rounded disabled:opacity-50 shrink-0"
                    >
                      Save
                    </button>
                  )}
                  {!isDirty && savedPath && (
                    <button
                      onClick={() => handleLaunch(printer.id)}
                      className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded shrink-0"
                      title={`Open in ${printer.slicer_name ?? 'slicer'}`}
                    >
                      <Play size={10} /> Open
                    </button>
                  )}
                  {savedPath && (
                    <button
                      onClick={() => deleteSlicerFileMutation.mutate(printer.id)}
                      className="text-gray-400 hover:text-red-500 shrink-0"
                      title="Clear file path"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Images */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Images</p>
        <div className="flex flex-wrap gap-2 items-end">
          {model.images.map(img => (
            <div key={img.id} className="relative group">
              <img
                src={`/api/models/${model.id}/images/${img.id}`}
                alt=""
                className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
              />
              <button
                onClick={() => deleteImageMutation.mutate(img.id)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={uploadingImage}
            className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-brand-600 hover:border-brand-400 transition-colors disabled:opacity-50"
          >
            {uploadingImage
              ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <><Upload size={16} /><span className="text-xs">Add</span></>
            }
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>
      </div>

      {/* Filaments */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Filaments</p>
        <div className="space-y-1.5">
          {model.filament_requirements.map((req, index) => {
            const isEditing = editingReq?.reqId === req.id
            const isDragOver = overIndex === index && dragIndex !== index
            return (
              <div
                key={req.id}
                draggable={!isEditing}
                onDragStart={!isEditing ? () => { dragSrc.current = index; setDragIndex(index); setOverIndex(null) } : undefined}
                onDragOver={e => { e.preventDefault(); if (!isEditing) setOverIndex(index) }}
                onDrop={() => handleDrop(index)}
                onDragEnd={clearDrag}
                className={`rounded transition-colors ${isDragOver ? 'bg-brand-50 dark:bg-brand-900/20 ring-1 ring-inset ring-brand-400' : ''} ${dragIndex === index ? 'opacity-40' : ''}`}
              >
                {isEditing && editingReq ? (
                  <div className="flex items-center gap-2 py-1">
                    <span className="text-xs text-gray-400 w-5 shrink-0 select-none text-right">{index + 1}.</span>
                    <select
                      autoFocus
                      className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      value={editingReq.specId}
                      onChange={e => setEditingReq({ ...editingReq, specId: e.target.value })}
                    >
                      <option value="">— select —</option>
                      {filaments.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      className="w-16 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600"
                      value={editingReq.grams}
                      onChange={e => setEditingReq({ ...editingReq, grams: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmEdit(req.id, editingReq.specId, editingReq.grams)
                        if (e.key === 'Escape') setEditingReq(null)
                      }}
                    />
                    <span className="text-xs text-gray-500 shrink-0">g</span>
                    <button
                      onClick={() => confirmEdit(req.id, editingReq.specId, editingReq.grams)}
                      disabled={!editingReq.specId || updateReqMutation.isPending}
                      className="text-green-500 hover:text-green-600 disabled:opacity-40"
                    >
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditingReq(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-sm py-0.5">
                    <div className="flex items-center gap-2">
                      <GripVertical size={12} className="text-gray-300 dark:text-gray-600 cursor-grab shrink-0" />
                      <span className="text-xs text-gray-400 w-4 shrink-0 select-none text-right">{index + 1}.</span>
                      <FilamentDot hex={req.filament_spec.color_hex} />
                      <span>{req.filament_spec.material} — {req.filament_spec.color_name}</span>
                      {req.filament_spec.brand && <span className="text-gray-400 text-xs">{req.filament_spec.brand}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{req.grams}g</span>
                      {req.filament_spec.purchase_url && (
                        <a href={req.filament_spec.purchase_url} target="_blank" rel="noopener noreferrer"
                          title="Order" className="text-gray-400 hover:text-green-600">
                          <ShoppingCart size={13} />
                        </a>
                      )}
                      <button
                        onClick={() => setEditingReq({ reqId: req.id, specId: String(req.filament_spec_id), grams: String(req.grams) })}
                        className="text-gray-400 hover:text-brand-600"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => removeReqMutation.mutate(req.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {reqForm !== null ? (
          <div className="flex items-end gap-2 pt-2">
            <div className="flex-1">
              <select
                className="w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={reqForm.specId}
                onChange={e => setReqForm(r => r && { ...r, specId: e.target.value })}
              >
                <option value="">— select filament —</option>
                {filaments.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="g"
                className="w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={reqForm.grams}
                onChange={e => setReqForm(r => r && { ...r, grams: e.target.value })}
              />
            </div>
            <button
              className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
              disabled={!reqForm.specId || !reqForm.grams || addReqMutation.isPending}
              onClick={() => addReqMutation.mutate({
                filament_spec_id: Number(reqForm.specId),
                grams: Number(reqForm.grams),
              })}
            >Save</button>
            <button className="text-sm text-gray-400 px-1" onClick={() => setReqForm(null)}>Cancel</button>
          </div>
        ) : (
          <button
            className="mt-2 text-sm text-brand-600 hover:underline flex items-center gap-1"
            onClick={() => setReqForm({ specId: '', grams: '' })}
          >
            <Plus size={13} /> Add filament
          </button>
        )}
      </div>
    </div>
  )
}

export default function Models() {
  const qc = useQueryClient()
  const { data: models = [] } = useQuery({ queryKey: ['models'], queryFn: getModels })
  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })
  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: getPrinters })

  const [expanded, setExpanded] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PrintModel | null>(null)
  const [form, setForm] = useState({ name: '', description: '', notes: '' })

  const saveMutation = useMutation({
    mutationFn: () => editing ? updateModel(editing.id, form) : createModel(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); closeForm() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteModel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', notes: '' })
    setShowForm(true)
  }

  function openEdit(m: PrintModel) {
    setEditing(m)
    setForm({ name: m.name, description: m.description, notes: m.notes })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null) }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Print Models</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          <Plus size={15} /> Add Model
        </button>
      </div>

      {models.length === 0 && (
        <p className="text-sm text-gray-400 italic">No models yet. Add your first print model.</p>
      )}

      <div className="space-y-2">
        {models.map(model => {
          const isOpen = expanded === model.id
          const firstImage = model.images[0]
          return (
            <div key={model.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30"
                onClick={() => setExpanded(isOpen ? null : model.id)}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                  {firstImage ? (
                    <img
                      src={`/api/models/${model.id}/images/${firstImage.id}`}
                      alt=""
                      className="w-8 h-8 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0" />
                  )}
                  <span className="font-medium">{model.name}</span>
                  {model.description && <span className="text-sm text-gray-400 hidden sm:inline">— {model.description}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{model.filament_requirements.length} filament{model.filament_requirements.length !== 1 ? 's' : ''}</span>
                  <button onClick={e => { e.stopPropagation(); openEdit(model) }} className="text-xs text-brand-600 hover:underline px-2">Edit</button>
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm('Delete this model?')) deleteMutation.mutate(model.id) }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {isOpen && <ModelDetail model={model} filaments={filaments} printers={printers} />}
            </div>
          )
        })}
      </div>

      {showForm && (
        <Modal title={editing ? 'Edit Model' : 'New Model'} onClose={closeForm}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Name *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Description</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancel</button>
              <button
                disabled={!form.name || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
