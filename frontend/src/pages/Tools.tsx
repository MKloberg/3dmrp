import { useState } from 'react'
import { Wrench, FileText, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import FilamentImportWizard from '../components/FilamentImportWizard'
import SpoolReceiveWizard from '../components/SpoolReceiveWizard'
import { SpoolmanSpool, pickHueForgeFolder, exportHueForge, getSettings, setSetting } from '../api/client'

interface FilamentMeta {
  type?: string
  color_hex?: string
  brand?: string
  min_temp?: number
  max_temp?: number
  bed_temp?: number
}

type HueForgeStatus = 'idle' | 'picking' | 'exporting' | 'success' | 'error'

export default function Tools() {
  const [importWizardOpen, setImportWizardOpen] = useState(false)
  const [tagSpools, setTagSpools] = useState<{ spools: SpoolmanSpool[]; meta: FilamentMeta } | null>(null)
  const [hueforgeStatus, setHueforgeStatus] = useState<HueForgeStatus>('idle')
  const [hueforgeResult, setHueforgeResult] = useState('')

  function handleTagSpools(spools: SpoolmanSpool[], meta: FilamentMeta) {
    setTagSpools({ spools, meta })
  }

  async function handleHueForgeExport() {
    if (hueforgeStatus === 'picking' || hueforgeStatus === 'exporting') return
    if (hueforgeStatus === 'success' || hueforgeStatus === 'error') {
      setHueforgeStatus('idle')
      setHueforgeResult('')
      return
    }
    try {
      setHueforgeStatus('picking')
      const settings = await getSettings()
      const lastDir = settings['hueforge_export_path'] || undefined
      const { directory } = await pickHueForgeFolder(lastDir)
      if (!directory) {
        setHueforgeStatus('idle')
        return
      }
      setHueforgeStatus('exporting')
      const dateStr = new Date().toISOString().slice(0, 10)
      const filename = `hueforge-filaments-${dateStr}.json`
      const sep = directory.includes('\\') ? '\\' : '/'
      const fullPath = directory + sep + filename
      const { path } = await exportHueForge(fullPath)
      await setSetting('hueforge_export_path', directory)
      setHueforgeResult(path)
      setHueforgeStatus('success')
    } catch (err) {
      setHueforgeResult(err instanceof Error ? err.message : 'Export failed')
      setHueforgeStatus('error')
    }
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
        <Wrench size={26} className="text-brand-600" />
        Tools
      </h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Simple</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            data-testid="hueforge-export-card"
            onClick={handleHueForgeExport}
            disabled={hueforgeStatus === 'picking' || hueforgeStatus === 'exporting'}
            className="flex flex-col items-start gap-3 p-5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-brand-400 dark:hover:border-brand-600 hover:shadow-sm transition-all text-left group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/50 transition-colors">
              {hueforgeStatus === 'picking' || hueforgeStatus === 'exporting'
                ? <Loader2 size={20} className="text-green-600 dark:text-green-400 animate-spin" />
                : hueforgeStatus === 'success'
                ? <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
                : hueforgeStatus === 'error'
                ? <XCircle size={20} className="text-red-500 dark:text-red-400" />
                : <Download size={20} className="text-green-600 dark:text-green-400" />}
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">HueForge Filament Export</p>
              {hueforgeStatus === 'picking' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Opening folder picker…</p>
              )}
              {hueforgeStatus === 'exporting' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Writing export file…</p>
              )}
              {hueforgeStatus === 'success' && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 leading-relaxed break-all">
                  Saved to: {hueforgeResult}
                </p>
              )}
              {hueforgeStatus === 'error' && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 leading-relaxed">
                  {hueforgeResult}
                  <span className="block mt-1 text-gray-400">Click to try again.</span>
                </p>
              )}
              {hueforgeStatus === 'idle' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  Export all filaments as a HueForge-compatible JSON library file, saved directly to your HueForge libraries folder.
                </p>
              )}
            </div>
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Advanced</h2>
          <span className="text-xs font-semibold text-amber-500 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-1.5 py-0.5 rounded">$ API key required</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setImportWizardOpen(true)}
            className="flex flex-col items-start gap-3 p-5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-brand-400 dark:hover:border-brand-600 hover:shadow-sm transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center group-hover:bg-amber-100 dark:group-hover:bg-amber-900/50 transition-colors">
              <FileText size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Import Filament from Listing</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Paste a product listing and AI extracts the full spec — material, temps, weight, ASIN — then walks you through adding it to Spoolman and tagging the spool.
              </p>
            </div>
          </button>
        </div>
      </section>

      {importWizardOpen && (
        <FilamentImportWizard
          onClose={() => setImportWizardOpen(false)}
          onTagSpools={handleTagSpools}
        />
      )}

      {tagSpools && (
        <SpoolReceiveWizard
          onClose={() => setTagSpools(null)}
          initialSpools={tagSpools.spools}
          initialFilamentMeta={tagSpools.meta}
        />
      )}
    </div>
  )
}
