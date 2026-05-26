import { useState } from 'react'
import { Wrench, FileText } from 'lucide-react'
import FilamentImportWizard from '../components/FilamentImportWizard'
import SpoolReceiveWizard from '../components/SpoolReceiveWizard'
import { SpoolmanSpool } from '../api/client'

interface FilamentMeta {
  type?: string
  color_hex?: string
  brand?: string
  min_temp?: number
  max_temp?: number
  bed_temp?: number
}

export default function Tools() {
  const [importWizardOpen, setImportWizardOpen] = useState(false)
  const [tagSpools, setTagSpools] = useState<{ spools: SpoolmanSpool[]; meta: FilamentMeta } | null>(null)

  function handleTagSpools(spools: SpoolmanSpool[], meta: FilamentMeta) {
    setTagSpools({ spools, meta })
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
        <Wrench size={26} className="text-brand-600" />
        Tools
      </h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Simple</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No tools yet — check back soon.</p>
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
