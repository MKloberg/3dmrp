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


class RoutingStepUpdate(BaseModel):
    description: Optional[str] = None
    printer_type_id: Optional[int] = None
    quantity_on_plate: Optional[int] = None


class RoutingStepReorderItem(BaseModel):
    id: int
    sort_order: int


class RoutingStepOut(BaseModel):
    id: int
    routing_id: int
    sort_order: int
    description: str
    printer_type_id: Optional[int] = None
    quantity_on_plate: int
    filaments: List[RoutingStepFilamentOut] = []

    model_config = {"from_attributes": True}


class RoutingCreate(BaseModel):
    name: str = ""
    is_default: bool = False


class RoutingUpdate(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None


class RoutingOut(BaseModel):
    id: int
    item_id: int
    name: str
    is_default: bool
    sort_order: int
    steps: List[RoutingStepOut] = []

    model_config = {"from_attributes": True}


class ItemBase(BaseModel):
    name: str
    sku: str = ""
    description: str = ""
    notes: str = ""
    use_advanced_routing: bool = False


class ItemCreate(ItemBase):
    pass


class SlicerFileOut(BaseModel):
    id: int
    printer_id: int
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


class OrderOut(OrderBase):
    id: int
    customer_id: Optional[int] = None
    date_ordered: datetime
    status: OrderStatus
    item: ItemOut
    customer: Optional[CustomerOut] = None

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


class PrinterTypeCreate(PrinterTypeBase):
    pass


class PrinterTypeUpdate(BaseModel):
    name: Optional[str] = None
    slicer_id: Optional[int] = None
    slot_count: Optional[int] = None


class PrinterTypeOut(PrinterTypeBase):
    id: int
    slicer: Optional[SlicerOut] = None
    created_at: datetime

    model_config = {"from_attributes": True}


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
    vendor: str
    material: str
    sub_type: str
    color_hex: str
    suggested_filament_spec_id: Optional[int] = None


class ContributingOrder(BaseModel):
    order_id: int
    model_name: str
    customer_name: str
    quantity: int
    grams_needed: float
    status: str  # "pending" or "printing"


class ForecastItem(BaseModel):
    filament_spec: FilamentSpecOut
    demand_grams_per_week: float
    forecast_weeks: int
    total_demand_grams: float
    spoolman_stock_grams: float
    shortfall_grams: float
    status: str  # "ok", "low", "critical"
    contributing_orders: List[ContributingOrder] = []


class ForecastResponse(BaseModel):
    forecast_weeks: int
    lookback_weeks: int
    items: List[ForecastItem]
    spoolman_url: Optional[str]
    spoolman_connected: bool
