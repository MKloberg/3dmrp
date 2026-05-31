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
  quality_rating: number | null
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
  printer_type_id: number
  file_path: string
}

export interface StepSlicerFile {
  id: number
  routing_step_id: number
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
  parts_per_item: number
  estimated_print_time: number | null
  include_in_planning: boolean
  gcode_file: string | null
  thumbnail_zoom: number | null
  thumbnail_offset_x: number | null
  thumbnail_offset_y: number | null
  filaments: RoutingStepFilament[]
  slicer_file: StepSlicerFile | null
}

export interface Routing {
  id: number
  item_id: number
  name: string
  is_default: boolean
  include_in_summary: boolean
  sort_order: number
  steps: RoutingStep[]
}

export interface PostProcessingCost {
  id: number
  item_id: number
  label: string
  cost_per_item: number
  sort_order: number
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
  post_processing_costs: PostProcessingCost[]
  msrp: number | null
}

export interface Order {
  id: number
  item_id: number
  customer_id: number | null
  quantity: number
  quantity_printed: number
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
  forecast_days: number
  total_demand_grams: number
  spoolman_stock_grams: number
  shortfall_grams: number
  status: 'ok' | 'low' | 'critical'
  contributing_orders: ContributingOrder[]
}

export interface ForecastResponse {
  forecast_days: number
  lookback_days: number
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
export const createItem = (data: Pick<Item, 'name' | 'description' | 'notes' | 'sku' | 'msrp'>) =>
  req<Item>('/items', { method: 'POST', body: JSON.stringify(data) })
export const updateItem = (id: number, data: Pick<Item, 'name' | 'description' | 'notes' | 'sku' | 'stl_source_url' | 'use_advanced_routing' | 'msrp'>) =>
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

export const createPostProcessingCost = (itemId: number, data: { label: string; cost_per_item: number }) =>
  req<PostProcessingCost>(`/items/${itemId}/post-processing`, { method: 'POST', body: JSON.stringify(data) })
export const updatePostProcessingCost = (itemId: number, costId: number, data: { label?: string; cost_per_item?: number }) =>
  req<PostProcessingCost>(`/items/${itemId}/post-processing/${costId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deletePostProcessingCost = (itemId: number, costId: number) =>
  req<void>(`/items/${itemId}/post-processing/${costId}`, { method: 'DELETE' })

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

export const setSlicerFile = (itemId: number, printerTypeId: number, filePath: string) =>
  req<SlicerFile>(`/items/${itemId}/slicer-files/${printerTypeId}`, { method: 'PUT', body: JSON.stringify({ file_path: filePath }) })
export const deleteSlicerFile = (itemId: number, printerTypeId: number) =>
  req<void>(`/items/${itemId}/slicer-files/${printerTypeId}`, { method: 'DELETE' })
export const openInSlicer = (itemId: number, printerTypeId: number) =>
  req<void>(`/items/${itemId}/open-slicer/${printerTypeId}`, { method: 'POST' })

export const setStepSlicerFile = (itemId: number, routingId: number, stepId: number, filePath: string) =>
  req<StepSlicerFile>(`/items/${itemId}/routings/${routingId}/steps/${stepId}/slicer-file`, { method: 'PUT', body: JSON.stringify({ file_path: filePath }) })
export const deleteStepSlicerFile = (itemId: number, routingId: number, stepId: number) =>
  req<void>(`/items/${itemId}/routings/${routingId}/steps/${stepId}/slicer-file`, { method: 'DELETE' })
export const openStepInSlicer = (itemId: number, routingId: number, stepId: number) =>
  req<void>(`/items/${itemId}/routings/${routingId}/steps/${stepId}/open-slicer`, { method: 'POST' })
export const pickModelFile = (currentPath?: string) =>
  req<{ path: string | null }>('/files/pick', {
    method: 'POST',
    body: JSON.stringify({ current_path: currentPath ?? null }),
  })

// --- Routings ---
export const updateItemRouting = (itemId: number, data: { use_advanced_routing: boolean }) =>
  req<Item>(`/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) })
export const createRouting = (itemId: number, data: { name?: string; is_default?: boolean }) =>
  req<Routing>(`/items/${itemId}/routings`, { method: 'POST', body: JSON.stringify(data) })
export const updateRouting = (itemId: number, routingId: number, data: { name?: string; is_default?: boolean; include_in_summary?: boolean }) =>
  req<Routing>(`/items/${itemId}/routings/${routingId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRouting = (itemId: number, routingId: number) =>
  req<void>(`/items/${itemId}/routings/${routingId}`, { method: 'DELETE' })

export const createRoutingStep = (itemId: number, routingId: number, data: { description?: string; printer_type_id?: number | null; quantity_on_plate?: number; parts_per_item?: number; estimated_print_time?: number | null }) =>
  req<RoutingStep>(`/items/${itemId}/routings/${routingId}/steps`, { method: 'POST', body: JSON.stringify(data) })
export const updateRoutingStep = (itemId: number, routingId: number, stepId: number, data: { description?: string; printer_type_id?: number | null; quantity_on_plate?: number; parts_per_item?: number; estimated_print_time?: number | null; include_in_planning?: boolean; gcode_file?: string | null; thumbnail_zoom?: number | null; thumbnail_offset_x?: number | null; thumbnail_offset_y?: number | null }) =>
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
export const getForecast = (forecastDays = 28, lookbackDays = 28) =>
  req<ForecastResponse>(`/forecast?forecast_days=${forecastDays}&lookback_days=${lookbackDays}`)

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
  name: string | null
  material: string | null
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
  remaining_length: number | null
  used_length: number | null
  archived: boolean
  price: number | null
  location: string | null
  lot_nr: string | null
  extra: { card_uids?: string } | null
  comment: string | null
  first_used: string | null
  last_used: string | null
  filament: {
    id: number
    name: string | null
    material: string | null
    color_hex: string | null
    multi_color_hexes: string | null
    comment: string | null
    vendor: { id: number; name: string } | null
    weight: number | null
    spool_weight: number | null
  }
}

export const getSpoolmanStock = () =>
  req<{ connected: boolean; spools: SpoolmanSpool[]; error?: string }>('/spoolman/stock')

export const spoolmanBulkImport = (ids: number[]) =>
  req<{ imported: number }>('/spoolman/import', { method: 'POST', body: JSON.stringify({ ids }) })

export const createSpoolmanSpools = (filamentId: number, count: number) =>
  req<{ spools: SpoolmanSpool[]; spoolman_url: string }>('/spoolman/create-spools', {
    method: 'POST',
    body: JSON.stringify({ filament_id: filamentId, count }),
  })

export const spoolmanSync = () =>
  req<{ updated: number }>('/spoolman/sync', { method: 'POST' })

export interface SpoolmanSlotAssignment {
  tool_index: number
  spool_id: number | null
}

export const deductSpoolman = (deductions: { spool_id: number; grams: number }[]) =>
  req<{ deducted: number; errors: { spool_id: number; error: string }[] }>(
    '/spoolman/deduct',
    { method: 'POST', body: JSON.stringify({ deductions }) },
  )

export const getPrinterSpoolmanSlots = (printerId: number, count: number) =>
  req<SpoolmanSlotAssignment[]>(`/printers/${printerId}/spoolman-slots?count=${count}`)

export const setPrinterSpoolmanSlots = (printerId: number, slots: SpoolmanSlotAssignment[]) =>
  req<{ ok: boolean; errors: { tool_index: number; error: string }[] }>(
    `/printers/${printerId}/spoolman-slots`,
    { method: 'POST', body: JSON.stringify({ slots }) },
  )

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
  hourly_rate: number | null
  power_watts: number | null
  has_afc: boolean
  has_nfc_detect: boolean
  has_mainsail_spoolman: boolean
  created_at: string
}

export interface PrinterCapabilityProbeResult {
  has_afc: boolean
  has_nfc_detect: boolean
  has_mainsail_spoolman: boolean
}

export interface PrinterCapabilityMismatch {
  capability: string
  expected: boolean
  actual: boolean
  message: string
}

export const getPrinterTypes = () => req<PrinterType[]>('/printer-types')
export const createPrinterType = (data: { name: string; slicer_id: number | null; slot_count: number; hourly_rate?: number | null; power_watts?: number | null; has_afc?: boolean; has_nfc_detect?: boolean; has_mainsail_spoolman?: boolean }) =>
  req<PrinterType>('/printer-types', { method: 'POST', body: JSON.stringify(data) })
export const updatePrinterType = (id: number, data: { name?: string; slicer_id?: number | null; slot_count?: number; hourly_rate?: number | null; power_watts?: number | null; has_afc?: boolean; has_nfc_detect?: boolean; has_mainsail_spoolman?: boolean }) =>
  req<PrinterType>(`/printer-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deletePrinterType = (id: number) =>
  req<void>(`/printer-types/${id}`, { method: 'DELETE' })
export const probePrinterType = (typeId: number, printerId?: number, probeUrl?: string) => {
  const params = new URLSearchParams()
  if (printerId != null) params.set('printer_id', String(printerId))
  if (probeUrl) params.set('probe_url', probeUrl)
  return req<PrinterCapabilityProbeResult>(`/printer-types/${typeId}/probe?${params}`, { method: 'POST' })
}
export const getPrinterCapabilitiesCheck = (printerId: number) =>
  req<PrinterCapabilityMismatch[]>(`/printers/${printerId}/capabilities-check`)

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
  active_extruder: string | null
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
export const getPrinterByName = (name: string) => req<Printer>(`/printers/by-name/${encodeURIComponent(name)}`)
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
  filament_present: boolean | null
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
export const getMailsailSpoolman = (id: number) =>
  req<{ configured: boolean | null; server_url: string | null }>(`/printers/${id}/mainsail-spoolman`)
export const getPrinterHistory = (id: number, limit = 50) =>
  req<PrinterHistoryResponse>(`/printers/${id}/history?limit=${limit}`)

export interface PrinterHistoryTotals {
  total_jobs: number
  total_print_time: number
  total_filament_used: number
  longest_print: number
}

export interface PrinterJobCounts {
  completed: number
  cancelled: number
  error: number
  unexpected: number
}

export interface PrinterExtruderStat {
  name: string
  index: number
  switch_count: number
  error_count: number
  retry_count: number
}

export interface PrinterStats {
  history: PrinterHistoryTotals | null
  job_counts: PrinterJobCounts | null
  extruders: PrinterExtruderStat[]
}

export const getPrinterStats = (id: number) =>
  req<PrinterStats>(`/printers/${id}/stats`)

export interface AfcLane {
  name: string
  map: string
  extruder: string
  color: string
  material: string
  weight: number
  status: string
  tool_loaded: boolean
  loaded_to_hub: boolean
  spool_id: number
}

export interface AfcLanesResponse {
  lanes: AfcLane[]
}

export const getPrinterAfcLanes = (id: number) =>
  req<AfcLanesResponse>(`/printers/${id}/afc-lanes`)
export const sendAfcCommand = (id: number, gcode: string) =>
  req<{ ok: boolean }>(`/printers/${id}/afc-command`, { method: 'POST', body: JSON.stringify({ gcode }) })
export const checkScreencastAvailable = (id: number) =>
  req<{ available: boolean }>(`/printers/${id}/screencast/available`)
export const sendScreencastTouch = (id: number, a: string, x: number, y: number) =>
  req<{ ok: boolean }>(`/printers/${id}/screencast/touch`, {
    method: 'POST',
    body: JSON.stringify({ a, x, y }),
  })
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
export const sendGcodeToPrinter = (
  printerId: number,
  filePath: string,
  startPrint = false,
  ctx?: { item_id?: number; routing_step_id?: number; order_id?: number },
) =>
  req<{ ok: boolean; filename: string }>(`/printers/${printerId}/send-gcode`, {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, start_print: startPrint, ...ctx }),
  })

export const adjustQuantityPrinted = (orderId: number, delta: number, force = false) =>
  req<Order | { warning: true }>(`/orders/${orderId}/quantity-printed`, {
    method: 'PATCH',
    body: JSON.stringify({ delta, force }),
  })
export interface GcodeSlotInfo {
  color_hex: string | null
  material: string | null
  brand: string | null
  preset_name: string | null
}
export interface GcodeFileMetadata {
  filament_weights: number[]
  filament_slots: GcodeSlotInfo[]
  filament_weight_total: number | null
  estimated_time: number | null
  has_exclude_objects: boolean
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

// --- Print Jobs ---
export interface PrintJobReport {
  id: number
  printer_id: number
  printer_name: string
  printer_url: string
  moonraker_job_id: string | null
  filename: string
  status: string
  quantity_credited: number
  order_id: number | null
  order_customer: string | null
  item_id: number | null
  item_name: string | null
  routing_step_id: number | null
  step_description: string | null
  quantity_on_plate: number | null
  start_time: string | null
  end_time: string | null
  created_at: string | null
}

export const getPrintJobs = () => req<PrintJobReport[]>('/print-jobs')

export interface OrderStepProgressReport {
  id: number
  order_id: number
  order_customer: string | null
  order_status: string
  order_quantity: number
  order_quantity_printed: number
  item_id: number | null
  item_name: string | null
  routing_step_id: number
  step_description: string
  parts_per_item: number
  quantity_on_plate: number
  parts_printed: number
  items_complete: number
}

export const getOrderStepProgress = () => req<OrderStepProgressReport[]>('/order-step-progress')

// --- Settings ---
export const getSettings = () => req<Record<string, string>>('/settings')
export const setSetting = (key: string, value: string) =>
  req<Record<string, string>>(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) })
export const testSpoolman = (url: string) =>
  req<{ connected: boolean; version?: string; error?: string }>('/settings/spoolman/test', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })

// --- NFC Sessions ---
export interface NfcSession {
  status: 'pending' | 'tag_a_done' | 'completed'
  spool_id: number
  spool_label: string
  slot: string
  mode: string
  filament_type: string | null
  color_hex: string | null
  brand: string | null
  subtype: string | null
  min_temp: number | null
  max_temp: number | null
  bed_temp: number | null
  card_uid: string | null
  wrote_tag: boolean | null
  card_uid_b: string | null
  wrote_tag_b: boolean | null
}

export interface CreateNfcSessionData {
  spool_id: number
  spool_label: string
  slot: string
  mode: string
  filament_type?: string
  color_hex?: string
  brand?: string
  subtype?: string
  min_temp?: number
  max_temp?: number
  bed_temp?: number
}

export const createNfcSession = (data: CreateNfcSessionData) =>
  req<{ token: string; expires_at: number }>('/nfc-sessions', { method: 'POST', body: JSON.stringify(data) })

export const getNfcSession = (token: string) =>
  req<NfcSession>(`/nfc-sessions/${token}`)

export const postNfcTagA = (token: string, result: { card_uid: string; wrote_tag: boolean }) =>
  req<{ ok: boolean }>(`/nfc-sessions/${token}/tag-a`, { method: 'POST', body: JSON.stringify(result) })

export const postNfcResult = (token: string, result: { card_uid: string; wrote_tag: boolean; card_uid_b?: string; wrote_tag_b?: boolean }) =>
  req<{ ok: boolean }>(`/nfc-sessions/${token}/result`, { method: 'POST', body: JSON.stringify(result) })

// --- Spoolman Wizard Extensions ---
export interface CreateFilamentData {
  name: string
  material: string
  color_hex?: string
  vendor_name?: string
  weight?: number
  spool_weight?: number
  diameter?: number
  density?: number
  price?: number
  settings_extruder_temp?: number
  settings_bed_temp?: number
  article_number?: string
}

export interface ParsedFilamentSpec {
  name?: string | null
  material?: string | null
  brand?: string | null
  color_hex?: string | null
  diameter?: number | null
  weight?: number | null
  spool_weight?: number | null
  extruder_temp?: number | null
  bed_temp?: number | null
  price?: number | null
  asin?: string | null
  density?: number | null
}

export const parseFilamentListing = (text: string) =>
  req<ParsedFilamentSpec>('/tools/parse-filament', { method: 'POST', body: JSON.stringify({ text }) })

export const createSpoolmanFilament = (data: CreateFilamentData) =>
  req<SpoolmanFilament>('/spoolman/filaments', { method: 'POST', body: JSON.stringify(data) })

export const createSpoolmanSpoolsWizard = (data: { filament_id: number; count: number; price?: number; location?: string; comment?: string }) =>
  req<{ spools: SpoolmanSpool[]; spoolman_url: string }>('/spoolman/create-spools-wizard', {
    method: 'POST',
    body: JSON.stringify(data),
  })

// Spoolman stores extra field values as JSON-encoded strings; decode before display.
export function getSpoolCardUid(spool: SpoolmanSpool): string | null {
  const raw = spool.extra?.card_uids
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return raw }
}

export const patchSpoolmanCardUid = (spoolId: number, cardUids: string[]) =>
  req<{ id: number }>(`/spoolman/spools/${spoolId}/card-uid`, {
    method: 'PATCH',
    body: JSON.stringify({ card_uids: cardUids }),
  })

export const getSpoolmanLocationOptions = () =>
  req<{ locations: string[]; storage_locations: string[] }>('/spoolman/location-options')

export const patchSpoolmanLocation = (spoolId: number, location: string | null) =>
  req<{ id: number }>(`/spoolman/spools/${spoolId}/location`, {
    method: 'PATCH',
    body: JSON.stringify({ location }),
  })

export const patchSpoolmanRemainingWeight = (spoolId: number, remainingWeight: number) =>
  req<{ id: number }>(`/spoolman/spools/${spoolId}/remaining-weight`, {
    method: 'PATCH',
    body: JSON.stringify({ remaining_weight: remainingWeight }),
  })

export const getSpoolWeighLog = () =>
  req<{ log: Record<number, string> }>('/spoolman/weigh-log')

export const patchSpoolmanFilamentSpoolWeight = (filamentId: number, spoolWeight: number) =>
  req<{ id: number }>(`/spoolman/filaments/${filamentId}/spool-weight`, {
    method: 'PATCH',
    body: JSON.stringify({ spool_weight: spoolWeight }),
  })

export const cloneSpoolmanSpool = (source: SpoolmanSpool) =>
  req<SpoolmanSpool>('/spoolman/clone-spool', {
    method: 'POST',
    body: JSON.stringify({
      filament_id: source.filament.id,
      price: source.price ?? null,
      location: source.location ?? null,
      comment: source.comment ?? null,
    }),
  })

// --- Mobile Session (WebSocket) ---
export interface MobileNfcWriteTask {
  type: 'task'
  task_type: 'nfc_write'
  nfc_token: string
}

export interface MobilePrintLabelTask { type: 'task'; task_type: 'print_label'; spool_id: number }
export type MobileTask = MobileNfcWriteTask | MobilePrintLabelTask

export interface MobileTaskResult {
  type: 'task_result'
  task_type: string
  success: boolean
  card_uid?: string
  card_uid_b?: string
}

export const createMobileSession = () =>
  req<{ token: string }>('/mobile/sessions', { method: 'POST' })

export async function restoreDatabase(file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/settings/restore`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
}
