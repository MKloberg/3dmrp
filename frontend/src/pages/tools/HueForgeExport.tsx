import { useState } from 'react'
import { Download, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { pickHueForgeFolder, exportHueForge, getSettings, setSetting } from '../../api/client'

type Status = 'idle' | 'picking' | 'exporting' | 'success' | 'error'

export default function HueForgeExport() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState('')

  async function handleExport() {
    if (status === 'picking' || status === 'exporting') return
    if (status === 'success' || status === 'error') {
      setStatus('idle')
      setResult('')
      return
    }
    try {
      setStatus('picking')
      const settings = await getSettings()
      const lastDir = settings['hueforge_export_path'] || undefined
      const { directory } = await pickHueForgeFolder(lastDir)
      if (!directory) { setStatus('idle'); return }
      setStatus('exporting')
      const dateStr = new Date().toISOString().slice(0, 10)
      const sep = directory.includes('\\') ? '\\' : '/'
      const fullPath = directory + sep + `hueforge-filaments-${dateStr}.json`
      const { path } = await exportHueForge(fullPath)
      await setSetting('hueforge_export_path', directory)
      setResult(path)
      setStatus('success')
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Export failed')
      setStatus('error')
    }
  }

  const busy = status === 'picking' || status === 'exporting'

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">HueForge Filament Export</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Export all filaments as a HueForge-compatible JSON library file, saved directly to your HueForge libraries folder.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <button
          onClick={handleExport}
          disabled={busy}
          className="flex items-center gap-3 px-5 py-3 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium transition-colors"
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
          <p className="text-sm text-green-600 dark:text-green-400 break-all">
            Saved to: {result}
          </p>
        )}
        {status === 'error' && (
          <p className="text-sm text-red-500 dark:text-red-400">{result}</p>
        )}
      </div>
    </div>
  )
}
