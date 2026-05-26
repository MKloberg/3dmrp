import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, setSetting } from '../../api/client'
import { ChevronLeft, Sparkles } from 'lucide-react'

export default function AISettings() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 60_000 })

  const [anthropicKey, setAnthropicKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (settings?.anthropic_api_key !== undefined) setAnthropicKey(settings.anthropic_api_key)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => setSetting('anthropic_api_key', anthropicKey.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  async function testKey() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/settings/anthropic/test', { method: 'POST' })
      setTestResult(await res.json())
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI</h1>
      </div>

      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500" />
            Anthropic API Key
            <span className="text-xs font-semibold text-amber-500 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-1.5 py-0.5 rounded ml-1">$ Required</span>
          </h2>
        </div>

        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p>
            Some features in <Link to="/tools" className="text-brand-600 hover:underline">Tools → Advanced</Link> use
            the Anthropic API to provide AI-assisted capabilities — for example, parsing a pasted product listing
            into a structured filament spec, or extracting print settings from unstructured text.
          </p>
          <p>
            These features are entirely optional. The rest of 3DMRP works without this key. When an Advanced tool
            is used, only the text you provide for that specific operation is sent to Anthropic's API servers.
            Your key is stored locally in 3DMRP's database and is never shared with or exposed to any party
            other than Anthropic.
          </p>
          <p>
            API calls are billed per token — a unit of text roughly equal to ¾ of a word. You can get a key, set
            spending limits, and monitor usage at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              console.anthropic.com
            </a>.
            Note that the Anthropic API requires a separate account and billing setup from a Claude.ai subscription.
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estimated cost</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            A typical 3DMRP operation (e.g. parsing a filament product listing) uses roughly 500–1,500 tokens.
            At that rate, <span className="font-medium text-gray-800 dark:text-gray-100">5 uses per month costs less than $0.02</span> — the
            $5 minimum account credit would last years at casual usage.
          </p>
          <p className="text-xs text-gray-400">Pricing varies by model. 3DMRP uses the smallest model capable of each task to minimize cost.</p>
        </div>

        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">API Key</label>
          <input
            type="password"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            placeholder="sk-ant-…"
            value={anthropicKey}
            onChange={e => setAnthropicKey(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Your key begins with <span className="font-mono">sk-ant-</span>. Stored in your local database and never transmitted except when making API calls.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {saved ? 'Saved!' : saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={testKey}
            disabled={testing || !anthropicKey}
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 px-4 py-2 text-sm rounded-lg disabled:opacity-40"
          >
            {testing ? 'Testing…' : 'Test Anthropic AI API Key'}
          </button>
          {anthropicKey && (
            <button onClick={() => { setAnthropicKey(''); setTestResult(null) }} className="text-sm text-gray-400 hover:text-red-500">Clear</button>
          )}
        </div>
        {testResult && (
          <p className={`text-sm font-medium ${testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {testResult.ok ? 'Key is valid and working.' : `Error: ${testResult.error}`}
          </p>
        )}
      </section>
    </div>
  )
}
