import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { restoreDatabase } from '../../api/client'
import { CheckCircle, XCircle, Loader, Download, Upload, ChevronLeft } from 'lucide-react'

export default function Database() {
  const qc = useQueryClient()
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreOk, setRestoreOk] = useState(false)

  const restoreMutation = useMutation({
    mutationFn: (file: File) => restoreDatabase(file),
    onSuccess: () => {
      qc.invalidateQueries()
      setRestoreOk(true)
      setRestoreError(null)
      setTimeout(() => setRestoreOk(false), 4000)
    },
    onError: (e: Error) => setRestoreError(e.message),
  })

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm(`Restore database from "${file.name}"?\n\nThis will overwrite all current data and cannot be undone.`)) return
    setRestoreError(null)
    restoreMutation.mutate(file)
  }

  return (
    <div className="p-6 max-w-xl space-y-8">
      <div>
        <Link to="/settings" className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-600 mb-3">
          <ChevronLeft size={14} /> Settings
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Database</h1>
      </div>

      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Backup & Restore</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Download a backup of all your data, or restore from a previous backup file.
          </p>
        </div>

        {restoreError && (
          <div className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-800">
            <XCircle size={16} className="shrink-0 mt-0.5" />
            <span>{restoreError}</span>
          </div>
        )}
        {restoreOk && (
          <div className="flex items-start gap-2 text-sm rounded-lg px-3 py-2 bg-green-50 text-green-800">
            <CheckCircle size={16} className="shrink-0 mt-0.5" />
            <span>Database restored successfully. All data has been reloaded.</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <a
            href="/api/settings/backup"
            download
            className="flex items-center gap-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 text-sm rounded-lg"
          >
            <Download size={14} /> Download backup
          </a>
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoreMutation.isPending}
            className="flex items-center gap-1.5 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {restoreMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            Restore from backup
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".db,application/octet-stream"
            className="hidden"
            onChange={handleRestoreFile}
          />
        </div>
      </section>
    </div>
  )
}
