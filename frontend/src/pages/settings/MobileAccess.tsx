import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSettings, setSetting } from '../../api/client'
import { Lock, Wifi, AlertTriangle, ChevronLeft, Info, Nfc, Globe } from 'lucide-react'
import clsx from 'clsx'

export default function MobileAccess() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  const [mobileProtocol, setMobileProtocol] = useState<'https' | 'http'>('https')
  const [protocolSaved, setProtocolSaved] = useState(false)

  const [nfcWriteMode, setNfcWriteMode] = useState<'push' | 'auto'>('push')
  const [nfcModeSaved, setNfcModeSaved] = useState(false)

  const [mobileBaseUrl, setMobileBaseUrl] = useState('')
  const [baseUrlSaved, setBaseUrlSaved] = useState(false)

  useEffect(() => {
    if (settings?.mobile_protocol === 'http' || settings?.mobile_protocol === 'https') {
      setMobileProtocol(settings.mobile_protocol)
    }
    if (settings?.nfc_write_mode === 'auto') setNfcWriteMode('auto')
    else setNfcWriteMode('push')
    if (settings?.mobile_base_url !== undefined) setMobileBaseUrl(settings.mobile_base_url)
  }, [settings])

  const saveProtocolMutation = useMutation({
    mutationFn: () => setSetting('mobile_protocol', mobileProtocol),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setProtocolSaved(true)
      setTimeout(() => setProtocolSaved(false), 2000)
    },
  })

  const saveNfcModeMutation = useMutation({
    mutationFn: () => setSetting('nfc_write_mode', nfcWriteMode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setNfcModeSaved(true)
      setTimeout(() => setNfcModeSaved(false), 2000)
    },
  })

  const saveBaseUrlMutation = useMutation({
    mutationFn: () => setSetting('mobile_base_url', mobileBaseUrl.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setBaseUrlSaved(true)
      setTimeout(() => setBaseUrlSaved(false), 2000)
    },
  })

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  return (
    <div className="p-6 max-w-xl space-y-8">
      <div>
        <Link to="/settings" className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-600 mb-3">
          <ChevronLeft size={14} /> Settings
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mobile Access</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure the protocol and NFC behavior for the mobile companion app.
        </p>
      </div>

      {/* Protocol */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Protocol</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Controls whether the QR code in the sidebar links to an HTTP or HTTPS address.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setMobileProtocol('https')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
              mobileProtocol === 'https'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
          >
            <Lock size={14} /> HTTPS (Recommended)
          </button>
          <button
            onClick={() => setMobileProtocol('http')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
              mobileProtocol === 'http'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
          >
            <Wifi size={14} /> HTTP
          </button>
        </div>

        {mobileProtocol === 'https' ? (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-4 space-y-3 text-sm">
            <p className="flex items-center gap-1.5 text-blue-900 dark:text-blue-200 font-medium"><Info size={14} className="shrink-0" />Why HTTPS?</p>
            <p className="text-blue-800 dark:text-blue-300">
              Browsers block camera access on HTTP for any address that isn't <code className="font-mono text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">localhost</code>.
              This applies to both iOS Safari and Android Chrome. HTTPS is required for QR scanning to work on your local network.
            </p>
            <p className="text-blue-900 dark:text-blue-200 font-medium">One-time certificate setup per phone</p>
            <p className="text-blue-800 dark:text-blue-300">
              3DMRP uses a self-signed certificate because it runs on your local network without a domain name.
              Your browser will warn you the first time — that's expected and safe to proceed past.
            </p>
            <div className="space-y-2 pt-1">
              <div className="rounded-md bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 px-3 py-2">
                <p className="font-medium text-gray-800 dark:text-gray-100 text-xs mb-1">iPhone / iPad (Safari)</p>
                <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                  When you see "This Connection Is Not Private" — tap <strong>Show Details</strong> → <strong>visit this website</strong> → <strong>Visit Website</strong>. You only need to do this once.
                </p>
              </div>
              <div className="rounded-md bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 px-3 py-2">
                <p className="font-medium text-gray-800 dark:text-gray-100 text-xs mb-1">Android (Chrome)</p>
                <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                  When you see "Your connection is not private" — tap <strong>Advanced</strong> → <strong>Proceed to [IP address] (unsafe)</strong>. You only need to do this once.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>Camera scanning will not work over HTTP on real devices. Use HTTP only if you have a separate HTTPS reverse proxy in front of 3DMRP.</p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveProtocolMutation.mutate()}
            disabled={saveProtocolMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {protocolSaved ? 'Saved!' : saveProtocolMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      {/* Custom Base URL */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Globe size={16} /> Base URL Override</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            By default the QR code uses the auto-detected LAN IP. If you're running 3DMRP behind a reverse proxy with a DNS alias, set the full base URL here instead.
          </p>
        </div>
        <div>
          <input
            type="url"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono dark:bg-gray-900 dark:border-gray-600 dark:text-gray-200"
            placeholder="https://3dmrp.home (leave blank to use auto-detected IP)"
            value={mobileBaseUrl}
            onChange={e => setMobileBaseUrl(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">No trailing slash. The QR code will link to <span className="font-mono">{mobileBaseUrl || 'https://&lt;lan-ip&gt;:7892'}/mobile/app/…</span></p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveBaseUrlMutation.mutate()}
            disabled={saveBaseUrlMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {baseUrlSaved ? 'Saved!' : saveBaseUrlMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {mobileBaseUrl && (
            <button onClick={() => setMobileBaseUrl('')} className="text-sm text-gray-400 hover:text-red-500">Clear</button>
          )}
        </div>
      </section>

      {/* NFC Write Mode */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Nfc size={16} /> NFC Write Mode</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Both modes write the same data to the tag. The difference is where you start the workflow.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => setNfcWriteMode('push')}
            className={clsx(
              'w-full px-4 py-3 rounded-lg border text-sm transition-colors text-left space-y-1',
              nfcWriteMode === 'push'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
          >
            <p className="font-semibold">Desktop-triggered <span className={clsx('text-xs font-normal ml-1', nfcWriteMode === 'push' ? 'text-brand-200' : 'text-gray-400')}>— current default</span></p>
            <p className={clsx('text-xs leading-relaxed', nfcWriteMode === 'push' ? 'text-brand-100' : 'text-gray-500 dark:text-gray-400')}>
              Start at the desktop — pick a spool and tap "Tag Spool." That pushes the spool data to your phone, then you walk to the shelf and touch the tag. The phone handles everything from there.
            </p>
          </button>
          <button
            onClick={() => setNfcWriteMode('auto')}
            className={clsx(
              'w-full px-4 py-3 rounded-lg border text-sm transition-colors text-left space-y-1',
              nfcWriteMode === 'auto'
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            )}
          >
            <p className="font-semibold">Auto-write</p>
            <p className={clsx('text-xs leading-relaxed', nfcWriteMode === 'auto' ? 'text-brand-100' : 'text-gray-500 dark:text-gray-400')}>
              Start at the shelf — your phone scans continuously and writes the moment a tag comes near. No desktop needed to kick things off. Ideal for receiving a batch of new spools: touch, done, next.
            </p>
          </button>
        </div>

        {nfcWriteMode === 'auto' && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>Auto-write requires <strong>Android Chrome</strong>. iOS Safari does not support continuous background NFC scanning in the browser and will fall back to desktop-triggered mode.</p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveNfcModeMutation.mutate()}
            disabled={saveNfcModeMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {nfcModeSaved ? 'Saved!' : saveNfcModeMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}
