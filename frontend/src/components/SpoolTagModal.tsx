import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Loader2, AlertTriangle, QrCode, Nfc, RefreshCw } from 'lucide-react'
import Modal from './Modal'
import { useMobileSession } from '../contexts/MobileSessionContext'
import {
  getSettings,
  createNfcSession,
  patchSpoolmanCardUid,
  SpoolmanSpool,
} from '../api/client'

function normalizeColorHex(hex: string | null | undefined): string | undefined {
  if (!hex) return undefined
  return hex.startsWith('#') ? hex.slice(1) : hex
}

interface Props {
  spool: SpoolmanSpool
  onClose: () => void
}

type Phase = 'qr' | 'waiting' | 'done' | 'error'

export default function SpoolTagModal({ spool, onClose }: Props) {
  const qc = useQueryClient()
  const { phoneConnected, pushTask, token } = useMobileSession()

  const [phase, setPhase] = useState<Phase>(() => phoneConnected ? 'waiting' : 'qr')
  const [patchError, setPatchError] = useState<string | null>(null)
  const [writtenLotNr, setWrittenLotNr] = useState<string | null>(null)
  const [finalUids, setFinalUids] = useState<string[]>([])
  const taskPushedRef = useRef(false)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const { data: lanIpData } = useQuery({
    queryKey: ['lan-ip'],
    queryFn: () => fetch('/api/settings/lan-ip').then(r => r.json()) as Promise<{ ip: string; https_port: string }>,
    staleTime: Infinity,
  })

  const mobileBase = useMemo(() => {
    if (settings?.mobile_base_url) return settings.mobile_base_url.replace(/\/$/, '')
    const ip = lanIpData?.ip ?? window.location.hostname
    const protocol = settings?.mobile_protocol ?? 'https'
    if (protocol === 'https') {
      const port = lanIpData?.https_port ?? '7892'
      return `https://${ip}:${port}`
    }
    const port = window.location.port
    return `http://${ip}${port ? `:${port}` : ''}`
  }, [lanIpData, settings])

  async function pushNfcTask() {
    if (taskPushedRef.current) return
    taskPushedRef.current = true
    setPhase('waiting')

    const spoolLabel = spool.filament.name
      ? `${spool.filament.name} #${spool.id}`
      : `Spool #${spool.id}`

    try {
      const session = await createNfcSession({
        spool_id: spool.id,
        spool_label: spoolLabel,
        slot: 'A',
        mode: 'read_write',
        filament_type: spool.filament.material || undefined,
        color_hex: normalizeColorHex(spool.filament.color_hex),
        brand: spool.filament.vendor?.name || undefined,
      })

      pushTask({ task_type: 'nfc_write', nfc_token: session.token }, (result) => {
        if (!result.success) {
          setPatchError('NFC write failed on phone')
          setPhase('error')
          return
        }
        const uids = [result.card_uid, result.card_uid_b].filter(Boolean) as string[]
        const normalized = uids.map(u => u.replace(/:/g, '').toLowerCase())
        setFinalUids(normalized)
        patchSpoolmanCardUid(spool.id, normalized)
          .then(() => {
            setWrittenLotNr(normalized.join(','))
            qc.invalidateQueries({ queryKey: ['spoolman-stock'] })
            setPhase('done')
          })
          .catch(e => {
            setPatchError(e instanceof Error ? e.message : 'Failed to update Spoolman')
            setPhase('error')
          })
      })
    } catch (e) {
      setPatchError(e instanceof Error ? e.message : 'Failed to create NFC session')
      setPhase('error')
      taskPushedRef.current = false
    }
  }

  useEffect(() => {
    if (phoneConnected && !taskPushedRef.current) {
      pushNfcTask()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneConnected])

  const spoolName = spool.filament.name || `Spool #${spool.id}`
  const vendorName = spool.filament.vendor?.name

  return (
    <Modal title={`Tag Spool #${spool.id}`} onClose={onClose}>
      <div className="space-y-4 py-2">
        {/* Spool info */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <div
            className="w-8 h-8 rounded-full shrink-0 border border-black/10 dark:border-white/10"
            style={{ backgroundColor: spool.filament.color_hex ? (spool.filament.color_hex.startsWith('#') ? spool.filament.color_hex : `#${spool.filament.color_hex}`) : '#888888' }}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{spoolName}</p>
            <p className="text-xs text-gray-400 truncate">
              {[vendorName, spool.filament.material].filter(Boolean).join(' · ')}
              {spool.extra?.card_uid && <span className="ml-2 text-amber-500 dark:text-amber-400">Current: {spool.extra.card_uid}</span>}
            </p>
          </div>
        </div>

        {/* QR — phone not connected */}
        {phase === 'qr' && token && (
          <div className="flex flex-col items-center gap-4">
            <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
              <QRCodeSVG
                value={`${mobileBase}/mobile/app/${token}`}
                size={160}
                bgColor="#ffffff"
                fgColor="#111827"
                level="M"
              />
            </div>
            <div className="text-center space-y-1">
              <div className="flex items-center gap-1.5 justify-center">
                <QrCode size={13} className="text-gray-400" />
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Open on your phone</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Scan to connect — NFC tagging will start automatically.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              Waiting for phone to connect…
            </div>
          </div>
        )}

        {/* Loading while token resolves */}
        {phase === 'qr' && !token && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 size={18} className="animate-spin text-brand-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Loading…</span>
          </div>
        )}

        {/* Waiting — task pushed, phone scanning */}
        {phase === 'waiting' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <Nfc size={26} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Waiting for phone…</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Hold an NFC tag to your phone to write spool data.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              NFC task sent to phone
            </div>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <Check size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">Lot number updated</p>
                <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">{writtenLotNr}</p>
              </div>
            </div>
            <div className="text-center text-xs text-gray-400 dark:text-gray-500">
              {finalUids.length} tag{finalUids.length !== 1 ? 's' : ''} linked to spool #{spool.id}
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
            >
              Done
            </button>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Tagging failed</p>
                <p className="text-xs text-red-600 dark:text-red-500">{patchError}</p>
              </div>
            </div>
            {finalUids.length > 0 && (
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">UIDs captured (copy for manual entry):</p>
                {finalUids.map((uid, i) => (
                  <p key={i} className="text-xs font-mono text-gray-700 dark:text-gray-300">card_uid:{uid}</p>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  taskPushedRef.current = false
                  setPatchError(null)
                  setFinalUids([])
                  if (phoneConnected) {
                    pushNfcTask()
                  } else {
                    setPhase('qr')
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <RefreshCw size={14} /> Retry
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
