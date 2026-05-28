import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getOrderStepProgress, type OrderStepProgressReport } from '../../api/client'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  printing: 'bg-blue-100 text-blue-700',
  complete: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-600',
}

type SortCol = keyof Pick<
  OrderStepProgressReport,
  'id' | 'order_id' | 'order_status' | 'item_name' | 'step_description' |
  'parts_per_item' | 'parts_printed' | 'items_complete' |
  'order_quantity' | 'order_quantity_printed'
>

function SortIndicator({ col, sort }: { col: SortCol; sort: { col: SortCol; dir: 'asc' | 'desc' } }) {
  if (sort.col !== col) return <span className="text-gray-300 ml-0.5">⇅</span>
  return <span className="ml-0.5">{sort.dir === 'asc' ? '▲' : '▼'}</span>
}

export default function OrderStepProgressReport() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['order-step-progress'],
    queryFn: getOrderStepProgress,
    refetchInterval: 15000,
  })

  const [orderFilter, setOrderFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [itemFilter, setItemFilter] = useState('')
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'order_id', dir: 'asc' })

  const itemOptions = useMemo(
    () => [...new Set(rows.map(r => r.item_name).filter(Boolean))].sort() as string[],
    [rows],
  )

  const filtered = useMemo(() => {
    let r = rows
    if (statusFilter) r = r.filter(x => x.order_status === statusFilter)
    if (itemFilter) r = r.filter(x => x.item_name === itemFilter)
    if (orderFilter) {
      const q = orderFilter.toLowerCase()
      r = r.filter(x =>
        String(x.order_id).includes(q) ||
        (x.order_customer ?? '').toLowerCase().includes(q),
      )
    }
    return r
  }, [rows, statusFilter, itemFilter, orderFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a[sort.col] ?? '') as string | number
      const bv = (b[sort.col] ?? '') as string | number
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sort])

  function toggleSort(col: SortCol) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  }

  function Th({ col, label, right }: { col: SortCol; label: string; right?: boolean }) {
    return (
      <th
        className={`px-1.5 py-1 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 ${right ? 'text-right' : 'text-left'}`}
        onClick={() => toggleSort(col)}
      >
        {label}<SortIndicator col={col} sort={sort} />
      </th>
    )
  }

  return (
    <div className="p-4 min-h-0">
      <h1 className="text-base font-semibold mb-3">Order Step Progress</h1>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded px-2 py-0.5 text-xs"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="printing">Printing</option>
          <option value="complete">Complete</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={itemFilter}
          onChange={e => setItemFilter(e.target.value)}
          className="border rounded px-2 py-0.5 text-xs"
        >
          <option value="">All items</option>
          {itemOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter order…"
          value={orderFilter}
          onChange={e => setOrderFilter(e.target.value)}
          className="border rounded px-2 py-0.5 text-xs w-36"
        />
        <span className="text-xs text-gray-500 ml-1">
          {isLoading ? 'Loading…' : `${sorted.length} row${sorted.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-700">
              <Th col="id" label="ID" />
              <Th col="order_id" label="Order" />
              <Th col="order_status" label="Order Status" />
              <Th col="item_name" label="Item" />
              <Th col="step_description" label="Step" />
              <Th col="parts_per_item" label="Parts/Item" right />
              <Th col="parts_printed" label="Parts Printed" right />
              <Th col="items_complete" label="Items Complete" right />
              <Th col="order_quantity" label="Order Qty" right />
              <Th col="order_quantity_printed" label="Order Qty Printed" right />
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.id} className="border-b hover:bg-gray-50">
                <td className="px-1.5 py-0.5 tabular-nums">{row.id}</td>
                <td className="px-1.5 py-0.5 whitespace-nowrap">
                  <Link to={`/orders#order-${row.order_id}`} className="text-blue-600 hover:underline">
                    #{row.order_id}{row.order_customer ? ` ${row.order_customer}` : ''}
                  </Link>
                </td>
                <td className="px-1.5 py-0.5">
                  <span className={`px-1.5 py-px rounded-full font-medium ${STATUS_COLORS[row.order_status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {row.order_status}
                  </span>
                </td>
                <td className="px-1.5 py-0.5 max-w-[140px]">
                  {row.item_id ? (
                    <Link to={`/items?open=${row.item_id}`} className="text-blue-600 hover:underline truncate block" title={row.item_name ?? ''}>
                      {row.item_name}
                    </Link>
                  ) : row.item_name ?? '—'}
                </td>
                <td className="px-1.5 py-0.5 max-w-[160px]">
                  <span className="truncate block" title={row.step_description}>{row.step_description}</span>
                </td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{row.parts_per_item}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums font-medium">{row.parts_printed}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{row.items_complete}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{row.order_quantity}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{row.order_quantity_printed}</td>
              </tr>
            ))}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-1.5 py-6 text-center text-gray-400">No step progress records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
