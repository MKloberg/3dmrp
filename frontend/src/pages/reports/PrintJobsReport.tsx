import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPrintJobs, type PrintJobReport } from '../../api/client'

const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-600',
  error: 'bg-red-100 text-red-700',
}

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  completed: 1,
  cancelled: 2,
  error: 3,
}

type SortCol = keyof Pick<
  PrintJobReport,
  'id' | 'status' | 'printer_name' | 'filename' | 'order_id' | 'item_name' | 'quantity_credited' | 'start_time' | 'end_time' | 'created_at'
>

function fmtDt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
}

function SortIndicator({ col, sort }: { col: SortCol; sort: { col: SortCol; dir: 'asc' | 'desc' } }) {
  if (sort.col !== col) return <span className="text-gray-300 ml-0.5">⇅</span>
  return <span className="ml-0.5">{sort.dir === 'asc' ? '▲' : '▼'}</span>
}

export default function PrintJobsReport() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['print-jobs'],
    queryFn: getPrintJobs,
    refetchInterval: 15000,
  })

  const [statusFilter, setStatusFilter] = useState('')
  const [printerFilter, setPrinterFilter] = useState('')
  const [filenameFilter, setFilenameFilter] = useState('')
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'status', dir: 'asc' })

  const printerOptions = useMemo(
    () => [...new Set(jobs.map(j => j.printer_name))].sort(),
    [jobs],
  )

  const filtered = useMemo(() => {
    let rows = jobs
    if (statusFilter) rows = rows.filter(j => j.status === statusFilter)
    if (printerFilter) rows = rows.filter(j => j.printer_name === printerFilter)
    if (filenameFilter) {
      const q = filenameFilter.toLowerCase()
      rows = rows.filter(j => j.filename.toLowerCase().includes(q))
    }
    return rows
  }, [jobs, statusFilter, printerFilter, filenameFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sort.col === 'status') {
        const sa = STATUS_ORDER[a.status] ?? 9
        const sb = STATUS_ORDER[b.status] ?? 9
        if (sa !== sb) return sort.dir === 'asc' ? sa - sb : sb - sa
        // secondary: end_time DESC, created_at DESC
        const et = (b.end_time ?? '').localeCompare(a.end_time ?? '')
        if (et !== 0) return et
        return (b.created_at ?? '').localeCompare(a.created_at ?? '')
      }
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
      <h1 className="text-base font-semibold mb-3">Print Jobs</h1>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded px-2 py-0.5 text-xs"
        >
          <option value="">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="error">Error</option>
        </select>
        <select
          value={printerFilter}
          onChange={e => setPrinterFilter(e.target.value)}
          className="border rounded px-2 py-0.5 text-xs"
        >
          <option value="">All printers</option>
          {printerOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter filename…"
          value={filenameFilter}
          onChange={e => setFilenameFilter(e.target.value)}
          className="border rounded px-2 py-0.5 text-xs w-40"
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
              <Th col="status" label="Status" />
              <Th col="printer_name" label="Printer" />
              <Th col="filename" label="Filename" />
              <th className="px-1.5 py-1 text-left whitespace-nowrap">Job UID</th>
              <Th col="order_id" label="Order" />
              <Th col="item_name" label="Item" />
              <th className="px-1.5 py-1 text-left whitespace-nowrap">Step</th>
              <Th col="quantity_credited" label="Parts" right />
              <Th col="start_time" label="Start" />
              <Th col="end_time" label="End" />
              <Th col="created_at" label="Created" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(job => (
              <tr key={job.id} className="border-b hover:bg-gray-50">
                <td className="px-1.5 py-0.5 tabular-nums">{job.id}</td>
                <td className="px-1.5 py-0.5">
                  <span className={`px-1.5 py-px rounded-full font-medium ${STATUS_COLORS[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {job.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-1.5 py-0.5">
                  <Link to="/printers" className="text-blue-600 hover:underline">{job.printer_name}</Link>
                </td>
                <td className="px-1.5 py-0.5 max-w-[180px]">
                  <span title={job.filename} className="block truncate">{job.filename}</span>
                </td>
                <td className="px-1.5 py-0.5 max-w-[100px]">
                  {job.moonraker_job_id ? (
                    <a
                      href={`${job.printer_url}/#history`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono truncate block"
                      title={job.moonraker_job_id}
                    >
                      {job.moonraker_job_id}
                    </a>
                  ) : '—'}
                </td>
                <td className="px-1.5 py-0.5 whitespace-nowrap">
                  {job.order_id ? (
                    <Link to={`/orders#order-${job.order_id}`} className="text-blue-600 hover:underline">
                      #{job.order_id}{job.order_customer ? ` ${job.order_customer}` : ''}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-1.5 py-0.5 max-w-[120px]">
                  {job.item_id && job.item_name ? (
                    <Link to={`/items?open=${job.item_id}`} className="text-blue-600 hover:underline truncate block" title={job.item_name}>
                      {job.item_name}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-1.5 py-0.5 max-w-[100px]">
                  {job.routing_step_id && job.step_description ? (
                    <Link to={`/items?open=${job.item_id}`} className="text-blue-600 hover:underline truncate block" title={job.step_description}>
                      {job.step_description}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">
                  {job.status === 'in_progress' && job.quantity_on_plate != null
                    ? <span className="text-gray-400 italic" title="expected when complete">{job.quantity_on_plate}</span>
                    : job.quantity_credited}
                </td>
                <td className="px-1.5 py-0.5 whitespace-nowrap tabular-nums">{fmtDt(job.start_time)}</td>
                <td className="px-1.5 py-0.5 whitespace-nowrap tabular-nums">{fmtDt(job.end_time)}</td>
                <td className="px-1.5 py-0.5 whitespace-nowrap tabular-nums">{fmtDt(job.created_at)}</td>
              </tr>
            ))}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={12} className="px-1.5 py-6 text-center text-gray-400">No print jobs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
