from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from .models import OrderStatus


class FilamentSpecBase(BaseModel):
    material: str
    color_name: str
    color_hex: str = "#888888"
    brand: str = ""
    price: Optional[float] = None
    density: Optional[float] = None
    diameter: Optional[float] = None
    weight: Optional[float] = None
    spool_weight: Optional[float] = None
    settings_extruder_temp: Optional[int] = None
    settings_bed_temp: Optional[int] = None
    article_number: str = ""
    comment: str = ""
    external_id: str = ""
    extra: Optional[dict] = None
    spoolman_id: Optional[int] = None
    purchase_url: str = ""
    quality_rating: Optional[int] = None


class FilamentSpecCreate(FilamentSpecBase):
    pass


class FilamentSpecOut(FilamentSpecBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TagOut(BaseModel):
    id: int
    name: str
    color_hex: str

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    name: str
    color_hex: str = "#6366f1"


class ModelFilamentBase(BaseModel):
    filament_spec_id: int
    grams: float


class ModelFilamentCreate(ModelFilamentBase):
    pass


class ModelFilamentUpdate(BaseModel):
    grams: float
    filament_spec_id: int


class ModelFilamentOut(ModelFilamentBase):
    id: int
    sort_order: int = 0
    filament_spec: FilamentSpecOut

    model_config = {"from_attributes": True}


class FilamentReorderItem(BaseModel):
    id: int
    sort_order: int


class ModelImageOut(BaseModel):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ModelImageFromPrinter(BaseModel):
    printer_id: int
    thumbnail_path: str


class ImageCropBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class RoutingStepFilamentCreate(BaseModel):
    filament_spec_id: int
    grams: float


class RoutingStepFilamentUpdate(BaseModel):
    grams: float
    filament_spec_id: int


class RoutingStepFilamentOut(RoutingStepFilamentCreate):
    id: int
    filament_spec: FilamentSpecOut

    model_config = {"from_attributes": True}


class RoutingStepCreate(BaseModel):
    description: str = ""
    printer_type_id: Optional[int] = None
    quantity_on_plate: int = 1
    parts_per_item: int = 1
    estimated_print_time: Optional[int] = None
    include_in_planning: bool = True


class RoutingStepUpdate(BaseModel):
    description: Optional[str] = None
    printer_type_id: Optional[int] = None
    quantity_on_plate: Optional[int] = None
    parts_per_item: Optional[int] = None
    estimated_print_time: Optional[int] = None
    include_in_planning: Optional[bool] = None
    gcode_file: Optional[str] = None
    thumbnail_zoom: Optional[int] = None
    thumbnail_offset_x: Optional[int] = None
    thumbnail_offset_y: Optional[int] = None


class RoutingStepReorderItem(BaseModel):
    id: int
    sort_order: int


class StepSlicerFileOut(BaseModel):
    id: int
    routing_step_id: int
    file_path: str

    model_config = {"from_attributes": True}


class StepSlicerOut(BaseModel):
    name: str

    model_config = {"from_attributes": True}


class StepPrinterTypeOut(BaseModel):
    id: int
    name: str
    slicer: Optional[StepSlicerOut] = None

    model_config = {"from_attributes": True}


class RoutingStepOut(BaseModel):
    id: int
    routing_id: int
    sort_order: int
    description: str
    printer_type_id: Optional[int] = None
    printer_type: Optional[StepPrinterTypeOut] = None
    quantity_on_plate: int
    parts_per_item: int = 1
    estimated_print_time: Optional[int] = None
    include_in_planning: bool = True
    filaments: List[RoutingStepFilamentOut] = []
    slicer_file: Optional[StepSlicerFileOut] = None
    gcode_file: Optional[str] = None
    thumbnail_zoom: Optional[int] = None
    thumbnail_offset_x: Optional[int] = None
    thumbnail_offset_y: Optional[int] = None

    model_config = {"from_attributes": True}


class RoutingCreate(BaseModel):
    name: str = ""
    is_default: bool = False
    include_in_summary: bool = True


class RoutingUpdate(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None
    include_in_summary: Optional[bool] = None


class RoutingOut(BaseModel):
    id: int
    item_id: int
    name: str
    is_default: bool
    include_in_summary: bool = True
    sort_order: int
    steps: List[RoutingStepOut] = []

    model_config = {"from_attributes": True}


class PostProcessingCostCreate(BaseModel):
    label: str
    cost_per_item: float = 0.0


class PostProcessingCostUpdate(BaseModel):
    label: Optional[str] = None
    cost_per_item: Optional[float] = None


class PostProcessingCostOut(PostProcessingCostCreate):
    id: int
    item_id: int
    sort_order: int = 0

    model_config = {"from_attributes": True}


class ItemBase(BaseModel):
    name: str
    sku: str = ""
    description: str = ""
    notes: str = ""
    stl_source_url: str = ""
    use_advanced_routing: bool = False
    msrp: Optional[float] = None


class ItemCreate(ItemBase):
    pass


class SlicerFileOut(BaseModel):
    id: int
    printer_type_id: int
    file_path: str

    model_config = {"from_attributes": True}


class SlicerFileSet(BaseModel):
    file_path: str


class ItemOut(ItemBase):
    id: int
    created_at: datetime
    filament_requirements: List[ModelFilamentOut] = []
    images: List[ModelImageOut] = []
    slicer_files: List[SlicerFileOut] = []
    tags: List[TagOut] = []
    routings: List[RoutingOut] = []
    post_processing_costs: List[PostProcessingCostOut] = []

    model_config = {"from_attributes": True}


class CustomerOrderItemOut(BaseModel):
    id: int
    name: str
    images: List[ModelImageOut] = []

    model_config = {"from_attributes": True}


class CustomerOrderOut(BaseModel):
    id: int
    item_id: int
    customer_id: Optional[int] = None
    quantity: int
    customer_name: str = ""
    customer_notes: str = ""
    date_ordered: datetime
    date_needed: Optional[datetime] = None
    status: OrderStatus
    item: Optional[CustomerOrderItemOut] = None

    model_config = {"from_attributes": True}


class CustomerBase(BaseModel):
    given_name: str = ""
    family_name: str = ""
    company_name: str = ""
    email: str = ""
    phone: str = ""
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    state: str = ""
    postal_code: str = ""
    country: str = ""
    notes: str = ""
    category: str = ""


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(CustomerBase):
    pass


class CustomerOut(CustomerBase):
    id: int
    square_id: Optional[str] = None
    display_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderBase(BaseModel):
    item_id: int
    quantity: int = 1
    customer_name: str = ""
    customer_notes: str = ""
    date_needed: Optional[datetime] = None


class OrderCreate(BaseModel):
    item_id: Optional[int] = None
    item_name: Optional[str] = None
    customer_id: Optional[int] = None
    quantity: int = 1
    customer_name: str = ""
    customer_notes: str = ""
    date_needed: Optional[datetime] = None


class OrderUpdate(BaseModel):
    quantity: Optional[int] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_notes: Optional[str] = None
    date_needed: Optional[datetime] = None
    status: Optional[OrderStatus] = None


class StepProgressOut(BaseModel):
    id: int
    routing_step_id: int
    parts_printed: int

    model_config = {"from_attributes": True}


class OrderOut(OrderBase):
    id: int
    customer_id: Optional[int] = None
    quantity_printed: int = 0
    date_ordered: datetime
    status: OrderStatus
    item: ItemOut
    customer: Optional[CustomerOut] = None
    step_progress: List[StepProgressOut] = []

    model_config = {"from_attributes": True}


class PrintJobOut(BaseModel):
    id: int
    order_id: Optional[int] = None
    item_id: Optional[int] = None
    routing_step_id: Optional[int] = None
    printer_id: int
    moonraker_job_id: Optional[str] = None
    filename: str
    status: str
    quantity_credited: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SlicerBase(BaseModel):
    name: str
    executable_path: str = ""


class SlicerCreate(SlicerBase):
    pass


class SlicerUpdate(BaseModel):
    name: Optional[str] = None
    executable_path: Optional[str] = None


class SlicerOut(SlicerBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PrinterTypeBase(BaseModel):
    name: str
    slicer_id: Optional[int] = None
    slot_count: int = 1
    hourly_rate: Optional[float] = None
    power_watts: Optional[float] = None
    has_afc: bool = False
    has_nfc_detect: bool = False
    has_mainsail_spoolman: bool = False


class PrinterTypeCreate(PrinterTypeBase):
    pass


class PrinterTypeUpdate(BaseModel):
    name: Optional[str] = None
    slicer_id: Optional[int] = None
    slot_count: Optional[int] = None
    hourly_rate: Optional[float] = None
    power_watts: Optional[float] = None
    has_afc: Optional[bool] = None
    has_nfc_detect: Optional[bool] = None
    has_mainsail_spoolman: Optional[bool] = None


class PrinterTypeOut(PrinterTypeBase):
    id: int
    slicer: Optional[SlicerOut] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PrinterCapabilityProbeResult(BaseModel):
    has_afc: bool
    has_nfc_detect: bool
    has_mainsail_spoolman: bool


class PrinterCapabilityMismatch(BaseModel):
    capability: str
    expected: bool
    actual: bool
    message: str


class PrinterBase(BaseModel):
    name: str
    url: str
    printer_type_id: Optional[int] = None
    slot_count_override: Optional[int] = None


class PrinterCreate(PrinterBase):
    pass


class PrinterUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None


class PrinterSlotOut(BaseModel):
    id: int
    slot_number: int
    filament_spec_id: Optional[int] = None
    filament_spec: Optional[FilamentSpecOut] = None

    model_config = {"from_attributes": True}


class PrinterSlotSet(BaseModel):
    filament_spec_id: Optional[int] = None


class PrinterSlicerConfig(BaseModel):
    slicer_name: Optional[str] = None
    slicer_executable: Optional[str] = None


class PrinterOut(PrinterBase):
    id: int
    created_at: datetime
    has_image: bool = False
    slicer_name: Optional[str] = None
    slicer_executable: Optional[str] = None
    printer_type: Optional[PrinterTypeOut] = None
    effective_slot_count: int = 1
    slots: List[PrinterSlotOut] = []

    model_config = {"from_attributes": True}


class WebcamInfo(BaseModel):
    name: str
    stream_url: str
    snapshot_url: str
    flip_horizontal: bool = False
    flip_vertical: bool = False
    rotation: int = 0


class PrinterStatus(BaseModel):
    state: str  # standby, printing, paused, error, complete, offline
    filename: Optional[str] = None
    progress: Optional[float] = None
    print_duration: Optional[float] = None
    time_remaining: Optional[float] = None
    extruder_temp: Optional[float] = None
    extruder_target: Optional[float] = None
    bed_temp: Optional[float] = None
    bed_target: Optional[float] = None
    active_extruder: Optional[str] = None


class MoonrakerJob(BaseModel):
    job_id: str
    filename: str
    status: str
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    print_duration: Optional[float] = None
    filament_used: Optional[float] = None
    thumbnail_path: Optional[str] = None


class PrinterHistoryResponse(BaseModel):
    count: int
    jobs: List[MoonrakerJob]


class FilamentDetectSlot(BaseModel):
    slot_index: int
    detected: bool
    filament_present: Optional[bool] = None
    vendor: str
    material: str
    sub_type: str
    color_hex: str
    suggested_filament_spec_id: Optional[int] = None


class ContributingOrder(BaseModel):
    model_config = {"protected_namespaces": ()}

    order_id: int
    model_name: str
    customer_name: str
    quantity: int
    grams_needed: float
    status: str  # "pending" or "printing"


class ForecastItem(BaseModel):
    filament_spec: FilamentSpecOut
    demand_grams_per_week: float
    forecast_days: int
    total_demand_grams: float
    spoolman_stock_grams: float
    shortfall_grams: float
    status: str  # "ok", "low", "critical"
    contributing_orders: List[ContributingOrder] = []


class ForecastResponse(BaseModel):
    forecast_days: int
    lookback_days: int
    items: List[ForecastItem]
    spoolman_url: Optional[str]
    spoolman_connected: bool
