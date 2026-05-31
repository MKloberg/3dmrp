import { useState, useEffect, Fragment } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { getOrders, createOrder, updateOrder, deleteOrder, getItems, updateItem, getCustomers, adjustQuantityPrinted, getPrinterStatus, Order, RoutingStep } from '../api/client'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { Plus, Trash2, Pencil, Package, User, ExternalLink, ClipboardList, ChevronRight, ChevronDown } from 'lucide-react'

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `~${h}h ${m}m` : `~${m}m`
}

function formatCompletion(remainingSecs: number): string {
  const now = new Date()
  const done = new Date(now.getTime() + remainingSecs * 1000)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isToday = done.toDateString() === now.toDateString()
  const isTomorrow = done.toDateString() === tomorrow.toDateString()
  const timeStr = done.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const dayLabel = isToday ? 'today' : isTomorrow ? 'tomorrow' : done.toLocaleDateString([], { weekday: 'long' })
  const h = Math.floor(remainingSecs / 3600)
  const m = Math.floor((remainingSecs % 3600) / 60)
  const leftStr = h > 0 ? `${h}h ${m}m left` : `${m}m left`
  return `${timeStr} ${dayLabel} · ${leftStr}`
}

function OrderProgressPanel({ order }: { order: Order }) {
  const qualifyingSteps: RoutingStep[] = []
  for (const routing of order.item.routings) {
    if (!routing.include_in_summary) continue
    for (const step of routing.steps) {
      if (!step.include_in_planning) continue
      qualifyingSteps.push(step)
    }
  }

  const activePrinterIds = [...new Set(order.active_print_jobs.map(j => j.printer_id))]
  const printerStatuses = useQueries({
    queries: activePrinterIds.map(id => ({
      queryKey: ['printer-status', id],
      queryFn: () => getPrinterStatus(id),
      refetchInterval: 30_000,
      staleTime: 15_000,
      retry: false,
    })),
  })
  const timeRemainingMap = new Map<number, number | null>(
    activePrinterIds.map((id, i) => [id, printerStatuses[i]?.data?.time_remaining ?? null])
  )

  if (qualifyingSteps.length === 0) {
    return <p className="text-sm text-gray-400 italic">No production steps defined.</p>
  }

  const progressMap = new Map(order.step_progress.map(p => [p.routing_step_id, p.parts_printed]))
  const THUMB = 72
  const MODAL = 384

  return (
    <div className="space-y-2">
      {qualifyingSteps.map(step => {
        const partsNeeded = step.parts_per_item * order.quantity
        const partsPrinted = progressMap.get(step.id) ?? 0
        const pct = partsNeeded > 0 ? Math.min(100, Math.round((partsPrinted / partsNeeded) * 100)) : 0
        const barColor = pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'

        const slicerName = step.printer_type?.slicer?.name
        const printerTypeName = step.printer_type?.name
        const thumbUrl = step.gcode_file && slicerName && printerTypeName
          ? `/api/gcode/thumbnail?item_name=${encodeURIComponent(order.item.name)}&slicer_name=${encodeURIComponent(slicerName)}&printer_type_name=${encodeURIComponent(printerTypeName)}&filename=${encodeURIComponent(step.gcode_file)}`
          : null

        const zoom = step.thumbnail_zoom ?? 150
        const ox = step.thumbnail_offset_x ?? 0
        const oy = step.thumbnail_offset_y ?? 0

        const platesNeeded = partsNeeded > 0 ? Math.ceil(partsNeeded / step.quantity_on_plate) : null
        const totalTime = step.estimated_print_time && platesNeeded ? step.estimated_print_time * platesNeeded : null

        const stepJobs = order.active_print_jobs.filter(j => j.routing_step_id === step.id)
        const printerNames = stepJobs.map(j => j.printer?.name ?? `Printer ${j.printer_id}`).join(', ')
        const maxRemaining = stepJobs.length > 0
          ? stepJobs.reduce<number | null>((max, j) => {
              const t = timeRemainingMap.get(j.printer_id) ?? null
              if (t === null) return max
              return max === null ? t : Math.max(max, t)
            }, null)
          : null

        return (
          <div key={step.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            {/* Thumbnail zone — always reserved */}
            <div className="w-[72px] h-[72px] shrink-0 rounded border border-gray-200 dark:border-gray-600 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              {thumbUrl && (
                <img
                  src={thumbUrl}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    transform: `translate(${ox * THUMB / MODAL}px, ${oy * THUMB / MODAL}px) scale(${zoom / 100})`,
                    transformOrigin: 'center center',
                  }}
                  alt=""
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
            </div>

            {/* Step info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {step.description || '(unnamed step)'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {step.printer_type?.name}
                {stepJobs.length > 0 && (
                  <span className="text-brand-500 dark:text-brand-400">
                    {' '}· Currently printing on {printerNames}
                    {maxRemaining !== null && maxRemaining > 0 && (
                      <>, Completed by {formatCompletion(maxRemaining)}</>
                    )}
                  </span>
                )}
              </p>
              {step.filaments.length > 0 && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {step.filaments.map(f => (
                    <span key={f.id} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300 dark:border-gray-500 shrink-0"
                        style={{ backgroundColor: f.filament_spec.color_hex }}
                      />
                      {f.filament_spec.material} {f.filament_spec.color_name}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-3 text-xs text-gray-400 mt-1">
                {step.parts_per_item !== 1 && <span>{step.parts_per_item} parts/item</span>}
                {step.quantity_on_plate !== 1 && <span>{step.quantity_on_plate}/plate</span>}
                {step.estimated_print_time && <span>{fmtTime(step.estimated_print_time)}/plate</span>}
              </div>
            </div>

            {/* Progress zone */}
            <div className="w-44 shrink-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">
                  {partsPrinted}<span className="text-gray-400 font-normal">/{partsNeeded} parts</span>
                </span>
                <span className={pct >= 100 ? 'text-green-600 font-medium' : pct > 0 ? 'text-brand-600 font-medium' : 'text-gray-400'}>
                  {pct}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              {totalTime && (
                <p className="text-xs text-gray-400 mt-1 text-right">{fmtTime(totalTime)} total</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const STATUSES = ['pending', 'printing', 'complete', 'cancelled'] as const
type Status = typeof STATUSES[number]

export default function Orders() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [warningOrderId, setWarningOrderId] = useState<number | null>(null)
  const [pendingDelta, setPendingDelta] = useState<number>(0)

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', filterStatus],
    queryFn: () => getOrders(filterStatus || undefined),
    refetchInterval: (query) => {
      const data = query.state.data as Order[] | undefined
      return data?.some(o => o.status === 'printing') ? 15_000 : false
    },
  })
  const { data: items = [] } = useQuery({ queryKey: ['items'], queryFn: getItems })
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: getCustomers })

  useEffect(() => {
    if (!hash || orders.length === 0) return
    const el = document.getElementById(hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [hash, orders])

  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId || orders.length === 0) return
    const order = orders.find(o => String(o.id) === openId)
    if (order) {
      openEdit(order)
      setSearchParams(p => { p.delete('open'); return p }, { replace: true })
    }
  }, [searchParams, orders])

  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [modelMode, setModelMode] = useState<'existing' | 'new'>('existing')

  const [form, setForm] = useState({
    item_id: '', item_name: '', stl_source_url: '',
    customer_id: '', customer_name: '', customer_notes: '', date_needed: '', quantity: '1',
  })
  const [editForm, setEditForm] = useState({
    quantity: '1', customer_id: '', customer_name: '', customer_notes: '',
    date_needed: '', status: 'pending' as Status,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const order = await createOrder({
        ...(modelMode === 'existing'
          ? { item_id: Number(form.item_id) }
          : { item_name: form.item_name }),
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        customer_name: form.customer_id ? '' : form.customer_name,
        customer_notes: form.customer_notes,
        quantity: Number(form.quantity),
        date_needed: form.date_needed || null,
      })
      if (form.stl_source_url) {
        const original = order.item
        if (original.stl_source_url !== form.stl_source_url) {
          await updateItem(original.id, { ...original, stl_source_url: form.stl_source_url })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['items'] })
      setShowForm(false)
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => updateOrder(editing!.id, {
      quantity: Number(editForm.quantity),
      customer_id: editForm.customer_id ? Number(editForm.customer_id) : null,
      customer_name: editForm.customer_id ? '' : editForm.customer_name,
      customer_notes: editForm.customer_notes,
      date_needed: editForm.date_needed || null,
      status: editForm.status,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setEditing(null) },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateOrder(id, { status } as Partial<Order>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const adjustMutation = useMutation({
    mutationFn: ({ id, delta, force }: { id: number; delta: number; force?: boolean }) =>
      adjustQuantityPrinted(id, delta, force),
    onSuccess: (result, variables) => {
      if ('warning' in result && result.warning) {
        setWarningOrderId(variables.id)
        setPendingDelta(variables.delta)
      } else {
        qc.invalidateQueries({ queryKey: ['orders'] })
      }
    },
  })

  function doAdjust(orderId: number, delta: number, force = false) {
    adjustMutation.mutate({ id: orderId, delta, force })
  }

  function resetForm() {
    setForm({ item_id: '', item_name: '', stl_source_url: '', customer_id: '', customer_name: '', customer_notes: '', date_needed: '', quantity: '1' })
    setModelMode('existing')
  }

  function openEdit(order: Order) {
    setEditing(order)
    setEditForm({
      quantity: String(order.quantity),
      customer_id: order.customer_id ? String(order.customer_id) : '',
      customer_name: order.customer_name,
      customer_notes: order.customer_notes,
      date_needed: order.date_needed ? order.date_needed.split('T')[0] : '',
      status: order.status,
    })
  }

  function orderCustomerLabel(order: Order) {
    if (order.customer) return order.customer.display_name
    if (order.customer_name) return order.customer_name
    return null
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3"><ClipboardList size={26} className="text-brand-600" />Orders</h1>
        <div className="flex items-center gap-3">
          <select
            className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={15} /> New Order
          </button>
        </div>
      </div>

      {orders.length === 0 && (
        <p className="text-sm text-gray-400 italic">No orders found.</p>
      )}

      {orders.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-2 py-2 w-8" />
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-center">Progress</th>
                <th className="px-4 py-2 text-left">Ordered</th>
                <th className="px-4 py-2 text-left">Needed by</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {orders.map(order => {
                const firstImage = order.item.images[0]
                const customerLabel = orderCustomerLabel(order)
                const isExpanded = expandedOrderId === order.id
                return (
                  <Fragment key={order.id}>
                  <tr id={`order-${order.id}`} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${hash === `#order-${order.id}` ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className="text-gray-400 hover:text-brand-600 p-0.5 rounded"
                        title={isExpanded ? 'Collapse' : 'Show production progress'}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {firstImage ? (
                          <img
                            src={`/api/items/${order.item.id}/images/${firstImage.id}?v=${new Date(firstImage.created_at).getTime()}`}
                            alt=""
                            className="w-8 h-8 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0" />
                        )}
                        <span className="font-medium">{order.item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {customerLabel ? (
                        <div className="flex items-center gap-1.5">
                          {order.customer && <User size={12} className="text-brand-500 shrink-0" />}
                          <div>
                            <span>{customerLabel}</span>
                            {order.customer_notes && (
                              <p className="text-xs text-gray-400 truncate max-w-40" title={order.customer_notes}>
                                {order.customer_notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-center gap-1 min-w-[90px]">
                        <div className="flex items-center gap-1.5">
                          {order.status !== 'complete' && order.status !== 'cancelled' && (
                            <button
                              onClick={() => doAdjust(order.id, -1)}
                              disabled={adjustMutation.isPending || order.quantity_printed === 0}
                              className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                            >−</button>
                          )}
                          <span className="text-sm font-medium tabular-nums">
                            {order.quantity_printed}
                            <span className="text-gray-400 font-normal">/{order.quantity}</span>
                          </span>
                          {order.status !== 'complete' && order.status !== 'cancelled' && (
                            <button
                              onClick={() => doAdjust(order.id, +1)}
                              disabled={adjustMutation.isPending || order.quantity_printed >= order.quantity}
                              className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                            >+</button>
                          )}
                        </div>
                        {order.quantity > 0 && (
                          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                order.status === 'complete' ? 'bg-green-500' :
                                order.status === 'printing' ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                              style={{ width: `${Math.min(100, (order.quantity_printed / order.quantity) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {new Date(order.date_ordered).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {order.date_needed
                        ? new Date(order.date_needed).toLocaleDateString()
                        : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative inline-block">
                        <StatusBadge status={order.status} />
                        <select
                          className="absolute inset-0 opacity-0 cursor-pointer w-full"
                          value={order.status}
                          onChange={e => statusMutation.mutate({ id: order.id, status: e.target.value })}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(order)} className="text-gray-400 hover:text-brand-600">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => navigate(`/items?open=${order.item.id}`)}
                          title="Go to item"
                          className="text-gray-400 hover:text-brand-600"
                        >
                          <Package size={14} />
                        </button>
                        <button
                          onClick={() => { if (confirm('Delete order?')) deleteMutation.mutate(order.id) }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50 dark:bg-gray-800/60">
                      <td colSpan={8} className="px-6 py-3 border-b border-gray-100 dark:border-gray-700">
                        <OrderProgressPanel order={order} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title="New Order" onClose={() => { setShowForm(false); resetForm() }}>
          <div className="space-y-3">
            {/* Item */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">Item *</label>
                <div className="flex text-xs rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
                  <button type="button" onClick={() => setModelMode('existing')}
                    className={`px-2 py-0.5 ${modelMode === 'existing' ? 'bg-brand-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                    Existing
                  </button>
                  <button type="button" onClick={() => setModelMode('new')}
                    className={`px-2 py-0.5 ${modelMode === 'new' ? 'bg-brand-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                    New
                  </button>
                </div>
              </div>
              {modelMode === 'existing' ? (
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                  value={form.item_id}
                  onChange={e => {
                    const url = items.find(m => String(m.id) === e.target.value)?.stl_source_url ?? ''
                    setForm(f => ({ ...f, item_id: e.target.value, stl_source_url: url }))
                  }}
                >
                  <option value="">— select item —</option>
                  {items.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Item name…"
                  value={form.item_name}
                  onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
                />
              )}
              <div className="flex items-center gap-1.5 mt-1.5">
                <input
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600"
                  placeholder="STL Source URL"
                  value={form.stl_source_url}
                  onChange={e => setForm(f => ({ ...f, stl_source_url: e.target.value }))}
                />
                <a
                  href={form.stl_source_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => !form.stl_source_url && e.preventDefault()}
                  className={`shrink-0 p-1.5 rounded-lg border ${form.stl_source_url ? 'text-brand-600 border-brand-300 dark:border-brand-700 hover:bg-brand-50 dark:hover:bg-brand-900/20' : 'text-gray-300 dark:text-gray-600 border-gray-200 dark:border-gray-700 pointer-events-none'}`}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Quantity *</label>
                <input type="number" min="1"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Needed by</label>
                <input type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                  value={form.date_needed}
                  onChange={e => setForm(f => ({ ...f, date_needed: e.target.value }))}
                />
              </div>
            </div>

            {/* Customer */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Customer</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={form.customer_id}
                onChange={e => setForm(f => ({ ...f, customer_id: e.target.value, customer_name: '' }))}
              >
                <option value="">— walk-in / no account —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name}{c.company_name && c.given_name ? ` (${c.company_name})` : ''}</option>
                ))}
              </select>
              {!form.customer_id && (
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 mt-2"
                  placeholder="Walk-in name (optional)"
                  value={form.customer_name}
                  onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                />
              )}
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Order notes</label>
              <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={form.customer_notes}
                onChange={e => setForm(f => ({ ...f, customer_notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setShowForm(false); resetForm() }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
              <button
                disabled={
                  (modelMode === 'existing' ? !form.item_id : !form.item_name.trim()) ||
                  !form.quantity || createMutation.isPending
                }
                onClick={() => createMutation.mutate()}
                className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving…' : 'Create Order'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {warningOrderId !== null && (
        <Modal title="Active Print in Progress" onClose={() => setWarningOrderId(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              A print job for this item is currently running. Adjusting the count manually while printing may cause a double-credit when the job completes.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setWarningOrderId(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >Cancel</button>
              <button
                onClick={() => {
                  doAdjust(warningOrderId, pendingDelta, true)
                  setWarningOrderId(null)
                }}
                className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
              >Adjust Anyway</button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Order" onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {editing.item.images[0] ? (
                <img
                  src={`/api/items/${editing.item.id}/images/${editing.item.images[0].id}?v=${new Date(editing.item.images[0].created_at).getTime()}`}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 shrink-0" />
              )}
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">{editing.item.name}</p>
              <button
                onClick={() => { setEditing(null); navigate(`/items?open=${editing.item.id}`) }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                <ExternalLink size={13} />
                Open Item
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Quantity</label>
                <input type="number" min="1"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                  value={editForm.quantity}
                  onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Needed by</label>
                <input type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                  value={editForm.date_needed}
                  onChange={e => setEditForm(f => ({ ...f, date_needed: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Status</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Status }))}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Customer</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={editForm.customer_id}
                onChange={e => setEditForm(f => ({ ...f, customer_id: e.target.value, customer_name: '' }))}
              >
                <option value="">— walk-in / no account —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name}{c.company_name && c.given_name ? ` (${c.company_name})` : ''}</option>
                ))}
              </select>
              {!editForm.customer_id && (
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 mt-2"
                  placeholder="Walk-in name (optional)"
                  value={editForm.customer_name}
                  onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Order notes</label>
              <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                value={editForm.customer_notes}
                onChange={e => setEditForm(f => ({ ...f, customer_notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
              <button
                disabled={!editForm.quantity || updateMutation.isPending}
                onClick={() => updateMutation.mutate()}
                className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
