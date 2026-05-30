import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getSpoolmanStock, SpoolmanSpool } from '../../api/client'
import { ArrowLeft, WifiOff, LayoutList, Layers, MapPin } from 'lucide-react'
import { SpoolIcon } from '../../components/SpoolIcon'

interface FilamentGroup {
  filament: SpoolmanSpool['filament']
  spools: SpoolmanSpool[]
  totalRemaining: number
}

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

function weightLabel(g: number | null | undefined): string {
  if (g == null) return '—'
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}


function SpoolRow({ spool }: { spool: SpoolmanSpool }) {
  const pct = spool.filament.weight && spool.remaining_weight != null
    ? Math.min(100, (spool.remaining_weight / spool.filament.weight) * 100)
    : null

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700 last:border-0">
      {/* Spool icon with filament color */}
      <SpoolIcon
        color={normalizeHex(spool.filament.multi_color_hexes ? spool.filament.multi_color_hexes.split(';')[0] : spool.filament.color_hex)}
        size={35}
      />

      {/* Filament info */}
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
          {spool.extra?.card_uid && (
            <span className="text-xs text-gray-400">NFC: {spool.extra.card_uid}</span>
          )}
          {spool.comment && (
            <span className="text-xs text-gray-400 italic truncate max-w-40">{spool.comment}</span>
          )}
        </div>
      </div>

      {/* Progress + weight */}
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
        {pct !== null && (
          <span className="text-xs text-gray-400">{Math.round(pct)}%</span>
        )}
      </div>
    </div>
  )
}

export default function FilamentInventory() {
  const navigate = useNavigate()
  const [view, setView] = useState<'grouped' | 'spools'>('grouped')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['spoolman-stock'],
    queryFn: getSpoolmanStock,
    refetchInterval: 60_000,
  })

  const activeSpools = (data?.spools ?? []).filter(s => !s.archived)

  // Grouped view data
  const groups = Object.values(
    activeSpools.reduce<Record<number, FilamentGroup>>((acc, spool) => {
      const fid = spool.filament.id
      if (!acc[fid]) acc[fid] = { filament: spool.filament, spools: [], totalRemaining: 0 }
      acc[fid].spools.push(spool)
      acc[fid].totalRemaining += spool.remaining_weight ?? 0
      return acc
    }, {})
  ).sort((a, b) => {
    const mc = (a.filament.material ?? '').localeCompare(b.filament.material ?? '')
    return mc !== 0 ? mc : (a.filament.name ?? '').localeCompare(b.filament.name ?? '')
  })

  const byMaterial = groups.reduce<Record<string, FilamentGroup[]>>((acc, g) => {
    ;(acc[g.filament.material ?? ''] ??= []).push(g)
    return acc
  }, {})

  // Flat spool list data
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
      const mc = (a.filament.material ?? '').localeCompare(b.filament.material ?? '')
      return mc !== 0 ? mc : (a.filament.name ?? '').localeCompare(b.filament.name ?? '')
    })

  const totalSpools = activeSpools.length
  const totalWeight = activeSpools.reduce((sum, s) => sum + (s.remaining_weight ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/reports')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
          <SpoolIcon size={40} color="#9ca3af" />
          Filament Inventory
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
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-teal-600">{totalSpools}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active spools</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-blue-600">{(totalWeight / 1000).toFixed(2)} kg</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total remaining</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4">
              <p className="text-2xl font-bold text-indigo-600">{Object.keys(byMaterial).length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Materials</p>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('grouped')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === 'grouped'
                  ? 'bg-brand-600 text-white'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Layers size={14} /> By Material
            </button>
            <button
              onClick={() => setView('spools')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === 'spools'
                  ? 'bg-brand-600 text-white'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <LayoutList size={14} /> All Spools
            </button>
          </div>

          {/* Grouped view */}
          {view === 'grouped' && (
            <>
              {Object.entries(byMaterial).map(([material, matGroups]) => (
                <div key={material}>
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    {material}
                    <span className="font-normal normal-case ml-2 text-gray-400">
                      — {matGroups.reduce((s, g) => s + g.spools.length, 0)} spools ·{' '}
                      {(matGroups.reduce((s, g) => s + g.totalRemaining, 0) / 1000).toFixed(2)} kg
                    </span>
                  </h2>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y dark:divide-gray-700">
                    {matGroups.map(({ filament, spools, totalRemaining }) => {
                      const fullWeight = filament.weight ? filament.weight * spools.length : null
                      const pct = fullWeight ? Math.min(100, (totalRemaining / fullWeight) * 100) : null
                      return (
                        <div key={filament.id} className="flex items-center gap-4 px-4 py-3">
                          <SpoolIcon color={normalizeHex(filament.multi_color_hexes ? filament.multi_color_hexes.split(';')[0] : filament.color_hex)} size={28} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-medium text-sm">{filament.name}</span>
                              {filament.vendor?.name && (
                                <span className="text-xs text-gray-400">{filament.vendor.name}</span>
                              )}
                            </div>
                            {pct !== null && (
                              <div className="mt-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden w-48">
                                <div
                                  className={`h-full rounded-full ${pct < 20 ? 'bg-red-400' : pct < 50 ? 'bg-yellow-400' : 'bg-teal-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0 space-y-0.5">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                              {totalRemaining >= 1000
                                ? `${(totalRemaining / 1000).toFixed(2)} kg`
                                : `${Math.round(totalRemaining)} g`}
                            </p>
                            <p className="text-xs text-gray-400">{spools.length} spool{spools.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <p className="text-sm text-gray-400 italic">No active spools found in Spoolman.</p>
              )}
            </>
          )}

          {/* All spools flat view */}
          {view === 'spools' && (
            <div className="space-y-3">
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                placeholder="Filter by name, material, vendor, location, lot…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                {filteredSpools.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-400 italic">No spools match your filter.</p>
                ) : (
                  filteredSpools.map(spool => <SpoolRow key={spool.id} spool={spool} />)
                )}
              </div>
              <p className="text-xs text-gray-400 text-right">{filteredSpools.length} of {totalSpools} spools</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
