import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSettings, setSetting, testSpoolman } from '../../api/client'
import { useTheme } from '../../lib/theme'
import { CURRENCY_SYMBOLS, CURRENCY_OPTIONS } from '../../lib/currency'
import { CheckCircle, CheckCircle2, XCircle, Loader, Sun, Moon, ChevronLeft, Wifi, Printer } from 'lucide-react'
import clsx from 'clsx'
import type { WsMode } from '../../hooks/useWsMode'

const WS_MODE_OPTIONS: { value: WsMode; label: string; desc: string }[] = [
  { value: 'off', label: 'Off', desc: 'Poll only — no persistent connections.' },
  { value: 'active', label: 'Active printers', desc: 'Subscribe while a printer card is expanded.' },
  { value: 'all', label: 'All printers', desc: 'Subscribe to every printer continuously.' },
]

function WsModeSection() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 60_000 })
  const currentMode = (settings?.printer_ws_mode as WsMode | undefined) ?? 'all'

  const mutation = useMutation({
    mutationFn: (mode: WsMode) => setSetting('printer_ws_mode', mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Wifi size={16} className="text-brand-600" /> Printer Live Updates
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Use Moonraker WebSocket subscriptions for real-time printer status instead of polling.
        </p>
      </div>
      <div className="flex gap-3 flex-wrap">
        {WS_MODE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => mutation.mutate(opt.value)}
            disabled={mutation.isPending}
            title={opt.desc}
            className={clsx(
              'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
              currentMode === opt.value
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {WS_MODE_OPTIONS.find(o => o.value === currentMode)?.desc}
      </p>
    </section>
  )
}

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

  const [machineRate, setMachineRate] = useState('2.50')
  const [machineRateSaved, setMachineRateSaved] = useState(false)

  const [electricityCost, setElectricityCost] = useState('0.1765')
  const [electricityCostSaved, setElectricityCostSaved] = useState(false)

  const [markupMultiplier, setMarkupMultiplier] = useState('1.2')
  const [markupSaved, setMarkupSaved] = useState(false)

  const [currency, setCurrency] = useState('USD')
  const [currencySaved, setCurrencySaved] = useState(false)

  const [labelPrinter, setLabelPrinter] = useState('')
  const [printerSaved, setPrinterSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  const { data: printersData } = useQuery({
    queryKey: ['label-printers'],
    queryFn: () => fetch('/api/print/printers').then(r => r.json()) as Promise<{ printers: string[]; error?: string }>,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (settings?.spoolman_url !== undefined) setSpoolmanUrl(settings.spoolman_url)
    if (settings?.square_api_token !== undefined) setSquareToken(settings.square_api_token)
    if (settings?.amazon_domain) setAmazonDomain(settings.amazon_domain)
    if (settings?.machine_hourly_rate !== undefined) setMachineRate(settings.machine_hourly_rate)
    if (settings?.electricity_cost_kwh !== undefined) setElectricityCost(settings.electricity_cost_kwh)
    if (settings?.markup_multiplier !== undefined) setMarkupMultiplier(settings.markup_multiplier)
    if (settings?.currency) setCurrency(settings.currency)
    if (settings?.label_printer_name !== undefined) setLabelPrinter(settings.label_printer_name)
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

  const saveMachineRateMutation = useMutation({
    mutationFn: () => setSetting('machine_hourly_rate', machineRate.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setMachineRateSaved(true); setTimeout(() => setMachineRateSaved(false), 2000) },
  })

  const saveElectricityCostMutation = useMutation({
    mutationFn: () => setSetting('electricity_cost_kwh', electricityCost.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setElectricityCostSaved(true); setTimeout(() => setElectricityCostSaved(false), 2000) },
  })

  const saveMarkupMutation = useMutation({
    mutationFn: () => setSetting('markup_multiplier', markupMultiplier.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setMarkupSaved(true); setTimeout(() => setMarkupSaved(false), 2000) },
  })

  const saveCurrencyMutation = useMutation({
    mutationFn: () => setSetting('currency', currency),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setCurrencySaved(true); setTimeout(() => setCurrencySaved(false), 2000) },
  })

  const savePrinterMutation = useMutation({
    mutationFn: () => setSetting('label_printer_name', labelPrinter),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setPrinterSaved(true); setTimeout(() => setPrinterSaved(false), 2000) },
  })

  async function handleTestPrint() {
    if (!labelPrinter) return
    setTestStatus('testing')
    setTestError('')
    try {
      const res = await fetch(`/api/print/test?printer=${encodeURIComponent(labelPrinter)}`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail ?? res.statusText)
      }
      setTestStatus('ok')
      setTimeout(() => setTestStatus('idle'), 3000)
    } catch (e: unknown) {
      setTestStatus('error')
      setTestError(e instanceof Error ? e.message : String(e))
    }
  }

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

  const currSym = CURRENCY_SYMBOLS[currency] ?? currency

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

      {/* Printer WebSocket */}
      <WsModeSection />

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
      {/* Machine Hourly Rate */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Machine Cost</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Default cost per hour for machine time, used in cost accounting. Can be overridden per printer type.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{currSym}</span>
          <input
            type="number" min="0" step="0.01"
            className="w-32 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
            value={machineRate}
            onChange={e => setMachineRate(e.target.value)}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">per hour</span>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveMachineRateMutation.mutate()}
            disabled={saveMachineRateMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {machineRateSaved ? 'Saved!' : saveMachineRateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Electricity Cost */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Electricity Cost in Your Area</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Used to calculate energy cost in cost accounting. The U.S. national average is $0.1765/kWh.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{currSym}</span>
          <input
            type="number" min="0" step="0.0001"
            className="w-32 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
            value={electricityCost}
            onChange={e => setElectricityCost(e.target.value)}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">per kWh</span>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveElectricityCostMutation.mutate()}
            disabled={saveElectricityCostMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {electricityCostSaved ? 'Saved!' : saveElectricityCostMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Currency */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Currency</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            The currency symbol shown throughout the app for costs, pricing, and MSRP.
          </p>
        </div>
        <div>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
          >
            {CURRENCY_OPTIONS.map(o => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveCurrencyMutation.mutate()}
            disabled={saveCurrencyMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {currencySaved ? 'Saved!' : saveCurrencyMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* QR Code Label Printer */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Printer size={16} /> QR Code Label Printer</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Select a Windows printer for automatic QR code label printing. When set, spool labels triggered from the mobile app print directly to this printer — no browser dialog required.
          </p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Printer</label>
          <select
            value={labelPrinter}
            onChange={e => setLabelPrinter(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">— None (use browser print dialog) —</option>
            {printersData?.printers.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {printersData?.error && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{printersData.error}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => savePrinterMutation.mutate()}
            disabled={savePrinterMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {printerSaved ? 'Saved!' : savePrinterMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {labelPrinter && (
            <button
              onClick={handleTestPrint}
              disabled={testStatus === 'testing'}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50',
                testStatus === 'ok'
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : testStatus === 'error'
                  ? 'border-red-400 text-red-600 dark:text-red-400'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
            >
              {testStatus === 'ok' ? <CheckCircle2 size={14} /> : testStatus === 'error' ? <XCircle size={14} /> : <Printer size={14} />}
              {testStatus === 'testing' ? 'Printing…' : testStatus === 'ok' ? 'Printed!' : testStatus === 'error' ? 'Failed' : 'Test Print'}
            </button>
          )}
          {testStatus === 'error' && testError && (
            <p className="text-xs text-red-600 dark:text-red-400 w-full">{testError}</p>
          )}
        </div>
      </section>

      {/* Markup Multiplier */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">MSRP Markup Multiplier</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Applied to the total cost per item to calculate the Suggested MSRP. A value of 1.2 means 20% above cost. Used across all items.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number" min="0" step="0.1"
            className="w-32 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
            value={markupMultiplier}
            onChange={e => setMarkupMultiplier(e.target.value)}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">× total cost</span>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveMarkupMutation.mutate()}
            disabled={saveMarkupMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {markupSaved ? 'Saved!' : saveMarkupMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}
