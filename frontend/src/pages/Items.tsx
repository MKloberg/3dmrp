import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import {
  getItems, createItem, updateItem, deleteItem,
  getFilaments, addFilamentReq, updateFilamentReq, removeFilamentReq, reorderFilaments,
  uploadItemImage, deleteItemImage, cropItemImage,
  getTags, createTag, updateTag, deleteTag, addTagToItem, removeTagFromItem,
  getPrinterTypes, getPrinters,
  createRouting, updateRouting, deleteRouting,
  createRoutingStep, updateRoutingStep, deleteRoutingStep,
  addRoutingStepFilament, updateRoutingStepFilament, deleteRoutingStepFilament,
  getOrders, getGcodeFiles, getGcodeFileMetadata, sendGcodeToPrinter, checkGcodeItemFolders, renameGcodeItemFolders,
  getPrinterStatus, getMailsailSpoolman, getSettings, getPrinterAfcLanes, getSpoolmanStock, getPrinterFilamentDetect, getPrinterSpoolmanSlots,
  createPostProcessingCost, updatePostProcessingCost, deletePostProcessingCost,
  setSlicerFile, deleteSlicerFile, openInSlicer, pickModelFile,
  setStepSlicerFile, deleteStepSlicerFile, openStepInSlicer,
  Item, Order, FilamentSpec, Tag, PrinterType, Printer, Routing, RoutingStepFilament, SlicerFile, StepSlicerFile,
  AfcLane, AfcLanesResponse, SpoolmanSpool, GcodeSlotInfo, FilamentDetectSlot,
} from '../api/client'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import PrintSpoolWizard from '../components/PrintSpoolWizard'
import { SpoolIcon } from '../components/SpoolIcon'
import { useCurrency } from '../lib/currency'
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check, X, Upload, ShoppingCart, GripVertical, Tag as TagIcon, Crop as CropIcon, Download, Route, Send, RefreshCw, Clock, Box, Share2, ClipboardList as BomIcon, FolderOpen, FileText, AlertTriangle, Info } from 'lucide-react'

function smoothScrollTo(container: HTMLElement, target: number, duration = 700) {
  const start = container.scrollTop
  const distance = target - start
  const startTime = performance.now()
  const ease = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
  function step(now: number) {
    const progress = Math.min((now - startTime) / duration, 1)
    container.scrollTop = start + distance * ease(progress)
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function CropModal({
  itemId,
  imageId,
  imageUrl,
  onClose,
  onDone,
}: {
  itemId: number
  imageId: number
  imageUrl: string
  onClose: () => void
  onDone: () => void
}) {
  const qc = useQueryClient()
  const imgRef = useRef<HTMLImageElement>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [saving, setSaving] = useState(false)

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 })
    setCompletedCrop({ unit: 'px', x: 0, y: 0, width, height })
  }

  async function handleSave() {
    if (!completedCrop?.width || !completedCrop?.height || !imgRef.current) return
    const { width, height } = imgRef.current
    const box = {
      x: completedCrop.x / width,
      y: completedCrop.y / height,
      width: completedCrop.width / width,
      height: completedCrop.height / height,
    }
    setSaving(true)
    try {
      await cropItemImage(itemId, imageId, box)
      await qc.refetchQueries({ queryKey: ['items'] })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Crop Image" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex justify-center bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
          <ReactCrop
            crop={crop}
            onChange={(_, pct) => setCrop(pct)}
            onComplete={c => setCompletedCrop(c)}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Crop"
              onLoad={onImageLoad}
              className="max-h-[60vh] max-w-full"
            />
          </ReactCrop>
        </div>
        <p className="text-xs text-gray-400 text-center">Drag to adjust the crop area. The original image will be replaced.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!completedCrop?.width || saving}
            className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Apply Crop'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const TAG_COLORS = [
  '#ef4444','#f43f5e','#f97316','#fb923c','#eab308',
  '#84cc16','#22c55e','#10b981','#14b8a6','#06b6d4',
  '#3b82f6','#0ea5e9','#6366f1','#8b5cf6','#a855f7',
  '#ec4899','#1d4ed8','#64748b','#374151','#78716c',
]

function TagPill({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white shrink-0"
      style={{ backgroundColor: tag.color_hex }}
    >
      {tag.name}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove() }} className="opacity-70 hover:opacity-100">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

function FilamentDot({ hex }: { hex: string }) {
  return <SpoolIcon color={hex} size={16} />
}

function ToggleSwitch({ checked, onChange, tooltip }: { checked: boolean; onChange: (v: boolean) => void; tooltip: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0" title={tooltip}>
      <span className={`text-xs font-medium select-none ${checked ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
        Include in BOM
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={e => { e.stopPropagation(); onChange(!checked) }}
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-red-400'}`}
      >
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

const HEX_COLOR_PALETTE: [string, number, number, number][] = [
  ['Black',     0,   0,   0], ['White',   255, 255, 255], ['Gray',    160, 160, 160],
  ['Silver',  210, 210, 215], ['Red',     255,   0,   0], ['Dark Red', 140,   0,   0],
  ['Orange',  255, 128,   0], ['Yellow',  255, 230,   0], ['Gold',    220, 180,   0],
  ['Green',     0, 180,   0], ['Dark Green', 0, 100,  0], ['Lime',    160, 230,   0],
  ['Teal',      0, 128, 128], ['Cyan',      0, 220, 220], ['Blue',      0,   0, 255],
  ['Navy',      0,   0, 128], ['Purple',  128,   0, 180], ['Magenta', 220,   0, 180],
  ['Pink',    255, 130, 180], ['Hot Pink', 255,  20, 147], ['Coral',   255, 100,  80],
  ['Brown',   128, 128,  40], ['Dark Brown', 100, 50,  10], ['Beige',  230, 215, 180],
  ['Cream',   255, 255, 220], ['Tan',     200, 170, 120],
]
function hexToColorName(hex: string | null): string {
  if (!hex) return ''
  const v = parseInt(hex.replace('#', ''), 16)
  const r = (v >> 16) & 0xff, g = (v >> 8) & 0xff, b = v & 0xff
  let best = '', bestDist = Infinity
  for (const [name, pr, pg, pb] of HEX_COLOR_PALETTE) {
    const d = Math.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2)
    if (d < bestDist) { bestDist = d; best = name }
  }
  return best
}

function formatPrintTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `~${h}h ${m}m`
  if (m > 0) return `~${m}m`
  return `~${secs}s`
}

const STATE_COLORS: Record<string, string> = {
  printing: 'bg-blue-500',
  paused:   'bg-yellow-400',
  error:    'bg-red-500',
  complete: 'bg-green-500',
  offline:  'bg-gray-400',
  standby:  'bg-gray-400',
}

const MATERIAL_GROUPS: string[][] = [
  ['PLA', 'PLA+', 'PLA-CF', 'PLA-HF', 'PLA-SILK', 'PLA-MATTE', 'PLA-PLUS'],
  ['PETG', 'PETG-CF', 'PETG+'],
  ['ABS', 'ABS+', 'ASA'],
  ['TPU', 'TPE'],
  ['PA', 'PA-CF', 'PA12', 'PA12-CF', 'NYLON'],
]
function materialsCompatible(a: string, b: string): boolean {
  const au = a.toUpperCase().trim(), bu = b.toUpperCase().trim()
  if (au === bu) return true
  return MATERIAL_GROUPS.some(g => g.includes(au) && g.includes(bu))
}
function normalizeHex(h: string | null | undefined): string | null {
  if (!h) return null
  return h.startsWith('#') ? h : `#${h}`
}

function PrintWizard({
  printer, mode, itemId, itemName, routingId, stepId, stepFilaments, filamentWeights, filamentSlots, stepPrintTime, gcodePrintTime, filaments, onUpdateBom, onPrint, onClose,
}: {
  printer: Printer
  mode: 'analyze' | 'send' | 'send_and_start'
  itemId: number
  itemName: string
  routingId: number
  stepId: number
  stepFilaments: RoutingStepFilament[]
  filamentWeights: number[]
  filamentSlots: GcodeSlotInfo[]
  stepPrintTime: number | null
  gcodePrintTime: number | null
  filaments: FilamentSpec[]
  onUpdateBom: (data: { weights: { filId: number; grams: number }[]; reassigns?: { filId: number; filament_spec_id: number; grams: number }[]; adds?: { filament_spec_id: number; grams: number }[]; printTime?: number }) => Promise<void>
  onPrint: (startPrint: boolean) => void
  onClose: () => void
}) {
  const [step, setStep] = useState(1)
  const [updating, setUpdating] = useState(false)
  const [analyzeClosing, setAnalyzeClosing] = useState(false)
  const [missingSelections, setMissingSelections] = useState<Record<number, string>>({})
  const [slotOverrides, setSlotOverrides] = useState<Record<number, string>>({})
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const [safetyBuffer, setSafetyBuffer] = useState(3)
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<number>>(new Set())
  const [step2Selections, setStep2Selections] = useState<Record<number, { bomId: number; specId: number }>>({})
  const [step2Override, setStep2Override] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    if (step !== 2) return
    const id = setInterval(() => {
      qc.refetchQueries({ queryKey: ['printer-afc-lanes', printer.id] })
      qc.refetchQueries({ queryKey: ['printers'] })
      qc.refetchQueries({ queryKey: ['spoolman-stock'] })
      qc.refetchQueries({ queryKey: ['filament-detect', printer.id] })
      qc.refetchQueries({ queryKey: ['printer-spoolman-slots', printer.id] })
    }, 3000)
    return () => clearInterval(id)
  }, [step, printer.id, qc])

  const { data: afcData } = useQuery({
    queryKey: ['printer-afc-lanes', printer.id],
    queryFn: () => getPrinterAfcLanes(printer.id),
    retry: false,
    staleTime: 0,
  })
  const { data: spoolStock } = useQuery({
    queryKey: ['spoolman-stock'],
    queryFn: getSpoolmanStock,
    staleTime: 0,
    retry: false,
  })
  const { data: mainsailSpoolman } = useQuery({
    queryKey: ['mainsail-spoolman', printer.id],
    queryFn: () => getMailsailSpoolman(printer.id),
    staleTime: 60_000,
    retry: false,
  })
  const { data: spoolmanSlots } = useQuery({
    queryKey: ['printer-spoolman-slots', printer.id, printer.effective_slot_count],
    queryFn: () => getPrinterSpoolmanSlots(printer.id, printer.effective_slot_count),
    enabled: mainsailSpoolman?.configured === true,
    staleTime: 0,
    retry: false,
  })
  const { data: filamentDetect } = useQuery({
    queryKey: ['filament-detect', printer.id],
    queryFn: () => getPrinterFilamentDetect(printer.id),
    staleTime: 0,
    retry: false,
  })
  const { data: allOrders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => getOrders(),
    staleTime: 30_000,
    enabled: mode !== 'analyze',
  })
  const fifoOrder: Order | null = allOrders
    .filter(o =>
      o.item_id === itemId &&
      o.status !== 'complete' &&
      o.status !== 'cancelled' &&
      o.quantity_printed < o.quantity
    )
    .sort((a, b) => new Date(a.date_ordered).getTime() - new Date(b.date_ordered).getTime())[0] ?? null

  const afcActive = (afcData?.lanes?.length ?? 0) > 0
  const afcSlotMap = useMemo(() => {
    const map = new Map<number, AfcLane>()
    for (const lane of afcData?.lanes ?? [])
      map.set(parseInt(lane.map.replace('T', ''), 10) + 1, lane)
    return map
  }, [afcData])
  const spoolMapById = useMemo(() => {
    const spools = spoolStock?.spools ?? []
    return new Map<number, SpoolmanSpool>(spools.map(s => [s.id, s]))
  }, [spoolStock])
  const livePrinter = (qc.getQueryData<Printer[]>(['printers']) ?? []).find(p => p.id === printer.id) ?? printer

  function getLoadedForSlot(slotNum: number): { colorHex: string; label: string; material: string; spoolId: number | null } | null {
    if (afcActive) {
      const lane = afcSlotMap.get(slotNum)
      if (!lane) return null
      const spool = lane.spool_id > 0 ? spoolMapById.get(lane.spool_id) : undefined
      const rawHex = spool?.filament.color_hex ?? lane.color
      const colorHex = rawHex ? (rawHex.startsWith('#') ? rawHex : `#${rawHex}`) : '#888888'
      const label = spool
        ? [spool.filament.vendor?.name, spool.filament.material, spool.filament.name].filter(Boolean).join(' ') || lane.material
        : lane.material
      return { colorHex, label, material: lane.material, spoolId: lane.spool_id > 0 ? lane.spool_id : null }
    }
    // Snapmaker NFC filament detect — live per-slot chip reading
    if (filamentDetect?.length) {
      const fd = filamentDetect.find((s: FilamentDetectSlot) => s.slot_index === slotNum - 1)
      if (fd) {
        if (fd.filament_present === false) return null
        if (!fd.detected) {
          return { colorHex: '#888888', label: 'Filament present — no NFC tag', material: '', spoolId: null }
        }
        const rawHex = fd.color_hex || '#888888'
        const colorHex = rawHex.startsWith('#') ? rawHex : `#${rawHex}`
        const vendor = fd.vendor !== 'NONE' ? fd.vendor : null
        const material = fd.material !== 'NONE' ? fd.material : ''
        const label = [vendor, material !== 'NONE' ? material : null, fd.sub_type || null].filter(Boolean).join(' ') || 'Unknown filament'
        return { colorHex, label, material, spoolId: null }
      }
    }
    // Spoolman slot — for non-AFC printers with Moonraker Spoolman integration
    if (mainsailSpoolman?.configured && spoolmanSlots) {
      const spSlot = spoolmanSlots.find(s => s.tool_index === slotNum - 1)
      if (spSlot?.spool_id != null) {
        const spool = spoolMapById.get(spSlot.spool_id)
        if (spool) {
          const rawHex = spool.filament.color_hex
          const colorHex = rawHex ? (rawHex.startsWith('#') ? rawHex : `#${rawHex}`) : '#888888'
          const label = [spool.filament.vendor?.name, spool.filament.material, spool.filament.name].filter(Boolean).join(' ')
          return { colorHex, label, material: spool.filament.material ?? '', spoolId: spool.id }
        }
      }
    }
    const slot = livePrinter.slots.find(s => s.slot_number === slotNum)
    if (!slot?.filament_spec) return null
    const spec = slot.filament_spec
    return {
      colorHex: spec.color_hex,
      label: [spec.brand, spec.material, spec.color_name].filter(Boolean).join(' '),
      material: spec.material,
      spoolId: null,
    }
  }

  // ── Step 1: G-Code vs BOM ────────────────────────────────────────────────
  const slotCount = Math.max(stepFilaments.length, filamentWeights.length)
  const step1Rows = Array.from({ length: slotCount }, (_, idx) => {
    const slotNum = idx + 1
    const bom = stepFilaments[idx] as RoutingStepFilament | undefined
    const gcodeGrams = filamentWeights[idx] ?? null
    const weightMatch = bom != null && gcodeGrams != null && Math.abs(bom.grams - gcodeGrams) <= 0.05
    return { slotNum, bom, gcodeGrams, weightMatch }
  })
  const missingFromBom = step1Rows.filter(r => r.bom == null && r.gcodeGrams != null)
  const weightDiffs = step1Rows.filter(r => r.bom != null && r.gcodeGrams != null && !r.weightMatch)
  const timeDiffers = gcodePrintTime != null && (stepPrintTime == null || Math.abs(stepPrintTime - gcodePrintTime) > 60)
  // Missing slots where user hasn't made a decision yet (neither selected a filament nor skipped)
  const unhandledMissing = missingFromBom.filter(r => !(r.slotNum in missingSelections))
  // Missing slots where user selected a filament (value is a numeric string, not 'skip')
  const selectedAdds = missingFromBom
    .filter(r => missingSelections[r.slotNum] && missingSelections[r.slotNum] !== 'skip')
    .map(r => ({ filament_spec_id: Number(missingSelections[r.slotNum]), grams: r.gcodeGrams! }))
  const reassignedSlots = step1Rows
    .filter(r => r.bom != null && slotOverrides[r.slotNum] && Number(slotOverrides[r.slotNum]) !== r.bom.filament_spec_id)
    .map(r => ({
      filId: r.bom!.id,
      filament_spec_id: Number(slotOverrides[r.slotNum]),
      grams: r.gcodeGrams ?? r.bom!.grams,
    }))
  const step1Match = filamentWeights.length === 0
    || (unhandledMissing.length === 0 && weightDiffs.length === 0 && !timeDiffers)
  const hasWeightDiff = weightDiffs.length > 0 || timeDiffers

  const step2Reassigns = Object.entries(step2Selections).map(([, v]) => ({
    filId: v.bomId,
    filament_spec_id: v.specId,
    grams: stepFilaments.find(f => f.id === v.bomId)?.grams ?? 0,
  }))

  function buildBomPayload() {
    const reassignedFilIds = new Set(reassignedSlots.map(r => r.filId))
    const allReassigns = [...reassignedSlots, ...step2Reassigns]
    return {
      weights: weightDiffs.filter(r => !reassignedFilIds.has(r.bom!.id)).map(r => ({ filId: r.bom!.id, grams: r.gcodeGrams! })),
      reassigns: allReassigns.length > 0 ? allReassigns : undefined,
      adds: selectedAdds.length > 0 ? selectedAdds : undefined,
      printTime: timeDiffers ? gcodePrintTime! : undefined,
    }
  }

  async function handleUpdateBom() {
    setUpdating(true)
    try {
      await onUpdateBom(buildBomPayload())
    } catch (_) { /* proceed */ }
    setUpdating(false)
  }

  async function handleAnalyzeClose() {
    if (hasWeightDiff || selectedAdds.length > 0 || reassignedSlots.length > 0 || step2Reassigns.length > 0) {
      setAnalyzeClosing(true)
      try {
        await onUpdateBom(buildBomPayload())
      } catch (_) { /* proceed */ }
      setAnalyzeClosing(false)
    }
    onClose()
  }

  function colorDist(a: string | null, b: string): number {
    if (!a) return Infinity
    const parse = (h: string) => { const v = parseInt(h.replace('#', ''), 16); return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff] }
    const [r1, g1, b1] = parse(a); const [r2, g2, b2] = parse(b)
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
  }

  function rgbToLab(hex: string): [number, number, number] {
    const v = parseInt(hex.replace('#', ''), 16)
    let r = ((v >> 16) & 0xff) / 255
    let g = ((v >> 8) & 0xff) / 255
    let b = (v & 0xff) / 255
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    const y = (r * 0.2126 + g * 0.7152 + b * 0.0722)
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
    const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
  }

  function deltaE(a: string | null, b: string): number {
    if (!a) return Infinity
    const [L1, a1, b1] = rgbToLab(a)
    const [L2, a2, b2] = rgbToLab(b)
    return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
  }

  const SUB_MATERIAL_KEYWORDS = ['silk', 'matte', 'sparkle', 'glitter', 'wood', 'metal', 'carbon', 'marble', 'glow', 'clear', 'transparent', 'multicolor']

  function getSubMaterial(text: string): string | null {
    const lower = text.toLowerCase()
    return SUB_MATERIAL_KEYWORDS.find(k => lower.includes(k)) ?? null
  }

  const COLOR_GROUPS: Record<string, string[]> = {
    brown:  ['brown', 'chocolate', 'mocha', 'mahogany', 'tan', 'coffee', 'walnut', 'chestnut', 'caramel', 'cocoa', 'copper', 'bronze', 'terra'],
    black:  ['black', 'ebony', 'onyx', 'charcoal', 'noir'],
    white:  ['white', 'ivory', 'pearl', 'cream', 'snow', 'chalk', 'natural'],
    red:    ['red', 'crimson', 'scarlet', 'carmine', 'ruby', 'burgundy', 'wine', 'maroon'],
    pink:   ['pink', 'rose', 'salmon', 'coral', 'magenta', 'blush', 'fuchsia', 'quartz'],
    orange: ['orange', 'amber', 'tangerine', 'pumpkin', 'terracotta'],
    yellow: ['yellow', 'gold', 'golden', 'lemon', 'mustard', 'banana'],
    green:  ['green', 'olive', 'forest', 'mint', 'sage', 'lime', 'emerald', 'jade', 'army'],
    blue:   ['blue', 'navy', 'azure', 'cobalt', 'teal', 'cyan', 'sky', 'indigo', 'midnight', 'ocean'],
    purple: ['purple', 'violet', 'lavender', 'lilac', 'plum', 'grape', 'amethyst'],
    gray:   ['gray', 'grey', 'silver', 'slate', 'ash', 'smoke', 'stone'],
  }

  function getColorGroup(text: string): string | null {
    const lower = text.toLowerCase()
    for (const [group, keywords] of Object.entries(COLOR_GROUPS)) {
      if (keywords.some(k => lower.includes(k))) return group
    }
    return null
  }

  function handleAutoAssign() {
    const assignments: Record<number, string> = {}
    for (const r of missingFromBom) {
      const slot = filamentSlots[r.slotNum - 1]
      if (!slot?.material) continue

      const pool = filaments.filter(f => (f.material ?? '').toUpperCase() === slot.material!.toUpperCase())
      if (pool.length === 0) continue

      const slotSubMat = getSubMaterial(`${slot.preset_name ?? ''} ${slot.material ?? ''}`)
      const slotColorGroup = getColorGroup(hexToColorName(slot.color_hex)) ?? getColorGroup(slot.preset_name ?? '')

      let best: FilamentSpec | null = null
      let bestScore = Infinity
      for (const f of pool) {
        const de = deltaE(slot.color_hex, f.color_hex)
        const filSubMat = getSubMaterial(`${f.material ?? ''} ${f.color_name ?? ''}`)
        const filColorGroup = getColorGroup(`${f.color_name ?? ''} ${f.material ?? ''}`)
        const subBonus = slotSubMat && filSubMat === slotSubMat ? 5 : 0
        const colorNameBonus = slotColorGroup && filColorGroup === slotColorGroup ? 15 : 0
        const score = de - subBonus - colorNameBonus
        if (score < bestScore) { bestScore = score; best = f }
      }
      if (best) assignments[r.slotNum] = String(best.id)
    }
    setMissingSelections(s => ({ ...s, ...assignments }))
  }

  // ── Step 1 confidence score ─────────────────────────────────────────────
  const confScores = step1Rows
    .filter(r => r.gcodeGrams != null)
    .flatMap(r => {
      const gcodeSlot = filamentSlots[r.slotNum - 1]
      let catalogHex: string | null = null
      if (r.bom) {
        catalogHex = r.bom.filament_spec.color_hex
      } else {
        const sel = missingSelections[r.slotNum]
        if (sel && sel !== 'skip') catalogHex = filaments.find(f => String(f.id) === sel)?.color_hex ?? null
      }
      if (!gcodeSlot?.color_hex || !catalogHex) return []
      return [Math.max(0, 1 - colorDist(gcodeSlot.color_hex, catalogHex) / 441)]
    })
  const allColorOk = confScores.every(s => s >= 0.8)
  const overallConf = confScores.length > 0 ? (allColorOk ? 1 : Math.min(...confScores)) : null
  const confPct = overallConf != null ? Math.round(overallConf * 100) : null
  const confHigh = confPct != null && confPct >= 80

  // ── Step 2: Loaded vs BOM ────────────────────────────────────────────────
  type S2Match = 'match' | 'soft_mismatch' | 'color_mismatch' | 'hard_mismatch' | 'none'
  const step2Rows = stepFilaments.map((bom, idx) => {
    const slotNum = idx + 1
    if (bom.grams === 0) {
      return { slotNum, bom, loaded: null as ReturnType<typeof getLoadedForSlot>, matchStatus: 'match' as S2Match, suggestions: [] as SpoolmanSpool[], notUsed: true }
    }
    const liveLoaded = getLoadedForSlot(slotNum)
    const selectedSpec = step2Selections[slotNum]
      ? filaments.find(f => f.id === step2Selections[slotNum].specId) ?? null
      : null
    const loaded = selectedSpec
      ? {
          colorHex: normalizeHex(selectedSpec.color_hex) ?? '#888888',
          label: [selectedSpec.brand, selectedSpec.material, selectedSpec.color_name].filter(Boolean).join(' ') || selectedSpec.material,
          material: selectedSpec.material,
          spoolId: null,
        }
      : liveLoaded
    const bomMat = bom.filament_spec.material
    const bomHex = normalizeHex(bom.filament_spec.color_hex)

    let matchStatus: S2Match = 'none'
    if (loaded) {
      if (!materialsCompatible(loaded.material, bomMat)) {
        matchStatus = 'hard_mismatch'
      } else {
        const loadedHex = normalizeHex(loaded.colorHex)
        const colorScore = bomHex && loadedHex ? Math.max(0, 1 - colorDist(bomHex, loadedHex) / 441) : null
        const colorOk = colorScore == null || colorScore >= 0.8
        const exactMat = loaded.material.toUpperCase().trim() === bomMat.toUpperCase().trim()
        matchStatus = colorOk && exactMat ? 'match' : colorOk ? 'soft_mismatch' : 'color_mismatch'
      }
    }

    const needsSuggestions = matchStatus !== 'match' && matchStatus !== 'soft_mismatch'
    const suggestions: SpoolmanSpool[] = []
    if (needsSuggestions) {
      const compatible = (spoolStock?.spools ?? []).filter(s =>
        !s.archived &&
        materialsCompatible(s.filament.material ?? '', bomMat) &&
        (s.remaining_weight ?? 0) >= bom.grams + safetyBuffer
      )
      const byFilamentId = new Map<number, SpoolmanSpool[]>()
      for (const s of compatible) {
        const arr = byFilamentId.get(s.filament.id) ?? []; arr.push(s)
        byFilamentId.set(s.filament.id, arr)
      }
      const reps: { spool: SpoolmanSpool; score: number }[] = []
      for (const [, group] of byFilamentId) {
        const best = group.slice().sort((a, b) => (a.remaining_weight ?? 0) - (b.remaining_weight ?? 0))[0]
        const spoolHex = normalizeHex(best.filament.color_hex)
        const colorScore = bomHex && spoolHex ? Math.max(0, 1 - colorDist(bomHex, spoolHex) / 441) : 0
        const brandBonus = (bom.filament_spec.brand && best.filament.vendor?.name?.toLowerCase() === bom.filament_spec.brand.toLowerCase()) ? 0.05 : 0
        const exactMatBonus = (best.filament.material ?? '').toUpperCase().trim() === bomMat.toUpperCase().trim() ? 0.1 : 0
        reps.push({ spool: best, score: colorScore + brandBonus + exactMatBonus })
      }
      reps.sort((a, b) => b.score - a.score)
      suggestions.push(...reps.map(r => r.spool))
    }

    return { slotNum, bom, loaded, matchStatus, suggestions, notUsed: false }
  })
  const step2AllMatch = step2Rows.length > 0 && step2Rows.every(r => r.matchStatus === 'match' || r.matchStatus === 'soft_mismatch')
  const step2ConfScores: number[] = step2Rows.map(r =>
    r.matchStatus === 'match' ? 1.0 :
    r.matchStatus === 'soft_mismatch' ? 0.85 :
    r.matchStatus === 'color_mismatch' ? 0.4 : 0.0
  )
  const step2ConfPct = step2ConfScores.length > 0
    ? Math.round((step2ConfScores.reduce((a, b) => a + b, 0) / step2ConfScores.length) * 100)
    : null

  const modeLabel = mode === 'send_and_start' ? 'Send & Start' : mode === 'send' ? 'Send' : 'Analyze'

  return (
    <Modal title={`${modeLabel} — ${printer.name}`} onClose={onClose} wide>
      <div className="space-y-4">

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {([1, 2] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                step > s ? 'bg-green-500 text-white' : step === s ? 'bg-brand-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}>
                {step > s ? <Check size={12} strokeWidth={3} /> : s}
              </div>
              <span className={`text-xs font-medium ${step === s ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
                {s === 1 ? 'G-Code vs. BOM' : 'Filament Check'}
              </span>
              {i < 1 && <div className={`flex-1 h-px ${step > s ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />}
            </div>
          ))}
        </div>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="space-y-3">
            {filamentWeights.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-start gap-2 min-w-0">
                  <Info size={13} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
                    Automatically matches G-Code filament slots to your catalog by material type and color proximity. Review assignments below before updating your BOM.
                  </p>
                </div>
                {confPct != null && (
                  <div className={`flex items-center gap-1.5 shrink-0 font-medium text-xs ${confHigh ? 'text-green-600 dark:text-green-400' : 'text-amber-500 dark:text-amber-400'}`}>
                    {confHigh
                      ? <Check size={14} strokeWidth={3} />
                      : <AlertTriangle size={14} />}
                    {confPct}%
                  </div>
                )}
              </div>
            )}
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b dark:border-gray-600">
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-3 w-8">Slot</th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-4">G-Code</th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2">BOM Filaments</th>
                  <th className="w-6 pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {step1Rows.map(r => {
                  const gcodeSlot = filamentSlots[r.slotNum - 1]
                  const overriddenSpec = r.bom && slotOverrides[r.slotNum]
                    ? (filaments.find(f => String(f.id) === slotOverrides[r.slotNum]) ?? null)
                    : null
                  const catalogHex = overriddenSpec?.color_hex
                    ?? (r.bom
                      ? r.bom.filament_spec.color_hex
                      : (() => { const sel = missingSelections[r.slotNum]; return (sel && sel !== 'skip') ? (filaments.find(f => String(f.id) === sel)?.color_hex ?? null) : null })())
                  const colorOk = !gcodeSlot?.color_hex || !catalogHex || (1 - colorDist(gcodeSlot.color_hex, catalogHex) / 441) >= 0.8
                  return (
                  <tr key={r.slotNum}>
                    <td className="py-2.5 pr-3 text-xs text-gray-400 tabular-nums align-middle">#{r.slotNum}</td>
                    <td className="py-2.5 pr-4 align-middle">
                      {gcodeSlot ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            {gcodeSlot.color_hex && (
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10 dark:border-white/10" style={{ backgroundColor: gcodeSlot.color_hex }} />
                            )}
                            <span className="text-xs text-gray-700 dark:text-gray-200">
                              {gcodeSlot.preset_name ?? (gcodeSlot.material ?? '—') + (gcodeSlot.brand ? ` · ${gcodeSlot.brand}` : '')}
                              {gcodeSlot.color_hex && ` ${hexToColorName(gcodeSlot.color_hex)}`}
                            </span>
                          </div>
                          {r.gcodeGrams != null && (
                            <div className={`text-xs tabular-nums pl-4 ${r.bom && !r.weightMatch ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                              {r.gcodeGrams.toFixed(1)} g
                            </div>
                          )}
                        </div>
                      ) : r.gcodeGrams != null ? (
                        <span className="text-xs text-gray-500 tabular-nums">{r.gcodeGrams.toFixed(1)} g</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 align-middle">
                      {r.bom ? (
                        editingSlot === r.slotNum ? (
                          <select
                            autoFocus
                            className="w-full text-xs border rounded px-1.5 py-1 dark:bg-gray-700 dark:border-gray-600 border-brand-400 dark:border-brand-500"
                            value={slotOverrides[r.slotNum] ?? String(r.bom.filament_spec_id)}
                            onChange={e => {
                              const val = e.target.value
                              if (val === String(r.bom!.filament_spec_id)) {
                                setSlotOverrides(s => { const n = { ...s }; delete n[r.slotNum]; return n })
                              } else {
                                setSlotOverrides(s => ({ ...s, [r.slotNum]: val }))
                              }
                              setEditingSlot(null)
                            }}
                            onBlur={() => setEditingSlot(null)}
                          >
                            {filaments.map(f => (
                              <option key={f.id} value={f.id}>
                                {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (() => {
                          const displaySpec = overriddenSpec ?? r.bom.filament_spec
                          const isOverridden = !!overriddenSpec
                          return (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <FilamentDot hex={displaySpec.color_hex} />
                                <span className={`text-xs ${isOverridden ? 'text-brand-600 dark:text-brand-400 font-medium' : r.weightMatch ? 'text-gray-700 dark:text-gray-200' : 'text-red-500 font-medium'}`}>
                                  {displaySpec.brand ? `${displaySpec.brand} ` : ''}{displaySpec.material} {displaySpec.color_name}
                                </span>
                                <button onClick={() => setEditingSlot(r.slotNum)}
                                  className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0" title="Change filament">
                                  <Pencil size={11} />
                                </button>
                              </div>
                              <div className={`text-xs tabular-nums pl-4 ${r.weightMatch ? 'text-gray-500' : 'text-red-400'}`}>
                                {r.bom.grams.toFixed(1)} g
                                {!r.weightMatch && r.gcodeGrams != null && (
                                  <span className="ml-1.5 text-gray-400">→ <span className="font-semibold text-gray-700 dark:text-gray-300">{r.gcodeGrams.toFixed(1)} g</span></span>
                                )}
                              </div>
                            </div>
                          )
                        })()
                      ) : (
                        <div className="space-y-1">
                          <select
                            className="w-full text-xs border rounded px-1.5 py-1 dark:bg-gray-700 dark:border-gray-600 border-amber-400 dark:border-amber-500"
                            value={missingSelections[r.slotNum] ?? ''}
                            onChange={e => setMissingSelections(s => ({ ...s, [r.slotNum]: e.target.value }))}
                          >
                            <option value="">— select filament to add —</option>
                            <option value="skip">Skip (leave out of BOM)</option>
                            {filaments.map(f => (
                              <option key={f.id} value={f.id}>
                                {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                              </option>
                            ))}
                          </select>
                          {r.gcodeGrams != null && <div className="text-xs text-gray-400 pl-0.5">{r.gcodeGrams.toFixed(1)} g from G-Code</div>}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pl-2 align-middle">
                      {r.bom == null
                        ? missingSelections[r.slotNum] === 'skip'
                          ? <Check size={14} className="text-gray-400" strokeWidth={2} />
                          : missingSelections[r.slotNum]
                            ? colorOk
                              ? <Check size={14} className="text-amber-500" strokeWidth={3} />
                              : <AlertTriangle size={14} className="text-amber-500" />
                            : null
                        : !colorOk
                          ? <AlertTriangle size={14} className="text-amber-500" />
                          : r.weightMatch
                            ? <Check size={14} className="text-green-500" strokeWidth={3} />
                            : <X size={14} className="text-red-400" strokeWidth={3} />}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>

            {timeDiffers && (
              <div className="flex items-center justify-between text-xs border-t dark:border-gray-700 pt-2.5">
                <span className="font-semibold text-gray-500 dark:text-gray-400">Estimated Print Time</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">{stepPrintTime != null ? formatPrintTime(stepPrintTime) : '—'}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{formatPrintTime(gcodePrintTime!)}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
              <div className="flex items-center gap-2">
                {unhandledMissing.length > 0 && filamentSlots.length > 0 && (
                  <button onClick={handleAutoAssign}
                    className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
                    Auto-assign
                  </button>
                )}
                {unhandledMissing.length > 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {`Select a filament or skip slot${unhandledMissing.length > 1 ? 's' : ''} ${unhandledMissing.map(r => `#${r.slotNum}`).join(', ')} to continue.`}
                  </p>
                ) : (hasWeightDiff || selectedAdds.length > 0 || reassignedSlots.length > 0) ? (
                  <button onClick={handleUpdateBom} disabled={updating}
                    className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50">
                    {updating ? 'Updating…' : 'Update BOM to match these assignments'}
                  </button>
                ) : step1Match ? (
                  filamentWeights.length === 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                      <Check size={13} strokeWidth={3} /> BOM confirmed
                    </div>
                  ) : confPct === 100 ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                      <Check size={13} strokeWidth={3} /> BOM matches G-Code
                    </div>
                  ) : confPct != null && confPct >= 80 ? (
                    <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                      <Check size={13} strokeWidth={3} /> Close match — verify highlighted slots
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-orange-500 dark:text-orange-400 font-medium">
                      <AlertTriangle size={13} strokeWidth={2.5} /> Approximate match — verify before continuing
                    </div>
                  )
                ) : null}
              </div>
              <button onClick={() => setStep(2)} disabled={!step1Match}
                className="px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="space-y-3">
            {step2Rows.length > 0 && step2ConfPct != null && (
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                step2ConfPct === 100
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : step2ConfPct >= 80
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
              }`}>
                <div className="flex items-start gap-2">
                  <Info size={14} className={`mt-0.5 shrink-0 ${step2ConfPct === 100 ? 'text-green-600 dark:text-green-400' : step2ConfPct >= 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-orange-500 dark:text-orange-400'}`} />
                  <span className={`text-xs ${step2ConfPct === 100 ? 'text-green-700 dark:text-green-300' : step2ConfPct >= 80 ? 'text-yellow-700 dark:text-yellow-300' : 'text-orange-700 dark:text-orange-300'}`}>
                    {step2ConfPct === 100
                      ? 'All slots are loaded with the correct filament.'
                      : step2ConfPct >= 80
                      ? 'All slots have compatible filament. Some use substitutes — highlighted in amber.'
                      : step2ConfPct > 0
                      ? 'Some slots have the wrong filament. Load the suggested spools from inventory.'
                      : 'One or more slots are empty or have incompatible filament.'}
                  </span>
                </div>
                <div className={`flex items-center gap-1 text-xs font-bold shrink-0 ml-3 ${step2ConfPct === 100 ? 'text-green-600 dark:text-green-400' : step2ConfPct >= 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-orange-500 dark:text-orange-400'}`}>
                  {step2ConfPct >= 80 ? <Check size={13} strokeWidth={3} /> : <AlertTriangle size={13} strokeWidth={2.5} />}
                  {step2ConfPct}%
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Live — this screen refreshes automatically as you load filament into the printer. Slots update in real time.
              </span>
            </div>

            {((printer.printer_type?.has_afc && !afcActive) || !spoolStock?.connected || (printer.printer_type?.has_mainsail_spoolman && mainsailSpoolman?.configured === false)) && (
              <div className="space-y-1.5">
                {printer.printer_type?.has_afc && !afcActive && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">AFC is not active on this printer — loaded slot status cannot be read automatically, and filament usage will not be deducted in Spoolman after printing. Verify the correct filament is loaded manually, and update spool weights in Spoolman after the print completes.</p>
                  </div>
                )}
                {!spoolStock?.connected && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">Spoolman is not connected — inventory suggestions are unavailable and filament usage will not be tracked automatically. Update spool weights manually after printing.</p>
                  </div>
                )}
                {printer.printer_type?.has_mainsail_spoolman && mainsailSpoolman?.configured === false && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">Spoolman is not enabled on this printer. Enable the Spoolman integration in Mainsail settings on this printer to allow automatic filament tracking and deduction during printing.</p>
                  </div>
                )}
              </div>
            )}

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b dark:border-gray-600">
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-3 w-10">Slot</th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-6 w-2/5">BOM Filaments</th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2">Printer / Inventory</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {step2Rows.map(r => {
                  const showSuggestions = !r.notUsed && (r.matchStatus === 'color_mismatch' || r.matchStatus === 'hard_mismatch' || r.matchStatus === 'none')
                  const statusIcon = r.notUsed
                    ? null
                    : r.matchStatus === 'match'
                    ? <Check size={13} className="text-green-500 shrink-0 mt-0.5" strokeWidth={3} />
                    : r.matchStatus === 'soft_mismatch'
                    ? <Check size={13} className="text-yellow-500 shrink-0 mt-0.5" strokeWidth={3} />
                    : r.matchStatus === 'color_mismatch'
                    ? <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    : <X size={13} className="text-red-400 shrink-0 mt-0.5" strokeWidth={3} />
                  return (
                    <tr key={r.slotNum}>
                      <td className="py-3 pr-3 text-xs text-gray-400 tabular-nums align-top">#{r.slotNum}</td>
                      <td className="py-3 pr-6 align-top">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <FilamentDot hex={r.bom.filament_spec.color_hex} />
                            <span className="text-xs text-gray-700 dark:text-gray-200">
                              {r.bom.filament_spec.brand ? `${r.bom.filament_spec.brand} ` : ''}{r.bom.filament_spec.material} {r.bom.filament_spec.color_name}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 tabular-nums pl-4">{r.bom.grams.toFixed(1)} g needed</div>
                        </div>
                      </td>
                      <td className="py-3 align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-1.5">
                            {statusIcon}
                            <div className="space-y-0.5 min-w-0">
                              {r.notUsed ? (
                                <span className="text-xs text-gray-400 italic">Not used</span>
                              ) : r.loaded ? (
                                <>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10 dark:border-white/10" style={{ backgroundColor: r.loaded.colorHex }} />
                                    {r.loaded.spoolId != null && (
                                      <span className="text-xs font-bold text-brand-600 dark:text-brand-400">#{r.loaded.spoolId}</span>
                                    )}
                                    <span className={`text-xs ${r.matchStatus === 'match' ? 'text-gray-700 dark:text-gray-200' : r.matchStatus === 'soft_mismatch' ? 'text-yellow-700 dark:text-yellow-300' : 'text-amber-600 dark:text-amber-400'}`}>
                                      {r.loaded.label}
                                    </span>
                                  </div>
                                  {r.matchStatus === 'soft_mismatch' && (
                                    <div className="text-xs text-yellow-600 dark:text-yellow-400 pl-4">Compatible substitute ({r.loaded.material})</div>
                                  )}
                                  {r.matchStatus === 'color_mismatch' && (
                                    <div className="text-xs text-amber-500 dark:text-amber-400 pl-4">Wrong color for this slot</div>
                                  )}
                                  {r.matchStatus === 'hard_mismatch' && (
                                    <div className="text-xs text-red-400 pl-4">Incompatible material ({r.loaded.material})</div>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-red-400 italic">Empty — slot not loaded</span>
                              )}
                            </div>
                          </div>
                          {showSuggestions && (
                            <div className="pl-5 space-y-1">
                              {r.suggestions.length > 0 ? (
                                <>
                                  <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">Available in inventory:</div>
                                  {(expandedSuggestions.has(r.slotNum) ? r.suggestions : r.suggestions.slice(0, 3)).map(s => {
                                    const hex = normalizeHex(s.filament.color_hex)
                                    const name = [s.filament.vendor?.name, s.filament.name].filter(Boolean).join(' ') || s.filament.material
                                    const spec = filaments.find(f => f.spoolman_id === s.filament.id)
                                    const isSelected = step2Selections[r.slotNum]?.specId === spec?.id
                                    if (spec) {
                                      return (
                                        <button
                                          key={s.id}
                                          onClick={() => setStep2Selections(prev =>
                                            isSelected
                                              ? Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k) !== r.slotNum))
                                              : { ...prev, [r.slotNum]: { bomId: r.bom.id, specId: spec.id } }
                                          )}
                                          className={`flex items-center gap-1.5 flex-wrap w-full text-left rounded px-1 -mx-1 transition-colors ${isSelected ? 'bg-brand-100 dark:bg-brand-900/40' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
                                        >
                                          <span className="w-2 h-2 rounded-full shrink-0 border border-black/10 dark:border-white/10" style={{ backgroundColor: hex ?? '#ccc' }} />
                                          <span className="text-xs text-gray-600 dark:text-gray-300">{name}</span>
                                          <span className="text-xs font-bold text-brand-600 dark:text-brand-400">#{s.id}</span>
                                          <span className="text-xs text-gray-400">· {s.remaining_weight?.toFixed(0)}g left</span>
                                          {isSelected && <Check size={11} className="text-brand-500 ml-auto shrink-0" strokeWidth={3} />}
                                        </button>
                                      )
                                    }
                                    return (
                                      <div key={s.id} className="flex items-center gap-1.5 flex-wrap">
                                        <span className="w-2 h-2 rounded-full shrink-0 border border-black/10 dark:border-white/10" style={{ backgroundColor: hex ?? '#ccc' }} />
                                        <span className="text-xs text-gray-600 dark:text-gray-300">{name}</span>
                                        <span className="text-xs font-bold text-brand-600 dark:text-brand-400">#{s.id}</span>
                                        <span className="text-xs text-gray-400">· {s.remaining_weight?.toFixed(0)}g left</span>
                                      </div>
                                    )
                                  })}
                                  {r.suggestions.length > 3 && !expandedSuggestions.has(r.slotNum) && (
                                    <button
                                      onClick={() => setExpandedSuggestions(prev => new Set([...prev, r.slotNum]))}
                                      className="text-xs text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
                                    >
                                      +{r.suggestions.length - 3} more
                                    </button>
                                  )}
                                  {step2Selections[r.slotNum] && (
                                    <div className="flex items-center gap-1 text-xs text-brand-500 dark:text-brand-400 pt-0.5">
                                      <Check size={11} strokeWidth={3} />
                                      BOM will be updated on Close
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-gray-400 italic">No suitable spools in inventory</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-600">
              <span className="text-xs text-gray-500 dark:text-gray-400">Safety buffer when suggesting partial spools:</span>
              <input
                type="number" min={0} max={50} value={safetyBuffer}
                onChange={e => setSafetyBuffer(Math.max(0, Number(e.target.value)))}
                className="w-14 border rounded px-1.5 py-0.5 text-xs dark:bg-gray-700 dark:border-gray-600 text-center"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">g</span>
            </div>

            {mode !== 'analyze' && fifoOrder && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                <Info size={13} className="text-blue-500 shrink-0" />
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  Will count toward <strong>Order #{fifoOrder.id}</strong>
                  {' · '}{itemName}
                  {(fifoOrder.customer?.display_name || fifoOrder.customer_name)
                    ? ` — ${fifoOrder.customer?.display_name || fifoOrder.customer_name}`
                    : ''}
                  {' '}({fifoOrder.quantity_printed}/{fifoOrder.quantity} printed)
                </span>
              </div>
            )}

            {mode !== 'analyze' && !step2AllMatch && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="step2-override"
                  checked={step2Override}
                  onChange={e => setStep2Override(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-brand-600"
                />
                <label htmlFor="step2-override" className="text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                  I've verified the filament — send anyway
                </label>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
              <button onClick={() => setStep(1)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                ← Back
              </button>
              <div className="flex items-center gap-2">
                <button onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                  Cancel
                </button>
                {mode !== 'analyze' ? (
                  <button onClick={() => onPrint(mode === 'send_and_start')} disabled={!step2AllMatch && !step2Override}
                    className="px-5 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors">
                    {mode === 'send_and_start' ? '▶ Send & Start Print' : '↑ Send G-Code'}
                  </button>
                ) : (
                  <button onClick={handleAnalyzeClose} disabled={analyzeClosing}
                    className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
                    {analyzeClosing ? 'Saving…' : 'Close'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </Modal>
  )
}

// ── legacy stubs kept for reference – no longer rendered ─────────────────────
function GcodeMismatchModal({ stepFilaments, filamentWeights, stepPrintTime, gcodePrintTime, onUpdate, onSkip, onUpdateDone }: {
  stepFilaments: RoutingStepFilament[]
  filamentWeights: number[]
  stepPrintTime: number | null
  gcodePrintTime: number | null
  onUpdate: (data: { weights: { filId: number; grams: number }[]; printTime?: number }) => Promise<void>
  onSkip: () => void
  onUpdateDone?: () => void
}) {
  const [updating, setUpdating] = useState(false)

  const weightDiffs = stepFilaments
    .map((sf, idx) => ({
      filId: sf.id,
      filament: sf.filament_spec,
      specGrams: sf.grams,
      gcodeGrams: filamentWeights[idx],
      slot: idx + 1,
    }))
    .filter(d => d.gcodeGrams != null && Math.abs(d.specGrams - d.gcodeGrams) > 0.05)

  const timeDiffers = gcodePrintTime != null &&
    (stepPrintTime == null || Math.abs(stepPrintTime - gcodePrintTime) > 60)

  async function handleUpdate() {
    setUpdating(true)
    try {
      await onUpdate({
        weights: weightDiffs.map(d => ({ filId: d.filId, grams: d.gcodeGrams })),
        printTime: timeDiffers ? gcodePrintTime! : undefined,
      })
    } catch (_) {
      // proceed even if update fails
    } finally {
      setUpdating(false)
    }
    ;(onUpdateDone ?? onSkip)()
  }

  return (
    <Modal title="Update from G-Code" onClose={onSkip}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Differences found between the item specification and the G-Code file. Would you like to update the specification to match?
        </p>

        {weightDiffs.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b dark:border-gray-600">
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-3 w-10">Slot</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-3">Filament</th>
                <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-3 whitespace-nowrap">Spec (g)</th>
                <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 whitespace-nowrap">G-Code (g)</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {weightDiffs.map(d => (
                <tr key={d.filId}>
                  <td className="py-2 pr-3 text-xs text-gray-400 tabular-nums">#{d.slot}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <FilamentDot hex={d.filament.color_hex} />
                      <span className="text-xs text-gray-700 dark:text-gray-200">
                        {d.filament.brand ? `${d.filament.brand} ` : ''}{d.filament.material} {d.filament.color_name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right text-xs tabular-nums text-gray-400">{d.specGrams.toFixed(1)}</td>
                  <td className="py-2 text-right text-xs tabular-nums font-semibold text-gray-800 dark:text-gray-100">{d.gcodeGrams.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {timeDiffers && (
          <div className="flex items-center justify-between text-sm border-t dark:border-gray-700 pt-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Estimated Print Time</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">{stepPrintTime != null ? formatPrintTime(stepPrintTime) : '—'}</span>
              <span className="text-xs text-gray-300 dark:text-gray-600">→</span>
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{formatPrintTime(gcodePrintTime!)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onSkip}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
            No, keep existing
          </button>
          <button onClick={handleUpdate} disabled={updating}
            className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50">
            {updating ? 'Updating…' : 'Yes, update'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function FilamentCheckModal({ printer, stepFilaments, filamentWeights, analyzeOnly, gcodeMatchesSpec, printTime, onConfirm, onCancel }: {
  printer: Printer
  stepFilaments: FilamentSpec[]
  filamentWeights: number[]
  analyzeOnly?: boolean
  gcodeMatchesSpec?: boolean
  printTime?: number | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const { data: status, refetch: refetchStatus, isFetching: fetchingStatus } = useQuery({
    queryKey: ['printer-status', printer.id],
    queryFn: () => getPrinterStatus(printer.id),
    staleTime: 0,
    refetchInterval: 5000,
  })
  const { data: spoolmanInfo } = useQuery({
    queryKey: ['mainsail-spoolman', printer.id],
    queryFn: () => getMailsailSpoolman(printer.id),
  })
  const { data: afcData } = useQuery({
    queryKey: ['printer-afc-lanes', printer.id],
    queryFn: () => getPrinterAfcLanes(printer.id),
    staleTime: 10_000,
    retry: false,
  })
  const { data: spoolStock } = useQuery({
    queryKey: ['spoolman-stock'],
    queryFn: getSpoolmanStock,
    staleTime: 30_000,
    retry: false,
  })

  const afcActive = (afcData?.lanes?.length ?? 0) > 0
  const afcSlotMap = useMemo(() => {
    const map = new Map<number, AfcLane>()
    if (afcData?.lanes) {
      for (const lane of afcData.lanes) {
        map.set(parseInt(lane.map.replace('T', ''), 10) + 1, lane)
      }
    }
    return map
  }, [afcData])
  const spoolMap = useMemo(() => {
    const spools = spoolStock?.spools ?? []
    return new Map<number, SpoolmanSpool>(spools.map(s => [s.id, s]))
  }, [spoolStock])

  const livePrinters = qc.getQueryData<Printer[]>(['printers']) ?? []
  const livePrinter = livePrinters.find(p => p.id === printer.id) ?? printer
  const [refreshingSlots, setRefreshingSlots] = useState(false)

  async function handleRefresh() {
    setRefreshingSlots(true)
    await Promise.all([
      qc.refetchQueries({ queryKey: ['printers'] }),
      qc.refetchQueries({ queryKey: ['printer-afc-lanes', printer.id] }),
      refetchStatus(),
    ])
    setRefreshingSlots(false)
  }

  const stateColor = STATE_COLORS[status?.state ?? 'offline'] ?? 'bg-gray-400'

  const allMatch = stepFilaments.length > 0 && stepFilaments.every((req, idx) => {
    const slotNumber = idx + 1
    if (afcActive) {
      const lane = afcSlotMap.get(slotNumber)
      return lane != null && lane.material.toLowerCase() === req.material.toLowerCase()
    }
    const slot = livePrinter.slots.find(s => s.slot_number === slotNumber)
    return slot?.filament_spec_id === req.id
  })
  const headerBg = stepFilaments.length === 0
    ? 'bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700'
    : allMatch
    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'

  function tempLabel(temp: number | null | undefined, target: number | null | undefined) {
    if (temp == null) return '—'
    return target ? `${Math.round(temp)}° / ${Math.round(target)}°` : `${Math.round(temp)}°`
  }

  return (
    <Modal title="Filament and Print Time Check" onClose={onCancel}>
      <div className="space-y-4">

        {/* Printer header */}
        <div className={`flex items-center gap-4 p-3 rounded-lg ${headerBg}`}>
          {printer.has_image ? (
            <img src={`/api/printers/${printer.id}/image`} alt={printer.name}
              className="w-16 h-16 rounded-lg object-cover shrink-0 border border-gray-200 dark:border-gray-600" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-200 dark:bg-gray-600 shrink-0 flex items-center justify-center text-gray-400 text-xs">No image</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{printer.name}</p>
            {printer.printer_type && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{printer.printer_type.name}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${stateColor}`} />
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{status?.state ?? '…'}</span>
              </div>
              {status?.extruder_temp != null && (
                <span className="text-xs text-gray-400">Hotend {tempLabel(status.extruder_temp, status.extruder_target)}</span>
              )}
              {status?.bed_temp != null && (
                <span className="text-xs text-gray-400">Bed {tempLabel(status.bed_temp, status.bed_target)}</span>
              )}
              {status?.state === 'printing' && status.progress != null && (
                <span className="text-xs text-blue-500">{Math.round(status.progress * 100)}%</span>
              )}
              {spoolmanInfo?.configured === true && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400 leading-none">
                  Spoolman
                  <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                    <Check size={10} strokeWidth={3} className="text-white" />
                  </span>
                </span>
              )}
              {spoolmanInfo?.configured === false && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 dark:text-red-400 leading-none">
                  Spoolman
                  <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                    <X size={10} strokeWidth={3} className="text-white" />
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Filament comparison table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-600">
              <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-4 w-10">Slot</th>
              <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-4">
                <div className="flex items-center gap-1.5">
                  Filament Loaded
                  <button onClick={handleRefresh} disabled={refreshingSlots || fetchingStatus}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-40" title="Refresh loaded filaments">
                    <RefreshCw size={11} className={refreshingSlots || fetchingStatus ? 'animate-spin' : ''} />
                  </button>
                </div>
              </th>
              <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 pr-4">Required for this Model</th>
              {filamentWeights.length > 0 && (
                <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 pb-2 whitespace-nowrap">G-Code (g)</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {Array.from({ length: Math.max(stepFilaments.length, filamentWeights.length) }, (_, idx) => {
              const req = stepFilaments[idx] as FilamentSpec | undefined
              const slotNumber = idx + 1
              const gcodeGrams = filamentWeights[idx]
              let loadedCell: React.ReactNode
              let matches: boolean

              if (afcActive) {
                const lane = afcSlotMap.get(slotNumber)
                if (lane) {
                  const spool = lane.spool_id > 0 ? spoolMap.get(lane.spool_id) : undefined
                  const rawHex = spool?.filament.color_hex ?? lane.color
                  const colorHex = rawHex ? (rawHex.startsWith('#') ? rawHex : `#${rawHex}`) : '#888888'
                  const label = spool
                    ? [spool.filament.vendor?.name, spool.filament.name].filter(Boolean).join(' ') || lane.material
                    : lane.material
                  matches = req != null && lane.material.toLowerCase() === req.material.toLowerCase()
                  loadedCell = (
                    <div className="flex items-center gap-2">
                      <FilamentDot hex={colorHex} />
                      <span className="text-gray-700 dark:text-gray-200">{label}</span>
                      {matches && <span className="text-green-500 ml-auto">✓</span>}
                    </div>
                  )
                } else {
                  matches = false
                  loadedCell = <span className="text-red-400 italic">Not in AFC</span>
                }
              } else {
                const slot = livePrinter.slots.find(s => s.slot_number === slotNumber)
                const loaded = slot?.filament_spec
                matches = req != null && slot?.filament_spec_id === req.id
                loadedCell = loaded ? (
                  <div className="flex items-center gap-2">
                    <FilamentDot hex={loaded.color_hex} />
                    <span className="text-gray-700 dark:text-gray-200">{loaded.brand ? `${loaded.brand} ` : ''}{loaded.material} {loaded.color_name}</span>
                    {matches && <span className="text-green-500 ml-auto">✓</span>}
                  </div>
                ) : (
                  <span className="text-red-400 italic">Unknown</span>
                )
              }

              return (
                <tr key={slotNumber}>
                  <td className="py-2 pr-4 text-xs text-gray-400 tabular-nums">
                    #{slotNumber}
                  </td>
                  <td className="py-2 pr-4">{loadedCell}</td>
                  <td className="py-2 pr-4">
                    {req ? (
                      <div className="flex items-center gap-2">
                        <FilamentDot hex={req.color_hex} />
                        <span className={matches ? 'text-gray-700 dark:text-gray-200' : 'text-red-500 font-medium'}>
                          {req.brand ? `${req.brand} ` : ''}{req.material} {req.color_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">—</span>
                    )}
                  </td>
                  {filamentWeights.length > 0 && (
                    <td className="py-2 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {gcodeGrams != null ? gcodeGrams.toFixed(1) : '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {printTime != null && (
          <div className="flex items-center justify-between text-sm border-t dark:border-gray-700 pt-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Estimated Print Time for this Plate</span>
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{formatPrintTime(printTime)}</span>
          </div>
        )}

        {analyzeOnly && gcodeMatchesSpec && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <span className="text-green-600 dark:text-green-400 text-sm font-medium">✓ Item filament weights and print time match the G-Code file.</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {analyzeOnly ? (
            <button onClick={onCancel}
              className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
              Close
            </button>
          ) : (
            <>
              <button onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                Cancel
              </button>
              <button onClick={onConfirm}
                className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg">
                Start Print
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function PrinterStatusRow({ printer, anySending, uploadSending, uploadSent, uploadProgress, uploadError, onSend, onAnalyze }: {
  printer: Printer
  anySending: boolean
  uploadSending: boolean
  uploadSent: boolean
  uploadProgress: number
  uploadError: string | null
  onSend: (printerId: number, startPrint: boolean) => void
  onAnalyze: (printerId: number) => void
}) {
  const { data: status } = useQuery({
    queryKey: ['printer-status', printer.id],
    queryFn: () => getPrinterStatus(printer.id),
    staleTime: 0,
    refetchInterval: 10_000,
  })
  const { data: spoolmanInfo } = useQuery({
    queryKey: ['mainsail-spoolman', printer.id],
    queryFn: () => getMailsailSpoolman(printer.id),
  })

  const lastFilenameRef = useRef<string | null>(null)
  if (status?.filename) lastFilenameRef.current = status.filename

  const stateColor = STATE_COLORS[status?.state ?? 'offline'] ?? 'bg-gray-400'
  const isPrinting = status?.state === 'printing'
  const isComplete = status?.state === 'complete'
  const displayFilename = status?.filename || (isComplete ? lastFilenameRef.current : null)

  return (
    <div className="flex items-start gap-1.5">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate">{printer.name}</span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateColor}`} />
          <span className="text-xs text-gray-400 capitalize shrink-0">
            {status?.state ?? '…'}{isComplete && displayFilename ? ` — ${displayFilename}` : ''}
          </span>
          {spoolmanInfo?.configured === true && (
            <span className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400 shrink-0">
              <span className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center">
                <Check size={8} strokeWidth={3} className="text-white" />
              </span>
              Spoolman
            </span>
          )}
          {spoolmanInfo?.configured === false && (
            <span className="inline-flex items-center gap-0.5 text-xs text-red-500 dark:text-red-400 shrink-0">
              <span className="w-3 h-3 rounded-full bg-red-500 flex items-center justify-center">
                <X size={8} strokeWidth={3} className="text-white" />
              </span>
              Spoolman
            </span>
          )}
        </div>
        {isPrinting && (
          <div className="space-y-0.5">
            {status.filename && (
              <p className="text-xs text-gray-400 font-mono truncate">{status.filename}</p>
            )}
            {status.progress != null && (
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1 overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(status.progress * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-400 shrink-0">{Math.round(status.progress * 100)}%</span>
              </div>
            )}
          </div>
        )}
        {(uploadSending || uploadSent || uploadError) && (
          <div className="space-y-0.5">
            {(uploadSending || uploadSent) && (
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${uploadSent ? 'bg-green-500' : 'bg-brand-500'}`}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
            {uploadSent && <p className="text-xs text-green-600">Sent!</p>}
            {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onAnalyze(printer.id)}
          className="flex items-center gap-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 px-2 py-0.5 rounded"
        >
          Analyze
        </button>
        <button
          disabled={anySending || isPrinting}
          onClick={() => onSend(printer.id, false)}
          className="flex items-center gap-1 text-xs border border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 px-2 py-0.5 rounded disabled:opacity-50"
        >
          <Send size={9} /> Send
        </button>
        <button
          disabled={anySending || isPrinting}
          onClick={() => onSend(printer.id, true)}
          className="flex items-center gap-1 text-xs border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 px-2 py-0.5 rounded disabled:opacity-50"
        >
          ▶ Send & Start
        </button>
      </div>
    </div>
  )
}

function GcodePanel({ itemId, routingId, itemName, slicerName, printerTypeName, printerTypeId, stepId, savedGcodeFile, stepPrintTime, printers, stepFilaments, filaments, onUpdateFromGcode, onGcodeFileChange }: {
  itemId: number
  routingId: number
  itemName: string
  slicerName: string
  printerTypeName: string
  printerTypeId: number
  stepId: number
  savedGcodeFile?: string | null
  stepPrintTime: number | null
  printers: Printer[]
  stepFilaments: RoutingStepFilament[]
  filaments: FilamentSpec[]
  onUpdateFromGcode: (data: { weights: { filId: number; grams: number }[]; reassigns?: { filId: number; filament_spec_id: number; grams: number }[]; adds?: { filament_spec_id: number; grams: number }[]; printTime?: number }) => Promise<void>
  onGcodeFileChange?: (file: string) => void
}) {
  const qc = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['gcode-files', itemName, slicerName, printerTypeName],
    queryFn: () => getGcodeFiles(itemName, slicerName, printerTypeName),
    staleTime: 0,
  })

  const { data: allOrders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => getOrders(),
    staleTime: 30_000,
  })

  const fifoOrder: Order | null = allOrders
    .filter(o =>
      o.item_id === itemId &&
      o.status !== 'complete' &&
      o.status !== 'cancelled' &&
      o.quantity_printed < o.quantity
    )
    .sort((a, b) => new Date(a.date_ordered).getTime() - new Date(b.date_ordered).getTime())[0] ?? null

  const [selected, setSelected] = useState<string>(savedGcodeFile ?? '')

  // Sync when savedGcodeFile arrives from the DB (covers the case where items were still
  // loading on first render and selected was initialised to '')
  useEffect(() => {
    setSelected(prev => prev || savedGcodeFile || '')
  }, [savedGcodeFile])

  const files = data?.files ?? []
  const activeFile = files.includes(selected) ? selected : (files[0] ?? '')

  const { data: metadata } = useQuery({
    queryKey: ['gcode-metadata', itemName, slicerName, printerTypeName, activeFile],
    queryFn: () => getGcodeFileMetadata(itemName, slicerName, printerTypeName, activeFile),
    enabled: !!activeFile,
    staleTime: 60_000,
  })
  const [sendingPrinterId, setSendingPrinterId] = useState<number | null>(null)
  const [sentPrinterId, setSentPrinterId] = useState<number | null>(null)
  const [sendError, setSendError] = useState<{ printerId: number; message: string } | null>(null)
  const [progress, setProgress] = useState(0)
  const sending = sendingPrinterId !== null
  const [wizardState, setWizardState] = useState<{ printer: Printer; mode: 'analyze' | 'send' | 'send_and_start' } | null>(null)
  const [showThumbModal, setShowThumbModal] = useState(false)
  const [showExcludeObjectsModal, setShowExcludeObjectsModal] = useState(false)
  const [zoom, setZoom] = useState(150)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  // Drag state kept in a ref to avoid re-renders during pointer move
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    if (!showThumbModal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowThumbModal(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showThumbModal])

  // Reset position when file changes
  useEffect(() => { setOffsetX(0); setOffsetY(0) }, [activeFile])

  function onDragPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offsetX, oy: offsetY }
  }
  function onDragPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    setOffsetX(dragRef.current.ox + (e.clientX - dragRef.current.startX))
    setOffsetY(dragRef.current.oy + (e.clientY - dragRef.current.startY))
  }
  function onDragPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  useEffect(() => {
    if (!sending) return
    setProgress(0)
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      // ease toward 85% over ~4s, never reaching it until confirmed done
      setProgress(85 * (1 - Math.exp(-elapsed / 4000)))
    }, 80)
    return () => clearInterval(id)
  }, [sending])

  useEffect(() => {
    if (sentPrinterId !== null) setProgress(100)
  }, [sentPrinterId])

  function selectFile(f: string) {
    setSelected(f)
    setSentPrinterId(null)
    setSendError(null)
    setProgress(0)
    onGcodeFileChange?.(f)
  }

  const matchingPrinters = printers.filter(p => p.printer_type_id === printerTypeId)

  async function doSend(printerId: number, startPrint: boolean) {
    if (!data?.folder || !activeFile) return
    const filePath = `${data.folder}\\${activeFile}`
    setSendingPrinterId(printerId)
    setSentPrinterId(null)
    setSendError(null)
    try {
      await sendGcodeToPrinter(printerId, filePath, startPrint, {
        item_id: itemId,
        routing_step_id: stepId || undefined,
        order_id: fifoOrder?.id,
      })
      setSentPrinterId(printerId)
      setTimeout(() => { setSentPrinterId(null); setProgress(0) }, 3000)
    } catch (e) {
      setSendError({ printerId, message: e instanceof Error ? e.message : 'Send failed' })
      setProgress(0)
    } finally {
      setSendingPrinterId(null)
    }
  }

  const handleSend = (printerId: number, startPrint: boolean) => {
    const printer = matchingPrinters.find(p => p.id === printerId)
    if (printer) setWizardState({ printer, mode: startPrint ? 'send_and_start' : 'send' })
  }
  const handleAnalyze = (printerId: number) => {
    const printer = matchingPrinters.find(p => p.id === printerId)
    if (printer) setWizardState({ printer, mode: 'analyze' })
  }

  const header = (
    <div className="flex items-center gap-1 mb-1">
      <Send size={9} className="text-gray-400" />
      <p className="text-xs text-gray-400 flex-1">G-Code</p>
      <button onClick={() => refetch()} disabled={isFetching} className="text-gray-300 hover:text-gray-500 disabled:opacity-40">
        <RefreshCw size={10} className={isFetching ? 'animate-spin' : ''} />
      </button>
    </div>
  )

  if (isLoading) return <div>{header}<p className="text-xs text-gray-400">Loading…</p></div>
  if (data?.error && !files.length) return (
    <div>{header}<p className="text-xs text-gray-400 italic">{data.error}</p></div>
  )
  if (!files.length) return (
    <div>{header}<p className="text-xs text-gray-400 italic">
      No .gcode files in <span className="font-mono">{slicerName}/{printerTypeName}/{itemName}/</span>
    </p></div>
  )

  const thumbnailUrl = activeFile
    ? `/api/gcode/thumbnail?item_name=${encodeURIComponent(itemName)}&slicer_name=${encodeURIComponent(slicerName)}&printer_type_name=${encodeURIComponent(printerTypeName)}&filename=${encodeURIComponent(activeFile)}`
    : null

  return (
    <div className="space-y-1.5">
      {header}
      <div className="flex gap-2 items-start">
        {thumbnailUrl && (
          <div
            className="w-20 h-20 rounded border border-gray-200 dark:border-gray-600 shrink-0 overflow-hidden bg-gray-50 dark:bg-gray-700 cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
            onClick={() => setShowThumbModal(true)}
          >
            <img
              key={thumbnailUrl}
              src={thumbnailUrl}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                // Scale offset from modal space (384px) to thumbnail space (80px)
                transform: `translate(${offsetX * 80 / 384}px, ${offsetY * 80 / 384}px) scale(${zoom / 100})`,
                transformOrigin: 'center center',
              }}
              onError={e => { (e.target as HTMLImageElement).closest('div')!.style.display = 'none' }}
              alt="G-code preview"
            />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <select
            value={activeFile}
            onChange={e => selectFile(e.target.value)}
            onFocus={() => refetch()}
            className="w-full border rounded px-2 py-1 text-xs font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          >
            {files.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {metadata && !metadata.error && (metadata.filament_weight_total != null || metadata.estimated_time != null) && (
            <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
              {metadata.filament_weight_total != null && (
                <span>
                  {metadata.filament_weights.length > 1
                    ? metadata.filament_weights.map((w, i) => `#${i + 1}: ${w.toFixed(1)}g`).join(' · ') + ` = ${metadata.filament_weight_total.toFixed(1)}g`
                    : `${metadata.filament_weight_total.toFixed(1)}g`}
                </span>
              )}
              {metadata.estimated_time != null && (
                <span>{formatPrintTime(metadata.estimated_time)}</span>
              )}
            </div>
          )}
          {metadata && !metadata.error && activeFile && metadata.has_exclude_objects === false && (
            <button
              onClick={() => setShowExcludeObjectsModal(true)}
              className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
            >
              <AlertTriangle size={12} className="shrink-0" />
              Exclude Objects not enabled — click for details
            </button>
          )}
        </div>
      </div>
      {showExcludeObjectsModal && (
        <Modal
          title={<span className="flex items-center gap-2 text-red-600 dark:text-red-400"><AlertTriangle size={16} /> Exclude Objects Not Detected</span>}
          onClose={() => setShowExcludeObjectsModal(false)}
        >
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <p>
              This G-code file was sliced without the <strong>Label Objects</strong> (Exclude Objects) feature enabled.
            </p>
            <p>
              When this feature is active, Klipper tracks each object on the print plate individually. If one object fails mid-print — spaghetti, a layer shift, a part knocked loose — you can exclude it from the rest of the print without stopping the entire job. The printer skips that object's moves from that layer forward, letting your other parts finish cleanly.
            </p>
            <p>
              Without it, your only options are to abort everything or let the ruined object sit on the bed while the rest of the print runs alongside it.
            </p>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5 text-xs space-y-0.5">
              <p className="text-gray-500 dark:text-gray-400 font-semibold mb-1">To enable in Orca Slicer:</p>
              <p className="font-mono">Print Settings → Others → ✓ Label objects</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Re-slice and replace this G-code file to enable the feature for future prints of this item.
            </p>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              onClick={() => setShowExcludeObjectsModal(false)}
              className="px-4 py-1.5 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              OK
            </button>
          </div>
        </Modal>
      )}
      {matchingPrinters.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No printers of this type</p>
      ) : matchingPrinters.map(printer => (
        <PrinterStatusRow
          key={printer.id}
          printer={printer}
          anySending={sending}
          uploadSending={sendingPrinterId === printer.id}
          uploadSent={sentPrinterId === printer.id}
          uploadProgress={progress}
          uploadError={sendError?.printerId === printer.id ? sendError.message : null}
          onSend={handleSend}
          onAnalyze={handleAnalyze}
        />
      ))}
      {wizardState && (
        <PrintWizard
          printer={wizardState.printer}
          mode={wizardState.mode}
          itemId={itemId}
          itemName={itemName}
          routingId={routingId}
          stepId={stepId}
          stepFilaments={stepFilaments}
          filamentWeights={metadata?.filament_weights ?? []}
          filamentSlots={metadata?.filament_slots ?? []}
          stepPrintTime={stepPrintTime}
          gcodePrintTime={metadata?.estimated_time ?? null}
          filaments={filaments}
          onUpdateBom={onUpdateFromGcode}
          onPrint={(startPrint) => { const p = wizardState.printer; setWizardState(null); doSend(p.id, startPrint) }}
          onClose={() => setWizardState(null)}
        />
      )}
      {showThumbModal && thumbnailUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowThumbModal(false)}
        >
          <div
            className="bg-gray-900 rounded-xl shadow-2xl flex flex-col gap-3 p-4 w-96"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 truncate">{activeFile}</span>
              <button onClick={() => setShowThumbModal(false)} className="text-gray-400 hover:text-white shrink-0 ml-2">
                <X size={16} />
              </button>
            </div>

            <div
              className="w-full aspect-square overflow-hidden rounded-lg bg-black flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
              onPointerDown={onDragPointerDown}
              onPointerMove={onDragPointerMove}
              onPointerUp={onDragPointerUp}
              onPointerCancel={onDragPointerUp}
            >
              <img
                key={thumbnailUrl}
                src={thumbnailUrl}
                draggable={false}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom / 100})`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                }}
                alt="G-code preview"
              />
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setZoom(z => Math.max(10, z - 10))}
                className="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 text-xl leading-none font-bold"
              >−</button>
              <button
                title="Click to reset to 100%"
                onClick={() => setZoom(100)}
                className="w-14 text-center text-sm font-mono text-gray-300 hover:text-white"
              >{zoom}%</button>
              <button
                onClick={() => setZoom(z => Math.min(400, z + 10))}
                className="w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 text-xl leading-none font-bold"
              >+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SlicerFileRow({ itemId, printerType, slicerFile, onChanged }: {
  itemId: number
  printerType: PrinterType
  slicerFile: SlicerFile | undefined
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [path, setPath] = useState(slicerFile?.file_path ?? '')
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)

  async function handleSave() {
    if (!path.trim()) return
    setSaving(true)
    try {
      await setSlicerFile(itemId, printerType.id, path.trim())
      onChanged()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    await deleteSlicerFile(itemId, printerType.id)
    setPath('')
    onChanged()
  }

  async function handleOpen() {
    setOpening(true)
    setOpenError(null)
    try { await openInSlicer(itemId, printerType.id) }
    catch (e) { setOpenError(e instanceof Error ? e.message : 'Failed to open slicer') }
    finally { setOpening(false) }
  }

  // fillInput=true: just populate the text field (used when already in edit mode)
  // fillInput=false: pick and save immediately
  async function handleBrowse(fillInput = false, currentPath?: string) {
    setPicking(true)
    try {
      const result = await pickModelFile(currentPath)
      if (!result.path) return
      if (fillInput) {
        setPath(result.path)
      } else {
        setSaving(true)
        try {
          await setSlicerFile(itemId, printerType.id, result.path)
          setPath(result.path)
          onChanged()
          setEditing(false)
        } finally {
          setSaving(false)
        }
      }
    } finally {
      setPicking(false)
    }
  }

  const browseBtn = (fillInput: boolean, currentPath?: string) => (
    <button
      onClick={() => handleBrowse(fillInput, currentPath)}
      disabled={picking || saving}
      className="shrink-0 text-gray-400 hover:text-brand-600 disabled:opacity-40"
      title="Browse for file"
    >
      {picking ? <span className="text-xs leading-none">…</span> : <FolderOpen size={13} />}
    </button>
  )

  return (
    <>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {printerType.name}{printerType.slicer && <span className="text-gray-400 dark:text-gray-500"> ({printerType.slicer.name})</span>}
      </span>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              className="flex-1 border rounded px-2 py-1 text-xs font-mono dark:bg-gray-700 dark:border-gray-600"
              placeholder="C:\path\to\model.3mf"
              value={path}
              onChange={e => setPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
            />
            {browseBtn(true, path || undefined)}
            <button onClick={handleSave} disabled={saving || !path.trim()} className="text-green-600 hover:text-green-700 disabled:opacity-40 shrink-0">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X size={14} />
            </button>
          </>
        ) : slicerFile ? (
          <>
            <span className="flex-1 min-w-0 text-xs font-mono text-gray-600 dark:text-gray-300 truncate" title={slicerFile.file_path}>
              {slicerFile.file_path}
            </span>
            <button
              onClick={handleOpen}
              disabled={opening}
              className="shrink-0 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
              title={`Open in ${printerType.slicer?.name ?? 'slicer'}`}
            >
              {opening ? 'Opening…' : 'Open'}
            </button>
            {openError && <span className="text-xs text-red-500 truncate" title={openError}>Error</span>}
            {browseBtn(false, slicerFile.file_path)}
            <button onClick={() => { setPath(slicerFile.file_path); setEditing(true) }} className="shrink-0 text-gray-400 hover:text-gray-600">
              <Pencil size={13} />
            </button>
            <button onClick={handleDelete} className="shrink-0 text-gray-400 hover:text-red-500">
              <Trash2 size={13} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleBrowse(false)}
              disabled={picking}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-40"
            >
              <FolderOpen size={12} />{picking ? 'Opening…' : 'Browse…'}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-400 hover:text-brand-600 flex items-center gap-1"
            >
              <Plus size={12} /> Type path
            </button>
          </>
        )}
      </div>
    </>
  )
}

function StepSlicerFileRow({ itemId, routingId, stepId, slicerFile, itemFallbackFile, hasSlicer, onChanged }: {
  itemId: number
  routingId: number
  stepId: number
  slicerFile: StepSlicerFile | null
  itemFallbackFile: SlicerFile | undefined
  hasSlicer: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [path, setPath] = useState(slicerFile?.file_path ?? '')
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  async function handleSave() {
    if (!path.trim()) return
    setSaving(true)
    try {
      await setStepSlicerFile(itemId, routingId, stepId, path.trim())
      onChanged()
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    await deleteStepSlicerFile(itemId, routingId, stepId)
    setPath('')
    onChanged()
  }

  async function handleOpen() {
    setOpening(true)
    setOpenError(null)
    try { await openStepInSlicer(itemId, routingId, stepId) }
    catch (e) { setOpenError(e instanceof Error ? e.message : 'Failed to open slicer') }
    finally { setOpening(false) }
  }

  async function handleBrowse(fillInput = false, currentPath?: string) {
    setPicking(true)
    try {
      const result = await pickModelFile(currentPath)
      if (!result.path) return
      if (fillInput) {
        setPath(result.path)
      } else {
        setSaving(true)
        try {
          await setStepSlicerFile(itemId, routingId, stepId, result.path)
          setPath(result.path)
          onChanged()
          setEditing(false)
        } finally { setSaving(false) }
      }
    } finally { setPicking(false) }
  }

  const browseBtn = (fillInput: boolean, currentPath?: string) => (
    <button onClick={() => handleBrowse(fillInput, currentPath)} disabled={picking || saving}
      className="shrink-0 text-gray-400 hover:text-brand-600 disabled:opacity-40" title="Browse for file">
      {picking ? <span className="text-xs leading-none">…</span> : <FolderOpen size={13} />}
    </button>
  )

  return (
    <div className="pt-1 border-t border-gray-200 dark:border-gray-600 mt-1">
      <div className="flex items-center gap-2 py-1">
        <FileText size={12} className="text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">Model File</span>
      </div>
      <div className="flex items-center gap-2 pb-1">
      {editing ? (
        <>
          <input autoFocus
            className="flex-1 border rounded px-2 py-1 text-xs font-mono dark:bg-gray-700 dark:border-gray-600"
            placeholder="C:\path\to\model.3mf"
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
          />
          {browseBtn(true, path || undefined)}
          <button onClick={handleSave} disabled={saving || !path.trim()} className="text-green-600 hover:text-green-700 disabled:opacity-40 shrink-0"><Check size={14} /></button>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={14} /></button>
        </>
      ) : slicerFile ? (
        <>
          <span className="flex-1 min-w-0 text-xs font-mono text-gray-600 dark:text-gray-300 truncate" title={slicerFile.file_path}>
            {slicerFile.file_path}
          </span>
          {hasSlicer && (
            <button onClick={handleOpen} disabled={opening}
              className="shrink-0 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50">
              {opening ? 'Opening…' : 'Open'}
            </button>
          )}
          {openError && <span className="text-xs text-red-500 truncate" title={openError}>Error</span>}
          {browseBtn(false, slicerFile.file_path)}
          <button onClick={() => { setPath(slicerFile.file_path); setEditing(true) }} className="shrink-0 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
          <button onClick={handleDelete} className="shrink-0 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
        </>
      ) : (
        <>
          {itemFallbackFile ? (
            <span className="text-xs text-gray-400 italic flex-1">↑ Using item file</span>
          ) : (
            <span className="text-xs text-gray-400 flex-1">No model file</span>
          )}
          <button onClick={() => handleBrowse(false)} disabled={picking}
            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-40">
            <FolderOpen size={12} />{picking ? 'Opening…' : 'Browse…'}
          </button>
          <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-brand-600 flex items-center gap-1">
            <Plus size={12} /> Type path
          </button>
        </>
      )}
      </div>
    </div>
  )
}

function ItemDetail({ item, filaments, allTags, printerTypes, printers }: { item: Item; filaments: FilamentSpec[]; allTags: Tag[]; printerTypes: PrinterType[]; printers: Printer[] }) {
  const qc = useQueryClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [cropTarget, setCropTarget] = useState<{ imageId: number; url: string } | null>(null)
  const [editingReq, setEditingReq] = useState<{ reqId: number; specId: string; grams: string } | null>(null)
  const [reqForm, setReqForm] = useState<{ specId: string; grams: string } | null>(null)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState(item.description)

  const saveDescMutation = useMutation({
    mutationFn: () => updateItem(item.id, {
      name: item.name, description: descValue, notes: item.notes, sku: item.sku,
      stl_source_url: item.stl_source_url, use_advanced_routing: item.use_advanced_routing,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setEditingDesc(false) },
  })
const addTagMutation = useMutation({
    mutationFn: (tagId: number) => addTagToItem(tagId, item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
  const removeTagMutation = useMutation({
    mutationFn: (tagId: number) => removeTagFromItem(tagId, item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
  const dragSrc = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const reorderMutation = useMutation({
    mutationFn: (reorderItems: { id: number; sort_order: number }[]) =>
      reorderFilaments(item.id, reorderItems),
    onMutate: async (reorderItems) => {
      await qc.cancelQueries({ queryKey: ['items'] })
      const previous = qc.getQueryData<Item[]>(['items'])
      qc.setQueryData<Item[]>(['items'], (old = []) =>
        old.map(i => {
          if (i.id !== item.id) return i
          const sorted = [...i.filament_requirements].sort((a, b) => {
            const ai = reorderItems.find(x => x.id === a.id)?.sort_order ?? 0
            const bi = reorderItems.find(x => x.id === b.id)?.sort_order ?? 0
            return ai - bi
          })
          return { ...i, filament_requirements: sorted }
        })
      )
      return { previous }
    },
    onError: (_err, _reorderItems, context) => {
      if (context?.previous) qc.setQueryData(['items'], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  function clearDrag() { dragSrc.current = null; setDragIndex(null); setOverIndex(null) }

  function handleDrop(dropIndex: number) {
    const from = dragSrc.current
    if (from === null || from === dropIndex) { clearDrag(); return }
    const reqs = [...item.filament_requirements]
    const [moved] = reqs.splice(from, 1)
    reqs.splice(dropIndex, 0, moved)
    reorderMutation.mutate(reqs.map((r, i) => ({ id: r.id, sort_order: i })))
    clearDrag()
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      await uploadItemImage(item.id, file)
      qc.invalidateQueries({ queryKey: ['items'] })
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      setPasteError(null)
      let file: File | null = null

      const items = Array.from(e.clipboardData?.items ?? [])
      const files = Array.from(e.clipboardData?.files ?? [])

      const imageItem = items.find(i => i.type.startsWith('image/'))
      if (imageItem) file = imageItem.getAsFile()

      if (!file) {
        file = files.find(f =>
          f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(f.name)
        ) ?? null
      }

      if (!file) {
        const anyFile = items.find(i => i.kind === 'file')
        if (anyFile) file = anyFile.getAsFile()
      }

      if (!file) return
      e.preventDefault()

      if (file.size === 0) {
        setPasteError('Clipboard image has no data. Try saving it to a file first, then uploading.')
        return
      }

      setUploadingImage(true)
      try {
        await uploadItemImage(item.id, file)
        qc.invalidateQueries({ queryKey: ['items'] })
      } catch (err) {
        setPasteError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploadingImage(false)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [item.id, qc])

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowRight') setLightboxIndex(i => i !== null ? Math.min(i + 1, item.images.length - 1) : null)
      if (e.key === 'ArrowLeft') setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightboxIndex, item.images.length])

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: number) => deleteItemImage(item.id, imageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const removeReqMutation = useMutation({
    mutationFn: (reqId: number) => removeFilamentReq(item.id, reqId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const updateReqMutation = useMutation({
    mutationFn: ({ reqId, grams, filament_spec_id }: { reqId: number; grams: number; filament_spec_id: number }) =>
      updateFilamentReq(item.id, reqId, { grams, filament_spec_id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setEditingReq(null) },
  })

  const addReqMutation = useMutation({
    mutationFn: (data: { filament_spec_id: number; grams: number }) =>
      addFilamentReq(item.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setReqForm(null) },
  })

function confirmEdit(reqId: number, specId: string, gramsStr: string) {
    const g = parseFloat(gramsStr)
    if (specId) updateReqMutation.mutate({ reqId, grams: (!isNaN(g) && g > 0) ? g : 0, filament_spec_id: Number(specId) })
  }

  // --- Cost / BOM modals ---
  const [showCostModal, setShowCostModal] = useState(false)
  const [showBomModal, setShowBomModal] = useState(false)
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const globalHourlyRate = parseFloat(settings?.machine_hourly_rate ?? '2.50') || 2.50
  const electricityRate = parseFloat(settings?.electricity_cost_kwh ?? '0.1765') || 0.1765
  const globalMarkup = parseFloat(settings?.markup_multiplier ?? '1.2') || 1.2
  const currSym = useCurrency()

  // --- Post-processing costs ---
  const [ppNewLabel, setPpNewLabel] = useState('')
  const [ppNewCost, setPpNewCost] = useState('')
  const [ppEditId, setPpEditId] = useState<number | null>(null)
  const [ppEditLabel, setPpEditLabel] = useState('')
  const [ppEditCost, setPpEditCost] = useState('')

  const ppCreateMutation = useMutation({
    mutationFn: () => createPostProcessingCost(item.id, { label: ppNewLabel.trim(), cost_per_item: parseFloat(ppNewCost) || 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setPpNewLabel(''); setPpNewCost('') },
  })
  const ppUpdateMutation = useMutation({
    mutationFn: (id: number) => updatePostProcessingCost(item.id, id, { label: ppEditLabel.trim(), cost_per_item: parseFloat(ppEditCost) || 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setPpEditId(null) },
  })
  const ppDeleteMutation = useMutation({
    mutationFn: (id: number) => deletePostProcessingCost(item.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  // --- Routing state ---
  const [editingRoutingId, setEditingRoutingId] = useState<number | null>(null)
  const [editingRoutingName, setEditingRoutingName] = useState('')
  const [editingStep, setEditingStep] = useState<{
    routingId: number; stepId: number; desc: string; printerTypeId: string; qty: string; partsPerItem: string; printTimeHrs: string; printTimeMins: string
  } | null>(null)
  const [addingStep, setAddingStep] = useState<{ routingId: number } | null>(null)
  const [newStepForm, setNewStepForm] = useState({ desc: '', printerTypeId: '', qty: '1', partsPerItem: '1', printTimeHrs: '', printTimeMins: '' })
  const [editingStepFil, setEditingStepFil] = useState<{
    routingId: number; stepId: number; filId: number; specId: string; grams: string
  } | null>(null)
  const [addingStepFil, setAddingStepFil] = useState<{ routingId: number; stepId: number } | null>(null)
  const [newStepFilForm, setNewStepFilForm] = useState({ specId: '', grams: '' })

  const toggleAdvancedMutation = useMutation({
    mutationFn: () => updateItem(item.id, {
      name: item.name, description: item.description, notes: item.notes, sku: item.sku,
      stl_source_url: item.stl_source_url, use_advanced_routing: !item.use_advanced_routing,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const createRoutingMutation = useMutation({
    mutationFn: (data: { name?: string }) => createRouting(item.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const updateRoutingMutation = useMutation({
    mutationFn: ({ routingId, name }: { routingId: number; name: string }) =>
      updateRouting(item.id, routingId, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setEditingRoutingId(null) },
  })

  const deleteRoutingMutation = useMutation({
    mutationFn: (routingId: number) => deleteRouting(item.id, routingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const createStepMutation = useMutation({
    mutationFn: async ({ routingId, desc, printerTypeId, qty, partsPerItem, printTimeHrs, printTimeMins }: { routingId: number; desc: string; printerTypeId: string; qty: string; partsPerItem: string; printTimeHrs: string; printTimeMins: string }) => {
      const printTimeSecs = (printTimeHrs || printTimeMins) ? (Number(printTimeHrs || 0) * 3600 + Number(printTimeMins || 0) * 60) : undefined
      const step = await createRoutingStep(item.id, routingId, {
        description: desc,
        printer_type_id: printerTypeId ? Number(printerTypeId) : null,
        quantity_on_plate: Number(qty) || 1,
        parts_per_item: Number(partsPerItem) || 1,
        estimated_print_time: printTimeSecs || undefined,
      })
      for (const req of item.filament_requirements) {
        await addRoutingStepFilament(item.id, routingId, step.id, {
          filament_spec_id: req.filament_spec_id,
          grams: req.grams,
        })
      }
      return step
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setAddingStep(null); setNewStepForm({ desc: '', printerTypeId: '', qty: '1', partsPerItem: '1', printTimeHrs: '', printTimeMins: '' }) },
  })

  const updateStepMutation = useMutation({
    mutationFn: ({ routingId, stepId, desc, printerTypeId, qty, partsPerItem, printTimeHrs, printTimeMins }: { routingId: number; stepId: number; desc: string; printerTypeId: string; qty: string; partsPerItem: string; printTimeHrs: string; printTimeMins: string }) => {
      const printTimeSecs = (printTimeHrs || printTimeMins) ? (Number(printTimeHrs || 0) * 3600 + Number(printTimeMins || 0) * 60) : null
      return updateRoutingStep(item.id, routingId, stepId, {
        description: desc,
        printer_type_id: printerTypeId ? Number(printerTypeId) : null,
        quantity_on_plate: Number(qty) || 1,
        parts_per_item: Number(partsPerItem) || 1,
        estimated_print_time: printTimeSecs,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setEditingStep(null) },
  })

  const deleteStepMutation = useMutation({
    mutationFn: ({ routingId, stepId }: { routingId: number; stepId: number }) =>
      deleteRoutingStep(item.id, routingId, stepId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const addStepFilMutation = useMutation({
    mutationFn: ({ routingId, stepId, specId, grams }: { routingId: number; stepId: number; specId: string; grams: string }) =>
      addRoutingStepFilament(item.id, routingId, stepId, { filament_spec_id: Number(specId), grams: Number(grams) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setAddingStepFil(null); setNewStepFilForm({ specId: '', grams: '' }) },
  })

  const updateStepFilMutation = useMutation({
    mutationFn: ({ routingId, stepId, filId, specId, grams }: { routingId: number; stepId: number; filId: number; specId: string; grams: string }) =>
      updateRoutingStepFilament(item.id, routingId, stepId, filId, { filament_spec_id: Number(specId), grams: Number(grams) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setEditingStepFil(null) },
  })

  const deleteStepFilMutation = useMutation({
    mutationFn: ({ routingId, stepId, filId }: { routingId: number; stepId: number; filId: number }) =>
      deleteRoutingStepFilament(item.id, routingId, stepId, filId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const toggleRoutingSummaryMutation = useMutation({
    mutationFn: ({ routingId, include_in_summary }: { routingId: number; include_in_summary: boolean }) =>
      updateRouting(item.id, routingId, { include_in_summary }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const toggleStepPlanningMutation = useMutation({
    mutationFn: ({ routingId, stepId, include_in_planning }: { routingId: number; stepId: number; include_in_planning: boolean }) =>
      updateRoutingStep(item.id, routingId, stepId, { include_in_planning }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  const hasProductionSteps = item.routings.some(r => r.steps.length > 0)

  const computedFilaments = useMemo(() => {
    if (!hasProductionSteps) return null
    const map = new Map<number, { filament_spec: typeof item.filament_requirements[0]['filament_spec']; grams: number }>()
    for (const routing of item.routings) {
      if (!routing.include_in_summary) continue
      for (const step of routing.steps) {
        if (!step.include_in_planning) continue
        const multiplier = step.quantity_on_plate > 0 ? step.parts_per_item / step.quantity_on_plate : step.parts_per_item
        for (const fil of step.filaments) {
          const grams = fil.grams * multiplier
          const existing = map.get(fil.filament_spec_id)
          if (existing) {
            map.set(fil.filament_spec_id, { ...existing, grams: existing.grams + grams })
          } else {
            map.set(fil.filament_spec_id, { filament_spec: fil.filament_spec, grams })
          }
        }
      }
    }
    return Array.from(map.values())
  }, [item.routings, hasProductionSteps])

  async function handleAddStep(routingId: number) {
    const { desc, printerTypeId, qty, partsPerItem, printTimeHrs, printTimeMins } = newStepForm
    createStepMutation.mutate({ routingId, desc, printerTypeId, qty, partsPerItem, printTimeHrs, printTimeMins })
  }

  async function ensureRoutingThenAddStep() {
    if (item.routings.length > 0) {
      setAddingStep({ routingId: item.routings[0].id })
    } else {
      const routing = await createRouting(item.id, {})
      await qc.invalidateQueries({ queryKey: ['items'] })
      setAddingStep({ routingId: routing.id })
    }
  }

  function renderRoutingSteps(routing: Routing) {
    return (
      <div className="space-y-2 mt-2">
        {routing.steps.map((step, idx) => {
          const isEditingThis = editingStep?.stepId === step.id
          const isAddingFilHere = addingStepFil?.stepId === step.id
          const printerType = printerTypes.find(pt => pt.id === step.printer_type_id)
          return (
            <div key={step.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 space-y-1.5">
              {isEditingThis && editingStep ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 shrink-0">Step {idx + 1}</span>
                    <input
                      autoFocus
                      className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Description"
                      value={editingStep.desc}
                      onChange={e => setEditingStep(s => s && { ...s, desc: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600"
                      value={editingStep.printerTypeId}
                      onChange={e => setEditingStep(s => s && { ...s, printerTypeId: e.target.value })}
                    >
                      <option value="">— any printer type —</option>
                      {printerTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                    </select>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-gray-500">×</span>
                      <input
                        type="number" min="1"
                        className="w-14 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600"
                        value={editingStep.qty}
                        onChange={e => setEditingStep(s => s && { ...s, qty: e.target.value })}
                      />
                      <span className="text-xs text-gray-500">per plate</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number" min="1"
                        className="w-14 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600"
                        value={editingStep.partsPerItem}
                        onChange={e => setEditingStep(s => s && { ...s, partsPerItem: e.target.value })}
                      />
                      <span className="text-xs text-gray-500">Parts per Item (BOM)</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number" min="0" placeholder="0"
                        className="w-12 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600"
                        value={editingStep.printTimeHrs}
                        onChange={e => setEditingStep(s => s && { ...s, printTimeHrs: e.target.value })}
                      />
                      <span className="text-xs text-gray-500">h</span>
                      <input
                        type="number" min="0" max="59" placeholder="0"
                        className="w-12 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600"
                        value={editingStep.printTimeMins}
                        onChange={e => setEditingStep(s => s && { ...s, printTimeMins: e.target.value })}
                      />
                      <span className="text-xs text-gray-500">min per plate</span>
                    </div>
                    <button onClick={() => updateStepMutation.mutate({ routingId: routing.id, stepId: step.id, desc: editingStep.desc, printerTypeId: editingStep.printerTypeId, qty: editingStep.qty, partsPerItem: editingStep.partsPerItem, printTimeHrs: editingStep.printTimeHrs, printTimeMins: editingStep.printTimeMins })} disabled={updateStepMutation.isPending} className="text-green-500 hover:text-green-600 disabled:opacity-40"><Check size={13} /></button>
                    <button onClick={() => setEditingStep(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-gray-400 shrink-0">Step {idx + 1}</span>
                    <span className="text-sm font-medium truncate">{step.description || <span className="text-gray-400 italic">No description</span>}</span>
                    {printerType && <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded">{printerType.name}</span>}
                    <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0"><Box size={10} />×{step.quantity_on_plate} per Plate</span>
                    <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0"><Share2 size={10} />{step.parts_per_item} {step.parts_per_item === 1 ? 'Part' : 'Parts'} per Item (BOM)</span>
                    {step.estimated_print_time != null && <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0"><Clock size={10} />{formatPrintTime(step.estimated_print_time)}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasProductionSteps && (
                      <ToggleSwitch
                        checked={step.include_in_planning}
                        onChange={v => toggleStepPlanningMutation.mutate({ routingId: routing.id, stepId: step.id, include_in_planning: v })}
                        tooltip={step.include_in_planning
                          ? 'This step is included in the Summarized Bill of Materials. Its filament consumption is scaled by parts per item ÷ quantity on plate and counted in the item-level summary.'
                          : 'This step is excluded from the Summarized Bill of Materials. Its filament consumption is not counted in the item-level summary.'}
                      />
                    )}
                    <button onClick={() => setEditingStep({ routingId: routing.id, stepId: step.id, desc: step.description, printerTypeId: String(step.printer_type_id ?? ''), qty: String(step.quantity_on_plate), partsPerItem: String(step.parts_per_item ?? 1), printTimeHrs: step.estimated_print_time != null ? String(Math.floor(step.estimated_print_time / 3600)) : '', printTimeMins: step.estimated_print_time != null ? String(Math.floor((step.estimated_print_time % 3600) / 60)) : '' })} className="text-gray-400 hover:text-brand-600"><Pencil size={12} /></button>
                    <button onClick={() => { if (confirm('Delete this step?')) deleteStepMutation.mutate({ routingId: routing.id, stepId: step.id }) }} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                  </div>
                </div>
              )}
              {/* Step filaments */}
              <div className="pl-10 space-y-1">
                {step.filaments.map(fil => {
                  const isEditingFil = editingStepFil?.filId === fil.id
                  return (
                    <div key={fil.id} className="flex items-center gap-2 text-xs">
                      {isEditingFil && editingStepFil ? (
                        <>
                          <FilamentDot hex={fil.filament_spec.color_hex} />
                          <select className="flex-1 border rounded px-1.5 py-0.5 text-xs dark:bg-gray-700 dark:border-gray-600" value={editingStepFil.specId} onChange={e => setEditingStepFil(s => s && { ...s, specId: e.target.value })}>
                            <option value="">— select —</option>
                            {filaments.map(f => <option key={f.id} value={f.id}>{f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}</option>)}
                          </select>
                          <input type="number" min="0.1" step="0.1" className="w-16 border rounded px-1.5 py-0.5 text-xs text-right dark:bg-gray-700 dark:border-gray-600" value={editingStepFil.grams} onChange={e => setEditingStepFil(s => s && { ...s, grams: e.target.value })} />
                          <span className="text-gray-500">g</span>
                          <button onClick={() => updateStepFilMutation.mutate({ routingId: routing.id, stepId: step.id, filId: fil.id, specId: editingStepFil.specId, grams: editingStepFil.grams })} disabled={!editingStepFil.specId || updateStepFilMutation.isPending} className="text-green-500 hover:text-green-600 disabled:opacity-40"><Check size={11} /></button>
                          <button onClick={() => setEditingStepFil(null)} className="text-gray-400 hover:text-gray-600"><X size={11} /></button>
                        </>
                      ) : (
                        <>
                          <FilamentDot hex={fil.filament_spec.color_hex} />
                          <span className="flex-1 text-gray-600 dark:text-gray-300">{fil.filament_spec.brand ? `${fil.filament_spec.brand} ` : ''}{fil.filament_spec.material} {fil.filament_spec.color_name}</span>
                          <span className="font-medium text-gray-700 dark:text-gray-200">{fil.grams}g/plate</span>
                          <button onClick={() => setEditingStepFil({ routingId: routing.id, stepId: step.id, filId: fil.id, specId: String(fil.filament_spec_id), grams: String(fil.grams) })} className="text-gray-400 hover:text-brand-600"><Pencil size={11} /></button>
                          <button onClick={() => deleteStepFilMutation.mutate({ routingId: routing.id, stepId: step.id, filId: fil.id })} className="text-red-400 hover:text-red-600"><Trash2 size={11} /></button>
                        </>
                      )}
                    </div>
                  )
                })}
                {isAddingFilHere && addingStepFil ? (
                  <div className="flex items-center gap-1.5">
                    <select className="flex-1 border rounded px-1.5 py-0.5 text-xs dark:bg-gray-700 dark:border-gray-600" value={newStepFilForm.specId} onChange={e => setNewStepFilForm(f => ({ ...f, specId: e.target.value }))}>
                      <option value="">— select filament —</option>
                      {filaments.map(f => <option key={f.id} value={f.id}>{f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}</option>)}
                    </select>
                    <input type="number" min="0.1" step="0.1" placeholder="g" className="w-16 border rounded px-1.5 py-0.5 text-xs text-right dark:bg-gray-700 dark:border-gray-600" value={newStepFilForm.grams} onChange={e => setNewStepFilForm(f => ({ ...f, grams: e.target.value }))} />
                    <span className="text-gray-500 text-xs">g</span>
                    <button disabled={!newStepFilForm.specId || !newStepFilForm.grams || addStepFilMutation.isPending} onClick={() => addStepFilMutation.mutate({ routingId: routing.id, stepId: step.id, ...newStepFilForm })} className="text-green-500 hover:text-green-600 disabled:opacity-40"><Check size={11} /></button>
                    <button onClick={() => setAddingStepFil(null)} className="text-gray-400 hover:text-gray-600"><X size={11} /></button>
                  </div>
                ) : (
                  <button onClick={() => { setAddingStepFil({ routingId: routing.id, stepId: step.id }); setNewStepFilForm({ specId: '', grams: '' }) }} className="text-xs text-brand-600 hover:underline flex items-center gap-0.5"><Plus size={10} /> Add filament</button>
                )}
                {/* Model files (per step) */}
                <StepSlicerFileRow
                  itemId={item.id}
                  routingId={routing.id}
                  stepId={step.id}
                  slicerFile={step.slicer_file}
                  itemFallbackFile={item.slicer_files.find(sf => sf.printer_type_id === step.printer_type_id)}
                  hasSlicer={!!printerType?.slicer?.executable_path}
                  onChanged={() => qc.invalidateQueries({ queryKey: ['items'] })}
                />
                {/* G-Code files */}
                {printerType?.slicer && (
                  <div className="pt-1 border-t border-gray-200 dark:border-gray-600 mt-1">
                    <GcodePanel
                      itemId={item.id}
                      routingId={routing.id}
                      itemName={item.name}
                      slicerName={printerType.slicer.name}
                      printerTypeName={printerType.name}
                      printerTypeId={printerType.id}
                      stepId={step.id}
                      savedGcodeFile={step.gcode_file}
                      stepPrintTime={step.estimated_print_time}
                      printers={printers}
                      stepFilaments={step.filaments}
                      filaments={filaments}
                      onGcodeFileChange={async (file) => {
                        await updateRoutingStep(item.id, routing.id, step.id, { gcode_file: file })
                        qc.invalidateQueries({ queryKey: ['items'] })
                      }}
                      onUpdateFromGcode={async ({ weights, reassigns, adds, printTime }) => {
                        if (adds && adds.length > 0) {
                          for (const a of adds) {
                            await addRoutingStepFilament(item.id, routing.id, step.id, a)
                          }
                        }
                        if (reassigns && reassigns.length > 0) {
                          await Promise.all(reassigns.map(r =>
                            updateRoutingStepFilament(item.id, routing.id, step.id, r.filId, {
                              filament_spec_id: r.filament_spec_id,
                              grams: r.grams,
                            })
                          ))
                        }
                        if (weights.length > 0) {
                          await Promise.all(weights.map(u => {
                            const sf = step.filaments.find(f => f.id === u.filId)
                            if (!sf) return Promise.resolve()
                            return updateRoutingStepFilament(item.id, routing.id, step.id, u.filId, {
                              filament_spec_id: sf.filament_spec_id,
                              grams: u.grams,
                            })
                          }))
                          await Promise.all(weights.map(u => {
                            const sf = step.filaments.find(f => f.id === u.filId)
                            if (!sf) return Promise.resolve()
                            const req = item.filament_requirements.find(r => r.filament_spec_id === sf.filament_spec_id)
                            if (!req) return Promise.resolve()
                            return updateFilamentReq(item.id, req.id, { grams: u.grams, filament_spec_id: sf.filament_spec_id })
                          }))
                        }
                        if (printTime != null) {
                          await updateRoutingStep(item.id, routing.id, step.id, { estimated_print_time: printTime })
                        }
                        await qc.invalidateQueries({ queryKey: ['items'] })
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {/* Add step row */}
        {addingStep?.routingId === routing.id ? (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 shrink-0">New step</span>
              <input autoFocus className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600" placeholder="Description" value={newStepForm.desc} onChange={e => setNewStepForm(f => ({ ...f, desc: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <select className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600" value={newStepForm.printerTypeId} onChange={e => setNewStepForm(f => ({ ...f, printerTypeId: e.target.value }))}>
                <option value="">— any printer type —</option>
                {printerTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
              </select>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-gray-500">×</span>
                <input type="number" min="1" className="w-14 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600" value={newStepForm.qty} onChange={e => setNewStepForm(f => ({ ...f, qty: e.target.value }))} />
                <span className="text-xs text-gray-500">per plate</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 shrink-0">
                <input type="number" min="1" className="w-14 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600" value={newStepForm.partsPerItem} onChange={e => setNewStepForm(f => ({ ...f, partsPerItem: e.target.value }))} />
                <span className="text-xs text-gray-500">Parts per Item (BOM)</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <input type="number" min="0" placeholder="0" className="w-12 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600" value={newStepForm.printTimeHrs} onChange={e => setNewStepForm(f => ({ ...f, printTimeHrs: e.target.value }))} />
                <span className="text-xs text-gray-500">h</span>
                <input type="number" min="0" max="59" placeholder="0" className="w-12 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600" value={newStepForm.printTimeMins} onChange={e => setNewStepForm(f => ({ ...f, printTimeMins: e.target.value }))} />
                <span className="text-xs text-gray-500">min per plate</span>
              </div>
              <button onClick={() => handleAddStep(routing.id)} disabled={createStepMutation.isPending} className="text-green-500 hover:text-green-600 disabled:opacity-40"><Check size={13} /></button>
              <button onClick={() => setAddingStep(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setAddingStep({ routingId: routing.id }); setNewStepForm({ desc: '', printerTypeId: '', qty: '1', partsPerItem: '1', printTimeHrs: '', printTimeMins: '' }) }} className="text-sm text-brand-600 hover:underline flex items-center gap-1 mt-1"><Plus size={13} /> Add step</button>
        )}
      </div>
    )
  }

  return (
    <div className="border-t dark:border-gray-700 px-4 py-3 space-y-4">
      {item.notes && <p className="text-sm text-gray-500 dark:text-gray-400 italic">{item.notes}</p>}



      {/* Images */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
          Images <span className="normal-case font-normal text-gray-300 dark:text-gray-600 ml-1">— or paste from clipboard</span>
        </p>
        {pasteError && (
          <p className="text-xs text-red-500 mb-2">{pasteError}</p>
        )}
        <div className="flex flex-wrap gap-2 items-end">
          {item.images.map((img, idx) => (
            <div key={img.id} className="relative group">
              <img
                src={`/api/items/${item.id}/images/${img.id}?v=${new Date(img.created_at).getTime()}`}
                alt=""
                onClick={() => setLightboxIndex(idx)}
                className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600 cursor-zoom-in"
              />
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={`/api/items/${item.id}/images/${img.id}`}
                  download={item.name}
                  onClick={e => e.stopPropagation()}
                  className="bg-black/60 text-white rounded-full p-0.5"
                  title="Download"
                >
                  <Download size={10} />
                </a>
                <button
                  onClick={() => setCropTarget({ imageId: img.id, url: `/api/items/${item.id}/images/${img.id}?v=${new Date(img.created_at).getTime()}` })}
                  className="bg-black/60 text-white rounded-full p-0.5"
                  title="Crop"
                >
                  <CropIcon size={10} />
                </button>
                <button
                  onClick={() => deleteImageMutation.mutate(img.id)}
                  className="bg-black/60 text-white rounded-full p-0.5"
                  title="Delete"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={uploadingImage}
            className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-brand-600 hover:border-brand-400 transition-colors disabled:opacity-50"
          >
            {uploadingImage
              ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <><Upload size={16} /><span className="text-xs">Add</span></>
            }
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>
      </div>

      {cropTarget && (
        <CropModal
          itemId={item.id}
          imageId={cropTarget.imageId}
          imageUrl={cropTarget.url}
          onClose={() => setCropTarget(null)}
          onDone={() => setCropTarget(null)}
        />
      )}

      {lightboxIndex !== null && item.images[lightboxIndex] && (() => {
        const img = item.images[lightboxIndex]
        const url = `/api/items/${item.id}/images/${img.id}?v=${new Date(img.created_at).getTime()}`
        return (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={() => setLightboxIndex(null)}
          >
            <img
              src={url}
              alt=""
              onClick={e => e.stopPropagation()}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />

            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full p-1.5"
            >
              <X size={20} />
            </button>

            {lightboxIndex > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
              >
                <ChevronRight size={24} className="rotate-180" />
              </button>
            )}

            {lightboxIndex < item.images.length - 1 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
              >
                <ChevronRight size={24} />
              </button>
            )}

            <div
              className="absolute bottom-4 flex items-center gap-3"
              onClick={e => e.stopPropagation()}
            >
              <a
                href={`/api/items/${item.id}/images/${img.id}`}
                download={item.name}
                className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white bg-black/50 px-3 py-1.5 rounded-full"
              >
                <Download size={14} /> Download
              </a>
              <button
                onClick={() => { setCropTarget({ imageId: img.id, url }); setLightboxIndex(null) }}
                className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white bg-black/50 px-3 py-1.5 rounded-full"
              >
                <CropIcon size={14} /> Crop
              </button>
              <button
                onClick={() => { deleteImageMutation.mutate(img.id); setLightboxIndex(null) }}
                className="flex items-center gap-1.5 text-sm text-white/80 hover:text-red-400 bg-black/50 px-3 py-1.5 rounded-full"
              >
                <X size={14} /> Delete
              </button>
              {item.images.length > 1 && (
                <span className="text-xs text-white/40">{lightboxIndex + 1} / {item.images.length}</span>
              )}
            </div>
          </div>
        )
      })()}

      {/* Description */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Description</p>
        {editingDesc ? (
          <div className="space-y-1.5">
            <textarea
              autoFocus
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 resize-none"
              value={descValue}
              onChange={e => setDescValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setDescValue(item.description); setEditingDesc(false) } }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => saveDescMutation.mutate()}
                disabled={saveDescMutation.isPending}
                className="text-xs bg-brand-600 text-white px-3 py-1 rounded-lg disabled:opacity-50"
              >
                {saveDescMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setDescValue(item.description); setEditingDesc(false) }}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setEditingDesc(true)}
            className="min-h-[2rem] text-sm text-gray-700 dark:text-gray-300 cursor-text rounded-lg px-3 py-2 -mx-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors whitespace-pre-wrap"
          >
            {item.description
              ? item.description
              : <span className="text-gray-400 dark:text-gray-500 italic">Add a description…</span>}
          </div>
        )}
      </div>

      {/* Bill of Materials */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Summarized Bill of Materials</p>
        {hasProductionSteps ? (
          <div className="space-y-1.5">
            {computedFilaments && computedFilaments.length > 0 ? (
              computedFilaments.map(({ filament_spec, grams }) => (
                <div key={filament_spec.id} className="flex items-center justify-between text-sm py-0.5">
                  <div className="flex items-center gap-2">
                    <FilamentDot hex={filament_spec.color_hex} />
                    <span>{filament_spec.material} — {filament_spec.color_name}</span>
                    {filament_spec.brand && <span className="text-gray-400 text-xs">{filament_spec.brand}</span>}
                  </div>
                  <span className="font-medium tabular-nums">{grams > 0 ? `${grams.toFixed(1)}g` : '—'}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 italic">
                {item.routings.some(r => r.include_in_summary && r.steps.some(s => s.include_in_planning && s.filaments.length > 0))
                  ? 'No filaments yet.'
                  : item.routings.every(r => !r.include_in_summary)
                    ? 'All routings excluded from summary.'
                    : 'No filaments defined in included steps.'}
              </p>
            )}
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
              <Route size={10} /> Computed from production steps — edit filaments within each step
            </p>
          </div>
        ) : (
          <>
          <div className="space-y-1.5">
          {item.filament_requirements.map((req, index) => {
            const isEditing = editingReq?.reqId === req.id
            const isDragOver = overIndex === index && dragIndex !== index
            return (
              <div
                key={req.id}
                draggable={!isEditing}
                onDragStart={!isEditing ? () => { dragSrc.current = index; setDragIndex(index); setOverIndex(null) } : undefined}
                onDragOver={e => { e.preventDefault(); if (!isEditing) setOverIndex(index) }}
                onDrop={() => handleDrop(index)}
                onDragEnd={clearDrag}
                className={`rounded transition-colors ${isDragOver ? 'bg-brand-50 dark:bg-brand-900/20 ring-1 ring-inset ring-brand-400' : ''} ${dragIndex === index ? 'opacity-40' : ''}`}
              >
                {isEditing && editingReq ? (
                  <div className="flex items-center gap-2 py-1">
                    <span className="text-xs text-gray-400 w-5 shrink-0 select-none text-right">{index + 1}.</span>
                    <select
                      autoFocus
                      className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      value={editingReq.specId}
                      onChange={e => setEditingReq({ ...editingReq, specId: e.target.value })}
                    >
                      <option value="">— select —</option>
                      {filaments.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      className="w-16 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600"
                      value={editingReq.grams}
                      onChange={e => setEditingReq({ ...editingReq, grams: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmEdit(req.id, editingReq.specId, editingReq.grams)
                        if (e.key === 'Escape') setEditingReq(null)
                      }}
                    />
                    <span className="text-xs text-gray-500 shrink-0">g</span>
                    <button
                      onClick={() => confirmEdit(req.id, editingReq.specId, editingReq.grams)}
                      disabled={!editingReq.specId || updateReqMutation.isPending}
                      className="text-green-500 hover:text-green-600 disabled:opacity-40"
                    >
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditingReq(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-sm py-0.5">
                    <div className="flex items-center gap-2">
                      <GripVertical size={12} className="text-gray-300 dark:text-gray-600 cursor-grab shrink-0" />
                      <span className="text-xs text-gray-400 w-4 shrink-0 select-none text-right">{index + 1}.</span>
                      <FilamentDot hex={req.filament_spec.color_hex} />
                      <span>{req.filament_spec.material} — {req.filament_spec.color_name}</span>
                      {req.filament_spec.brand && <span className="text-gray-400 text-xs">{req.filament_spec.brand}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{req.grams > 0 ? `${req.grams}g` : '—'}</span>
                      {req.filament_spec.purchase_url && (
                        <a href={req.filament_spec.purchase_url} target="_blank" rel="noopener noreferrer"
                          title="Order" className="text-gray-400 hover:text-green-600">
                          <ShoppingCart size={13} />
                        </a>
                      )}
                      <button
                        onClick={() => setEditingReq({ reqId: req.id, specId: String(req.filament_spec_id), grams: String(req.grams) })}
                        className="text-gray-400 hover:text-brand-600"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => removeReqMutation.mutate(req.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {reqForm !== null ? (
          <div className="flex items-end gap-2 pt-2">
            <div className="flex-1">
              <select
                className="w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={reqForm.specId}
                onChange={e => setReqForm(r => r && { ...r, specId: e.target.value })}
              >
                <option value="">— select filament —</option>
                {filaments.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.material} — {f.color_name}{f.brand ? ` (${f.brand})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="g"
                className="w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={reqForm.grams}
                onChange={e => setReqForm(r => r && { ...r, grams: e.target.value })}
              />
            </div>
            <button
              className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
              disabled={!reqForm.specId || addReqMutation.isPending}
              onClick={() => { const g = parseFloat(reqForm.grams); addReqMutation.mutate({ filament_spec_id: Number(reqForm.specId), grams: (!isNaN(g) && g > 0) ? g : 0 }) }}
            >Save</button>
            <button className="text-sm text-gray-400 px-1" onClick={() => setReqForm(null)}>Cancel</button>
          </div>
        ) : (
          <button
            className="mt-2 text-sm text-brand-600 hover:underline flex items-center gap-1"
            onClick={() => setReqForm({ specId: '', grams: '' })}
          >
            <Plus size={13} /> Add filament
          </button>
        )}
          </>
        )}
      </div>

      {/* Cost / BOM feature panel */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowCostModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 text-white hover:opacity-90 transition-opacity shadow-sm"
        >
          <span className="text-xs font-bold leading-none">{currSym}</span> Cost Accounting
        </button>
        <button
          onClick={() => setShowBomModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:opacity-90 transition-opacity shadow-sm"
        >
          <BomIcon size={12} /> BOM
        </button>
      </div>

      {/* Model Files */}
      {printerTypes.filter(pt => pt.slicer).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
            <FolderOpen size={11} /> Model Files
          </p>
          <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5 items-center">
            {printerTypes.filter(pt => pt.slicer).map(pt => {
              const sf: SlicerFile | undefined = item.slicer_files.find(f => f.printer_type_id === pt.id)
              return (
                <SlicerFileRow
                  key={pt.id}
                  itemId={item.id}
                  printerType={pt}
                  slicerFile={sf}
                  onChanged={() => qc.invalidateQueries({ queryKey: ['items'] })}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Routing */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Route size={11} /> Production Steps (Routing)
          </p>
          <div className="flex items-center gap-3">
            {!item.use_advanced_routing && hasProductionSteps && item.routings.length > 0 && (
              <ToggleSwitch
                checked={item.routings[0].include_in_summary}
                onChange={v => toggleRoutingSummaryMutation.mutate({ routingId: item.routings[0].id, include_in_summary: v })}
                tooltip={item.routings[0].include_in_summary
                  ? 'This routing is included in the Summarized Bill of Materials. Filament consumption from its steps is counted in the item-level summary.'
                  : 'This routing is excluded from the Summarized Bill of Materials. Its filament consumption is not counted in the item-level summary.'}
              />
            )}
            <button
              onClick={() => toggleAdvancedMutation.mutate()}
              disabled={toggleAdvancedMutation.isPending}
              className="text-xs text-gray-400 hover:text-brand-600 flex items-center gap-1"
              title={item.use_advanced_routing ? 'Switch to simple mode (one routing)' : 'Switch to advanced mode (multiple routings)'}
            >
              {item.use_advanced_routing ? 'Advanced' : 'Simple'} <ChevronDown size={10} />
            </button>
          </div>
        </div>

        {item.use_advanced_routing ? (
          /* Advanced mode: multiple named routings */
          <div className="space-y-4">
            {item.routings.map(routing => (
              <div key={routing.id} className="border dark:border-gray-600 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50">
                  {editingRoutingId === routing.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        autoFocus
                        className="flex-1 border rounded px-2 py-0.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                        value={editingRoutingName}
                        onChange={e => setEditingRoutingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') updateRoutingMutation.mutate({ routingId: routing.id, name: editingRoutingName })
                          if (e.key === 'Escape') setEditingRoutingId(null)
                        }}
                      />
                      <button onClick={() => updateRoutingMutation.mutate({ routingId: routing.id, name: editingRoutingName })} disabled={updateRoutingMutation.isPending} className="text-green-500 hover:text-green-600 disabled:opacity-40"><Check size={13} /></button>
                      <button onClick={() => setEditingRoutingId(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{routing.name || <span className="text-gray-400 italic">Untitled</span>}</span>
                      {routing.is_default && <span className="text-xs bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded-full">Default</span>}
                      <button onClick={() => { setEditingRoutingId(routing.id); setEditingRoutingName(routing.name) }} className="text-gray-400 hover:text-brand-600"><Pencil size={12} /></button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 shrink-0">
                    {hasProductionSteps && (
                      <ToggleSwitch
                        checked={routing.include_in_summary}
                        onChange={v => toggleRoutingSummaryMutation.mutate({ routingId: routing.id, include_in_summary: v })}
                        tooltip={routing.include_in_summary
                          ? 'This routing is included in the Summarized Bill of Materials. Filament consumption from its steps is counted in the item-level summary.'
                          : 'This routing is excluded from the Summarized Bill of Materials. Its filament consumption is not counted in the item-level summary.'}
                      />
                    )}
                    <button
                      onClick={() => { if (confirm(`Delete routing "${routing.name || 'Untitled'}"?`)) deleteRoutingMutation.mutate(routing.id) }}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2">
                  {renderRoutingSteps(routing)}
                </div>
              </div>
            ))}
            <button
              onClick={() => createRoutingMutation.mutate({ name: `Production Step ${item.routings.length + 1}` })}
              disabled={createRoutingMutation.isPending}
              className="text-sm text-brand-600 hover:underline flex items-center gap-1"
            >
              <Plus size={13} /> Add routing
            </button>
          </div>
        ) : (
          /* Simple mode: single routing */
          <div>
            {item.routings.length === 0 ? (
              <div>
                {addingStep ? (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0">Step 1</span>
                      <input autoFocus className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600" placeholder="Description" value={newStepForm.desc} onChange={e => setNewStepForm(f => ({ ...f, desc: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-2">
                      <select className="flex-1 border rounded px-2 py-1 text-xs dark:bg-gray-700 dark:border-gray-600" value={newStepForm.printerTypeId} onChange={e => setNewStepForm(f => ({ ...f, printerTypeId: e.target.value }))}>
                        <option value="">— any printer type —</option>
                        {printerTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                      </select>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-gray-500">×</span>
                        <input type="number" min="1" className="w-14 border rounded px-1.5 py-1 text-xs text-right dark:bg-gray-700 dark:border-gray-600" value={newStepForm.qty} onChange={e => setNewStepForm(f => ({ ...f, qty: e.target.value }))} />
                        <span className="text-xs text-gray-500">per plate</span>
                      </div>
                      <button onClick={async () => {
                        const routing = await createRouting(item.id, {})
                        await qc.invalidateQueries({ queryKey: ['items'] })
                        createStepMutation.mutate({ routingId: routing.id, desc: newStepForm.desc, printerTypeId: newStepForm.printerTypeId, qty: newStepForm.qty, partsPerItem: newStepForm.partsPerItem, printTimeHrs: newStepForm.printTimeHrs, printTimeMins: newStepForm.printTimeMins })
                      }} disabled={createStepMutation.isPending} className="text-green-500 hover:text-green-600 disabled:opacity-40"><Check size={13} /></button>
                      <button onClick={() => setAddingStep(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setAddingStep({ routingId: -1 }); setNewStepForm({ desc: '', printerTypeId: '', qty: '1', partsPerItem: '1', printTimeHrs: '', printTimeMins: '' }) }} className="text-sm text-brand-600 hover:underline flex items-center gap-1"><Plus size={13} /> Add step</button>
                )}
              </div>
            ) : (
              renderRoutingSteps(item.routings[0])
            )}
          </div>
        )}
      </div>

      {/* Cost Accounting Modal */}
      {showCostModal && (
        <Modal title={<>Cost Accounting / <span className="text-green-600 dark:text-green-400">MSRP</span></>} onClose={() => setShowCostModal(false)} wide>
          <div className="space-y-4">
            {(() => {
              const allSteps = item.routings.flatMap(r => r.steps)
              if (allSteps.length === 0) {
                const filamentTotal = item.filament_requirements.reduce((acc, req) => {
                  const spec = req.filament_spec
                  const cpg = spec.price != null && spec.weight != null && spec.weight > 0 ? spec.price / spec.weight : null
                  return acc + (cpg != null ? req.grams * cpg : 0)
                }, 0)
                return (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No production steps defined. Showing filament costs only.</p>
                    <div className="flex justify-between text-sm border-t dark:border-gray-700 pt-3">
                      <span className="text-gray-600 dark:text-gray-400">Filament cost</span>
                      <span className="font-semibold text-brand-600">{filamentTotal > 0 ? `${currSym}${filamentTotal.toFixed(2)}` : '—'}</span>
                    </div>
                  </div>
                )
              }

              let grandTotal = 0
              return (
                <div className="space-y-4">
                  {item.routings.map(routing => (
                    <div key={routing.id}>
                      {item.use_advanced_routing && (
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{routing.name || 'Routing'}</p>
                      )}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-700 text-xs text-gray-400">
                            <th className="text-left pb-1 font-medium">Production Steps</th>
                            <th className="text-right pb-1 font-medium">Plates/Item</th>
                            <th className="text-right pb-1 font-medium">Filament</th>
                            <th className="text-right pb-1 font-medium">Machine</th>
                            <th className="text-right pb-1 font-medium">Energy</th>
                            <th className="text-right pb-1 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                          {routing.steps.map((step, stepIdx) => {
                            const printerType = printerTypes.find(pt => pt.id === step.printer_type_id)
                            const hourlyRate = printerType?.hourly_rate ?? globalHourlyRate
                            const platesPerItem = Math.ceil(step.parts_per_item / step.quantity_on_plate)
                            const machineCost = step.estimated_print_time != null
                              ? (step.estimated_print_time / 3600) * hourlyRate * platesPerItem
                              : null
                            const powerWatts = printerType?.power_watts ?? 150
                            const energyCost = step.estimated_print_time != null
                              ? (powerWatts / 1000) * (step.estimated_print_time / 3600) * electricityRate * platesPerItem
                              : null
                            const filamentCost = step.filaments.reduce((acc, f) => {
                              const spec = f.filament_spec
                              const cpg = spec.price != null && spec.weight != null && spec.weight > 0 ? spec.price / spec.weight : null
                              return acc + (cpg != null ? f.grams * cpg * platesPerItem : 0)
                            }, 0)
                            const stepTotal = (machineCost ?? 0) + (energyCost ?? 0) + filamentCost
                            grandTotal += stepTotal
                            return (
                              <tr key={step.id}>
                                <td className="py-1.5 pr-2">
                                  <span className="font-medium"><span className="text-gray-400 mr-1">{stepIdx + 1}.</span>{step.description || `Step ${step.sort_order + 1}`}</span>
                                  {printerType && <span className="text-xs text-gray-400 ml-1.5">({printerType.name}{printerType.hourly_rate != null ? ` · ${currSym}${printerType.hourly_rate}/hr` : ''})</span>}
                                </td>
                                <td className="text-right py-1.5 text-gray-500">{platesPerItem}×</td>
                                <td className="text-right py-1.5">{filamentCost > 0 ? `${currSym}${filamentCost.toFixed(2)}` : <span className="text-gray-400">—</span>}</td>
                                <td className="text-right py-1.5">{machineCost != null ? `${currSym}${machineCost.toFixed(2)}` : <span className="text-gray-400">—</span>}</td>
                                <td className="text-right py-1.5">{energyCost != null ? `${currSym}${energyCost.toFixed(2)}` : <span className="text-gray-400">—</span>}</td>
                                <td className="text-right py-1.5 font-semibold">{stepTotal > 0 ? `${currSym}${stepTotal.toFixed(2)}` : <span className="text-gray-400">—</span>}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {/* Post Processing */}
                  <div className="border-t dark:border-gray-700 pt-3 space-y-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Post Processing</p>
                    {item.post_processing_costs.map(pp => (
                      <div key={pp.id} className="flex items-center gap-2 group">
                        {ppEditId === pp.id ? (
                          <>
                            <input className="flex-1 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600" value={ppEditLabel} onChange={e => setPpEditLabel(e.target.value)} autoFocus />
                            <input className="w-24 border rounded px-2 py-1 text-sm text-right font-mono dark:bg-gray-700 dark:border-gray-600" value={ppEditCost} onChange={e => setPpEditCost(e.target.value)} placeholder="0.00" />
                            <button onClick={() => ppUpdateMutation.mutate(pp.id)} disabled={!ppEditLabel.trim() || ppUpdateMutation.isPending} className="text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={14} /></button>
                            <button onClick={() => setPpEditId(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm">{pp.label}</span>
                            <span className="text-sm font-mono">{currSym}{pp.cost_per_item.toFixed(2)}</span>
                            <button onClick={() => { setPpEditId(pp.id); setPpEditLabel(pp.label); setPpEditCost(String(pp.cost_per_item)) }} className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100"><Pencil size={12} /></button>
                            <button onClick={() => ppDeleteMutation.mutate(pp.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                          </>
                        )}
                      </div>
                    ))}
                    {/* Add row */}
                    <div className="flex items-center gap-2 pt-1">
                      <input className="flex-1 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600" placeholder="Add Post Processing Item" value={ppNewLabel} onChange={e => setPpNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && ppNewLabel.trim() && ppCreateMutation.mutate()} />
                      <input className="w-24 border rounded px-2 py-1 text-sm text-right font-mono dark:bg-gray-700 dark:border-gray-600" placeholder={`${currSym}/item`} value={ppNewCost} onChange={e => setPpNewCost(e.target.value)} onKeyDown={e => e.key === 'Enter' && ppNewLabel.trim() && ppCreateMutation.mutate()} />
                      <button onClick={() => ppCreateMutation.mutate()} disabled={!ppNewLabel.trim() || ppCreateMutation.isPending} className="text-green-600 hover:text-green-700 disabled:opacity-40"><Plus size={14} /></button>
                    </div>
                  </div>

                  {(() => {
                    const totalCost = grandTotal + item.post_processing_costs.reduce((s, p) => s + p.cost_per_item, 0)
                    const msrp = totalCost * globalMarkup
                    return (
                      <>
                        <div className="border-t dark:border-gray-700 pt-3 flex justify-between items-center">
                          <span className="font-semibold">Total Cost per Item</span>
                          <span className="font-bold text-lg text-brand-600">{currSym}{totalCost.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2 border-b dark:border-gray-700">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Markup multiplier <span className="font-mono text-gray-700 dark:text-gray-300">{globalMarkup.toFixed(2)}×</span>
                            <Link to="/settings/general" className="ml-2 text-xs text-brand-500 hover:text-brand-700">edit in settings</Link>
                          </span>
                          <span className="text-xs text-gray-400">{totalCost > 0 ? `${currSym}${totalCost.toFixed(2)} × ${globalMarkup.toFixed(2)}` : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="font-semibold text-green-700 dark:text-green-400">Suggested MSRP</span>
                          <span className="font-bold text-2xl text-green-600 dark:text-green-400">{currSym}{msrp.toFixed(2)}</span>
                        </div>
                      </>
                    )
                  })()}
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2.5 space-y-2.5">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400">How this was calculated</p>
                    <p className="text-xs text-green-800 dark:text-green-300 leading-relaxed">
                      Each production step contributes three costs: <span className="font-medium">filament</span> (grams used × cost per gram, derived from spool price and weight),{' '}
                      <span className="font-medium">machine time</span> (print hours × hourly rate), and{' '}
                      <span className="font-medium">energy</span> (print hours × printer wattage × electricity rate).
                      The <em>Plates/Item</em> column shows how many print runs are needed — if a plate holds 2 parts but 3 are required per item, that's 2 plates — and all costs scale accordingly.
                    </p>
                    {item.post_processing_costs.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Post Processing</p>
                        <p className="text-xs text-green-800 dark:text-green-300 mb-1.5 leading-relaxed">
                          These are fixed costs added per finished item to account for manual work done after printing, such as sanding, painting, or assembly. Each entry is a flat {currSym}/item amount that is always included regardless of print settings.
                        </p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-green-200 dark:border-green-700 text-green-600 dark:text-green-500">
                              <th className="text-left pb-1 font-medium">Item</th>
                              <th className="text-right pb-1 font-medium">Cost/Item</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.post_processing_costs.map(pp => (
                              <tr key={pp.id} className="border-b border-green-100 dark:border-green-800/50 last:border-0">
                                <td className="py-1 text-green-800 dark:text-green-300">{pp.label}</td>
                                <td className="py-1 text-right font-mono text-green-800 dark:text-green-300">{currSym}{pp.cost_per_item.toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr>
                              <td className="pt-1.5 font-semibold text-green-700 dark:text-green-400">Total post processing</td>
                              <td className="pt-1.5 text-right font-mono font-semibold text-green-700 dark:text-green-400">{currSym}{item.post_processing_costs.reduce((s, p) => s + p.cost_per_item, 0).toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-xs text-green-600 dark:text-green-500">
                      Using: {currSym}{globalHourlyRate.toFixed(2)}/hr machine rate · {currSym}{electricityRate.toFixed(4)}/kWh electricity · 150 W default power
                      {printerTypes.some(pt => pt.hourly_rate != null || pt.power_watts != null) ? ' · some printer types use custom values' : ''}
                    </p>
                  </div>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}

      {/* Bill of Materials Modal */}
      {showBomModal && (
        <Modal title="Bill of Materials" onClose={() => setShowBomModal(false)}>
          <div className="space-y-4">
            {(() => {
              const allSteps = item.routings.flatMap(r => r.steps)
              if (allSteps.length === 0) {
                if (item.filament_requirements.length === 0) {
                  return <p className="text-sm text-gray-400 italic">No filament requirements defined.</p>
                }
                let totalCost = 0
                return (
                  <div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b dark:border-gray-700 text-xs text-gray-400">
                          <th className="text-left pb-1 font-medium">Filament</th>
                          <th className="text-right pb-1 font-medium">Grams</th>
                          <th className="text-right pb-1 font-medium">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        {item.filament_requirements.map(req => {
                          const spec = req.filament_spec
                          const cpg = spec.price != null && spec.weight != null && spec.weight > 0 ? spec.price / spec.weight : null
                          const cost = cpg != null ? req.grams * cpg : null
                          if (cost != null) totalCost += cost
                          return (
                            <tr key={req.id}>
                              <td className="py-1.5">
                                <div className="flex items-center gap-2">
                                  <SpoolIcon color={spec.color_hex ?? '#888888'} size={16} />
                                  <span>{spec.brand ? `${spec.brand} ` : ''}{spec.material} {spec.color_name}</span>
                                </div>
                              </td>
                              <td className="text-right py-1.5">{req.grams}g</td>
                              <td className="text-right py-1.5">{cost != null ? `${currSym}${cost.toFixed(2)}` : <span className="text-gray-400">—</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {totalCost > 0 && (
                      <div className="border-t dark:border-gray-700 pt-3 flex justify-between mt-2">
                        <span className="font-semibold text-sm">Total filament cost</span>
                        <span className="font-bold text-brand-600">{currSym}{totalCost.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )
              }

              const bomMap = new Map<number, { spec: FilamentSpec; totalGrams: number }>()
              for (const step of allSteps) {
                const platesPerItem = Math.ceil(step.parts_per_item / step.quantity_on_plate)
                for (const f of step.filaments) {
                  const existing = bomMap.get(f.filament_spec_id)
                  if (existing) {
                    existing.totalGrams += f.grams * platesPerItem
                  } else {
                    bomMap.set(f.filament_spec_id, { spec: f.filament_spec, totalGrams: f.grams * platesPerItem })
                  }
                }
              }

              if (bomMap.size === 0) {
                return <p className="text-sm text-gray-400 italic">No filament usage defined in production steps.</p>
              }

              let totalCost = 0
              const entries = Array.from(bomMap.values())
              return (
                <div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-xs text-gray-400">
                        <th className="text-left pb-1 font-medium">Filament</th>
                        <th className="text-right pb-1 font-medium">Grams</th>
                        <th className="text-right pb-1 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {entries.map(({ spec, totalGrams }) => {
                        const cpg = spec.price != null && spec.weight != null && spec.weight > 0 ? spec.price / spec.weight : null
                        const cost = cpg != null ? totalGrams * cpg : null
                        if (cost != null) totalCost += cost
                        return (
                          <tr key={spec.id}>
                            <td className="py-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: spec.color_hex }} />
                                <span>{spec.brand ? `${spec.brand} ` : ''}{spec.material} {spec.color_name}</span>
                              </div>
                            </td>
                            <td className="text-right py-1.5">{totalGrams.toFixed(1)}g</td>
                            <td className="text-right py-1.5">{cost != null ? `${currSym}${cost.toFixed(2)}` : <span className="text-gray-400">—</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {totalCost > 0 && (
                    <div className="border-t dark:border-gray-700 pt-3 flex justify-between mt-2">
                      <span className="font-semibold text-sm">Total filament cost</span>
                      <span className="font-bold text-brand-600">{currSym}{totalCost.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </Modal>
      )}
    </div>
  )
}

function TagManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: getTags })
  const [form, setForm] = useState({ name: '', color_hex: TAG_COLORS[0] })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ name: '', color_hex: '' })

  const createMutation = useMutation({
    mutationFn: () => createTag(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); qc.invalidateQueries({ queryKey: ['items'] }); setForm({ name: '', color_hex: TAG_COLORS[0] }) },
  })
  const updateMutation = useMutation({
    mutationFn: () => updateTag(editingId!, editForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); qc.invalidateQueries({ queryKey: ['items'] }); setEditingId(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); qc.invalidateQueries({ queryKey: ['items'] }) },
  })

  return (
    <Modal title="Manage Tags" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-2">
          {tags.length === 0 && <p className="text-sm text-gray-400 italic">No tags yet.</p>}
          {tags.map(tag => (
            <div key={tag.id} className="flex items-center gap-2">
              {editingId === tag.id ? (
                <>
                  <div className="grid grid-cols-10 gap-1">
                    {TAG_COLORS.map(c => (
                      <button key={c} onClick={() => setEditForm(f => ({ ...f, color_hex: c }))}
                        className={`w-6 h-6 rounded-full border-2 ${editForm.color_hex === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-110'} transition-transform`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <input className="flex-1 border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"
                    value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') updateMutation.mutate(); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus />
                  <button onClick={() => updateMutation.mutate()} disabled={!editForm.name} className="text-green-500 hover:text-green-600 disabled:opacity-40"><Check size={14} /></button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </>
              ) : (
                <>
                  <TagPill tag={tag} />
                  <button onClick={() => { setEditingId(tag.id); setEditForm({ name: tag.name, color_hex: tag.color_hex }) }}
                    className="text-gray-400 hover:text-brand-600 ml-auto"><Pencil size={12} /></button>
                  <button onClick={() => { if (confirm(`Delete tag "${tag.name}"?`)) deleteMutation.mutate(tag.id) }}
                    className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t dark:border-gray-700 pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">New tag</p>
          <div className="grid grid-cols-10 gap-1">
            {TAG_COLORS.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color_hex: c }))}
                className={`w-6 h-6 rounded-full border-2 ${form.color_hex === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-110'} transition-transform`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex gap-2">
            <input className="flex-1 border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
              placeholder="Tag name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && form.name) createMutation.mutate() }}
            />
            <button disabled={!form.name || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="bg-brand-600 text-white px-3 py-1.5 text-sm rounded-lg disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function Items() {
  const qc = useQueryClient()
  const { data: items = [] } = useQuery({ queryKey: ['items'], queryFn: getItems })
  const { data: filaments = [] } = useQuery({ queryKey: ['filaments'], queryFn: getFilaments })
  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: getTags })
  const { data: printerTypes = [] } = useQuery({ queryKey: ['printer-types'], queryFn: getPrinterTypes })
  const { data: printers = [] } = useQuery({ queryKey: ['printers'], queryFn: getPrinters })
  const { data: printingOrders = [] } = useQuery({ queryKey: ['orders', 'printing'], queryFn: () => getOrders('printing'), refetchInterval: 30_000 })
  const printingItemIds = useMemo(() => new Set(printingOrders.map(o => o.item_id)), [printingOrders])

  const [searchParams, setSearchParams] = useSearchParams()
  const [expanded, setExpanded] = useState<number | null>(() => {
    const id = Number(searchParams.get('open'))
    return id || null
  })
  const [showForm, setShowForm] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)
  const [filterTagIds, setFilterTagIds] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'recent'>('recent')
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState({ name: '', sku: '', description: '', notes: '', stl_source_url: '' })
  const [gcodeRenamePrompt, setGcodeRenamePrompt] = useState<{ oldName: string; newName: string } | null>(null)

  useEffect(() => {
    const id = Number(searchParams.get('open'))
    if (!id || !items.length) return
    setExpanded(id)
    setTimeout(() => {
      document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    setSearchParams({}, { replace: true })
  }, [items])

  function toggleFilterTag(id: number) {
    setFilterTagIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visibleItems = items
    .filter(m => {
      const matchTag = filterTagIds.size === 0 || [...filterTagIds].every(tid => m.tags.some(t => t.id === tid))
      const q = search.trim().toLowerCase()
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q)
      return matchTag && matchSearch
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name)
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name)
      if (sortBy === 'recent') {
        const pa = printingItemIds.has(a.id) ? 0 : 1
        const pb = printingItemIds.has(b.id) ? 0 : 1
        if (pa !== pb) return pa - pb
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return 0
    })

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? updateItem(editing.id, { ...form, use_advanced_routing: editing.use_advanced_routing })
      : createItem(form),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      const wasRename = editing && form.name !== editing.name
      const oldName = editing?.name
      const newName = form.name
      closeForm()
      if (wasRename && oldName) {
        const { folders } = await checkGcodeItemFolders(oldName)
        if (folders.length > 0) {
          setGcodeRenamePrompt({ oldName, newName })
        }
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  function openCreate() {
    setEditing(null)
    setForm({ name: '', sku: '', description: '', notes: '', stl_source_url: '' })
    setShowForm(true)
  }

  function openEdit(item: Item) {
    setEditing(item)
    setForm({ name: item.name, sku: item.sku, description: item.description, notes: item.notes, stl_source_url: item.stl_source_url })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null); setForm({ name: '', sku: '', description: '', notes: '', stl_source_url: '' }) }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3"><Box size={26} className="text-brand-600" />Items</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTagManager(true)}
            className="flex items-center gap-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm px-3 py-2 rounded-lg"
          >
            <TagIcon size={14} /> Tags
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={15} /> Add Item
          </button>
        </div>
      </div>

      {/* Search + sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 w-64"
          placeholder="Search name or SKU…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
        >
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
          <option value="recent">Recently added</option>
        </select>
        <span className="text-xs text-gray-400">{visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400">Filter:</span>
          {allTags.map(tag => (
            <button
              key={tag.id}
              onClick={() => toggleFilterTag(tag.id)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border-2 transition-all ${
                filterTagIds.has(tag.id)
                  ? 'text-white border-transparent'
                  : 'bg-transparent border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300'
              }`}
              style={filterTagIds.has(tag.id) ? { backgroundColor: tag.color_hex, borderColor: tag.color_hex } : {}}
            >
              {tag.name}
            </button>
          ))}
          {filterTagIds.size > 0 && (
            <button onClick={() => setFilterTagIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          )}
        </div>
      )}

      {visibleItems.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          {items.length === 0 ? 'No items yet. Add your first item.' : 'No items match your filters.'}
        </p>
      )}

      <div className="space-y-2">
        {visibleItems.map(item => {
          const isOpen = expanded === item.id
          const firstImage = item.images[0]
          return (
            <div key={item.id} id={`item-${item.id}`} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30"
                onClick={() => {
                  const next = isOpen ? null : item.id
                  setExpanded(next)
                  if (next !== null) {
                    setTimeout(() => {
                      const el = document.getElementById(`item-${next}`)
                      const main = el?.closest('main') as HTMLElement | null
                      if (el && main) {
                        const top = main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top - 24
                        smoothScrollTo(main, top)
                      }
                    }, 50)
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                  {firstImage ? (
                    <img
                      src={`/api/items/${item.id}/images/${firstImage.id}?v=${new Date(firstImage.created_at).getTime()}`}
                      alt=""
                      className="w-8 h-8 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0" />
                  )}
                  <span className="font-medium">{item.name}</span>
                  {item.tags.map(tag => (
                    <TagPill key={tag.id} tag={tag} onRemove={() => removeTagFromItem(tag.id, item.id).then(() => qc.invalidateQueries({ queryKey: ['items'] }))} />
                  ))}
                  {expanded === item.id && allTags.filter(t => !item.tags.some(it => it.id === t.id)).length > 0 && (
                    <select
                      className="text-xs border rounded-full px-2 py-0.5 text-gray-500 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-600 cursor-pointer"
                      value=""
                      onClick={e => e.stopPropagation()}
                      onChange={e => { if (e.target.value) addTagToItem(Number(e.target.value), item.id).then(() => qc.invalidateQueries({ queryKey: ['items'] })) }}
                    >
                      <option value="">+ Add tag</option>
                      {allTags.filter(t => !item.tags.some(it => it.id === t.id)).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {item.stl_source_url && (
                    <a href={item.stl_source_url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-brand-500 hover:text-brand-700 hover:underline">
                      STL Source
                    </a>
                  )}
                  <span className="text-xs text-gray-400">{item.filament_requirements.length} filament{item.filament_requirements.length !== 1 ? 's' : ''}</span>
                  <button onClick={e => { e.stopPropagation(); openEdit(item) }} className="text-xs text-brand-600 hover:underline px-2">Edit</button>
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm('Delete this item?')) deleteMutation.mutate(item.id) }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {isOpen && <ItemDetail item={item} filaments={filaments} allTags={allTags} printerTypes={printerTypes} printers={printers} />}
            </div>
          )
        })}
      </div>

      {showTagManager && <TagManager onClose={() => setShowTagManager(false)} />}

      {gcodeRenamePrompt && (
        <ConfirmModal
          title="Rename G-Code Folders"
          message={`Rename G-Code folders from "${gcodeRenamePrompt.oldName}" to "${gcodeRenamePrompt.newName}"?`}
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={async () => {
            await renameGcodeItemFolders(gcodeRenamePrompt.oldName, gcodeRenamePrompt.newName)
            setGcodeRenamePrompt(null)
          }}
          onCancel={() => setGcodeRenamePrompt(null)}
        />
      )}

      {showForm && (
        <Modal title={editing ? 'Edit Item' : 'New Item'} onClose={closeForm}>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Name *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="w-28">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">SKU</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                  value={form.sku}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Description</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 resize-none overflow-hidden"
                rows={4}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">STL Source URL</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                placeholder="https://"
                value={form.stl_source_url}
                onChange={e => setForm(f => ({ ...f, stl_source_url: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancel</button>
              <button
                disabled={!form.name || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
