import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'

interface Props {
  onScan: (text: string) => void
}

export default function QrScanner({ onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'starting' | 'active' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let alive = true
    let stream: MediaStream | null = null
    let controls: IScannerControls | null = null

    async function start() {
      try {
        // Get camera stream first — gives us clear error feedback for permission issues
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return }

        // Dynamic import keeps @zxing out of the main bundle.
        // A static import crashed the whole app on mobile during bundle evaluation.
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!alive) return

        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromStream(
          stream,
          videoRef.current!,
          (result, _err, ctrl) => {
            if (!controls) controls = ctrl
            if (!alive) return
            setStatus('active')
            if (!result) return
            const text = result.getText()
            if (text !== lastRef.current) {
              lastRef.current = text
              onScan(text)
            }
          },
        )
        if (alive) setStatus('active')
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setStatus('error')
        setErrorMsg(msg)
      }
    }

    start()

    return () => {
      alive = false
      controls?.stop()
      stream?.getTracks().forEach(t => t.stop())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isInsecure =
    window.location.protocol === 'http:' && window.location.hostname !== 'localhost'

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {status === 'active' && (
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '4px 10px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'block' }} />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>LIVE</span>
        </div>
      )}

      {status === 'starting' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Starting camera…</p>
        </div>
      )}

      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 8 }}>
          <p style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Camera unavailable</p>
          <p style={{ color: '#9ca3af', fontSize: 12, wordBreak: 'break-word' }}>{errorMsg}</p>
          {isInsecure && (
            <p style={{ color: '#fbbf24', fontSize: 12, marginTop: 6 }}>
              Both iOS and Android require HTTPS for camera access on local IPs.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
