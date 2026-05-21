import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getCustomerOrders, squarePreview, squareImport, squareSync,
  Customer, CustomerInput, SquarePreviewCustomer, Order,
} from '../api/client'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, RefreshCw, Download, Users } from 'lucide-react'

const CATEGORIES = ['Retail', 'Wholesale', 'VIP', 'One-time', 'Trade', 'Consignment']

const EMPTY_FORM: CustomerInput = {
  given_name: '', family_name: '', company_name: '',
  email: '', phone: '',
  address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '',
  notes: '', category: '',
}

function customerFromSquare(sq: SquarePreviewCustomer): CustomerInput {
  return {
    given_name: sq.given_name, family_name: sq.family_name, company_name: sq.company_name,
    email: sq.email, phone: sq.phone,
    address_line1: sq.address_line1, address_line2: sq.address_line2,
    city: sq.city, state: sq.state, postal_code: sq.postal_code, country: sq.country,
    notes: sq.notes, category: '',
  }
}

function CustomerForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: CustomerInput
  onSave: (data: CustomerInput) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<CustomerInput>(initial)
  const set = (patch: Partial<CustomerInput>) => setForm(f => ({ ...f, ...patch }))

  const nameOk = form.given_name.trim() || form.family_name.trim() || form.company_name.trim()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">First name</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
            value={form.given_name} onChange={e => set({ given_name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Last name</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
            value={form.family_name} onChange={e => set({ family_name: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Company</label>
        <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          value={form.company_name} onChange={e => set({ company_name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Email</label>
          <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
            value={form.email} onChange={e => set({ email: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Phone</label>
          <input type="tel" className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
            value={form.phone} onChange={e => set({ phone: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Address</label>
        <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 mb-2"
          placeholder="Street address" value={form.address_line1} onChange={e => set({ address_line1: e.target.value })} />
        <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          placeholder="Apt, suite, etc." value={form.address_line2} onChange={e => set({ address_line2: e.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">City</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
            value={form.city} onChange={e => set({ city: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">State</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
            value={form.state} onChange={e => set({ state: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">ZIP</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
            value={form.postal_code} onChange={e => set({ postal_code: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Category</label>
        <select className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          value={form.category} onChange={e => set({ category: e.target.value })}>
          <option value="">— none —</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
        <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
          value={form.notes} onChange={e => set({ notes: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
        <button
          disabled={!nameOk || saving}
          onClick={() => onSave(form)}
          className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function CustomerOrders({ customerId }: { customerId: number }) {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['customer-orders', customerId],
    queryFn: () => getCustomerOrders(customerId),
  })

  if (isLoading) return <p className="text-sm text-gray-400 py-2">Loading orders…</p>
  if (orders.length === 0) return <p className="text-sm text-gray-400 italic py-2">No orders yet.</p>

  return (
    <div className="space-y-1 mt-2">
      {orders.map((order: Order) => (
        <div key={order.id} className="flex items-center justify-between text-sm py-1.5 border-b dark:border-gray-700 last:border-0">
          <div className="flex items-center gap-3 min-w-0">
            {order.item?.images?.[0] ? (
              <img
                src={`/api/items/${order.item.id}/images/${order.item.images[0].id}`}
                className="w-8 h-8 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                alt=""
              />
            ) : (
              <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-medium truncate">{order.item?.name ?? '(deleted item)'}</p>
              <p className="text-xs text-gray-400">{new Date(order.date_ordered).toLocaleDateString()} · ×{order.quantity}</p>
            </div>
          </div>
          <StatusBadge status={order.status} />
        </div>
      ))}
    </div>
  )
}

function SquareImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['square-preview'],
    queryFn: squarePreview,
    retry: false,
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const importMutation = useMutation({
    mutationFn: () => squareImport(Array.from(selected)),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      alert(`Imported ${data.imported} customer${data.imported !== 1 ? 's' : ''}.`)
      onClose()
    },
  })

  const filtered = (preview ?? []).filter(c => {
    const name = `${c.given_name} ${c.family_name} ${c.company_name}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const available = filtered.filter(c => !c.already_imported)
  const allSelected = available.length > 0 && available.every(c => selected.has(c.square_id))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(available.map(c => c.square_id)))
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <Modal title="Import from Square" onClose={onClose} wide>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-gray-400">Fetching Square customers…</p>}
        {error && (
          <p className="text-sm text-red-500">
            {error instanceof Error ? error.message : 'Failed to fetch Square customers. Check your API token in Settings.'}
          </p>
        )}
        {preview && (
          <>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
              placeholder="Search by name or company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="text-xs text-gray-400 flex items-center justify-between">
              <span>{preview.length} customers in Square · {preview.filter(c => c.already_imported).length} already imported</span>
              {available.length > 0 && (
                <button onClick={toggleAll} className="text-brand-600 hover:underline">
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-lg">
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 italic p-4">No matches.</p>
              )}
              {filtered.map(c => {
                const name = [c.given_name, c.family_name].filter(Boolean).join(' ') || c.company_name || '—'
                const sub = [c.company_name && c.given_name ? c.company_name : '', c.email].filter(Boolean).join(' · ')
                return (
                  <label
                    key={c.square_id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 ${c.already_imported ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      disabled={c.already_imported}
                      checked={c.already_imported || selected.has(c.square_id)}
                      onChange={() => toggle(c.square_id)}
                      className="shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
                    </div>
                    {c.already_imported && (
                      <span className="text-xs text-gray-400 shrink-0 ml-auto">imported</span>
                    )}
                  </label>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
              <button
                disabled={selected.size === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate()}
                className="bg-brand-600 text-white px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              >
                {importMutation.isPending ? 'Importing…' : `Import ${selected.size > 0 ? selected.size : ''} selected`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default function Customers() {
  const qc = useQueryClient()
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: getCustomers })

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'recent' | 'category' | 'company'>('name_asc')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [showSquareImport, setShowSquareImport] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: CustomerInput) => createCustomer(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setShowForm(false) },
  })

  const updateMutation = useMutation({
    mutationFn: (data: CustomerInput) => updateCustomer(editing!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setEditing(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await squareSync()
      setSyncResult(`Synced ${result.synced} customer${result.synced !== 1 ? 's' : ''} from Square.`)
      qc.invalidateQueries({ queryKey: ['customers'] })
    } catch (e) {
      setSyncResult('Sync failed. Check your Square API token in Settings.')
    } finally {
      setSyncing(false)
    }
  }

  const filtered = customers
    .filter(c => {
      const name = `${c.given_name} ${c.family_name} ${c.company_name} ${c.email}`.toLowerCase()
      const matchSearch = !search || name.includes(search.toLowerCase())
      const matchCat = !filterCategory || c.category === filterCategory
      return matchSearch && matchCat
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'name_asc') return a.display_name.localeCompare(b.display_name)
      if (sortBy === 'name_desc') return b.display_name.localeCompare(a.display_name)
      if (sortBy === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'category') {
        const cat = (a.category || 'zzz').localeCompare(b.category || 'zzz')
        return cat !== 0 ? cat : a.display_name.localeCompare(b.display_name)
      }
      if (sortBy === 'company') {
        const co = (a.company_name || 'zzz').localeCompare(b.company_name || 'zzz')
        return co !== 0 ? co : a.display_name.localeCompare(b.display_name)
      }
      return 0
    })

  const linkedToSquare = customers.filter(c => c.square_id).length

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3"><Users size={26} className="text-brand-600" />Customers</h1>
        <div className="flex items-center gap-2">
          {linkedToSquare > 0 && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm px-3 py-2 rounded-lg disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Sync from Square
            </button>
          )}
          <button
            onClick={() => setShowSquareImport(true)}
            className="flex items-center gap-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm px-3 py-2 rounded-lg"
          >
            <Download size={14} /> Import from Square
          </button>
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={15} /> New Customer
          </button>
        </div>
      </div>

      {syncResult && (
        <p className="text-sm text-green-600 dark:text-green-400">{syncResult}</p>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 w-64"
          placeholder="Search name, company, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
        >
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
          <option value="recent">Recently added</option>
          <option value="category">Category</option>
          <option value="company">Company</option>
        </select>
        <span className="text-xs text-gray-400">{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          {customers.length === 0 ? 'No customers yet. Add one or import from Square.' : 'No customers match your filters.'}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map(customer => {
          const isOpen = expanded === customer.id
          return (
            <div key={customer.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30"
                onClick={() => setExpanded(isOpen ? null : customer.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isOpen
                    ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                    : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                  <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                      {(customer.given_name[0] || customer.company_name[0] || '?').toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{customer.display_name}</span>
                      {customer.category && (
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">
                          {customer.category}
                        </span>
                      )}
                      {customer.square_id && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">Square</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      {customer.email && <span>{customer.email}</span>}
                      {customer.phone && <span>{customer.phone}</span>}
                      {customer.city && <span>{customer.city}{customer.state ? `, ${customer.state}` : ''}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); setEditing(customer); setShowForm(true) }}
                    className="text-gray-400 hover:text-brand-600"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm(`Delete ${customer.display_name}? Their orders will be kept but unlinked.`))
                        deleteMutation.mutate(customer.id)
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t dark:border-gray-700 px-4 py-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {(customer.address_line1 || customer.city) && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Address</p>
                        <p>{customer.address_line1}</p>
                        {customer.address_line2 && <p>{customer.address_line2}</p>}
                        <p>{[customer.city, customer.state, customer.postal_code].filter(Boolean).join(', ')}</p>
                        {customer.country && <p>{customer.country}</p>}
                      </div>
                    )}
                    {customer.notes && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                        <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{customer.notes}</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Order History</p>
                    <CustomerOrders customerId={customer.id} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showForm && (
        <Modal
          title={editing ? `Edit ${editing.display_name}` : 'New Customer'}
          onClose={() => { setShowForm(false); setEditing(null) }}
          wide
        >
          <CustomerForm
            initial={editing ? {
              given_name: editing.given_name, family_name: editing.family_name,
              company_name: editing.company_name, email: editing.email, phone: editing.phone,
              address_line1: editing.address_line1, address_line2: editing.address_line2,
              city: editing.city, state: editing.state, postal_code: editing.postal_code,
              country: editing.country, notes: editing.notes, category: editing.category,
            } : EMPTY_FORM}
            onSave={data => editing ? updateMutation.mutate(data) : createMutation.mutate(data)}
            onCancel={() => { setShowForm(false); setEditing(null) }}
            saving={createMutation.isPending || updateMutation.isPending}
          />
        </Modal>
      )}

      {showSquareImport && <SquareImportModal onClose={() => setShowSquareImport(false)} />}
    </div>
  )
}
