from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, Text, UniqueConstraint, Table, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON
import enum

from .database import Base


model_tags = Table(
    "model_tags",
    Base.metadata,
    Column("model_id", Integer, ForeignKey("items.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    color_hex = Column(String, nullable=False, default="#6366f1")

    items = relationship("Item", secondary="model_tags", back_populates="tags")


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, default="")


class OrderStatus(str, enum.Enum):
    pending = "pending"
    printing = "printing"
    complete = "complete"
    cancelled = "cancelled"


class FilamentSpec(Base):
    __tablename__ = "filament_specs"

    id = Column(Integer, primary_key=True, index=True)
    material = Column(String, nullable=False)
    color_name = Column(String, nullable=False)
    color_hex = Column(String, default="#888888")
    brand = Column(String, default="")
    # Extended Spoolman fields
    price = Column(Float, nullable=True)
    density = Column(Float, nullable=True)
    diameter = Column(Float, nullable=True)
    weight = Column(Float, nullable=True)          # nominal filament weight (g)
    spool_weight = Column(Float, nullable=True)    # empty spool weight (g)
    settings_extruder_temp = Column(Integer, nullable=True)
    settings_bed_temp = Column(Integer, nullable=True)
    article_number = Column(String, default="")
    comment = Column(Text, default="")
    external_id = Column(String, default="")
    extra = Column(JSON, default=dict)             # custom Spoolman extra fields
    spoolman_id = Column(Integer, nullable=True, index=True)
    purchase_url = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    model_filaments = relationship("ModelFilament", back_populates="filament_spec", cascade="all, delete-orphan")


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    sku = Column(String, default="")
    description = Column(String, default="")
    notes = Column(String, default="")
    stl_source_url = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    use_advanced_routing = Column(Boolean, nullable=False, default=False)

    filament_requirements = relationship("ModelFilament", back_populates="item", cascade="all, delete-orphan", order_by="ModelFilament.sort_order")
    images = relationship("ModelImage", back_populates="item", cascade="all, delete-orphan", order_by="ModelImage.created_at")
    slicer_files = relationship("ModelSlicerFile", back_populates="item", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="item")
    tags = relationship("Tag", secondary="model_tags", back_populates="items", order_by="Tag.name")
    routings = relationship("Routing", back_populates="item", cascade="all, delete-orphan", order_by="Routing.sort_order")
    post_processing_costs = relationship("PostProcessingCost", back_populates="item", cascade="all, delete-orphan", order_by="PostProcessingCost.sort_order")


class ModelFilament(Base):
    __tablename__ = "model_filaments"

    id = Column(Integer, primary_key=True, index=True)
    print_model_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    filament_spec_id = Column(Integer, ForeignKey("filament_specs.id"), nullable=False)
    grams = Column(Float, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    item = relationship("Item", back_populates="filament_requirements")
    filament_spec = relationship("FilamentSpec", back_populates="model_filaments")


class ModelImage(Base):
    __tablename__ = "model_images"

    id = Column(Integer, primary_key=True, index=True)
    print_model_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    image_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    item = relationship("Item", back_populates="images")


class ModelSlicerFile(Base):
    __tablename__ = "model_slicer_files"

    id = Column(Integer, primary_key=True, index=True)
    print_model_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    printer_id = Column(Integer, ForeignKey("printers.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String, nullable=False)

    item = relationship("Item", back_populates="slicer_files")
    printer = relationship("Printer")

    __table_args__ = (UniqueConstraint("print_model_id", "printer_id", name="uq_model_printer_slicer"),)


class Slicer(Base):
    __tablename__ = "slicers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    executable_path = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    printer_types = relationship("PrinterType", back_populates="slicer")


class PrinterType(Base):
    __tablename__ = "printer_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    slicer_id = Column(Integer, ForeignKey("slicers.id", ondelete="SET NULL"), nullable=True)
    slot_count = Column(Integer, nullable=False, default=1)
    hourly_rate = Column(Float, nullable=True)
    power_watts = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    slicer = relationship("Slicer", back_populates="printer_types")
    printers = relationship("Printer", back_populates="printer_type")


class Printer(Base):
    __tablename__ = "printers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    image_path = Column(String, nullable=True)
    slicer_name = Column(String, nullable=True)
    slicer_executable = Column(String, nullable=True)
    printer_type_id = Column(Integer, ForeignKey("printer_types.id", ondelete="SET NULL"), nullable=True)
    slot_count_override = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    printer_type = relationship("PrinterType", back_populates="printers")
    slots = relationship(
        "PrinterSlot", back_populates="printer",
        cascade="all, delete-orphan",
        order_by="PrinterSlot.slot_number",
    )

    @property
    def has_image(self) -> bool:
        return self.image_path is not None

    @property
    def effective_slot_count(self) -> int:
        if self.slot_count_override is not None:
            return self.slot_count_override
        if self.printer_type is not None:
            return self.printer_type.slot_count
        return len(self.slots) or 1


class PrinterSlot(Base):
    __tablename__ = "printer_slots"

    id = Column(Integer, primary_key=True, index=True)
    printer_id = Column(Integer, ForeignKey("printers.id", ondelete="CASCADE"), nullable=False)
    slot_number = Column(Integer, nullable=False)
    filament_spec_id = Column(Integer, ForeignKey("filament_specs.id", ondelete="SET NULL"), nullable=True)

    printer = relationship("Printer", back_populates="slots")
    filament_spec = relationship("FilamentSpec")

    __table_args__ = (UniqueConstraint("printer_id", "slot_number", name="uq_printer_slot"),)


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    given_name = Column(String, default="")
    family_name = Column(String, default="")
    company_name = Column(String, default="")
    email = Column(String, default="")
    phone = Column(String, default="")
    address_line1 = Column(String, default="")
    address_line2 = Column(String, default="")
    city = Column(String, default="")
    state = Column(String, default="")
    postal_code = Column(String, default="")
    country = Column(String, default="")
    notes = Column(Text, default="")
    category = Column(String, default="")
    square_id = Column(String, nullable=True, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    orders = relationship("Order", back_populates="customer")

    @property
    def display_name(self) -> str:
        parts = [self.given_name, self.family_name]
        full = " ".join(p for p in parts if p).strip()
        return full or self.company_name or "—"


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    customer_name = Column(String, default="")
    customer_notes = Column(String, default="")
    date_ordered = Column(DateTime, default=datetime.utcnow)
    date_needed = Column(DateTime, nullable=True)
    status = Column(Enum(OrderStatus), default=OrderStatus.pending)

    item = relationship("Item", back_populates="orders")
    customer = relationship("Customer", back_populates="orders")


class Routing(Base):
    __tablename__ = "routings"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False, default="")
    is_default = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    item = relationship("Item", back_populates="routings")
    steps = relationship("RoutingStep", back_populates="routing", cascade="all, delete-orphan", order_by="RoutingStep.sort_order")


class RoutingStep(Base):
    __tablename__ = "routing_steps"

    id = Column(Integer, primary_key=True, index=True)
    routing_id = Column(Integer, ForeignKey("routings.id", ondelete="CASCADE"), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    description = Column(String, nullable=False, default="")
    printer_type_id = Column(Integer, ForeignKey("printer_types.id", ondelete="SET NULL"), nullable=True)
    quantity_on_plate = Column(Integer, nullable=False, default=1)
    parts_per_item = Column(Integer, nullable=False, default=1)
    estimated_print_time = Column(Integer, nullable=True)  # seconds

    routing = relationship("Routing", back_populates="steps")
    printer_type = relationship("PrinterType")
    filaments = relationship("RoutingStepFilament", back_populates="step", cascade="all, delete-orphan", order_by="RoutingStepFilament.id")


class RoutingStepFilament(Base):
    __tablename__ = "routing_step_filaments"

    id = Column(Integer, primary_key=True, index=True)
    routing_step_id = Column(Integer, ForeignKey("routing_steps.id", ondelete="CASCADE"), nullable=False)
    filament_spec_id = Column(Integer, ForeignKey("filament_specs.id", ondelete="CASCADE"), nullable=False)
    grams = Column(Float, nullable=False)

    step = relationship("RoutingStep", back_populates="filaments")
    filament_spec = relationship("FilamentSpec")


class PostProcessingCost(Base):
    __tablename__ = "post_processing_costs"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    label = Column(String, nullable=False)
    cost_per_item = Column(Float, nullable=False, default=0.0)
    sort_order = Column(Integer, nullable=False, default=0)

    item = relationship("Item", back_populates="post_processing_costs")
