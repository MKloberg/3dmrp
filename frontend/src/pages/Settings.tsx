import { useRef, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, setSetting, testSpoolman, restoreDatabase } from '../api/client'
import { useTheme } from '../lib/theme'
import { CheckCircle, XCircle, Loader, Sun, Moon, Download, Upload } from 'lucide-react'
import clsx from 'clsx'

export default function Settings() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const { theme, setTheme } = useTheme()

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

  const [spoolmanUrl, setSpoolmanUrl] = useState('')
  const [testResult, setTestResult] = useState<{ connected: boolean; version?: string; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings?.spoolman_url !== undefined) {
      setSpoolmanUrl(settings.spoolman_url)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => setSetting('spoolman_url', spoolmanUrl.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testSpoolman(spoolmanUrl.trim())
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-6 max-w-xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>

      {/* Theme */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Appearance</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Choose your preferred color theme.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setTheme('light')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
              theme === 'light'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
          >
            <Sun size={15} /> Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
              theme === 'dark'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
          >
            <Moon size={15} /> Dark
          </button>
        </div>
      </section>

      {/* Spoolman */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Spoolman Integration</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Connect to your Spoolman instance to pull live filament stock into the forecast.
          </p>
        </div>

        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Spoolman URL</label>
          <input
            type="url"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="http://192.168.1.100:7912"
            value={spoolmanUrl}
            onChange={e => { setSpoolmanUrl(e.target.value); setTestResult(null) }}
          />
          <p className="text-xs text-gray-400 mt-1">No trailing slash. Include the port if needed.</p>
        </div>

        {testResult && (
          <div className={clsx(
            'flex items-start gap-2 text-sm rounded-lg px-3 py-2',
            testResult.connected ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          )}>
            {testResult.connected
              ? <CheckCircle size={16} className="shrink-0 mt-0.5" />
              : <XCircle size={16} className="shrink-0 mt-0.5" />}
            <span>
              {testResult.connected
                ? `Connected — Spoolman v${testResult.version}`
                : testResult.error}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleTest}
            disabled={!spoolmanUrl.trim() || testing}
            className="flex items-center gap-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 text-sm rounded-lg disabled:opacity-40"
          >
            {testing ? <Loader size={14} className="animate-spin" /> : null}
            Test connection
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {saved ? 'Saved!' : saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {spoolmanUrl && (
            <button
              onClick={() => { setSpoolmanUrl(''); setTestResult(null) }}
              className="text-sm text-gray-400 hover:text-red-500"
            >
              Clear
            </button>
          )}
        </div>
      </section>
      {/* Database */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Database</h2>
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
