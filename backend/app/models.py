from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON
import enum

from .database import Base


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


class PrintModel(Base):
    __tablename__ = "print_models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(String, default="")
    notes = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    filament_requirements = relationship("ModelFilament", back_populates="print_model", cascade="all, delete-orphan", order_by="ModelFilament.sort_order")
    images = relationship("ModelImage", back_populates="print_model", cascade="all, delete-orphan", order_by="ModelImage.created_at")
    slicer_files = relationship("ModelSlicerFile", back_populates="print_model", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="print_model")


class ModelFilament(Base):
    __tablename__ = "model_filaments"

    id = Column(Integer, primary_key=True, index=True)
    print_model_id = Column(Integer, ForeignKey("print_models.id"), nullable=False)
    filament_spec_id = Column(Integer, ForeignKey("filament_specs.id"), nullable=False)
    grams = Column(Float, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    print_model = relationship("PrintModel", back_populates="filament_requirements")
    filament_spec = relationship("FilamentSpec", back_populates="model_filaments")


class ModelImage(Base):
    __tablename__ = "model_images"

    id = Column(Integer, primary_key=True, index=True)
    print_model_id = Column(Integer, ForeignKey("print_models.id", ondelete="CASCADE"), nullable=False)
    image_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    print_model = relationship("PrintModel", back_populates="images")


class ModelSlicerFile(Base):
    __tablename__ = "model_slicer_files"

    id = Column(Integer, primary_key=True, index=True)
    print_model_id = Column(Integer, ForeignKey("print_models.id", ondelete="CASCADE"), nullable=False)
    printer_id = Column(Integer, ForeignKey("printers.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String, nullable=False)

    print_model = relationship("PrintModel", back_populates="slicer_files")
    printer = relationship("Printer")

    __table_args__ = (UniqueConstraint("print_model_id", "printer_id", name="uq_model_printer_slicer"),)


class Printer(Base):
    __tablename__ = "printers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    image_path = Column(String, nullable=True)
    slicer_name = Column(String, nullable=True)
    slicer_executable = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    slots = relationship(
        "PrinterSlot", back_populates="printer",
        cascade="all, delete-orphan",
        order_by="PrinterSlot.slot_number",
    )

    @property
    def has_image(self) -> bool:
        return self.image_path is not None


class PrinterSlot(Base):
    __tablename__ = "printer_slots"

    id = Column(Integer, primary_key=True, index=True)
    printer_id = Column(Integer, ForeignKey("printers.id", ondelete="CASCADE"), nullable=False)
    slot_number = Column(Integer, nullable=False)
    filament_spec_id = Column(Integer, ForeignKey("filament_specs.id", ondelete="SET NULL"), nullable=True)

    printer = relationship("Printer", back_populates="slots")
    filament_spec = relationship("FilamentSpec")

    __table_args__ = (UniqueConstraint("printer_id", "slot_number", name="uq_printer_slot"),)


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    print_model_id = Column(Integer, ForeignKey("print_models.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    customer_name = Column(String, default="")
    customer_notes = Column(String, default="")
    date_ordered = Column(DateTime, default=datetime.utcnow)
    date_needed = Column(DateTime, nullable=True)
    status = Column(Enum(OrderStatus), default=OrderStatus.pending)

    print_model = relationship("PrintModel", back_populates="orders")
