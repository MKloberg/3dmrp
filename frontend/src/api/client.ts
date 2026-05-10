const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// --- Types ---
export interface FilamentSpec {
  id: number
  material: string
  color_name: string
  color_hex: string
  brand: string
  price: number | null
  density: number | null
  diameter: number | null
  weight: number | null
  spool_weight: number | null
  settings_extruder_temp: number | null
  settings_bed_temp: number | null
  article_number: string
  comment: string
  external_id: string
  extra: Record<string, unknown> | null
  spoolman_id: number | null
  purchase_url: string
  created_at: string
}

export interface Tag {
  id: number
  name: string
  color_hex: string
}

export interface ModelFilament {
  id: number
  filament_spec_id: number
  grams: number
  sort_order: number
  filament_spec: FilamentSpec
}

export interface ModelImage {
  id: number
  created_at: string
}

export interface SlicerFile {
  id: number
  printer_id: number
  file_path: string
}

export interface PrintModel {
  id: number
  name: string
  description: string
  notes: string
  created_at: string
  filament_requirements: ModelFilament[]
  images: ModelImage[]
  slicer_files: SlicerFile[]
  tags: Tag[]
}

export interface Order {
  id: number
  print_model_id: number
  quantity: number
  customer_name: string
  customer_notes: string
  date_ordered: string
  date_needed: string | null
  status: 'pending' | 'printing' | 'complete' | 'cancelled'
  print_model: PrintModel
}

export interface ForecastItem {
  filament_spec: FilamentSpec
  demand_grams_per_week: number
  forecast_weeks: number
  total_demand_grams: number
  spoolman_stock_grams: number
  shortfall_grams: number
  status: 'ok' | 'low' | 'critical'
}

export interface ForecastResponse {
  forecast_weeks: number
  lookback_weeks: number
  items: ForecastItem[]
  spoolman_url: string | null
  spoolman_connected: boolean
}

// --- Filaments ---
export const getFilaments = () => req<FilamentSpec[]>('/filaments')
export type FilamentSpecInput = Omit<FilamentSpec, 'id' | 'created_at'>

export const createFilament = (data: FilamentSpecInput) =>
  req<FilamentSpec>('/filaments', { method: 'POST', body: JSON.stringify(data) })
export const updateFilament = (id: number, data: FilamentSpecInput) =>
  req<FilamentSpec>(`/filaments/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteFilament = (id: number) =>
  req<void>(`/filaments/${id}`, { method: 'DELETE' })

// --- Models ---
export const getModels = () => req<PrintModel[]>('/models')
export const createModel = (data: Pick<PrintModel, 'name' | 'description' | 'notes'>) =>
  req<PrintModel>('/models', { method: 'POST', body: JSON.stringify(data) })
export const updateModel = (id: number, data: Pick<PrintModel, 'name' | 'description' | 'notes'>) =>
  req<PrintModel>(`/models/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteModel = (id: number) =>
  req<void>(`/models/${id}`, { method: 'DELETE' })
export const addFilamentReq = (modelId: number, data: { filament_spec_id: number; grams: number }) =>
  req<ModelFilament>(`/models/${modelId}/filaments`, { method: 'POST', body: JSON.stringify(data) })
export const updateFilamentReq = (modelId: number, reqId: number, data: { grams: number; filament_spec_id: number }) =>
  req<ModelFilament>(`/models/${modelId}/filaments/${reqId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const reorderFilaments = (modelId: number, items: { id: number; sort_order: number }[]) =>
  req<void>(`/models/${modelId}/filaments/reorder`, { method: 'POST', body: JSON.stringify(items) })
export const removeFilamentReq = (modelId: number, reqId: number) =>
  req<void>(`/models/${modelId}/filaments/${reqId}`, { method: 'DELETE' })

export const uploadModelImage = async (modelId: number, file: File): Promise<ModelImage> => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/models/${modelId}/images`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}
export const copyThumbnailToModel = (modelId: number, printerId: number, thumbnailPath: string) =>
  req<ModelImage>(`/models/${modelId}/images/from-printer`, {
    method: 'POST',
    body: JSON.stringify({ printer_id: printerId, thumbnail_path: thumbnailPath }),
  })
export const deleteModelImage = (modelId: number, imageId: number) =>
  req<void>(`/models/${modelId}/images/${imageId}`, { method: 'DELETE' })
export const cropModelImage = (modelId: number, imageId: number, box: { x: number; y: number; width: number; height: number }) =>
  req<ModelImage>(`/models/${modelId}/images/${imageId}/crop`, { method: 'POST', body: JSON.stringify(box) })

export const setSlicerFile = (modelId: number, printerId: number, filePath: string) =>
  req<SlicerFile>(`/models/${modelId}/slicer-files/${printerId}`, { method: 'PUT', body: JSON.stringify({ file_path: filePath }) })
export const deleteSlicerFile = (modelId: number, printerId: number) =>
  req<void>(`/models/${modelId}/slicer-files/${printerId}`, { method: 'DELETE' })
export const openInSlicer = (modelId: number, printerId: number) =>
  req<void>(`/models/${modelId}/open-slicer/${printerId}`, { method: 'POST' })

// --- Orders ---
export const getOrders = (status?: string) =>
  req<Order[]>(`/orders${status ? `?status=${status}` : ''}`)
export const createOrder = (data: {
  print_model_id: number
  quantity: number
  customer_name?: string
  customer_notes?: string
  date_needed?: string | null
}) => req<Order>('/orders', { method: 'POST', body: JSON.stringify(data) })
export const updateOrder = (id: number, data: Partial<Order>) =>
  req<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteOrder = (id: number) =>
  req<void>(`/orders/${id}`, { method: 'DELETE' })

// --- Tags ---
export const getTags = () => req<Tag[]>('/tags')
export const createTag = (data: { name: string; color_hex: string }) =>
  req<Tag>('/tags', { method: 'POST', body: JSON.stringify(data) })
export const updateTag = (id: number, data: { name: string; color_hex: string }) =>
  req<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteTag = (id: number) =>
  req<void>(`/tags/${id}`, { method: 'DELETE' })
export const addTagToModel = (tagId: number, modelId: number) =>
  req<void>(`/tags/${tagId}/models/${modelId}`, { method: 'POST' })
export const removeTagFromModel = (tagId: number, modelId: number) =>
  req<void>(`/tags/${tagId}/models/${modelId}`, { method: 'DELETE' })

// --- Forecast ---
export const getForecast = (forecastWeeks = 4, lookbackWeeks = 4) =>
  req<ForecastResponse>(`/forecast?forecast_weeks=${forecastWeeks}&lookback_weeks=${lookbackWeeks}`)

// --- Spoolman ---
export interface SpoolmanVendor {
  id: number
  name: string
  empty_spool_weight: number | null
  extra: Record<string, unknown>
}

export interface SpoolmanFilament {
  id: number
  registered: string
  name: string
  material: string
  price: number | null
  density: number
  diameter: number
  weight: number | null
  spool_weight: number | null
  settings_extruder_temp: number | null
  settings_bed_temp: number | null
  color_hex: string
  external_id: string | null
  article_number: string | null
  comment: string | null
  extra: Record<string, unknown>
  vendor?: SpoolmanVendor
}

export const getSpoolmanFilaments = () =>
  req<{ connected: boolean; filaments: SpoolmanFilament[]; error?: string }>('/spoolman/filaments')

// --- Printers ---
export interface PrinterSlot {
  id: number
  slot_number: number
  filament_spec_id: number | null
  filament_spec: FilamentSpec | null
}

export interface Printer {
  id: number
  name: string
  url: string
  has_image: boolean
  slicer_name: string | null
  slicer_executable: string | null
  created_at: string
  slots: PrinterSlot[]
}

export interface PrinterStatus {
  state: 'standby' | 'printing' | 'paused' | 'error' | 'complete' | 'offline' | string
  filename: string | null
  progress: number | null
  print_duration: number | null
  time_remaining: number | null
  extruder_temp: number | null
  extruder_target: number | null
  bed_temp: number | null
  bed_target: number | null
}

export interface MoonrakerJob {
  job_id: string
  filename: string
  status: string
  start_time: number | null
  end_time: number | null
  print_duration: number | null
  filament_used: number | null
  thumbnail_path: string | null
}

export interface PrinterHistoryResponse {
  count: number
  jobs: MoonrakerJob[]
}

export const getPrinters = () => req<Printer[]>('/printers')
export const createPrinter = (data: { name: string; url: string }) =>
  req<Printer>('/printers', { method: 'POST', body: JSON.stringify(data) })
export const deletePrinter = (id: number) =>
  req<void>(`/printers/${id}`, { method: 'DELETE' })
export const setPrinterSlicer = (id: number, data: { slicer_name: string | null; slicer_executable: string | null }) =>
  req<Printer>(`/printers/${id}/slicer`, { method: 'PUT', body: JSON.stringify(data) })
export const setPrinterSlot = (printerId: number, slotNumber: number, filamentSpecId: number | null) =>
  req<PrinterSlot>(`/printers/${printerId}/slots/${slotNumber}`, {
    method: 'PUT',
    body: JSON.stringify({ filament_spec_id: filamentSpecId }),
  })
export const deletePrinterSlot = (printerId: number, slotNumber: number) =>
  req<void>(`/printers/${printerId}/slots/${slotNumber}`, { method: 'DELETE' })
export interface WebcamInfo {
  name: string
  stream_url: string
  snapshot_url: string
  flip_horizontal: boolean
  flip_vertical: boolean
  rotation: number
}

export interface FilamentDetectSlot {
  slot_index: number
  detected: boolean
  vendor: string
  material: string
  sub_type: string
  color_hex: string
  suggested_filament_spec_id: number | null
}

export const getPrinterFilamentDetect = (id: number) =>
  req<FilamentDetectSlot[]>(`/printers/${id}/filament-detect`)

export const getPrinterWebcams = (id: number) =>
  req<WebcamInfo[]>(`/printers/${id}/webcams`)
export const getPrinterStatus = (id: number) =>
  req<PrinterStatus>(`/printers/${id}/status`)
export const getPrinterHistory = (id: number, limit = 50) =>
  req<PrinterHistoryResponse>(`/printers/${id}/history?limit=${limit}`)
export const uploadPrinterImage = async (id: number, file: File): Promise<void> => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/printers/${id}/image`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(res.statusText)
}

// --- Settings ---
export const getSettings = () => req<Record<string, string>>('/settings')
export const setSetting = (key: string, value: string) =>
  req<Record<string, string>>(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) })
export const testSpoolman = (url: string) =>
  req<{ connected: boolean; version?: string; error?: string }>('/settings/spoolman/test', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })

export async function restoreDatabase(file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/settings/restore`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
}
