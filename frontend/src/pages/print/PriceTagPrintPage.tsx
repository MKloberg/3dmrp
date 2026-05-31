import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getItems, getSettings } from '../../api/client'
import { LabelPrint } from '../../components/label-designer'
import type { LabelTemplate } from '../../components/label-designer'

function parseCurrency(settings: Record<string, string> | undefined, msrp: number | null): string {
  if (msrp === null) return ''
  const sym = settings?.currency === 'CAD' ? 'CA$'
    : settings?.currency === 'EUR' ? '€'
    : settings?.currency === 'GBP' ? '£'
    : '$'
  return `${sym}${msrp.toFixed(2)}`
}

export default function PriceTagPrintPage() {
  const [params] = useSearchParams()
  const rawIds = params.get('items') ?? ''
  const ids = rawIds.split(',').map(Number).filter(Boolean)

  const { data: allItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['items'],
    queryFn: getItems,
    staleTime: 30_000,
  })

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
  })

  if (itemsLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  const templateJson = settings?.price_tag_template as string | undefined
  const widthMm  = parseFloat((settings?.price_tag_width_mm  as string | undefined) ?? '54')
  const heightMm = parseFloat((settings?.price_tag_height_mm as string | undefined) ?? '18')

  if (!templateJson) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-gray-500 text-sm">
        <p>No price tag template configured.</p>
        <a href="/settings/price-tags" className="text-brand-600 underline">Go to Settings → Price Tags</a>
      </div>
    )
  }

  let template: LabelTemplate
  try {
    template = JSON.parse(templateJson) as LabelTemplate
    template.widthMm  = widthMm
    template.heightMm = heightMm
  } catch {
    return (
      <div className="flex items-center justify-center h-screen text-red-500 text-sm">
        Template is invalid. Please reconfigure in Settings → Price Tags.
      </div>
    )
  }

  const items = (allItems ?? []).filter(item => ids.includes(item.id))

  const printData = items.map(item => {
    const firstColor = item.filament_requirements[0]?.filament_spec?.color_hex ?? ''
    return {
      name:     item.name,
      msrp:     parseCurrency(settings as Record<string, string>, item.msrp),
      category: item.tags[0]?.name ?? item.sku ?? '',
      qr_url:   item.sku || `item-${item.id}`,
      swatch:   firstColor ? `#${firstColor.replace('#', '')}` : '#cccccc',
    }
  })

  return (
    <>
      {/* Print button — hidden in print media */}
      <div className="print:hidden fixed top-4 right-4 flex items-center gap-3 z-50">
        <span className="text-sm text-gray-500">{items.length} tag{items.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => window.print()}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm rounded-lg"
        >
          Print
        </button>
        <a href="/items" className="text-sm text-gray-400 hover:text-gray-600">← Back to Items</a>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            size: ${widthMm}mm ${heightMm}mm;
            margin: 0;
          }
          body { margin: 0; }
          .label-print-root { margin: 0; padding: 0; }
        }
        @media screen {
          body { background: #f3f4f6; }
          .label-card {
            margin: 20px auto;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          }
        }
      `}</style>

      <LabelPrint template={template} data={printData} />
    </>
  )
}
