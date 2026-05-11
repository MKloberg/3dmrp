import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSettings, setSetting, testSpoolman } from '../../api/client'
import { useTheme } from '../../lib/theme'
import { CheckCircle, XCircle, Loader, Sun, Moon, ChevronLeft } from 'lucide-react'
import clsx from 'clsx'

export default function General() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const { theme, setTheme } = useTheme()

  const [spoolmanUrl, setSpoolmanUrl] = useState('')
  const [testResult, setTestResult] = useState<{ connected: boolean; version?: string; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)

  const [squareToken, setSquareToken] = useState('')
  const [squareSaved, setSquareSaved] = useState(false)

  const [amazonDomain, setAmazonDomain] = useState('amazon.com')
  const [amazonSaved, setAmazonSaved] = useState(false)

  useEffect(() => {
    if (settings?.spoolman_url !== undefined) setSpoolmanUrl(settings.spoolman_url)
    if (settings?.square_api_token !== undefined) setSquareToken(settings.square_api_token)
    if (settings?.amazon_domain) setAmazonDomain(settings.amazon_domain)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => setSetting('spoolman_url', spoolmanUrl.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  const saveSquareMutation = useMutation({
    mutationFn: () => setSetting('square_api_token', squareToken.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSquareSaved(true); setTimeout(() => setSquareSaved(false), 2000) },
  })

  const saveAmazonMutation = useMutation({
    mutationFn: () => setSetting('amazon_domain', amazonDomain),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setAmazonSaved(true); setTimeout(() => setAmazonSaved(false), 2000) },
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
      <div>
        <Link to="/settings" className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-600 mb-3">
          <ChevronLeft size={14} /> Settings
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">General</h1>
      </div>

      {/* Appearance */}
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
            {testResult.connected ? <CheckCircle size={16} className="shrink-0 mt-0.5" /> : <XCircle size={16} className="shrink-0 mt-0.5" />}
            <span>{testResult.connected ? `Connected — Spoolman v${testResult.version}` : testResult.error}</span>
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
            <button onClick={() => { setSpoolmanUrl(''); setTestResult(null) }} className="text-sm text-gray-400 hover:text-red-500">Clear</button>
          )}
        </div>
      </section>

      {/* Square */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Square Integration</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Connect your Square account to import and sync customers.</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Personal Access Token</label>
          <input
            type="password"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="EAAAl…"
            value={squareToken}
            onChange={e => setSquareToken(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">Found in your Square Developer dashboard under Credentials.</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveSquareMutation.mutate()}
            disabled={saveSquareMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {squareSaved ? 'Saved!' : saveSquareMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {squareToken && (
            <button onClick={() => setSquareToken('')} className="text-sm text-gray-400 hover:text-red-500">Clear</button>
          )}
        </div>
      </section>

      {/* Amazon */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Purchasing</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            When importing filaments from Spoolman, Article # fields that look like Amazon ASINs will auto-fill the purchase URL.
          </p>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Preferred Amazon store</label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
            value={amazonDomain}
            onChange={e => setAmazonDomain(e.target.value)}
          >
            <option value="amazon.com">amazon.com — United States</option>
            <option value="amazon.ca">amazon.ca — Canada</option>
            <option value="amazon.co.uk">amazon.co.uk — United Kingdom</option>
            <option value="amazon.de">amazon.de — Germany</option>
            <option value="amazon.fr">amazon.fr — France</option>
            <option value="amazon.it">amazon.it — Italy</option>
            <option value="amazon.es">amazon.es — Spain</option>
            <option value="amazon.co.jp">amazon.co.jp — Japan</option>
            <option value="amazon.com.au">amazon.com.au — Australia</option>
          </select>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveAmazonMutation.mutate()}
            disabled={saveAmazonMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {amazonSaved ? 'Saved!' : saveAmazonMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}
