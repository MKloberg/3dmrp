import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, CheckCircle, XCircle, Loader2, FileText, Layers } from 'lucide-react'
import { pickHueForgeFolder, exportHueForge, getSettings, setSetting, getFilaments } from '../../api/client'

type Status = 'idle' | 'picking' | 'exporting' | 'success' | 'error'

export default function HueForgeExport() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState('')

  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 60_000 })

  const totalFilaments = filaments.length
  const withTd = filaments.filter(f => f.extra?.['td'] != null && Number(f.extra['td']) > 0).length
  const lastExportDir = settings?.['hueforge_export_path'] ?? null

  async function handleExport() {
    if (status === 'picking' || status === 'exporting') return
    if (status === 'success' || status === 'error') {
      setStatus('idle')
      setResult('')
      return
    }
    try {
      setStatus('picking')
      const s = await getSettings()
      const lastDir = s['hueforge_export_path'] || undefined
      const dateStr = new Date().toISOString().slice(0, 10)
      const { path: chosenPath } = await pickHueForgeFolder(lastDir, `hueforge-filaments-${dateStr}.json`)
      if (!chosenPath) { setStatus('idle'); return }
      setStatus('exporting')
      const { path: savedPath } = await exportHueForge(chosenPath)
      const sep = savedPath.includes('\\') ? '\\' : '/'
      const directory = savedPath.substring(0, savedPath.lastIndexOf(sep))
      await setSetting('hueforge_export_path', directory)
      setResult(savedPath)
      setStatus('success')
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Export failed')
      setStatus('error')
    }
  }

  const busy = status === 'picking' || status === 'exporting'

  return (
    <div className="p-6 max-w-lg space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">HueForge Filament Export</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Export all filaments as a HueForge <span className="font-medium text-gray-700 dark:text-gray-300">Personal Library</span> file.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <Layers size={18} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none tabular-nums">{totalFilaments}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">filaments</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <span className="text-xs font-black text-amber-600 dark:text-amber-400">TD</span>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none tabular-nums">{withTd}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">with TD values</p>
          </div>
        </div>
      </div>

      {/* Action card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-start gap-4 p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <FileText size={20} className="text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">hueforge-filaments-{new Date().toISOString().slice(0, 10)}.json</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Personal Library · includes color, material, TD, temperatures, and density for all {totalFilaments} filaments.
            </p>
            {lastExportDir && status === 'idle' && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 font-mono truncate" title={lastExportDir}>
                → {lastExportDir}
              </p>
            )}
          </div>
        </div>

        <div className="p-5 space-y-3">
          <button
            onClick={handleExport}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {busy
              ? <Loader2 size={18} className="animate-spin" />
              : status === 'success'
              ? <CheckCircle size={18} />
              : status === 'error'
              ? <XCircle size={18} />
              : <Download size={18} />}
            {status === 'picking' ? 'Opening folder picker…'
              : status === 'exporting' ? 'Writing file…'
              : status === 'success' ? 'Export again'
              : status === 'error' ? 'Try again'
              : 'Export to HueForge'}
          </button>

          {status === 'success' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <CheckCircle size={14} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <p className="text-sm text-green-700 dark:text-green-300 break-all font-mono">{result}</p>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{result}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
