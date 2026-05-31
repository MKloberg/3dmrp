import { QRCodeSVG } from 'qrcode.react'
import type { LabelPrintProps, TextElement, QrElement, SwatchElement } from './types'

const PT_TO_MM = 0.3528

export function LabelPrint({ template, data }: LabelPrintProps) {
  const { widthMm, heightMm, elements } = template

  return (
    <div className="label-print-root">
      {data.map((item, i) => (
        <div
          key={i}
          className="label-card"
          style={{
            position: 'relative',
            width: `${widthMm}mm`,
            height: `${heightMm}mm`,
            overflow: 'hidden',
            background: '#ffffff',
            pageBreakAfter: 'always',
            breakAfter: 'page',
          }}
        >
          {elements.map(el => {
            const base: React.CSSProperties = {
              position: 'absolute',
              left: `${el.xMm}mm`,
              top: `${el.yMm}mm`,
            }

            if (el.type === 'text') {
              const t = el as TextElement
              const value = item[t.fieldKey] ?? `[${t.fieldKey}]`
              return (
                <div
                  key={el.id}
                  style={{
                    ...base,
                    fontSize: `${t.fontSizePt * PT_TO_MM}mm`,
                    fontWeight: t.fontWeight,
                    color: t.color,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    fontFamily: 'sans-serif',
                  }}
                >
                  {value}
                </div>
              )
            }

            if (el.type === 'qr') {
              const q = el as QrElement
              const value = item[q.fieldKey] ?? ''
              if (!value) return null
              const sizeMm = q.sizeMm
              // Convert mm to px for QRCodeSVG (96dpi: 1mm ≈ 3.78px)
              const sizePx = Math.round(sizeMm * 3.7795)
              return (
                <div key={el.id} style={{ ...base, width: `${sizeMm}mm`, height: `${sizeMm}mm` }}>
                  <QRCodeSVG value={value} size={sizePx} style={{ width: '100%', height: '100%' }} />
                </div>
              )
            }

            if (el.type === 'swatch') {
              const sw = el as SwatchElement
              const color = item[sw.fieldKey] ?? '#cccccc'
              return (
                <div
                  key={el.id}
                  style={{
                    ...base,
                    width: `${sw.widthMm}mm`,
                    height: `${sw.heightMm}mm`,
                    background: color,
                    borderRadius: '1mm',
                  }}
                />
              )
            }

            return null
          })}
        </div>
      ))}
    </div>
  )
}
