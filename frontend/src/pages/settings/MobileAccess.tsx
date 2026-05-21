import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSettings, setSetting } from '../../api/client'
import { Lock, Wifi, AlertTriangle, ChevronLeft, Info } from 'lucide-react'
import clsx from 'clsx'

export default function MobileAccess() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  const [mobileProtocol, setMobileProtocol] = useState<'https' | 'http'>('https')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings?.mobile_protocol === 'http' || settings?.mobile_protocol === 'https') {
      setMobileProtocol(settings.mobile_protocol)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => setSetting('mobile_protocol', mobileProtocol),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
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
          Configure the protocol used for the mobile filament loader QR codes.
        </p>
      </div>

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
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {saved ? 'Saved!' : saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}
