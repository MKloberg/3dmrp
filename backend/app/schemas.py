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


class PrintModelBase(BaseModel):
    name: str
    description: str = ""
    notes: str = ""


class PrintModelCreate(PrintModelBase):
    pass


class SlicerFileOut(BaseModel):
    id: int
    printer_id: int
    file_path: str

    model_config = {"from_attributes": True}


class SlicerFileSet(BaseModel):
    file_path: str


class PrintModelOut(PrintModelBase):
    id: int
    created_at: datetime
    filament_requirements: List[ModelFilamentOut] = []
    images: List[ModelImageOut] = []
    slicer_files: List[SlicerFileOut] = []
    tags: List[TagOut] = []

    model_config = {"from_attributes": True}


class OrderBase(BaseModel):
    print_model_id: int
    quantity: int = 1
    customer_name: str = ""
    customer_notes: str = ""
    date_needed: Optional[datetime] = None


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    quantity: Optional[int] = None
    customer_name: Optional[str] = None
    customer_notes: Optional[str] = None
    date_needed: Optional[datetime] = None
    status: Optional[OrderStatus] = None


class OrderOut(OrderBase):
    id: int
    date_ordered: datetime
    status: OrderStatus
    print_model: PrintModelOut

    model_config = {"from_attributes": True}


class PrinterBase(BaseModel):
    name: str
    url: str


class PrinterCreate(PrinterBase):
    pass


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


class ForecastItem(BaseModel):
    filament_spec: FilamentSpecOut
    demand_grams_per_week: float
    forecast_weeks: int
    total_demand_grams: float
    spoolman_stock_grams: float
    shortfall_grams: float
    status: str  # "ok", "low", "critical"


class ForecastResponse(BaseModel):
    forecast_weeks: int
    lookback_weeks: int
    items: List[ForecastItem]
    spoolman_url: Optional[str]
    spoolman_connected: bool
