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

export interface RoutingStepFilament {
  id: number
  filament_spec_id: number
  grams: number
  filament_spec: FilamentSpec
}

export interface RoutingStep {
  id: number
  routing_id: number
  sort_order: number
  description: string
  printer_type_id: number | null
  quantity_on_plate: number
  filaments: RoutingStepFilament[]
}

export interface Routing {
  id: number
  item_id: number
  name: string
  is_default: boolean
  sort_order: number
  steps: RoutingStep[]
}

export interface Item {
  id: number
  name: string
  description: string
  notes: string
  sku: string
  stl_source_url: string
  use_advanced_routing: boolean
  created_at: string
  filament_requirements: ModelFilament[]
  images: ModelImage[]
  slicer_files: SlicerFile[]
  tags: Tag[]
  routings: Routing[]
}

export interface Order {
  id: number
  item_id: number
  customer_id: number | null
  quantity: number
  customer_name: string
  customer_notes: string
  date_ordered: string
  date_needed: string | null
  status: 'pending' | 'printing' | 'complete' | 'cancelled'
  item: Item
  customer: Customer | null
}

export interface ContributingOrder {
  order_id: number
  model_name: string
  customer_name: string
  quantity: number
  grams_needed: number
  status: 'pending' | 'printing'
}

export interface ForecastItem {
  filament_spec: FilamentSpec
  demand_grams_per_week: number
  forecast_weeks: number
  total_demand_grams: number
  spoolman_stock_grams: number
  shortfall_grams: number
  status: 'ok' | 'low' | 'critical'
  contributing_orders: ContributingOrder[]
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

// --- Items ---
export const getItems = () => req<Item[]>('/items')
export const createItem = (data: Pick<Item, 'name' | 'description' | 'notes' | 'sku'>) =>
  req<Item>('/items', { method: 'POST', body: JSON.stringify(data) })
export const updateItem = (id: number, data: Pick<Item, 'name' | 'description' | 'notes' | 'sku' | 'stl_source_url' | 'use_advanced_routing'>) =>
  req<Item>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteItem = (id: number) =>
  req<void>(`/items/${id}`, { method: 'DELETE' })
export const addFilamentReq = (itemId: number, data: { filament_spec_id: number; grams: number }) =>
  req<ModelFilament>(`/items/${itemId}/filaments`, { method: 'POST', body: JSON.stringify(data) })
export const updateFilamentReq = (itemId: number, reqId: number, data: { grams: number; filament_spec_id: number }) =>
  req<ModelFilament>(`/items/${itemId}/filaments/${reqId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const reorderFilaments = (itemId: number, items: { id: number; sort_order: number }[]) =>
  req<void>(`/items/${itemId}/filaments/reorder`, { method: 'POST', body: JSON.stringify(items) })
export const removeFilamentReq = (itemId: number, reqId: number) =>
  req<void>(`/items/${itemId}/filaments/${reqId}`, { method: 'DELETE' })

export const uploadItemImage = async (itemId: number, file: File): Promise<ModelImage> => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/items/${itemId}/images`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}
export const copyThumbnailToItem = (itemId: number, printerId: number, thumbnailPath: string) =>
  req<ModelImage>(`/items/${itemId}/images/from-printer`, {
    method: 'POST',
    body: JSON.stringify({ printer_id: printerId, thumbnail_path: thumbnailPath }),
  })
export const deleteItemImage = (itemId: number, imageId: number) =>
  req<void>(`/items/${itemId}/images/${imageId}`, { method: 'DELETE' })
export const cropItemImage = (itemId: number, imageId: number, box: { x: number; y: number; width: number; height: number }) =>
  req<ModelImage>(`/items/${itemId}/images/${imageId}/crop`, { method: 'POST', body: JSON.stringify(box) })

export const setSlicerFile = (itemId: number, printerId: number, filePath: string) =>
  req<SlicerFile>(`/items/${itemId}/slicer-files/${printerId}`, { method: 'PUT', body: JSON.stringify({ file_path: filePath }) })
export const deleteSlicerFile = (itemId: number, printerId: number) =>
  req<void>(`/items/${itemId}/slicer-files/${printerId}`, { method: 'DELETE' })
export const openInSlicer = (itemId: number, printerId: number) =>
  req<void>(`/items/${itemId}/open-slicer/${printerId}`, { method: 'POST' })

// --- Routings ---
export const updateItemRouting = (itemId: number, data: { use_advanced_routing: boolean }) =>
  req<Item>(`/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) })
export const createRouting = (itemId: number, data: { name?: string; is_default?: boolean }) =>
  req<Routing>(`/items/${itemId}/routings`, { method: 'POST', body: JSON.stringify(data) })
export const updateRouting = (itemId: number, routingId: number, data: { name?: string; is_default?: boolean }) =>
  req<Routing>(`/items/${itemId}/routings/${routingId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRouting = (itemId: number, routingId: number) =>
  req<void>(`/items/${itemId}/routings/${routingId}`, { method: 'DELETE' })

export const createRoutingStep = (itemId: number, routingId: number, data: { description?: string; printer_type_id?: number | null; quantity_on_plate?: number }) =>
  req<RoutingStep>(`/items/${itemId}/routings/${routingId}/steps`, { method: 'POST', body: JSON.stringify(data) })
export const updateRoutingStep = (itemId: number, routingId: number, stepId: number, data: { description?: string; printer_type_id?: number | null; quantity_on_plate?: number }) =>
  req<RoutingStep>(`/items/${itemId}/routings/${routingId}/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRoutingStep = (itemId: number, routingId: number, stepId: number) =>
  req<void>(`/items/${itemId}/routings/${routingId}/steps/${stepId}`, { method: 'DELETE' })
export const reorderRoutingSteps = (itemId: number, routingId: number, items: { id: number; sort_order: number }[]) =>
  req<void>(`/items/${itemId}/routings/${routingId}/steps/reorder`, { method: 'POST', body: JSON.stringify(items) })

export const addRoutingStepFilament = (itemId: number, routingId: number, stepId: number, data: { filament_spec_id: number; grams: number }) =>
  req<RoutingStepFilament>(`/items/${itemId}/routings/${routingId}/steps/${stepId}/filaments`, { method: 'POST', body: JSON.stringify(data) })
export const updateRoutingStepFilament = (itemId: number, routingId: number, stepId: number, filId: number, data: { grams: number; filament_spec_id: number }) =>
  req<RoutingStepFilament>(`/items/${itemId}/routings/${routingId}/steps/${stepId}/filaments/${filId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRoutingStepFilament = (itemId: number, routingId: number, stepId: number, filId: number) =>
  req<void>(`/items/${itemId}/routings/${routingId}/steps/${stepId}/filaments/${filId}`, { method: 'DELETE' })

// --- Orders ---
export const getOrders = (status?: string) =>
  req<Order[]>(`/orders${status ? `?status=${status}` : ''}`)
export const createOrder = (data: {
  item_id?: number
  item_name?: string
  customer_id?: number | null
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
export const addTagToItem = (tagId: number, itemId: number) =>
  req<void>(`/tags/${tagId}/items/${itemId}`, { method: 'POST' })
export const removeTagFromItem = (tagId: number, itemId: number) =>
  req<void>(`/tags/${tagId}/items/${itemId}`, { method: 'DELETE' })

// --- Customers ---
export interface Customer {
  id: number
  given_name: string
  family_name: string
  company_name: string
  email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  notes: string
  category: string
  square_id: string | null
  display_name: string
  created_at: string
}

export type CustomerInput = Omit<Customer, 'id' | 'square_id' | 'display_name' | 'created_at'>

export interface SquarePreviewCustomer {
  given_name: string
  family_name: string
  company_name: string
  email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  notes: string
  square_id: string
  already_imported: boolean
}

export const getCustomers = () => req<Customer[]>('/customers')
export const createCustomer = (data: CustomerInput) =>
  req<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) })
export const updateCustomer = (id: number, data: CustomerInput) =>
  req<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteCustomer = (id: number) =>
  req<void>(`/customers/${id}`, { method: 'DELETE' })
export const getCustomerOrders = (id: number) =>
  req<Order[]>(`/customers/${id}/orders`)
export const squarePreview = () =>
  req<SquarePreviewCustomer[]>('/customers/square/preview')
export const squareImport = (square_ids: string[]) =>
  req<{ imported: number }>('/customers/square/import', { method: 'POST', body: JSON.stringify({ square_ids }) })
export const squareSync = () =>
  req<{ synced: number }>('/customers/square/sync', { method: 'POST' })

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
  multi_color_hexes: string | null
  multi_color_direction: string | null
  external_id: string | null
  article_number: string | null
  comment: string | null
  extra: Record<string, unknown>
  vendor?: SpoolmanVendor
}

export const getSpoolmanFilaments = () =>
  req<{ connected: boolean; filaments: SpoolmanFilament[]; error?: string }>('/spoolman/filaments')

export interface SpoolmanSpool {
  id: number
  remaining_weight: number | null
  used_weight: number | null
  archived: boolean
  location: string | null
  filament: {
    id: number
    name: string
    material: string
    color_hex: string | null
    vendor: { id: number; name: string } | null
    weight: number | null
  }
}

export const getSpoolmanStock = () =>
  req<{ connected: boolean; spools: SpoolmanSpool[]; error?: string }>('/spoolman/stock')

export const spoolmanBulkImport = (ids: number[]) =>
  req<{ imported: number }>('/spoolman/import', { method: 'POST', body: JSON.stringify({ ids }) })

export const spoolmanSync = () =>
  req<{ updated: number }>('/spoolman/sync', { method: 'POST' })

// --- Slicers ---
export interface Slicer {
  id: number
  name: string
  executable_path: string
  created_at: string
}

export const getSlicers = () => req<Slicer[]>('/slicers')
export const createSlicer = (data: { name: string; executable_path: string }) =>
  req<Slicer>('/slicers', { method: 'POST', body: JSON.stringify(data) })
export const updateSlicer = (id: number, data: { name?: string; executable_path?: string }) =>
  req<Slicer>(`/slicers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSlicer = (id: number) =>
  req<void>(`/slicers/${id}`, { method: 'DELETE' })

// --- Printer Types ---
export interface PrinterType {
  id: number
  name: string
  slicer_id: number | null
  slicer: Slicer | null
  slot_count: number
  created_at: string
}

export const getPrinterTypes = () => req<PrinterType[]>('/printer-types')
export const createPrinterType = (data: { name: string; slicer_id: number | null; slot_count: number }) =>
  req<PrinterType>('/printer-types', { method: 'POST', body: JSON.stringify(data) })
export const updatePrinterType = (id: number, data: { name?: string; slicer_id?: number | null; slot_count?: number }) =>
  req<PrinterType>(`/printer-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deletePrinterType = (id: number) =>
  req<void>(`/printer-types/${id}`, { method: 'DELETE' })

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
  printer_type_id: number | null
  printer_type: PrinterType | null
  slot_count_override: number | null
  effective_slot_count: number
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
export const updatePrinter = (id: number, data: { name?: string; url?: string }) =>
  req<Printer>(`/printers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deletePrinter = (id: number) =>
  req<void>(`/printers/${id}`, { method: 'DELETE' })
export const setPrinterSlicer = (id: number, data: { slicer_name: string | null; slicer_executable: string | null }) =>
  req<Printer>(`/printers/${id}/slicer`, { method: 'PUT', body: JSON.stringify(data) })
export const setPrinterType = (id: number, data: { printer_type_id: number | null; slot_count_override: number | null }) =>
  req<Printer>(`/printers/${id}/type`, { method: 'PATCH', body: JSON.stringify(data) })
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

// --- G-Code Repository ---
export interface GcodeFilesResult {
  files: string[]
  folder: string | null
  error: string | null
}
export const getGcodeFiles = (itemName: string, slicerName: string, printerTypeName: string) =>
  req<GcodeFilesResult>(`/gcode/files?item_name=${encodeURIComponent(itemName)}&slicer_name=${encodeURIComponent(slicerName)}&printer_type_name=${encodeURIComponent(printerTypeName)}`)
export const getGcodeRepoStatus = () =>
  req<{ configured: boolean; exists: boolean; root: string | null }>('/gcode/status')
export const scaffoldGcodeRepo = () =>
  req<{ created: string[]; skipped: string[]; error: string | null }>('/gcode/scaffold', { method: 'POST' })
export const sendGcodeToPrinter = (printerId: number, filePath: string, startPrint = false) =>
  req<{ ok: boolean; filename: string }>(`/printers/${printerId}/send-gcode`, {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, start_print: startPrint }),
  })
export interface GcodeFileMetadata {
  filament_weights: number[]
  filament_weight_total: number | null
  estimated_time: number | null
  error: string | null
}
export const getGcodeFileMetadata = (
  itemName: string, slicerName: string, printerTypeName: string, filename: string,
) => req<GcodeFileMetadata>(
  `/gcode/file-metadata?item_name=${encodeURIComponent(itemName)}&slicer_name=${encodeURIComponent(slicerName)}&printer_type_name=${encodeURIComponent(printerTypeName)}&filename=${encodeURIComponent(filename)}`,
)
export const checkGcodeItemFolders = (itemName: string) =>
  req<{ folders: string[] }>(`/gcode/item-folders?item_name=${encodeURIComponent(itemName)}`)
export const renameGcodeItemFolders = (oldName: string, newName: string) =>
  req<{ renamed: string[]; error: string | null }>('/gcode/rename-item-folders', {
    method: 'POST',
    body: JSON.stringify({ old_name: oldName, new_name: newName }),
  })

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
