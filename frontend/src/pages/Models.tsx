import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import {
  getModels, createModel, updateModel, deleteModel,
  getFilaments, getPrinters, addFilamentReq, updateFilamentReq, removeFilamentReq, reorderFilaments,
  uploadModelImage, deleteModelImage, cropModelImage, setSlicerFile, deleteSlicerFile, openInSlicer,
  getTags, createTag, updateTag, deleteTag, addTagToModel, removeTagFromModel,
  PrintModel, FilamentSpec, Printer, Tag,
} from '../api/client'
import Modal from '../components/Modal'
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check, X, Upload, ShoppingCart, Play, Scissors, GripVertical, Tag as TagIcon, Settings2, Crop as CropIcon, Download } from 'lucide-react'

function CropModal({
  modelId,
  imageId,
  imageUrl,
  onClose,
  onDone,
}: {
  modelId: number
  imageId: number
  imageUrl: string
  onClose: () => void
  onDone: () => void
}) {
  const qc = useQueryClient()
  const imgRef = useRef<HTMLImageElement>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [saving, setSaving] = useState(false)

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 })
    setCompletedCrop({ unit: 'px', x: 0, y: 0, width, height })
  }

  async function handleSave() {
    if (!completedCrop?.width || !completedCrop?.height || !imgRef.current) return
    const { width, height } = imgRef.current
    const box = {
      x: completedCrop.x / width,
      y: completedCrop.y / height,
      width: completedCrop.width / width,
      height: completedCrop.height / height,
    }
    setSaving(true)
    try {
      await cropModelImage(modelId, imageId, box)
      await qc.refetchQueries({ queryKey: ['models'] })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Crop Image" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex justify-center bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
          <ReactCrop
            crop={crop}
            onChange={(_, pct) => setCrop(pct)}
            onComplete={c => setCompletedCrop(c)}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Crop"
              onLoad={onImageLoad}
              className="max-h-[60vh] max-w-full"
            />
          </ReactCrop>
        </div>
        <p className="text-xs text-gray-400 text-center">Drag to adjust the crop area. The original image will be replaced.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!completedCrop?.width || saving}
            className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Apply Crop'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const TAG_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#14b8a6','#3b82f6','#64748b',
]

function TagPill({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white shrink-0"
      style={{ backgroundColor: tag.color_hex }}
    >
      {tag.name}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove() }} className="opacity-70 hover:opacity-100">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

function FilamentDot({ hex }: { hex: string }) {
  return <span className="inline-block w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0" style={{ backgroundColor: hex }} />
}

function ModelDetail({ model, filaments, printers, allTags }: { model: PrintModel; filaments: FilamentSpec[]; printers: Printer[]; allTags: Tag[] }) {
  const qc = useQueryClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [cropTarget, setCropTarget] = useState<{ imageId: number; url: string } | null>(null)
  const [editingReq, setEditingReq] = useState<{ reqId: number; specId: string; grams: string } | null>(null)
  const [reqForm, setReqForm] = useState<{ specId: string; grams: string } | null>(null)
  const [slicerPaths, setSlicerPaths] = useState<Record<number, string>>(() =>
    Object.fromEntries(model.slicer_files.map(sf => [sf.printer_id, sf.file_path]))
  )
  const [launchError, setLaunchError] = useState<string | null>(null)

  const addTagMutation = useMutation({
    mutationFn: (tagId: number) => addTagToModel(tagId, model.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })
  const removeTagMutation = useMutation({
    mutationFn: (tagId: number) => removeTagFromModel(tagId, model.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  })
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

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {model.tags.map(tag => (
          <TagPill key={tag.id} tag={tag} onRemove={() => removeTagMutation.mutate(tag.id)} />
        ))}
        {allTags.filter(t => !model.tags.some(mt => mt.id === t.id)).length > 0 && (
          <select
            className="text-xs border rounded-full px-2 py-0.5 text-gray-500 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-600 cursor-pointer"
            value=""
            onChange={e => { if (e.target.value) addTagMutation.mutate(Number(e.target.value)) }}
          >
            <option value="">+ Add tag</option>
            {allTags.filter(t => !model.tags.some(mt => mt.id === t.id)).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        {allTags.length === 0 && model.tags.length === 0 && (
          <span className="text-xs text-gray-400 italic">No tags yet — create some with the tag manager above.</span>
        )}
      </div>

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
                src={`/api/models/${model.id}/images/${img.id}?v=${new Date(img.created_at).getTime()}`}
                alt=""
                className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
              />
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={`/api/models/${model.id}/images/${img.id}`}
                  download={model.name}
                  onClick={e => e.stopPropagation()}
                  className="bg-black/60 text-white rounded-full p-0.5"
                  title="Download"
                >
                  <Download size={10} />
                </a>
                <button
                  onClick={() => setCropTarget({ imageId: img.id, url: `/api/models/${model.id}/images/${img.id}?v=${new Date(img.created_at).getTime()}` })}
                  className="bg-black/60 text-white rounded-full p-0.5"
                  title="Crop"
                >
                  <CropIcon size={10} />
                </button>
                <button
                  onClick={() => deleteImageMutation.mutate(img.id)}
                  className="bg-black/60 text-white rounded-full p-0.5"
                  title="Delete"
                >
                  <X size={10} />
                </button>
              </div>
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

      {cropTarget && (
        <CropModal
          modelId={model.id}
          imageId={cropTarget.imageId}
          imageUrl={cropTarget.url}
          onClose={() => setCropTarget(null)}
          onDone={() => setCropTarget(null)}
        />
      )}

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

function TagManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: getTags })
  const [form, setForm] = useState({ name: '', color_hex: TAG_COLORS[0] })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ name: '', color_hex: '' })

  const createMutation = useMutation({
    mutationFn: () => createTag(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); qc.invalidateQueries({ queryKey: ['models'] }); setForm({ name: '', color_hex: TAG_COLORS[0] }) },
  })
  const updateMutation = useMutation({
    mutationFn: () => updateTag(editingId!, editForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); qc.invalidateQueries({ queryKey: ['models'] }); setEditingId(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); qc.invalidateQueries({ queryKey: ['models'] }) },
  })

  return (
    <Modal title="Manage Tags" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-2">
          {tags.length === 0 && <p className="text-sm text-gray-400 italic">No tags yet.</p>}
          {tags.map(tag => (
            <div key={tag.id} className="flex items-center gap-2">
              {editingId === tag.id ? (
                <>
                  <div className="flex gap-1 flex-wrap">
                    {TAG_COLORS.map(c => (
                      <button key={c} onClick={() => setEditForm(f => ({ ...f, color_hex: c }))}
                        className={`w-5 h-5 rounded-full border-2 ${editForm.color_hex === c ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <input className="flex-1 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"
                    value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') updateMutation.mutate(); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus />
                  <button onClick={() => updateMutation.mutate()} disabled={!editForm.name} className="text-green-500 hover:text-green-600 disabled:opacity-40"><Check size={14} /></button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </>
              ) : (
                <>
                  <TagPill tag={tag} />
                  <button onClick={() => { setEditingId(tag.id); setEditForm({ name: tag.name, color_hex: tag.color_hex }) }}
                    className="text-gray-400 hover:text-brand-600 ml-auto"><Pencil size={12} /></button>
                  <button onClick={() => { if (confirm(`Delete tag "${tag.name}"?`)) deleteMutation.mutate(tag.id) }}
                    className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t dark:border-gray-700 pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">New tag</p>
          <div className="flex gap-1 flex-wrap">
            {TAG_COLORS.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color_hex: c }))}
                className={`w-5 h-5 rounded-full border-2 ${form.color_hex === c ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex gap-2">
            <input className="flex-1 border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
              placeholder="Tag name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && form.name) createMutation.mutate() }}
            />
            <button disabled={!form.name || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="bg-brand-600 text-white px-3 py-1.5 text-sm rounded-lg disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function Models() {
  const qc = useQueryClient()
  const { data: models = [] } = useQuery({ queryKey: ['models'], queryFn: getModels })
  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })
  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: getPrinters })
  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: getTags })

  const [expanded, setExpanded] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)
  const [filterTagIds, setFilterTagIds] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<PrintModel | null>(null)
  const [form, setForm] = useState({ name: '', description: '', notes: '' })

  function toggleFilterTag(id: number) {
    setFilterTagIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visibleModels = filterTagIds.size === 0
    ? models
    : models.filter(m => [...filterTagIds].every(tid => m.tags.some(t => t.id === tid)))

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTagManager(true)}
            className="flex items-center gap-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm px-3 py-2 rounded-lg"
          >
            <TagIcon size={14} /> Tags
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={15} /> Add Model
          </button>
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400">Filter:</span>
          {allTags.map(tag => (
            <button
              key={tag.id}
              onClick={() => toggleFilterTag(tag.id)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border-2 transition-all ${
                filterTagIds.has(tag.id)
                  ? 'text-white border-transparent'
                  : 'bg-transparent border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300'
              }`}
              style={filterTagIds.has(tag.id) ? { backgroundColor: tag.color_hex, borderColor: tag.color_hex } : {}}
            >
              {tag.name}
            </button>
          ))}
          {filterTagIds.size > 0 && (
            <button onClick={() => setFilterTagIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          )}
        </div>
      )}

      {visibleModels.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          {models.length === 0 ? 'No models yet. Add your first print model.' : 'No models match the selected tags.'}
        </p>
      )}

      <div className="space-y-2">
        {visibleModels.map(model => {
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
                      src={`/api/models/${model.id}/images/${firstImage.id}?v=${new Date(firstImage.created_at).getTime()}`}
                      alt=""
                      className="w-8 h-8 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0" />
                  )}
                  <span className="font-medium">{model.name}</span>
                  {model.description && <span className="text-sm text-gray-400 hidden sm:inline">— {model.description}</span>}
                  {model.tags.map(tag => <TagPill key={tag.id} tag={tag} />)}
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

              {isOpen && <ModelDetail model={model} filaments={filaments} printers={printers} allTags={allTags} />}
            </div>
          )
        })}
      </div>

      {showTagManager && <TagManager onClose={() => setShowTagManager(false)} />}

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
