import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { getSpoolmanStock } from '../../api/client'

const LABEL_SIZES = [
  { w: 40, h: 25 },
  { w: 40, h: 30 },
  { w: 50, h: 30 },
  { w: 50, h: 40 },
  { w: 62, h: 29 },
  { w: 57, h: 32 },
]

const MM = 3.7795275591
const SCALE = 3 // screen preview multiplier

export default function SpoolLabelPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const sizeIndex = Math.min(Number(params.get('size') ?? 0), LABEL_SIZES.length - 1)
  const { w, h } = LABEL_SIZES[sizeIndex]

  const { data: stock } = useQuery({ queryKey: ['spoolman-stock'], queryFn: getSpoolmanStock })
  const spool = stock?.spools.find(s => s.id === Number(id))

  useEffect(() => {
    if (spool) {
      document.title = `Label — #${spool.id} ${spool.filament.name || ''}`
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [spool])

  useEffect(() => {
    window.addEventListener('afterprint', () => window.close())
  }, [])

  if (!spool) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#6b7280' }}>
        {stock ? 'Spool not found.' : 'Loading…'}
      </div>
    )
  }

  const line1 = spool.filament.name || `Spool #${spool.id}`
  const line2 = [spool.filament.material, spool.filament.vendor?.name].filter(Boolean).join(' · ')

  // QR fills label height minus vertical padding; capped so text column gets at least half the width
  const qrMm = Math.min(h - 4, (w - 5) / 2)
  const qrPx = Math.round(qrMm * MM * SCALE)

  const idFontMm = h * 0.18
  const nameFontMm = h * 0.08
  const subFontMm = h * 0.08

  return (
    <>
      <style>{`
        @page { size: ${w}mm ${h}mm; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          height: 100%;
        }
        body {
          font-family: sans-serif;
          background: #f3f4f6;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          gap: 20px;
        }
        .label {
          background: #fff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0,0,0,.08);
          display: flex;
          flex-direction: row;
          align-items: center;
          width: ${w * MM * SCALE}px;
          height: ${h * MM * SCALE}px;
          padding: ${2 * MM * SCALE}px ${2.5 * MM * SCALE}px;
          gap: ${2 * MM * SCALE}px;
          overflow: hidden;
        }
        .label svg { width: ${qrPx}px; height: ${qrPx}px; flex-shrink: 0; }
        .text-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
          gap: ${0.5 * MM * SCALE}px;
        }
        .id   { font-size: ${idFontMm * MM * SCALE}px; font-weight: 900; line-height: 1; color: #111; }
        .name { font-size: ${nameFontMm * MM * SCALE}px; font-weight: 600; color: #222; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .sub  { font-size: ${subFontMm * MM * SCALE}px; color: #6b7280; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .note { font-size: 11px; color: #9ca3af; }
        .btn  { background: #0284c7; color: #fff; border: none; border-radius: 8px; padding: 10px 28px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .btn:hover { background: #0369a1; }
        @media print {
          body { background: #fff; min-height: unset; width: ${w}mm; height: ${h}mm; gap: 0; overflow: hidden; }
          .label {
            border: none; box-shadow: none; border-radius: 0;
            width: ${w}mm; height: ${h}mm;
            padding: 2mm 2.5mm; gap: 2mm;
          }
          .label svg { width: ${qrMm}mm !important; height: ${qrMm}mm !important; }
          .text-col { gap: 0.5mm; }
          .id   { font-size: ${idFontMm}mm; }
          .name { font-size: ${nameFontMm}mm; -webkit-line-clamp: 3; }
          .sub  { font-size: ${subFontMm}mm; }
          .btn, .note { display: none; }
        }
      `}</style>
      <div className="label">
        <QRCodeSVG value={String(spool.id)} size={qrPx} bgColor="#ffffff" fgColor="#111827" level="M" />
        <div className="text-col">
          <p className="id">#{spool.id}</p>
          <p className="name">{line1}</p>
          {line2 && <p className="sub">{line2}</p>}
        </div>
      </div>
      <p className="note">{w} × {h} mm</p>
      <button className="btn" onClick={() => window.print()}>Print</button>
    </>
  )
}
