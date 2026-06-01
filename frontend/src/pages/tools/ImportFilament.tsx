import { useState } from 'react'
import { FileText, Sparkles } from 'lucide-react'
import FilamentImportWizard from '../../components/FilamentImportWizard'
import SpoolReceiveWizard from '../../components/SpoolReceiveWizard'
import { SpoolmanSpool } from '../../api/client'

interface FilamentMeta {
  type?: string
  color_hex?: string
  brand?: string
  min_temp?: number
  max_temp?: number
  bed_temp?: number
}

export default function ImportFilament() {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [tagSpools, setTagSpools] = useState<{ spools: SpoolmanSpool[]; meta: FilamentMeta } | null>(null)

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import Filament from Listing</h1>
          <span className="text-xs font-semibold text-amber-500 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-1.5 py-0.5 rounded">$ API key required</span>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Paste a product listing and AI extracts the full spec — material, temps, weight, ASIN — then walks you through adding it to Spoolman and tagging the spool.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-3 px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors"
        >
          <Sparkles size={18} />
          Start Import Wizard
        </button>
      </div>

      {wizardOpen && (
        <FilamentImportWizard
          onClose={() => setWizardOpen(false)}
          onTagSpools={(spools, meta) => { setWizardOpen(false); setTagSpools({ spools, meta }) }}
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
