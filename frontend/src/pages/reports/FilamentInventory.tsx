import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getSpoolmanStock, SpoolmanSpool } from '../../api/client'
import { ArrowLeft, WifiOff } from 'lucide-react'

interface FilamentGroup {
  filament: SpoolmanSpool['filament']
  spools: SpoolmanSpool[]
  totalRemaining: number
}

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

export default function FilamentInventory() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['spoolman-stock'],
    queryFn: getSpoolmanStock,
    refetchInterval: 60_000,
  })

  const activeSpools = (data?.spools ?? []).filter(s => !s.archived)

  const groups = Object.values(
    activeSpools.reduce<Record<number, FilamentGroup>>((acc, spool) => {
      const fid = spool.filament.id
      if (!acc[fid]) acc[fid] = { filament: spool.filament, spools: [], totalRemaining: 0 }
      acc[fid].spools.push(spool)
      acc[fid].totalRemaining += spool.remaining_weight ?? 0
      return acc
    }, {})
  ).sort((a, b) => {
    const mc = a.filament.material.localeCompare(b.filament.material)
    return mc !== 0 ? mc : a.filament.name.localeCompare(b.filament.name)
  })

  const byMaterial = groups.reduce<Record<string, FilamentGroup[]>>((acc, g) => {
    ;(acc[g.filament.material] ??= []).push(g)
    return acc
  }, {})

  const totalSpools = activeSpools.length
  const totalWeight = activeSpools.reduce((sum, s) => sum + (s.remaining_weight ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/reports')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Filament Inventory</h1>
          <p className="text-xs text-gray-400 mt-0.5">Live data from Spoolman · refreshes every 60s</p>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400 italic">Loading…</p>
      )}

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

          {/* Per-material tables */}
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
                      <div
                        className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"
                        style={{ backgroundColor: normalizeHex(filament.color_hex) }}
                      />
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
    </div>
  )
}
