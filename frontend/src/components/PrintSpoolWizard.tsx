import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  getMailsailSpoolman,
  getPrinterSpoolmanSlots,
  setPrinterSpoolmanSlots,
  getSpoolmanStock,
  deductSpoolman,
  getOrders,
  updateOrder,
  Printer,
  FilamentSpec,
  SpoolmanSpool,
} from '../api/client'
import Modal from './Modal'

type Step = 'init' | 'slots' | 'o-status'

function normalizeHex(hex: string | null | undefined): string {
  if (!hex) return '#888888'
  return hex.startsWith('#') ? hex : `#${hex}`
}

function weightLabel(g: number | null | undefined): string {
  if (g == null) return '—'
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}

function SpoolSelect({
  value,
  onChange,
  spools,
}: {
  value: number | null
  onChange: (id: number | null) => void
  spools: SpoolmanSpool[]
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      className="flex-1 border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
    >
      <option value="">— Not assigned —</option>
      {spools.map(s => {
        const pct = s.filament.weight && s.remaining_weight != null
          ? Math.min(100, Math.round((s.remaining_weight / s.filament.weight) * 100))
          : null
        return (
          <option key={s.id} value={s.id}>
            #{s.id} · {s.filament.vendor?.name ? `${s.filament.vendor.name} ` : ''}{s.filament.name}
            {' '}· {weightLabel(s.remaining_weight)}{pct != null ? ` (${pct}%)` : ''}
          </option>
        )
      })}
    </select>
  )
}

export default function PrintSpoolWizard({
  printer,
  itemId,
  stepFilaments,
  filamentWeights,
  onConfirm,
  onCancel,
}: {
  printer: Printer
  itemId: number
  stepFilaments: FilamentSpec[]
  filamentWeights: number[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<Step>('init')
  const [assignments, setAssignments] = useState<(number | null)[]>(stepFilaments.map(() => null))
  const [shouldDeduct, setShouldDeduct] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set())
  const [updatingOrders, setUpdatingOrders] = useState(false)

  const { data: spoolmanInfo } = useQuery({
    queryKey: ['mainsail-spoolman', printer.id],
    queryFn: () => getMailsailSpoolman(printer.id),
  })

  const { data: slotsData } = useQuery({
    queryKey: ['printer-spoolman-slots', printer.id, stepFilaments.length],
    queryFn: () => getPrinterSpoolmanSlots(printer.id, stepFilaments.length),
    enabled: spoolmanInfo?.configured === true,
  })

  const { data: stockData } = useQuery({
    queryKey: ['spoolman-stock'],
    queryFn: getSpoolmanStock,
  })

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['orders', 'pending'],
    queryFn: () => getOrders('pending'),
  })

  const spools = (stockData?.spools ?? []).filter(s => !s.archived)
  const itemOrders = (ordersData ?? []).filter(o => o.item_id === itemId && o.status === 'pending')

  // Advance past 'init' once spoolmanInfo arrives
  useEffect(() => {
    if (spoolmanInfo !== undefined && step === 'init') {
      setStep('slots')
    }
  }, [spoolmanInfo, step])

  // Populate slot assignments from Moonraker once loaded
  useEffect(() => {
    if (slotsData) {
      setAssignments(slotsData.map(s => s.spool_id ?? null))
    }
  }, [slotsData])

  // Pre-select all pending orders when order step becomes active
  useEffect(() => {
    if (step === 'o-status' && ordersData) {
      setSelectedOrderIds(new Set(itemOrders.map(o => o.id)))
    }
  }, [step, ordersData, itemId])

  // Auto-skip order step once orders load and none are pending (race-condition fallback)
  useEffect(() => {
    if (step === 'o-status' && !loadingOrders && itemOrders.length === 0) {
      onConfirm()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loadingOrders, itemOrders.length])
  const spoolmanActive = spoolmanInfo?.configured === true
  const hasWeights = filamentWeights.some(w => w > 0)

  function setAssignment(i: number, id: number | null) {
    setAssignments(prev => { const next = [...prev]; next[i] = id; return next })
  }

  function toggleOrder(id: number, checked: boolean) {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  async function handleSlotsConfirm() {
    setSaving(true)
    setError(null)
    try {
      if (spoolmanActive) {
        await setPrinterSpoolmanSlots(
          printer.id,
          assignments.map((spool_id, i) => ({ tool_index: i, spool_id })),
        )
      }
      if (shouldDeduct) {
        const deductions = assignments
          .map((spool_id, i) => ({ spool_id: spool_id!, grams: filamentWeights[i] ?? 0 }))
          .filter(d => d.spool_id != null && d.grams > 0)
        if (deductions.length > 0) await deductSpoolman(deductions)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed — continuing anyway.')
    }
    setSaving(false)
    if (!loadingOrders && itemOrders.length === 0) {
      onConfirm()
    } else {
      setStep('o-status')
    }
  }

  async function handleFinalConfirm() {
    if (selectedOrderIds.size > 0) {
      setUpdatingOrders(true)
      try {
        await Promise.all([...selectedOrderIds].map(id => updateOrder(id, { status: 'printing' })))
      } catch {
        // non-blocking
      }
      setUpdatingOrders(false)
    }
    onConfirm()
  }

  return (
    <Modal title="Spool Assignment" onClose={onCancel} wide>
      <div className="space-y-4">

        {/* ── Loading ── */}
        {step === 'init' && (
          <div className="flex items-center gap-3 py-6 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Checking Spoolman status…</span>
          </div>
        )}

        {/* ── Spool assignment ── */}
        {step === 'slots' && (
          <>
            {/* Spoolman status banner */}
            {spoolmanActive ? (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <p className="text-sm text-green-700 dark:text-green-300">
                  <strong>{printer.name}</strong> is connected to Spoolman. The spools you select below will be registered
                  as active on the printer so filament usage is tracked automatically while it prints.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  <strong>{printer.name}</strong> is not linked to Spoolman, so spool assignments won't be sent to the
                  printer. You can still record which spools you're loading below for manual inventory tracking.
                </p>
              </div>
            )}

            {/* Slot rows */}
            {stepFilaments.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No filaments defined for this print step.</p>
            ) : (
              <div>
                {stepFilaments.map((fil, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b dark:border-gray-700 last:border-0">
                    <span className="text-xs font-semibold text-gray-400 shrink-0 w-6">#{i + 1}</span>
                    <div className="flex items-center gap-1.5 shrink-0 w-36">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                        style={{ backgroundColor: normalizeHex(fil.color_hex) }}
                      />
                      <span className="text-xs truncate text-gray-700 dark:text-gray-300">
                        {fil.brand ? `${fil.brand} ` : ''}{fil.material} {fil.color_name}
                      </span>
                    </div>
                    {(filamentWeights[i] ?? 0) > 0 && (
                      <span className="text-xs text-gray-400 shrink-0 w-12 text-right">
                        {filamentWeights[i].toFixed(1)}g
                      </span>
                    )}
                    <div className="flex-1">
                      <SpoolSelect value={assignments[i] ?? null} onChange={id => setAssignment(i, id)} spools={spools} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Deduct yes/no */}
            {hasWeights && stepFilaments.length > 0 && (
              <div className="space-y-2 pt-1 border-t dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Deduct used filament from Spoolman inventory?
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Keeping spool weights up to date improves forecast accuracy and reorder suggestions. We recommend saying yes.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShouldDeduct(false)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      !shouldDeduct
                        ? 'border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                        : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    No
                  </button>
                  <button
                    onClick={() => setShouldDeduct(true)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      shouldDeduct
                        ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    Yes <span className="text-xs font-normal opacity-75">(recommended)</span>
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                Cancel
              </button>
              <button
                onClick={handleSlotsConfirm}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                Next
              </button>
            </div>
          </>
        )}

        {/* ── Order status ── */}
        {step === 'o-status' && (
          <>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Update order status to Printing?
            </p>

            {loadingOrders ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-sm">Loading orders…</span>
              </div>
            ) : itemOrders.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No pending orders found for this item.</p>
            ) : (
              <div className="space-y-1.5">
                {itemOrders.map(order => (
                  <label
                    key={order.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.has(order.id)}
                      onChange={e => toggleOrder(order.id, e.target.checked)}
                      className="w-4 h-4 rounded accent-brand-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          Order #{order.id}
                        </span>
                        {order.customer_name && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">{order.customer_name}</span>
                        )}
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                          qty {order.quantity}
                        </span>
                        {order.date_needed && (
                          <span className="text-xs text-gray-400">Due {order.date_needed}</span>
                        )}
                      </div>
                      {order.customer_notes && (
                        <p className="text-xs text-gray-400 mt-0.5 italic truncate">{order.customer_notes}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                Cancel
              </button>
              <button
                onClick={() => onConfirm()}
                className="px-4 py-2 text-sm border border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg"
              >
                Skip, Just Print
              </button>
              <button
                onClick={handleFinalConfirm}
                disabled={updatingOrders || loadingOrders}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50"
              >
                {updatingOrders && <Loader2 size={13} className="animate-spin" />}
                {selectedOrderIds.size > 0
                  ? `Update ${selectedOrderIds.size > 1 ? `${selectedOrderIds.size} Orders` : 'Order'} & Print`
                  : 'Proceed to Print'}
              </button>
            </div>
          </>
        )}

      </div>
    </Modal>
  )
}
