import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getOrders, createOrder, updateOrder, deleteOrder, getModels, Order } from '../api/client'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { Plus, Trash2 } from 'lucide-react'

const STATUSES = ['pending', 'printing', 'complete', 'cancelled'] as const
type Status = typeof STATUSES[number]

export default function Orders() {
  const qc = useQueryClient()
  const [filterStatus, setFilterStatus] = useState<string>('')
  const { data: orders = [] } = useQuery({
    queryKey: ['orders', filterStatus],
    queryFn: () => getOrders(filterStatus || undefined),
  })
  const { data: models = [] } = useQuery({ queryKey: ['models'], queryFn: getModels })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    print_model_id: '',
    quantity: '1',
    customer_name: '',
    customer_notes: '',
    date_needed: '',
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createOrder({
        print_model_id: Number(form.print_model_id),
        quantity: Number(form.quantity),
        customer_name: form.customer_name,
        customer_notes: form.customer_notes,
        date_needed: form.date_needed || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setShowForm(false); resetForm() },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateOrder(id, { status } as Partial<Order>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  function resetForm() {
    setForm({ print_model_id: '', quantity: '1', customer_name: '', customer_notes: '', date_needed: '' })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Orders</h1>
        <div className="flex items-center gap-3">
          <select
            className="border rounded-lg px-3 py-1.5 text-sm"
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

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {orders.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Model</th>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-center">Qty</th>
                <th className="px-4 py-2 text-left">Ordered</th>
                <th className="px-4 py-2 text-left">Needed by</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium">{order.print_model.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{order.customer_name || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-center">{order.quantity}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(order.date_ordered).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {order.date_needed ? new Date(order.date_needed).toLocaleDateString() : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="text-xs border rounded px-1.5 py-0.5"
                      value={order.status}
                      onChange={e => statusMutation.mutate({ id: order.id, status: e.target.value })}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { if (confirm('Delete order?')) deleteMutation.mutate(order.id) }}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title="New Order" onClose={() => { setShowForm(false); resetForm() }}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Model *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.print_model_id}
                onChange={e => setForm(f => ({ ...f, print_model_id: e.target.value }))}
              >
                <option value="">— select model —</option>
                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Quantity *</label>
                <input
                  type="number" min="1"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Needed by</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.date_needed}
                  onChange={e => setForm(f => ({ ...f, date_needed: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Customer name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.customer_name}
                onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={form.customer_notes}
                onChange={e => setForm(f => ({ ...f, customer_notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setShowForm(false); resetForm() }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
              <button
                disabled={!form.print_model_id || !form.quantity || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving…' : 'Create Order'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
