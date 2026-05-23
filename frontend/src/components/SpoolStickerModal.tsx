import { useRef, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Info, Printer } from 'lucide-react'
import Modal from './Modal'
import { getSettings, setSetting, type SpoolmanSpool } from '../api/client'

export const LABEL_SIZES = [
  { label: '40mm wide × 25mm tall', w: 40, h: 25, qr: 56 },
  { label: '40mm wide × 30mm tall', w: 40, h: 30, qr: 69 },
  { label: '50mm wide × 30mm tall', w: 50, h: 30, qr: 69 },
  { label: '50mm wide × 40mm tall', w: 50, h: 40, qr: 96 },
  { label: '62mm wide × 29mm tall (Brother)', w: 62, h: 29, qr: 66 },
  { label: '57mm wide × 32mm tall (Dymo)', w: 57, h: 32, qr: 74 },
]

export default function SpoolStickerModal({ spool, onClose }: { spool: SpoolmanSpool; onClose: () => void }) {
  const qrRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const [sizeIndex, setSizeIndex] = useState(0)
  const sizeIndexSynced = useRef(false)
  useEffect(() => {
    if (settings && !sizeIndexSynced.current) {
      sizeIndexSynced.current = true
      const n = Number(settings.ui_printer_label_size_index ?? 0)
      if (n >= 0 && n < LABEL_SIZES.length) setSizeIndex(n)
    }
  }, [settings])

  const line1 = spool.filament.name || `Spool #${spool.id}`
  const line2 = [spool.filament.material, spool.filament.vendor?.name].filter(Boolean).join(' · ')

  function rasterizeQr(scale: number, callback: (pngDataUrl: string) => void) {
    const svgEl = qrRef.current?.querySelector('svg')
    if (!svgEl) return
    const { qr } = LABEL_SIZES[sizeIndex]
    const cloned = svgEl.cloneNode(true) as SVGElement
    cloned.setAttribute('width', String(qr * scale))
    cloned.setAttribute('height', String(qr * scale))
    const svgBlob = new Blob([new XMLSerializer().serializeToString(cloned)], { type: 'image/svg+xml' })
    const svgUrl = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = qr * scale
      canvas.height = qr * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(svgUrl)
      callback(canvas.toDataURL('image/png'))
    }
    img.src = svgUrl
  }

  const printUrl = `${window.location.origin}/print/spool/${spool.id}?size=${sizeIndex}`

  function handlePrint() {
    onClose()
    fetch(`/api/settings/open-browser?url=${encodeURIComponent(printUrl)}`)
      .then(r => { if (!r.ok) throw new Error() })
      .catch(() => window.open(printUrl, '_blank'))
  }

  function handleCopyToClipboard() {
    rasterizeQr(5, pngDataUrl => {
      const { qr } = LABEL_SIZES[sizeIndex]
      const qrPx = qr * 5
      const padding = 16
      const textHeight = 22
      const subHeight = 16
      const gap = 8
      const canvasW = qrPx + padding * 2
      const canvasH = qrPx + gap + textHeight + (line2 ? subHeight + 4 : 0) + padding * 2
      const canvas = document.createElement('canvas')
      canvas.width = canvasW
      canvas.height = canvasH
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasW, canvasH)
      const qrImg = new Image()
      qrImg.onload = () => {
        ctx.drawImage(qrImg, padding, padding, qrPx, qrPx)
        ctx.fillStyle = '#111111'
        ctx.font = `bold ${Math.round(textHeight * 0.8)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(line1, canvasW / 2, padding + qrPx + gap)
        if (line2) {
          ctx.font = `${Math.round(subHeight * 0.8)}px sans-serif`
          ctx.fillStyle = '#444444'
          ctx.fillText(line2, canvasW / 2, padding + qrPx + gap + textHeight + 4)
        }
        canvas.toBlob(async blob => {
          if (!blob) return
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch { /* clipboard API not available */ }
        }, 'image/png')
      }
      qrImg.src = pngDataUrl
    })
  }

  return (
    <Modal title="Spool QR Label" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div ref={qrRef}>
          <QRCodeSVG value={String(spool.id)} size={100} bgColor="#ffffff" fgColor="#111827" level="M" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-800 dark:text-gray-200">#{spool.id} {line1}</p>
          {line2 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{line2}</p>}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Print and affix this label to the spool</p>
        </div>
        <div className="flex items-center gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Label size</label>
          <select
            value={sizeIndex}
            onChange={e => { const i = Number(e.target.value); setSizeIndex(i); setSetting('ui_printer_label_size_index', String(i)) }}
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
          >
            {LABEL_SIZES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
        >
          <Printer size={14} />
          Print Label
        </button>
        <button
          onClick={handleCopyToClipboard}
          className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <Copy size={12} />
          {copied ? 'Copied!' : 'Copy QR code image to clipboard'}
        </button>
        <div className="w-full flex items-start gap-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-3 py-2.5 text-xs text-green-800 dark:text-green-300 leading-relaxed">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>Stick this label on the spool. When loading filament at a printer, scan it with your phone via the <strong>Mobile</strong> QR code in the sidebar — the app will identify the spool automatically.</span>
        </div>
      </div>
    </Modal>
  )
}
