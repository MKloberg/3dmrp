import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getSpoolmanStock, getSettings, SpoolmanSpool } from '../../api/client'
import { ArrowLeft, WifiOff, MapPin, LayoutList, LayoutGrid, QrCode, Copy, Info } from 'lucide-react'
import { SpoolIcon } from '../../components/SpoolIcon'
import { QRCodeSVG } from 'qrcode.react'
import Modal from '../../components/Modal'

type View = 'list' | 'details'

const LABEL_SIZES = [
  { label: '40mm wide × 25mm tall', w: 40, h: 25, qr: 56 },
  { label: '40mm wide × 30mm tall', w: 40, h: 30, qr: 69 },
  { label: '50mm wide × 30mm tall', w: 50, h: 30, qr: 69 },
  { label: '50mm wide × 40mm tall', w: 50, h: 40, qr: 96 },
  { label: '62mm wide × 29mm tall (Brother)', w: 62, h: 29, qr: 66 },
  { label: '57mm wide × 32mm tall (Dymo)', w: 57, h: 32, qr: 74 },
]

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

function weightLabel(g: number | null | undefined): string {
  if (g == null) return '—'
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}

function spoolColor(spool: SpoolmanSpool): string {
  return normalizeHex(
    spool.filament.multi_color_hexes
      ? spool.filament.multi_color_hexes.split(';')[0]
      : spool.filament.color_hex
  )
}

function SpoolStickerModal({ spool, onClose }: { spool: SpoolmanSpool; onClose: () => void }) {
  const qrRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [sizeIndex, setSizeIndex] = useState(() => {
    const saved = localStorage.getItem('printerLabelSizeIndex')
    const n = saved !== null ? Number(saved) : 0
    return n >= 0 && n < LABEL_SIZES.length ? n : 0
  })

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

  function handlePrint() {
    const { w, h, qr } = LABEL_SIZES[sizeIndex]
    rasterizeQr(3, pngDataUrl => {
      const html = `<!DOCTYPE html><html><head><title>${line1}</title><style>
        @page { size: ${w}mm ${h}mm; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #f3f4f6; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 20px; }
        .preview { background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        .preview-name { font-size: 12px; font-weight: 700; color: #111; }
        .preview-sub { font-size: 10px; color: #6b7280; }
        .preview-size { font-size: 10px; color: #6b7280; margin-top: 4px; }
        .btn { background: #0284c7; color: #fff; border: none; border-radius: 8px; padding: 10px 28px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .btn:hover { background: #0369a1; }
        @media print {
          html { height: ${h}mm; }
          html, body { overflow: hidden; }
          body { background: #fff; height: 100%; padding: 2.5mm 1mm 0 1mm; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2px; }
          .btn, .preview-size { display: none; }
          .preview { border: none; box-shadow: none; padding: 0; border-radius: 0; gap: 1px; }
          .label { display: flex; flex-direction: column; align-items: center; gap: 1px; }
          .label-name { font-size: 11px; font-weight: 700; color: #111; text-align: center; max-width: ${w - 4}mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.1; }
          .label-sub { font-size: 9px; color: #444; text-align: center; max-width: ${w - 4}mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.1; }
        }
      </style></head><body>
        <div class="preview">
          <div class="label" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <img src="${pngDataUrl}" width="${qr}" height="${qr}" />
            <p class="label-name preview-name">#${spool.id} ${line1}</p>
            ${line2 ? `<p class="label-sub preview-sub">${line2}</p>` : ''}
          </div>
          <p class="preview-size">${w} &times; ${h} mm label</p>
        </div>
        <button class="btn" onclick="window.print()">Print</button>
        <script>window.addEventListener('afterprint', function() { window.close(); });<\/script>
      </body></html>`
      const pw = 480, ph = 520
      const left = Math.round((window.screen.width - pw) / 2)
      const top = Math.round((window.screen.height - ph) / 2)
      const blob = new Blob([html], { type: 'text/html' })
      const blobUrl = URL.createObjectURL(blob)
      const win = window.open(blobUrl, '_blank', `width=${pw},height=${ph},left=${left},top=${top}`)
      if (win) win.addEventListener('load', () => URL.revokeObjectURL(blobUrl))
    })
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
            onChange={e => { const i = Number(e.target.value); setSizeIndex(i); localStorage.setItem('printerLabelSizeIndex', String(i)) }}
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
          >
            {LABEL_SIZES.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
        >
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

function SpoolRow({ spool, onPrintLabel }: { spool: SpoolmanSpool; onPrintLabel: () => void }) {
  const color = spoolColor(spool)
  const pct = spool.filament.weight && spool.remaining_weight != null
    ? Math.min(100, (spool.remaining_weight / spool.filament.weight) * 100)
    : null

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700 last:border-0">
      <SpoolIcon color={color} size={35} />
      <p className="text-xl font-black text-brand-600 dark:text-brand-400 leading-none shrink-0 w-12">
        #{spool.id}
      </p>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{spool.filament.name || '—'}</span>
          {spool.filament.vendor?.name && (
            <span className="text-xs text-gray-400 shrink-0">{spool.filament.vendor.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
            {spool.filament.material}
          </span>
          {spool.location && (
            <span className="flex items-center gap-0.5 text-xs text-gray-400">
              <MapPin size={10} />{spool.location}
            </span>
          )}
          {spool.lot_nr && <span className="text-xs text-gray-400">Lot: {spool.lot_nr}</span>}
          {spool.comment && (
            <span className="text-xs text-gray-400 italic truncate max-w-40">{spool.comment}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {weightLabel(spool.remaining_weight)}
        </span>
        {pct !== null && (
          <div className="w-24 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct < 20 ? 'bg-red-400' : pct < 50 ? 'bg-yellow-400' : 'bg-teal-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {pct !== null && <span className="text-xs text-gray-400">{Math.round(pct)}%</span>}
      </div>
      <button
        onClick={onPrintLabel}
        title="Print QR label"
        className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shrink-0"
      >
        <QrCode size={16} />
      </button>
    </div>
  )
}

function SpoolCard({ spool, onPrintLabel }: { spool: SpoolmanSpool; onPrintLabel: () => void }) {
  const color = spoolColor(spool)
  const pct = spool.filament.weight && spool.remaining_weight != null
    ? Math.min(100, (spool.remaining_weight / spool.filament.weight) * 100)
    : null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
      <div className="relative flex items-center justify-center py-6" style={{ backgroundColor: `${color}28` }}>
        <SpoolIcon color={color} size={72} />
        <button
          onClick={onPrintLabel}
          title="Print QR label"
          className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-white/60 dark:hover:bg-gray-900/40 transition-colors"
        >
          <QrCode size={15} />
        </button>
      </div>
      <div className="p-4 flex flex-col flex-1 gap-2">
        <p className="text-2xl font-black text-brand-600 dark:text-brand-400 leading-none">#{spool.id}</p>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
            {spool.filament.name || '—'}
          </p>
          {spool.filament.vendor?.name && (
            <p className="text-xs text-gray-400 mt-0.5">{spool.filament.vendor.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
            {spool.filament.material}
          </span>
          {spool.location && (
            <span className="flex items-center gap-0.5 text-xs text-gray-400">
              <MapPin size={10} />{spool.location}
            </span>
          )}
          {spool.lot_nr && <span className="text-xs text-gray-400">Lot: {spool.lot_nr}</span>}
        </div>
        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {weightLabel(spool.remaining_weight)}
            </span>
            {pct !== null && <span className="text-xs text-gray-400">{Math.round(pct)}%</span>}
          </div>
          {pct !== null && (
            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct < 20 ? 'bg-red-400' : pct < 50 ? 'bg-yellow-400' : 'bg-teal-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const VIEW_KEY = 'spool-inventory-view'

function loadView(): View {
  try { return (localStorage.getItem(VIEW_KEY) as View) || 'list' } catch { return 'list' }
}

export default function SpoolInventory() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>(loadView)
  const [labelSpool, setLabelSpool] = useState<SpoolmanSpool | null>(null)

  function changeView(v: View) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['spoolman-stock'],
    queryFn: getSpoolmanStock,
    refetchInterval: 60_000,
  })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const spoolmanUrl = (settings?.spoolman_url || '').replace(/\/$/, '')

  const activeSpools = (data?.spools ?? []).filter(s => !s.archived)
  const materialsCount = new Set(activeSpools.map(s => s.filament.material)).size
  const colorsCount = new Set(activeSpools.map(s => s.filament.color_hex ?? 'unknown')).size
  const brandsCount = new Set(activeSpools.map(s => s.filament.vendor?.name ?? '').filter(Boolean)).size
  const totalWeight = activeSpools.reduce((sum, s) => sum + (s.remaining_weight ?? 0), 0)

  const filteredSpools = activeSpools
    .filter(s => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        String(s.id).includes(q) ||
        s.filament.name?.toLowerCase().includes(q) ||
        s.filament.material?.toLowerCase().includes(q) ||
        s.filament.vendor?.name?.toLowerCase().includes(q) ||
        s.location?.toLowerCase().includes(q) ||
        s.lot_nr?.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const mc = a.filament.material.localeCompare(b.filament.material)
      return mc !== 0 ? mc : a.filament.name.localeCompare(b.filament.name)
    })

  // suppress unused warning — spoolmanUrl kept for potential future use
  void spoolmanUrl

  return (
    <div className="p-6 space-y-6">
      {labelSpool && <SpoolStickerModal spool={labelSpool} onClose={() => setLabelSpool(null)} />}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/filaments')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <SpoolIcon size={40} color="#9ca3af" />
            Spool Inventory
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Live data from Spoolman · refreshes every 60s</p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400 italic">Loading…</p>}

      {!isLoading && !data?.connected && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <WifiOff size={15} />
          <span>Spoolman not connected — configure the URL in Settings.</span>
        </div>
      )}

      {data?.connected && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-teal-600">{activeSpools.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active spools</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-blue-600">{(totalWeight / 1000).toFixed(2)} kg</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total remaining</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-indigo-600">{materialsCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Materials</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-purple-600">{colorsCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Colors</p>
            </div>
            <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-rose-600">{brandsCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Brands</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
              placeholder="Filter by ID, name, material, vendor, location, lot…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
              <button
                onClick={() => changeView('list')}
                title="List view"
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  view === 'list'
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <LayoutList size={15} /> List
              </button>
              <button
                onClick={() => changeView('details')}
                title="Details view"
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-l border-gray-200 dark:border-gray-700 transition-colors ${
                  view === 'details'
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <LayoutGrid size={15} /> Details
              </button>
            </div>
          </div>

          {filteredSpools.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No spools match your filter.</p>
          ) : view === 'list' ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              {filteredSpools.map(spool => (
                <SpoolRow key={spool.id} spool={spool} onPrintLabel={() => setLabelSpool(spool)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredSpools.map(spool => (
                <SpoolCard key={spool.id} spool={spool} onPrintLabel={() => setLabelSpool(spool)} />
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 text-right">{filteredSpools.length} of {activeSpools.length} spools</p>
        </>
      )}
    </div>
  )
}
