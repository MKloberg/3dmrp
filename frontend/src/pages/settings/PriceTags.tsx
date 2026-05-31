import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Tag } from 'lucide-react'
import { getSettings, setSetting } from '../../api/client'
import { LabelDesigner } from '../../components/label-designer'
import type { LabelField } from '../../components/label-designer'

const FIELDS: LabelField[] = [
  { key: 'name',       label: 'Item Name',   type: 'text' },
  { key: 'msrp',       label: 'MSRP',        type: 'text' },
  { key: 'category',   label: 'Category',    type: 'text' },
  { key: 'qr_url',     label: 'QR Code',     type: 'qr' },
  { key: 'swatch',     label: 'Color Swatch', type: 'swatch' },
]

function DimInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-600 dark:text-gray-400 w-16 shrink-0">{label}</label>
      <input
        type="number" min="10" max="300" step="0.5"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 10)}
        className="w-20 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-200"
      />
      <span className="text-sm text-gray-400">mm</span>
    </div>
  )
}

export default function PriceTags() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 60_000 })

  const savedTemplate = settings?.price_tag_template as string | undefined
  const savedWidth  = parseFloat((settings?.price_tag_width_mm  as string | undefined) ?? '54')
  const savedHeight = parseFloat((settings?.price_tag_height_mm as string | undefined) ?? '18')

  const [widthMm,  setWidthMm]  = useState<number | null>(null)
  const [heightMm, setHeightMm] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

  const effectiveWidth  = widthMm  ?? savedWidth
  const effectiveHeight = heightMm ?? savedHeight

  const saveMutation = useMutation({
    mutationFn: async (templateJson: string) => {
      await Promise.all([
        setSetting('price_tag_template',  templateJson),
        setSetting('price_tag_width_mm',  String(effectiveWidth)),
        setSetting('price_tag_height_mm', String(effectiveHeight)),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <Link to="/settings" className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-600 mb-3">
          <ChevronLeft size={14} /> Settings
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Tag size={22} className="text-brand-600" /> Price Tag Designer
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Design the layout of price tags printed from the Items page.
          Tags are printed at the exact mm dimensions via your browser's print dialog.
        </p>
      </div>

      {/* Dimensions */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Tag Size</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Set the physical dimensions of your label. For the IDRP SP320 cut in thirds: 54 × 18 mm.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <DimInput label="Width"  value={effectiveWidth}  onChange={setWidthMm} />
          <DimInput label="Height" value={effectiveHeight} onChange={setHeightMm} />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Changing dimensions resets the canvas. Save the template after adjusting.
        </p>
      </section>

      {/* Designer */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Layout</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Click an element in the palette to add it, then drag to reposition. Select an element to edit its properties.
          </p>
        </div>

        <LabelDesigner
          key={`${effectiveWidth}x${effectiveHeight}`}
          widthMm={effectiveWidth}
          heightMm={effectiveHeight}
          fields={FIELDS}
          initialTemplate={savedTemplate}
          onSave={json => saveMutation.mutate(json)}
        />

        {saved && (
          <p className="text-sm text-green-600 dark:text-green-400">Template saved.</p>
        )}
      </section>

      {/* Print link */}
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span>To print tags, go to</span>
        <Link to="/items" className="text-brand-600 hover:text-brand-700 font-medium">Items</Link>
        <span>and use the Print Price Tags action.</span>
      </div>
    </div>
  )
}
