import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getNfcSession, postNfcTagA, postNfcResult, NfcSession } from '../../api/client'
import { Loader2, Check, X, AlertTriangle } from 'lucide-react'

declare global {
  interface Window {
    NDEFReader: new () => NDEFReaderInstance
  }
  interface NDEFReaderInstance extends EventTarget {
    scan(): Promise<void>
    write(message: NDEFMessageInit, options?: { overwrite?: boolean; signal?: AbortSignal }): Promise<void>
  }
  interface NDEFMessageInit {
    records: NDEFRecordInit[]
  }
  interface NDEFRecordInit {
    recordType: string
    data?: BufferSource | string
    lang?: string
    encoding?: string
    mediaType?: string
  }
  interface NDEFReadingEvent extends Event {
    serialNumber: string
    message: { records: Array<{ recordType: string; mediaType?: string }> }
  }
}

type ScanStatus = 'loading' | 'ready' | 'scanning' | 'ask_second' | 'scanning_b' | 'done' | 'error'

// Filament types accepted by the Snapmaker openrfid processor
const VALID_PRINTER_TYPES = new Set([
  'PLA', 'PLA-CF', 'TPU', 'PETG', 'PETG-CF', 'PETG-HF',
  'ABS', 'ASA', 'PA', 'PA-CF', 'PA6-CF', 'PA-GF', 'PA6-GF',
  'PC', 'PC-ABS', 'PVA',
])

const FILAMENT_TYPE_ALIASES: Record<string, string> = {
  'PLA+': 'PLA', 'PLA PLUS': 'PLA', 'PLA-PLUS': 'PLA', 'PLAPLUS': 'PLA',
  'PETG+': 'PETG', 'PETG PLUS': 'PETG',
  'PETG HF': 'PETG-HF',
  'ABS+': 'ABS', 'ABS PLUS': 'ABS',
  'ASA+': 'ASA',
}

function toValidPrinterType(raw: string): string {
  const upper = raw.toUpperCase().trim()
  if (VALID_PRINTER_TYPES.has(upper)) return upper
  if (FILAMENT_TYPE_ALIASES[upper]) return FILAMENT_TYPE_ALIASES[upper]
  // Strip trailing + or suffix after a space and retry
  const base = upper.replace(/[+].*$/, '').trim()
  if (VALID_PRINTER_TYPES.has(base)) return base
  return 'PLA'
}

export default function MobileNfcScan() {
  const { token } = useParams<{ token: string }>()
  const [session, setSession] = useState<NfcSession | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<ScanStatus>('loading')

  // Tag A state
  const [cardUidA, setCardUidA] = useState<string | null>(null)
  const [wroteTagA, setWroteTagA] = useState<boolean>(false)
  const [writeErrorA, setWriteErrorA] = useState<string | null>(null)

  // Tag B state
  const [cardUidB, setCardUidB] = useState<string | null>(null)
  const [wroteTagB, setWroteTagB] = useState<boolean>(false)
  const [writeErrorB, setWriteErrorB] = useState<string | null>(null)

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const readerRef = useRef<NDEFReaderInstance | null>(null)

  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

  useEffect(() => {
    document.body.style.backgroundColor = '#030712'
    return () => { document.body.style.backgroundColor = '' }
  }, [])

  useEffect(() => {
    if (!token) { setLoadError('Missing session token'); setStatus('error'); return }
    getNfcSession(token)
      .then(s => {
        if (s.status === 'completed') {
          setSession(s)
          setCardUidA(s.card_uid)
          setCardUidB(s.card_uid_b)
          setWroteTagA(s.wrote_tag ?? false)
          setWroteTagB(s.wrote_tag_b ?? false)
          setStatus('done')
        } else if (s.status === 'tag_a_done') {
          setSession(s)
          setCardUidA(s.card_uid)
          setWroteTagA(s.wrote_tag ?? false)
          setStatus('ask_second')
        } else {
          setSession(s)
          setStatus('ready')
        }
      })
      .catch(() => { setLoadError('Session not found or expired'); setStatus('error') })
  }, [token])

  async function runNfcScan(
    onRead: (uid: string, wrote: boolean, writeErr: string | null) => void,
    onError: (msg: string) => void,
  ) {
    if (!session || !token) return
    try {
      const reader = new window.NDEFReader()
      readerRef.current = reader
      await reader.scan()

      let handled = false
      reader.addEventListener('reading', async (ev: Event) => {
        if (handled) return
        handled = true
        const event = ev as NDEFReadingEvent
        const uid = event.serialNumber
        const hasExistingNdef = (event.message?.records?.length ?? 0) > 0

        let wrote = false
        let writeErr: string | null = null

        if (session.mode === 'read_write') {
          try {
            const payload: Record<string, string> = {
              protocol: 'openspool',
              version: '1.0',
              type: toValidPrinterType(session.filament_type ?? 'PLA'),
              color_hex: (session.color_hex ?? '888888').replace('#', ''),
              brand: session.brand ?? '',
              spool_id: String(session.spool_id),
            }
            if (session.subtype) payload.subtype = session.subtype
            if (session.min_temp != null) payload.min_temp = String(session.min_temp)
            if (session.max_temp != null) payload.max_temp = String(session.max_temp)
            if (session.bed_temp != null) payload.bed_min_temp = payload.bed_max_temp = String(session.bed_temp)
            const encoder = new TextEncoder()
            await reader.write(
              {
                records: [{
                  recordType: 'mime',
                  mediaType: 'application/json',
                  data: encoder.encode(JSON.stringify(payload)),
                }],
              },
              { overwrite: true },
            )
            wrote = true
          } catch (e: unknown) {
            const raw = e instanceof Error ? e.message : 'Tag write failed'
            const looksLocked = /read.only|not.allowed|security|auth/i.test(raw)
            writeErr = looksLocked || hasExistingNdef ? 'incompatible' : raw
          }
        }

        onRead(uid, wrote, writeErr)
      })

      reader.addEventListener('readingerror', () => {
        onError('Error reading tag. Hold it steadier and try again.')
      })
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'NFC scan failed')
    }
  }

  async function startScanA() {
    if (!session || !token) return
    setStatus('scanning')
    setErrorMsg(null)
    setWriteErrorA(null)

    await runNfcScan(
      async (uid, wrote, writeErr) => {
        setCardUidA(uid)
        setWroteTagA(wrote)
        setWriteErrorA(writeErr)
        try {
          await postNfcTagA(token, { card_uid: uid, wrote_tag: wrote })
          setStatus('ask_second')
        } catch {
          setStatus('error')
          setErrorMsg('Session expired or lost — close this page and scan the QR code again.')
        }
      },
      (msg) => { setStatus('error'); setErrorMsg(msg) },
    )
  }

  async function startScanB() {
    if (!session || !token || !cardUidA) return
    setStatus('scanning_b')
    setErrorMsg(null)
    setWriteErrorB(null)

    await runNfcScan(
      async (uid, wrote, writeErr) => {
        setCardUidB(uid)
        setWroteTagB(wrote)
        setWriteErrorB(writeErr)
        setStatus('done')
        try {
          await postNfcResult(token, {
            card_uid: cardUidA,
            wrote_tag: wroteTagA,
            card_uid_b: uid,
            wrote_tag_b: wrote,
          })
        } catch { /* session expired on the other side — ignore */ }
      },
      (msg) => { setStatus('error'); setErrorMsg(msg) },
    )
  }

  async function skipSecondTag() {
    if (!token || !cardUidA) return
    setStatus('done')
    try {
      await postNfcResult(token, { card_uid: cardUidA, wrote_tag: wroteTagA })
    } catch { /* ignore */ }
  }

  // Loading
  if (status === 'loading') {
    return (
      <div className="min-h-dvh bg-gray-950 flex items-center justify-center">
        <Loader2 size={28} className="text-brand-400 animate-spin" />
      </div>
    )
  }

  // Session error
  if (status === 'error' && loadError) {
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <X size={32} className="text-red-400" />
        </div>
        <p className="text-white font-semibold">{loadError}</p>
        <p className="text-sm text-gray-400">This link may have expired. Generate a new one from the desktop.</p>
      </div>
    )
  }

  // Done
  if (status === 'done') {
    const tagCount = cardUidB ? 2 : 1
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <Check size={40} className="text-green-400" />
        </div>
        <div className="space-y-1">
          <p className="text-white text-xl font-bold">{tagCount === 2 ? 'Both Tags Written' : 'Tag Written'}</p>
          {session && (
            <p className="text-sm text-gray-400">{session.spool_label}</p>
          )}
        </div>

        {/* Tag A result */}
        {wroteTagA && (
          <div className="w-full px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30">
            <p className="text-sm font-medium text-green-400">Tag A: spool ID written</p>
            {cardUidA && <p className="text-xs text-gray-600 font-mono mt-0.5">{cardUidA}</p>}
          </div>
        )}
        {!wroteTagA && writeErrorA && (
          <WriteErrorBox writeError={writeErrorA} label="Tag A" uid={cardUidA} />
        )}
        {!wroteTagA && !writeErrorA && cardUidA && (
          <div className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700">
            <p className="text-sm text-gray-400">Tag A UID recorded</p>
            <p className="text-xs text-gray-600 font-mono mt-0.5">{cardUidA}</p>
          </div>
        )}

        {/* Tag B result */}
        {cardUidB && wroteTagB && (
          <div className="w-full px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30">
            <p className="text-sm font-medium text-green-400">Tag B: spool ID written</p>
            {cardUidB && <p className="text-xs text-gray-600 font-mono mt-0.5">{cardUidB}</p>}
          </div>
        )}
        {cardUidB && !wroteTagB && writeErrorB && (
          <WriteErrorBox writeError={writeErrorB} label="Tag B" uid={cardUidB} />
        )}
        {cardUidB && !wroteTagB && !writeErrorB && (
          <div className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700">
            <p className="text-sm text-gray-400">Tag B UID recorded</p>
            <p className="text-xs text-gray-600 font-mono mt-0.5">{cardUidB}</p>
          </div>
        )}

        <p className="text-sm text-gray-500 mt-2">Return to the desktop to continue.</p>
      </div>
    )
  }

  // Ask second tag
  if (status === 'ask_second') {
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
        <div className="px-6 pt-safe pt-10 pb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">Tag A Written</p>
          {session && <p className="text-2xl font-bold leading-tight">{session.spool_label}</p>}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
          <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
            <Check size={36} className="text-green-400" />
          </div>
          {cardUidA && <p className="text-xs text-gray-600 font-mono">{cardUidA}</p>}
          <div className="text-center space-y-2">
            <p className="text-white font-semibold text-lg">Tag A done.</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              Is there a tag on the other side of the spool?
            </p>
          </div>
        </div>
        <div className="px-6 pb-safe pb-10 pt-4 flex gap-3">
          <button
            onClick={skipSecondTag}
            className="flex-1 py-4 rounded-2xl border-2 border-gray-700 text-gray-300 font-semibold text-base hover:bg-gray-800 transition-colors"
          >
            No
          </button>
          <button
            onClick={startScanB}
            className="flex-1 py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-base transition-colors"
          >
            Yes, write it
          </button>
        </div>
      </div>
    )
  }

  // Main scan UI (ready / scanning / scanning_b / error)
  const isScanning = status === 'scanning' || status === 'scanning_b'
  const isError = status === 'error'
  const isScanningB = status === 'scanning_b'

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
      {/* Header */}
      <div className="px-6 pt-safe pt-10 pb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">
          {isScanningB ? 'Second Tag' : 'Add Spool to Inventory'}
        </p>
        {session && (
          <>
            <p className="text-2xl font-bold leading-tight">{session.spool_label}</p>
            <p className="text-sm text-gray-400 mt-1">
              {isScanningB ? 'Tag B' : 'Tag A'}
              {session.mode === 'read_write' ? ' · spool ID will be written' : ' · read only'}
            </p>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-10">
        {!nfcSupported ? (
          <div className="text-center space-y-4">
            <AlertTriangle size={48} className="text-amber-400 mx-auto" />
            <p className="text-white font-semibold">NFC not supported</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              NFC scanning requires Android Chrome. This browser does not support the Web NFC API.
            </p>
          </div>
        ) : (
          <>
            {/* NFC tap graphic */}
            <div className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-300 ${
              isScanning
                ? 'bg-brand-500/20 border-2 border-brand-400 animate-pulse'
                : isError
                ? 'bg-red-500/20 border-2 border-red-500'
                : 'bg-gray-900 border-2 border-gray-700'
            }`}>
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-20 h-20">
                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2.5"
                  className={isScanning ? 'text-brand-400' : isError ? 'text-red-500' : 'text-gray-600'} />
                <circle cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="2.5"
                  className={isScanning ? 'text-brand-300' : isError ? 'text-red-400' : 'text-gray-700'} />
                <circle cx="32" cy="32" r="6" fill="currentColor"
                  className={isScanning ? 'text-brand-400' : isError ? 'text-red-500' : 'text-gray-600'} />
              </svg>
            </div>

            <div className="text-center space-y-2 px-4">
              {!isError && !isScanning && (
                <>
                  <p className="text-white font-semibold text-lg">Ready to write</p>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Tap the button below, then hold an NFC tag to the back of your phone.
                  </p>
                </>
              )}
              {isScanning && (
                <>
                  <p className="text-white font-semibold text-lg">Writing…</p>
                  <p className="text-sm text-gray-400">Hold the NFC tag to the back of your phone.</p>
                </>
              )}
              {isError && (
                <>
                  <p className="text-red-400 font-semibold text-lg">Write failed</p>
                  <p className="text-sm text-gray-400">{errorMsg}</p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom button */}
      {nfcSupported && (
        <div className="px-6 pb-safe pb-10 pt-4">
          <button
            onClick={isScanningB ? undefined : isError && cardUidA ? startScanB : startScanA}
            disabled={isScanning}
            className="w-full py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-base disabled:opacity-50 transition-colors"
          >
            {isScanning ? 'Writing…' : isError ? 'Try Again' : isScanningB ? 'Write Tag B' : 'Write NFC Tag'}
          </button>
        </div>
      )}
    </div>
  )
}

function WriteErrorBox({ writeError, label, uid }: { writeError: string; label: string; uid: string | null }) {
  if (writeError === 'incompatible') {
    return (
      <div className="w-full px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-left space-y-1.5">
        <p className="text-sm font-semibold text-amber-400">{label}: tag could not be written</p>
        <p className="text-xs text-amber-300/80 leading-relaxed">
          This tag contains data in a format that can't be overwritten via the browser. Use a fresh NTAG215 tag, or use NFC Tools to format it first.
        </p>
        <p className="text-xs text-gray-500 pt-0.5">UID was recorded — spool is tracked in Spoolman.</p>
        {uid && <p className="text-xs text-gray-600 font-mono">{uid}</p>}
      </div>
    )
  }
  return (
    <div className="w-full px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-left">
      <p className="text-sm font-medium text-amber-400 mb-0.5">{label}: tag not written</p>
      <p className="text-xs text-amber-500/80">{writeError}</p>
      <p className="text-xs text-gray-500 mt-1">UID was recorded — try a fresh NTAG215 tag for printer recognition.</p>
      {uid && <p className="text-xs text-gray-600 font-mono mt-0.5">{uid}</p>}
    </div>
  )
}
