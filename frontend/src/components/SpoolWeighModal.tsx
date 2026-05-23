import { useState } from 'react'
import { Scale } from 'lucide-react'
import { SpoolmanSpool, patchSpoolmanRemainingWeight } from '../api/client'
import { SpoolIcon } from './SpoolIcon'
import Modal from './Modal'

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

interface Props {
  spool: SpoolmanSpool
  onClose: () => void
  onSaved: () => void
}

export default function SpoolWeighModal({ spool, onClose, onSaved }: Props) {
  const [gross, setGross] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tare = spool.filament.spool_weight
  const grossNum = parseFloat(gross)
  const remaining = tare != null && gross !== '' && !isNaN(grossNum) ? grossNum - tare : null
  const belowTare = remaining !== null && remaining < 0
  const canSave = remaining !== null && !belowTare && !saving

  async function handleSave() {
    if (!canSave || remaining === null) return
    setSaving(true)
    setError(null)
    try {
      await patchSpoolmanRemainingWeight(spool.id, Math.round(remaining))
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update Spoolman')
      setSaving(false)
    }
  }

  const color = normalizeHex(
    spool.filament.multi_color_hexes
      ? spool.filament.multi_color_hexes.split(/[,;]/)[0]
      : spool.filament.color_hex
  )

  return (
    <Modal title={<span className="flex items-center gap-2"><Scale size={16} />Weigh Spool #{spool.id}</span>} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
          <SpoolIcon color={color} size={32} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {spool.filament.name || '—'}
            </p>
            {spool.filament.vendor?.name && (
              <p className="text-xs text-gray-400">{spool.filament.vendor.name}</p>
            )}
          </div>
        </div>

        {tare == null ? (
          <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
            Spool tare weight is not set on this filament type in Spoolman. Set it there first, then try again.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Empty spool weight (tare)</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{tare} g</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Gross weight (spool + filament)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  autoFocus
                  className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={`e.g. ${tare + 500}`}
                  value={gross}
                  onChange={e => { setGross(e.target.value); setError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <span className="text-sm text-gray-400 shrink-0">g</span>
              </div>
              {belowTare && (
                <p className="text-xs text-red-500">
                  Gross weight must be greater than the tare ({tare} g).
                </p>
              )}
            </div>

            {remaining !== null && !belowTare && (
              <div className="flex items-center justify-between text-sm border-t dark:border-gray-700 pt-4">
                <span className="text-gray-500 dark:text-gray-400">Remaining filament</span>
                <span className="text-xl font-bold text-brand-600 dark:text-brand-400">
                  {Math.round(remaining)} g
                </span>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
          </>
        )}

        <div className="flex items-center gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
          {tare != null && (
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
