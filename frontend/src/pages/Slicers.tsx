import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSlicers, createSlicer, updateSlicer, deleteSlicer, getSettings, setSetting, getGcodeRepoStatus, scaffoldGcodeRepo, Slicer } from '../api/client'
import { Plus, Trash2, Pencil, Check, X, ChevronLeft, FolderOpen, FolderPlus, Scissors } from 'lucide-react'

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
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', executable_path: '' })
  const [repoPath, setRepoPath] = useState('')
  const [repoSaved, setRepoSaved] = useState(false)
  const [scaffoldResult, setScaffoldResult] = useState<{ created: string[]; skipped: string[] } | null>(null)

  useEffect(() => {
    if (settings?.gcode_repo_path !== undefined) setRepoPath(settings.gcode_repo_path)
  }, [settings])

  const { data: repoStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['gcode-repo-status'],
    queryFn: getGcodeRepoStatus,
    enabled: !!settings,
  })

  const saveRepoMutation = useMutation({
    mutationFn: () => setSetting('gcode_repo_path', repoPath.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      refetchStatus()
      setRepoSaved(true)
      setTimeout(() => setRepoSaved(false), 2000)
    },
  })

  const scaffoldMutation = useMutation({
    mutationFn: scaffoldGcodeRepo,
    onSuccess: (data) => {
      if (!data.error) setScaffoldResult({ created: data.created, skipped: data.skipped })
    },
  })

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Slicers</h1>
      </div>

      {/* Slicer Program Locations */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Scissors size={15} className="text-gray-400" />
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Slicer Program Locations</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5 rounded-lg"
          >
            <Plus size={14} /> Add Slicer
          </button>
        </div>
        {showForm && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-t dark:border-gray-700">
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
        <div className="border-t dark:border-gray-700">
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

      {/* G-Code Repository */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FolderOpen size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">G-Code Repository Root</p>
        </div>
        <p className="text-xs text-gray-400">
          Path to the folder where sliced G-Code files are stored. Structure: {"{slicer}"}/{"{printer type}"}/{"{item}"}/*.gcode — only printer types with a slicer binding are included.
        </p>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 border rounded px-3 py-1.5 text-sm font-mono dark:bg-gray-700 dark:border-gray-600"
            placeholder="e.g. C:\GCode"
            value={repoPath}
            onChange={e => { setRepoPath(e.target.value); setScaffoldResult(null) }}
          />
          <button
            onClick={() => saveRepoMutation.mutate()}
            disabled={saveRepoMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-1.5 text-sm rounded-lg disabled:opacity-50 shrink-0"
          >
            {repoSaved ? 'Saved!' : saveRepoMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>

        {repoStatus?.configured && (
          repoStatus.exists ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-green-600 dark:text-green-400">Folder found: <span className="font-mono">{repoStatus.root}</span></span>
              </div>
              <button
                onClick={() => { setScaffoldResult(null); scaffoldMutation.mutate() }}
                disabled={scaffoldMutation.isPending}
                className="flex items-center gap-1.5 text-sm border border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                <FolderPlus size={14} />
                {scaffoldMutation.isPending ? 'Creating…' : 'Auto Create Repository Folder Structure'}
              </button>
              {scaffoldResult && (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                  {scaffoldResult.created.length > 0 ? (
                    <p className="text-green-600 dark:text-green-400">
                      ✓ Created {scaffoldResult.created.length} folder{scaffoldResult.created.length !== 1 ? 's' : ''}
                    </p>
                  ) : (
                    <p>All folders already exist — nothing to create.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <span className="text-xs text-red-500">Folder not found: <span className="font-mono">{repoStatus.root}</span></span>
            </div>
          )
        )}
      </div>

    </div>
  )
}
