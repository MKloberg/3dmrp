import { useEffect, useRef, useState } from 'react'
import { Canvas, FabricText, Rect, type FabricObject } from 'fabric'
import clsx from 'clsx'
import type {
  LabelField, LabelElement, LabelTemplate,
  TextElement, QrElement, SwatchElement, LabelDesignerProps,
} from './types'

const CANVAS_DISPLAY_WIDTH = 560
const PT_TO_MM = 0.3528  // 1pt = 0.3528mm

interface ElementPatch {
  fontSizePt?: number
  fontWeight?: 'normal' | 'bold'
  color?: string
  sizeMm?: number
  widthMm?: number
  heightMm?: number
}

function scale(widthMm: number) {
  return CANVAS_DISPLAY_WIDTH / widthMm
}

function makeFabricObj(el: LabelElement, s: number, fields: LabelField[]): FabricObject {
  const x = el.xMm * s
  const y = el.yMm * s

  if (el.type === 'text') {
    const label = fields.find(f => f.key === el.fieldKey)?.label ?? el.fieldKey
    return new FabricText(`{{ ${label} }}`, {
      left: x,
      top: y,
      fontSize: el.fontSizePt * PT_TO_MM * s,
      fontWeight: el.fontWeight,
      fill: el.color,
      selectable: true,
      hasControls: false,
    })
  }

  if (el.type === 'qr') {
    const size = el.sizeMm * s
    const bg = new Rect({
      left: x,
      top: y,
      width: size,
      height: size,
      fill: '#f9fafb',
      stroke: '#9ca3af',
      strokeWidth: 1,
      selectable: true,
      hasControls: false,
    })
    return bg
  }

  // swatch
  return new Rect({
    left: x,
    top: y,
    width: el.widthMm * s,
    height: el.heightMm * s,
    fill: '#3b82f6',
    rx: 2,
    ry: 2,
    selectable: true,
    hasControls: false,
  })
}

function defaultElement(field: LabelField, existingCount: number): LabelElement {
  const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const offset = existingCount * 2
  if (field.type === 'qr') {
    return { id, type: 'qr', fieldKey: field.key, xMm: 2 + offset, yMm: 2 + offset, sizeMm: 12 } as QrElement
  }
  if (field.type === 'swatch') {
    return { id, type: 'swatch', fieldKey: field.key, xMm: 2 + offset, yMm: 2 + offset, widthMm: 10, heightMm: 4 } as SwatchElement
  }
  return { id, type: 'text', fieldKey: field.key, xMm: 2 + offset, yMm: 2 + offset, fontSizePt: 8, fontWeight: 'normal', color: '#000000' } as TextElement
}

export function LabelDesigner({ widthMm, heightMm, fields, initialTemplate, onSave }: LabelDesignerProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const objMapRef = useRef<Map<string, FabricObject>>(new Map())
  const s = scale(widthMm)
  const canvasHeight = heightMm * s

  const [elements, setElements] = useState<LabelElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedEl = elements.find(e => e.id === selectedId)

  // Init canvas once on mount
  useEffect(() => {
    if (!canvasElRef.current) return

    const canvas = new Canvas(canvasElRef.current, {
      width: CANVAS_DISPLAY_WIDTH,
      height: canvasHeight,
      backgroundColor: '#ffffff',
    })
    fabricRef.current = canvas

    // Border
    const border = new Rect({
      left: 0, top: 0,
      width: CANVAS_DISPLAY_WIDTH - 1,
      height: canvasHeight - 1,
      fill: 'transparent',
      stroke: '#e5e7eb',
      strokeWidth: 1,
      selectable: false,
      evented: false,
    })
    canvas.add(border)

    canvas.on('selection:created', e => {
      const obj = e.selected?.[0]
      if (obj) setSelectedId((obj as any).elementId ?? null)
    })
    canvas.on('selection:updated', e => {
      const obj = e.selected?.[0]
      if (obj) setSelectedId((obj as any).elementId ?? null)
    })
    canvas.on('selection:cleared', () => setSelectedId(null))

    canvas.on('object:modified', e => {
      const obj = e.target
      if (!obj || !(obj as any).elementId) return
      const id = (obj as any).elementId as string
      const xMm = (obj.left ?? 0) / s
      const yMm = (obj.top ?? 0) / s
      setElements(prev => prev.map(el => el.id === id ? { ...el, xMm, yMm } : el))
    })

    // Load initial template
    if (initialTemplate) {
      try {
        const tmpl = JSON.parse(initialTemplate) as LabelTemplate
        setElements(tmpl.elements)
        for (const el of tmpl.elements) {
          const obj = makeFabricObj(el, s, fields)
          ;(obj as any).elementId = el.id
          canvas.add(obj)
          objMapRef.current.set(el.id, obj)
        }
        canvas.renderAll()
      } catch { /* ignore malformed template */ }
    }

    return () => {
      canvas.dispose()
      fabricRef.current = null
      objMapRef.current.clear()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — intentionally mount-only

  function addElement(field: LabelField) {
    const canvas = fabricRef.current
    if (!canvas) return
    const el = defaultElement(field, elements.length)
    const obj = makeFabricObj(el, s, fields)
    ;(obj as any).elementId = el.id
    canvas.add(obj)
    canvas.setActiveObject(obj)
    canvas.renderAll()
    objMapRef.current.set(el.id, obj)
    setElements(prev => [...prev, el])
    setSelectedId(el.id)
  }

  function deleteSelected() {
    const canvas = fabricRef.current
    if (!canvas || !selectedId) return
    const obj = objMapRef.current.get(selectedId)
    if (obj) canvas.remove(obj)
    objMapRef.current.delete(selectedId)
    setElements(prev => prev.filter(e => e.id !== selectedId))
    setSelectedId(null)
    canvas.renderAll()
  }

  function updateSelected(patch: ElementPatch) {
    const canvas = fabricRef.current
    if (!canvas || !selectedId || !selectedEl) return

    // Spread into union element — cast required because TypeScript can't narrow discriminated union spreads
    setElements(prev => prev.map(e =>
      e.id === selectedId ? ({ ...e, ...(patch as Record<string, unknown>) } as LabelElement) : e
    ))

    const obj = objMapRef.current.get(selectedId)
    if (!obj) return

    if (selectedEl.type === 'text') {
      const t = selectedEl as TextElement
      ;(obj as FabricText).set({
        fontSize: (patch.fontSizePt ?? t.fontSizePt) * PT_TO_MM * s,
        fontWeight: patch.fontWeight ?? t.fontWeight,
        fill: patch.color ?? t.color,
      })
    } else if (selectedEl.type === 'qr' && patch.sizeMm !== undefined) {
      const size = patch.sizeMm * s
      ;(obj as Rect).set({ width: size, height: size })
    } else if (selectedEl.type === 'swatch') {
      const sw = selectedEl as SwatchElement
      ;(obj as Rect).set({
        width: (patch.widthMm ?? sw.widthMm) * s,
        height: (patch.heightMm ?? sw.heightMm) * s,
      })
    }

    canvas.renderAll()
  }

  function handleSave() {
    const template: LabelTemplate = {
      version: '1',
      widthMm,
      heightMm,
      elements,
    }
    onSave?.(JSON.stringify(template))
  }

  const fieldLabel = (key: string) => fields.find(f => f.key === key)?.label ?? key

  return (
    <div className="flex gap-5">
      {/* Palette */}
      <div className="w-36 shrink-0 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1 mb-2">
          Elements
        </p>
        {fields.map(f => (
          <button
            key={f.key}
            onClick={() => addElement(f)}
            className="w-full text-left px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-brand-50 dark:hover:bg-gray-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors text-gray-700 dark:text-gray-300"
          >
            + {f.label}
          </button>
        ))}
        <p className="text-xs text-gray-400 dark:text-gray-500 px-1 pt-2 leading-snug">
          Click to add. Drag to reposition.
        </p>
      </div>

      {/* Canvas + properties */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Canvas */}
        <div className="overflow-x-auto">
          <div
            className="rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 inline-block"
            style={{ background: '#f9fafb' }}
          >
            <canvas ref={canvasElRef} />
          </div>
        </div>

        {/* Canvas info */}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {widthMm} × {heightMm} mm canvas
          {selectedEl && <span className="ml-2 text-brand-500">· {fieldLabel(selectedEl.fieldKey)} selected</span>}
        </p>

        {/* Properties panel */}
        {selectedEl && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-wrap">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 shrink-0">
              {fieldLabel(selectedEl.fieldKey)}
            </span>

            {selectedEl.type === 'text' && (
              <>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Size</label>
                  <input
                    type="number" min="4" max="72" step="1"
                    value={(selectedEl as TextElement).fontSizePt}
                    onChange={e => updateSelected({ fontSizePt: Number(e.target.value) })}
                    className="w-14 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs dark:bg-gray-900 dark:text-gray-200"
                  />
                  <span className="text-xs text-gray-400">pt</span>
                </div>
                <button
                  onClick={() => updateSelected({ fontWeight: (selectedEl as TextElement).fontWeight === 'bold' ? 'normal' : 'bold' })}
                  className={clsx(
                    'px-2.5 py-1 text-xs rounded border font-bold transition-colors',
                    (selectedEl as TextElement).fontWeight === 'bold'
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                  )}
                >
                  B
                </button>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Color</label>
                  <input
                    type="color"
                    value={(selectedEl as TextElement).color}
                    onChange={e => updateSelected({ color: e.target.value })}
                    className="w-8 h-7 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                  />
                </div>
              </>
            )}

            {selectedEl.type === 'qr' && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Size</label>
                <input
                  type="number" min="5" max="50" step="1"
                  value={(selectedEl as QrElement).sizeMm}
                  onChange={e => updateSelected({ sizeMm: Number(e.target.value) })}
                  className="w-14 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs dark:bg-gray-900 dark:text-gray-200"
                />
                <span className="text-xs text-gray-400">mm</span>
              </div>
            )}

            {selectedEl.type === 'swatch' && (
              <>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">W</label>
                  <input
                    type="number" min="2" max="60" step="0.5"
                    value={(selectedEl as SwatchElement).widthMm}
                    onChange={e => updateSelected({ widthMm: Number(e.target.value) })}
                    className="w-14 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs dark:bg-gray-900 dark:text-gray-200"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">H</label>
                  <input
                    type="number" min="1" max="30" step="0.5"
                    value={(selectedEl as SwatchElement).heightMm}
                    onChange={e => updateSelected({ heightMm: Number(e.target.value) })}
                    className="w-14 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs dark:bg-gray-900 dark:text-gray-200"
                  />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={deleteSelected}
                className="text-xs text-red-500 hover:text-red-600 border border-red-200 dark:border-red-800 hover:border-red-400 px-2.5 py-1 rounded transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {elements.length === 0 ? 'No elements yet.' : `${elements.length} element${elements.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={handleSave}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg transition-colors"
          >
            Save Template
          </button>
        </div>
      </div>
    </div>
  )
}
