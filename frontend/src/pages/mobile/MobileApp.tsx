import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getNfcSession, postNfcTagA, postNfcResult, getSpoolmanStock, createNfcSession, patchSpoolmanLotNr, patchSpoolmanRemainingWeight, patchSpoolmanFilamentSpoolWeight, type NfcSession, type SpoolmanSpool } from '../../api/client'
import { Check, Loader2, X, AlertTriangle, WifiOff, Nfc, ChevronRight, ArrowLeft, Scale, Sparkles, Info } from 'lucide-react'

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

type AppPhase =
  | 'connecting'
  | 'idle'
  | 'spool_picker'
  | 'nfc_loading'
  | 'nfc_ready'
  | 'nfc_scanning'
  | 'nfc_ask_second'
  | 'nfc_scanning_b'
  | 'nfc_done'
  | 'weigh_spool'
  | 'nfc_error'
  | 'disconnected'
  | 'session_error'

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

function getDeviceName(): string {
  const uad = (navigator as { userAgentData?: { platform?: string } }).userAgentData
  if (uad?.platform) return uad.platform
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'Android'
  if (/iphone/i.test(ua)) return 'iPhone'
  if (/ipad/i.test(ua)) return 'iPad'
  return 'Phone'
}

function toValidPrinterType(raw: string): string {
  const upper = raw.toUpperCase().trim()
  if (VALID_PRINTER_TYPES.has(upper)) return upper
  if (FILAMENT_TYPE_ALIASES[upper]) return FILAMENT_TYPE_ALIASES[upper]
  const base = upper.replace(/[+].*$/, '').trim()
  if (VALID_PRINTER_TYPES.has(base)) return base
  return 'PLA'
}

export default function MobileApp() {
  const { token } = useParams<{ token: string }>()

  const [phase, setPhase] = useState<AppPhase>('connecting')
  // Keep a ref in sync so WS callbacks can read current phase without stale closures
  const _setPhase = (p: AppPhase) => { phaseRef.current = p; setPhase(p) }
  const [sessionError, setSessionError] = useState<string | null>(null)

  const [nfcSession, setNfcSession] = useState<NfcSession | null>(null)
  const [nfcToken, setNfcToken] = useState<string | null>(null)

  const [cardUidA, setCardUidA] = useState<string | null>(null)
  const [wroteTagA, setWroteTagA] = useState(false)
  const [writeErrorA, setWriteErrorA] = useState<string | null>(null)
  const [cardUidB, setCardUidB] = useState<string | null>(null)
  const [wroteTagB, setWroteTagB] = useState(false)
  const [writeErrorB, setWriteErrorB] = useState<string | null>(null)
  const [nfcErrorMsg, setNfcErrorMsg] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)
  const nfcTokenRef = useRef<string | null>(null)
  const cardUidARef = useRef<string | null>(null)
  const wroteTagARef = useRef(false)
  const nfcSessionRef = useRef<NfcSession | null>(null)
  const serverInstanceRef = useRef<string | null>(null)
  const failureCountRef = useRef(0)
  const phaseRef = useRef<AppPhase>('connecting')

  // Spool picker state
  const [spools, setSpools] = useState<SpoolmanSpool[]>([])
  const [spoolsLoading, setSpoolsLoading] = useState(false)
  const phoneInitiatedRef = useRef(false)

  // Weigh spool state
  const [weighSpool, setWeighSpool] = useState<SpoolmanSpool | null>(null)
  const [weighLoading, setWeighLoading] = useState(false)

  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

  useEffect(() => {
    document.body.style.backgroundColor = '#030712'
    return () => { document.body.style.backgroundColor = '' }
  }, [])

  function connectWs(tok: string) {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/mobile/ws/${tok}/phone`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!unmountedRef.current) {
        failureCountRef.current = 0
        ws.send(JSON.stringify({ type: 'hello', name: getDeviceName() }))
        _setPhase('idle')
      }
    }

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data)

        if (msg.type === 'server_info') {
          if (serverInstanceRef.current && serverInstanceRef.current !== msg.instance_id) {
            // Backend restarted with a new build — reload to pick up fresh JS
            window.location.reload()
            return
          }
          serverInstanceRef.current = msg.instance_id
          return
        }
        if (msg.type === 'task' && msg.task_type === 'nfc_write' && msg.nfc_token) {
          setCardUidA(null); cardUidARef.current = null
          setWroteTagA(false); wroteTagARef.current = false
          setWriteErrorA(null)
          setCardUidB(null)
          setWroteTagB(false)
          setWriteErrorB(null)
          setNfcErrorMsg(null)
          setNfcToken(msg.nfc_token)
          nfcTokenRef.current = msg.nfc_token
          setNfcSession(null)
          nfcSessionRef.current = null
          _setPhase('nfc_loading')
          try {
            const s = await getNfcSession(msg.nfc_token)
            nfcSessionRef.current = s
            setNfcSession(s)
            _setPhase('nfc_ready')
          } catch {
            _setPhase('nfc_error')
            setNfcErrorMsg('Failed to load task. Try again from desktop.')
          }
        }
      } catch { /* ignore */ }
    }

    ws.onclose = (event) => {
      if (unmountedRef.current) return

      if (event.code === 4004) {
        failureCountRef.current++
        if (failureCountRef.current >= 3) {
          setSessionError('Session expired — scan the QR code again from 3DMRP.')
          _setPhase('session_error')
          return
        }
      } else {
        failureCountRef.current = 0
      }

      // Don't interrupt active NFC flows — reconnect silently in background
      const nfcActive = ['nfc_loading', 'nfc_ready', 'nfc_scanning', 'nfc_ask_second', 'nfc_scanning_b', 'nfc_done', 'nfc_error'].includes(phaseRef.current)
      if (!nfcActive) _setPhase('disconnected')

      const delay = Math.min(1000 + failureCountRef.current * 2000, 10000)
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          if (!nfcActive) _setPhase('connecting')
          connectWs(tok)
        }
      }, delay)
    }

    ws.onerror = () => ws.close()
  }

  useEffect(() => {
    if (!token) {
      setSessionError('Missing session token')
      _setPhase('session_error')
      return
    }
    connectWs(token)
    return () => {
      unmountedRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runNfcScan(
    session: NfcSession,
    onRead: (uid: string, wrote: boolean, writeErr: string | null) => void,
    onError: (msg: string) => void,
  ) {
    try {
      const reader = new window.NDEFReader()
      await reader.scan()
      let handled = false
      reader.addEventListener('reading', async (ev: Event) => {
        if (handled) return
        handled = true
        const event = ev as NDEFReadingEvent
        const uid = event.serialNumber.replace(/:/g, '')
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
              { records: [{ recordType: 'mime', mediaType: 'application/json', data: encoder.encode(JSON.stringify(payload)) }] },
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
      onError(e instanceof Error ? e.message : 'NFC failed')
    }
  }

  async function startScanA() {
    const session = nfcSessionRef.current
    const tok = nfcTokenRef.current
    if (!session || !tok) return
    _setPhase('nfc_scanning')
    setNfcErrorMsg(null)
    setWriteErrorA(null)
    await runNfcScan(
      session,
      async (uid, wrote, writeErr) => {
        setCardUidA(uid); cardUidARef.current = uid
        setWroteTagA(wrote); wroteTagARef.current = wrote
        setWriteErrorA(writeErr)
        try {
          await postNfcTagA(tok, { card_uid: uid, wrote_tag: wrote })
          _setPhase('nfc_ask_second')
        } catch {
          _setPhase('nfc_error')
          setNfcErrorMsg('Session lost — try again from desktop.')
        }
      },
      (msg) => { _setPhase('nfc_error'); setNfcErrorMsg(msg) },
    )
  }

  async function startScanB() {
    const session = nfcSessionRef.current
    const tok = nfcTokenRef.current
    const uidA = cardUidARef.current
    const wroteA = wroteTagARef.current
    if (!session || !tok || !uidA) return
    _setPhase('nfc_scanning_b')
    setNfcErrorMsg(null)
    setWriteErrorB(null)
    await runNfcScan(
      session,
      async (uid, wrote, writeErr) => {
        setCardUidB(uid)
        setWroteTagB(wrote)
        setWriteErrorB(writeErr)
        try {
          await postNfcResult(tok, { card_uid: uidA, wrote_tag: wroteA, card_uid_b: uid, wrote_tag_b: wrote })
        } catch { /* ignore */ }
        if (phoneInitiatedRef.current && nfcSessionRef.current) {
          const spoolId = nfcSessionRef.current.spool_id
          const uids = [uidA, uid].filter(Boolean) as string[]
          patchSpoolmanLotNr(spoolId, uids).catch(() => { /* ignore */ })
        }
        wsRef.current?.send(JSON.stringify({
          type: 'task_result', task_type: 'nfc_write', success: true,
          card_uid: uidA, card_uid_b: uid,
        }))
        _setPhase('nfc_done')
      },
      (msg) => { _setPhase('nfc_error'); setNfcErrorMsg(msg) },
    )
  }

  async function skipSecondTag() {
    const tok = nfcTokenRef.current
    const uidA = cardUidARef.current
    const wroteA = wroteTagARef.current
    if (!tok || !uidA) return
    try {
      await postNfcResult(tok, { card_uid: uidA, wrote_tag: wroteA })
    } catch { /* ignore */ }
    if (phoneInitiatedRef.current && nfcSessionRef.current) {
      patchSpoolmanLotNr(nfcSessionRef.current.spool_id, [uidA]).catch(() => { /* ignore */ })
    }
    wsRef.current?.send(JSON.stringify({
      type: 'task_result', task_type: 'nfc_write', success: true,
      card_uid: uidA,
    }))
    _setPhase('nfc_done')
  }

  function returnToIdle() {
    _setPhase('idle')
    setNfcSession(null)
    nfcSessionRef.current = null
    setNfcToken(null)
    nfcTokenRef.current = null
    phoneInitiatedRef.current = false
  }

  async function openSpoolPicker() {
    setSpoolsLoading(true)
    _setPhase('spool_picker')
    try {
      const res = await getSpoolmanStock()
      setSpools((res.spools ?? []).filter(s => !s.archived))
    } catch {
      setSpools([])
    }
    setSpoolsLoading(false)
  }

  async function handleSpoolPick(spool: SpoolmanSpool) {
    phoneInitiatedRef.current = true
    setCardUidA(null); cardUidARef.current = null
    setWroteTagA(false); wroteTagARef.current = false
    setWriteErrorA(null)
    setCardUidB(null); setWroteTagB(false); setWriteErrorB(null)
    setNfcErrorMsg(null)
    _setPhase('nfc_loading')

    try {
      const spoolLabel = spool.filament.name
        ? `${spool.filament.name} #${spool.id}`
        : `Spool #${spool.id}`
      const colorHex = spool.filament.color_hex
        ? (spool.filament.color_hex.startsWith('#') ? spool.filament.color_hex.slice(1) : spool.filament.color_hex)
        : undefined
      const created = await createNfcSession({
        spool_id: spool.id,
        spool_label: spoolLabel,
        slot: 'A',
        mode: 'read_write',
        filament_type: spool.filament.material || undefined,
        color_hex: colorHex,
        brand: spool.filament.vendor?.name || undefined,
      })
      nfcTokenRef.current = created.token
      setNfcToken(created.token)
      const s = await getNfcSession(created.token)
      nfcSessionRef.current = s
      setNfcSession(s)
      _setPhase('nfc_ready')
    } catch {
      _setPhase('nfc_error')
      setNfcErrorMsg('Failed to create tag session. Check your connection and try again.')
    }
  }

  async function handleWeighYes() {
    if (!nfcSession) return
    const spoolId = nfcSession.spool_id
    let spool = spools.find(s => s.id === spoolId) ?? null
    if (!spool) {
      setWeighLoading(true)
      try {
        const res = await getSpoolmanStock()
        spool = res.spools.find(s => s.id === spoolId) ?? null
      } catch { /* ignore */ }
      setWeighLoading(false)
    }
    if (spool) {
      setWeighSpool(spool)
      _setPhase('weigh_spool')
    }
  }

  // Session error (bad URL)
  if (phase === 'session_error') {
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <X size={32} className="text-red-400" />
        </div>
        <p className="text-white font-semibold">{sessionError}</p>
        <p className="text-sm text-gray-400">Scan the QR code on the desktop to get a fresh link.</p>
      </div>
    )
  }

  // Connecting / reconnecting
  if (phase === 'connecting' || phase === 'disconnected') {
    const isCustomDomain = !/^(localhost|(\d+\.)+\d+)$/.test(window.location.hostname)
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
          {phase === 'disconnected'
            ? <WifiOff size={28} className="text-gray-500" />
            : <Loader2 size={28} className="text-brand-400 animate-spin" />}
        </div>
        <div className="space-y-1">
          <p className="text-white font-semibold">
            {phase === 'disconnected' ? 'Connection lost' : 'Connecting…'}
          </p>
          <p className="text-sm text-gray-500">
            {phase === 'disconnected' ? 'Reconnecting to 3DMRP…' : 'Opening secure channel…'}
          </p>
        </div>
        {phase === 'disconnected' && isCustomDomain && (
          <p className="text-xs text-gray-600 leading-relaxed max-w-xs">
            Using a reverse proxy? Make sure it forwards WebSocket upgrades for <span className="font-mono text-gray-500">/api/</span>.
          </p>
        )}
      </div>
    )
  }

  // Idle — connected menu
  if (phase === 'idle') {
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
        <div className="px-6 pt-safe pt-10 pb-6 border-b border-gray-800">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-1">3DMRP Mobile</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <p className="text-sm text-green-400 font-medium">Connected</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-6 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-widest px-2 mb-3">Actions</p>

          <button
            onClick={openSpoolPicker}
            className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-gray-900 border border-gray-800 hover:border-brand-500/50 hover:bg-gray-800 active:bg-gray-700 transition-colors text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <Nfc size={22} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Tag a Spool</p>
              <p className="text-xs text-gray-400 mt-0.5">Pick a spool and write its NFC tags</p>
            </div>
            <ChevronRight size={16} className="text-gray-600 shrink-0" />
          </button>
        </div>

        <div className="px-6 pb-safe pb-8 pt-2 text-center">
          <p className="text-xs text-gray-700">Desktop tasks will appear automatically.</p>
        </div>
      </div>
    )
  }

  // Spool picker
  if (phase === 'spool_picker') {
    return <SpoolPickerScreen
      spools={spools}
      loading={spoolsLoading}
      onPick={handleSpoolPick}
      onBack={returnToIdle}
    />
  }

  // Weigh spool
  if (phase === 'weigh_spool' && weighSpool) {
    return <WeighSpoolScreen
      spool={weighSpool}
      onDone={() => { setWeighSpool(null); _setPhase('nfc_done') }}
    />
  }

  // NFC loading
  if (phase === 'nfc_loading') {
    return (
      <div className="min-h-dvh bg-gray-950 flex items-center justify-center">
        <Loader2 size={28} className="text-brand-400 animate-spin" />
      </div>
    )
  }

  // NFC done
  if (phase === 'nfc_done') {
    const tagCount = cardUidB ? 2 : 1

    function sendPrintLabel() {
      if (nfcSession) {
        wsRef.current?.send(JSON.stringify({ type: 'task', task_type: 'print_label', spool_id: nfcSession.spool_id }))
      }
      returnToIdle()
    }

    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check size={40} className="text-green-400" />
          </div>
          <div className="space-y-1">
            <p className="text-white text-xl font-bold">
              {tagCount === 2 ? 'Both Tags Written' : 'Tag Written'}
            </p>
            {nfcSession && <p className="text-sm text-gray-400">{nfcSession.spool_label}</p>}
          </div>
          {wroteTagA && (
            <div className="w-full px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30">
              <p className="text-sm font-medium text-green-400">Tag A: spool ID written</p>
              {cardUidA && <p className="text-xs text-gray-600 font-mono mt-0.5">{cardUidA}</p>}
            </div>
          )}
          {!wroteTagA && writeErrorA && <NfcWriteErrorBox writeError={writeErrorA} label="Tag A" uid={cardUidA} />}
          {cardUidB && wroteTagB && (
            <div className="w-full px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30">
              <p className="text-sm font-medium text-green-400">Tag B: spool ID written</p>
              {cardUidB && <p className="text-xs text-gray-600 font-mono mt-0.5">{cardUidB}</p>}
            </div>
          )}
          {cardUidB && !wroteTagB && writeErrorB && <NfcWriteErrorBox writeError={writeErrorB} label="Tag B" uid={cardUidB} />}
        </div>
        <div className="px-6 pb-safe pb-10 pt-4 space-y-3">
          {nfcSession ? (
            <>
              <button
                onClick={handleWeighYes}
                disabled={weighLoading}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-base transition-colors disabled:opacity-50"
              >
                {weighLoading ? <Loader2 size={18} className="animate-spin" /> : <Scale size={18} />}
                Weigh this spool
              </button>
              <button
                onClick={sendPrintLabel}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-gray-700 text-gray-300 font-medium text-sm hover:bg-gray-900 transition-colors"
              >
                Print QR label
              </button>
              <button
                onClick={returnToIdle}
                className="w-full py-3 text-gray-500 text-sm font-medium hover:text-gray-300 transition-colors"
              >
                Done
              </button>
            </>
          ) : (
            <button
              onClick={returnToIdle}
              className="w-full py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-base transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    )
  }

  // NFC ask second tag
  if (phase === 'nfc_ask_second') {
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
        <div className="px-6 pt-safe pt-10 pb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">Tag A Written</p>
          {nfcSession && <p className="text-2xl font-bold leading-tight">{nfcSession.spool_label}</p>}
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

  // NFC scan UI (nfc_ready / nfc_scanning / nfc_scanning_b / nfc_error)
  const isScanning = phase === 'nfc_scanning' || phase === 'nfc_scanning_b'
  const isError = phase === 'nfc_error'
  const isScanningB = phase === 'nfc_scanning_b'

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
      <div className="px-6 pt-safe pt-10 pb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">
          {isScanningB ? 'Second Tag' : 'Tag Spool'}
        </p>
        {nfcSession && (
          <>
            <p className="text-2xl font-bold leading-tight">{nfcSession.spool_label}</p>
            <p className="text-sm text-gray-400 mt-1">
              {isScanningB ? 'Tag B' : 'Tag A'}
              {nfcSession.mode === 'read_write' ? ' · spool ID will be written' : ' · read only'}
            </p>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-10">
        {!nfcSupported ? (
          <div className="text-center space-y-4">
            <AlertTriangle size={48} className="text-amber-400 mx-auto" />
            <p className="text-white font-semibold">NFC not supported</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              NFC writing requires Android Chrome. This browser does not support the Web NFC API.
            </p>
          </div>
        ) : (
          <>
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
                  <p className="text-sm text-gray-400">{nfcErrorMsg}</p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {nfcSupported && (
        <div className="px-6 pb-safe pb-10 pt-4">
          <button
            onClick={isError && cardUidA ? startScanB : startScanA}
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

function pillCls(active: boolean) {
  return `shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
    active ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 active:bg-gray-700'
  }`
}

function SpoolPickerScreen({
  spools, loading, onPick, onBack,
}: {
  spools: SpoolmanSpool[]
  loading: boolean
  onPick: (spool: SpoolmanSpool) => void
  onBack: () => void
}) {
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null)
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const materials = useMemo(() => {
    const seen = new Set<string>()
    spools.forEach(s => { if (s.filament.material) seen.add(s.filament.material) })
    return Array.from(seen).sort()
  }, [spools])

  const brands = useMemo(() => {
    const seen = new Set<string>()
    spools.forEach(s => { if (s.filament.vendor?.name) seen.add(s.filament.vendor.name) })
    return Array.from(seen).sort()
  }, [spools])

  const colors = useMemo(() => {
    const seen = new Set<string>()
    spools.forEach(s => {
      const raw = s.filament.multi_color_hexes
        ? s.filament.multi_color_hexes.split(/[,;]/)[0]
        : s.filament.color_hex
      if (raw) seen.add(raw.replace('#', '').toUpperCase())
    })
    return Array.from(seen)
  }, [spools])

  const filtered = useMemo(() => {
    let active = spools.filter(s => !s.archived)
    if (selectedMaterial) active = active.filter(s => s.filament.material === selectedMaterial)
    if (selectedBrand) active = active.filter(s => s.filament.vendor?.name === selectedBrand)
    if (selectedColor) active = active.filter(s => {
      const raw = s.filament.multi_color_hexes
        ? s.filament.multi_color_hexes.split(/[,;]/)[0]
        : s.filament.color_hex
      return (raw ?? '').replace('#', '').toUpperCase() === selectedColor
    })
    active.sort((a, b) => sortDir === 'asc' ? a.id - b.id : b.id - a.id)
    return active
  }, [spools, selectedMaterial, selectedBrand, selectedColor, sortDir])

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-10 pb-4 border-b border-gray-800">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center shrink-0"
        >
          <ArrowLeft size={16} className="text-gray-300" />
        </button>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">3DMRP Mobile</p>
          <p className="text-sm font-semibold text-white">Tag a Spool</p>
        </div>
      </div>

      {/* Filter pills */}
      {!loading && (
        <div className="border-b border-gray-800 divide-y divide-gray-800/60">
          {materials.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-2.5">
              <button onClick={() => setSelectedMaterial(null)} className={pillCls(!selectedMaterial)}>All</button>
              {materials.map(m => (
                <button key={m} onClick={() => setSelectedMaterial(selectedMaterial === m ? null : m)} className={pillCls(selectedMaterial === m)}>{m}</button>
              ))}
            </div>
          )}
          {brands.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-2.5">
              <button onClick={() => setSelectedBrand(null)} className={pillCls(!selectedBrand)}>All</button>
              {brands.map(b => (
                <button key={b} onClick={() => setSelectedBrand(selectedBrand === b ? null : b)} className={pillCls(selectedBrand === b)}>{b}</button>
              ))}
            </div>
          )}
          {colors.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <button onClick={() => setSelectedColor(null)} className={pillCls(!selectedColor)}>All</button>
              {colors.map(hex => (
                <button
                  key={hex}
                  onClick={() => setSelectedColor(selectedColor === hex ? null : hex)}
                  className={`shrink-0 w-8 h-8 rounded-full border-2 transition-all ${
                    selectedColor === hex ? 'border-white ring-2 ring-brand-500' : 'border-gray-700'
                  }`}
                  style={{ backgroundColor: `#${hex}` }}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="text-xs text-gray-500">Sort</span>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className={pillCls(true)}
            >
              ID {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16">
            <Loader2 size={20} className="animate-spin text-brand-400" />
            <span className="text-sm text-gray-400">Loading spools…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
            <p className="text-sm text-gray-500">{spools.length === 0 ? 'No spools found in Spoolman.' : 'No spools match your search.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {filtered.map(spool => {
              const rawHex = spool.filament.multi_color_hexes
                ? spool.filament.multi_color_hexes.split(/[,;]/)[0]
                : spool.filament.color_hex
              const hex = rawHex
                ? (rawHex.startsWith('#') ? rawHex : `#${rawHex}`)
                : '#888888'
              const name = spool.filament.name || `Spool #${spool.id}`
              const sub = [spool.filament.material, spool.filament.vendor?.name].filter(Boolean).join(' · ')
              const pct = spool.filament.weight && spool.remaining_weight != null
                ? Math.round(Math.min(100, (spool.remaining_weight / spool.filament.weight) * 100))
                : null
              return (
                <button
                  key={spool.id}
                  onClick={() => onPick(spool)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-900 active:bg-gray-800 transition-colors text-left"
                >
                  <div
                    className="w-9 h-9 rounded-full shrink-0 border border-black/20"
                    style={{ backgroundColor: hex }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      #{spool.id}{sub ? ` · ${sub}` : ''}
                      {pct != null ? ` · ${pct}%` : ''}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function WeighSpoolScreen({ spool, onDone }: { spool: SpoolmanSpool; onDone: () => void }) {
  const [gross, setGross] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detectedTare, setDetectedTare] = useState<number | null>(null)
  const [updatingTare, setUpdatingTare] = useState(false)

  const tare = spool.filament.spool_weight
  const grossNum = parseFloat(gross)
  const remaining = tare != null && gross !== '' && !isNaN(grossNum) ? grossNum - tare : null
  const belowTare = remaining !== null && remaining < 0
  const canSave = remaining !== null && !belowTare && !saving

  async function handleSave() {
    if (!canSave || remaining === null) return
    setSaving(true)
    setError(null)
    try {
      await patchSpoolmanRemainingWeight(spool.id, Math.round(remaining))
      const filamentWeight = spool.filament.weight
      if (filamentWeight != null && remaining > filamentWeight * 0.95) {
        setDetectedTare(Math.round(grossNum - filamentWeight))
        setSaving(false)
      } else {
        onDone()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update Spoolman')
      setSaving(false)
    }
  }

  async function handleUpdateTare() {
    if (detectedTare === null) return
    setUpdatingTare(true)
    try {
      await patchSpoolmanFilamentSpoolWeight(spool.filament.id, detectedTare)
    } catch { /* best-effort */ }
    onDone()
  }

  const rawHex = spool.filament.multi_color_hexes
    ? spool.filament.multi_color_hexes.split(/[,;]/)[0]
    : spool.filament.color_hex
  const color = rawHex ? (rawHex.startsWith('#') ? rawHex : `#${rawHex}`) : '#888888'
  const name = spool.filament.name || `Spool #${spool.id}`
  const sub = [spool.filament.material, spool.filament.vendor?.name].filter(Boolean).join(' · ')

  return (
    <div className="min-h-dvh bg-gray-950 flex flex-col text-white select-none">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-10 pb-4 border-b border-gray-800">
        <button
          onClick={onDone}
          className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center shrink-0"
        >
          <ArrowLeft size={16} className="text-gray-300" />
        </button>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">3DMRP Mobile</p>
          <p className="text-sm font-semibold text-white">Weigh Spool</p>
        </div>
      </div>

      {detectedTare !== null ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <Sparkles size={36} className="text-green-400" />
          </div>
          <div className="space-y-1">
            <p className="text-white text-xl font-bold">New Spool Detected</p>
            <p className="text-sm text-gray-400">
              Calculated empty spool weight: <span className="font-semibold text-white">{detectedTare} g</span>
            </p>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
            Update the filament type in Spoolman so future weighings are more accurate?
          </p>
        </div>
      ) : (
        <div className="flex-1 px-5 py-6 space-y-5">
          <div className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-xl">
            <div className="w-9 h-9 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: color }} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{name}</p>
              {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
            </div>
          </div>

          {tare == null ? (
            <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
              Spool tare weight is not set on this filament type in Spoolman. Set it there first, then try again.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Empty spool weight (tare)</span>
                <span className="text-sm font-medium text-gray-200">{tare} g</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Gross weight (spool + filament)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1}
                    autoFocus
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-lg font-semibold text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder={`e.g. ${tare + 500}`}
                    value={gross}
                    onChange={e => { setGross(e.target.value); setError(null) }}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                  />
                  <span className="text-gray-400 text-sm font-medium shrink-0">g</span>
                </div>
                {belowTare && (
                  <p className="text-xs text-red-400">Gross weight must be greater than the tare ({tare} g).</p>
                )}
              </div>

              {remaining !== null && !belowTare && (
                <div className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-xl">
                  <span className="text-sm text-gray-400">Remaining filament</span>
                  <span className="text-2xl font-bold text-brand-400">{Math.round(remaining)} g</span>
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          )}

          <div className="flex gap-2 text-xs text-blue-300 bg-blue-500/10 border border-blue-500/25 rounded-xl px-3 py-2.5">
            <Info size={13} className="shrink-0 mt-px" />
            <p className="leading-relaxed">
              Place the spool on a scale and enter the total weight. The tare is pulled from the filament type in Spoolman. If the tare is wrong, the calculated remaining weight will drift.
            </p>
          </div>
        </div>
      )}

      <div className="px-5 pb-safe pb-8 pt-4 space-y-3">
        {detectedTare !== null ? (
          <>
            <button
              onClick={handleUpdateTare}
              disabled={updatingTare}
              className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold text-base transition-colors disabled:opacity-50"
            >
              {updatingTare ? 'Updating…' : 'Update Tare'}
            </button>
            <button
              onClick={onDone}
              className="w-full py-3 text-gray-500 text-sm font-medium hover:text-gray-300 transition-colors"
            >
              Skip
            </button>
          </>
        ) : (
          <>
            {tare != null && (
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="w-full py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-base transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Weight'}
              </button>
            )}
            <button
              onClick={onDone}
              className="w-full py-3 text-gray-500 text-sm font-medium hover:text-gray-300 transition-colors"
            >
              {tare == null ? 'Back' : 'Cancel'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function NfcWriteErrorBox({ writeError, label, uid }: { writeError: string; label: string; uid: string | null }) {
  if (writeError === 'incompatible') {
    return (
      <div className="w-full px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-left space-y-1.5">
        <p className="text-sm font-semibold text-amber-400">{label}: tag could not be written</p>
        <p className="text-xs text-amber-300/80 leading-relaxed">
          This tag contains data that can't be overwritten via the browser. Use a fresh NTAG215 tag, or use NFC Tools to format it first.
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
