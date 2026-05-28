from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Customer, Item, Order, OrderStepProgress, PrintJob, Printer, RoutingStep

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class PrintJobEnriched(BaseModel):
    id: int
    printer_id: int
    printer_name: str
    printer_url: str
    moonraker_job_id: Optional[str]
    filename: str
    status: str
    quantity_credited: int
    order_id: Optional[int]
    order_customer: Optional[str]
    item_id: Optional[int]
    item_name: Optional[str]
    routing_step_id: Optional[int]
    step_description: Optional[str]
    quantity_on_plate: Optional[int]
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class OrderStepProgressEnriched(BaseModel):
    id: int
    order_id: int
    order_customer: Optional[str]
    order_status: str
    order_quantity: int
    order_quantity_printed: int
    item_id: Optional[int]
    item_name: Optional[str]
    routing_step_id: int
    step_description: str
    parts_per_item: int
    quantity_on_plate: int
    parts_printed: int
    items_complete: int

    class Config:
        from_attributes = True


@router.get("/api/order-step-progress", response_model=List[OrderStepProgressEnriched])
def list_order_step_progress(db: Session = Depends(get_db)):
    rows = db.query(OrderStepProgress).all()
    if not rows:
        return []

    order_ids = {r.order_id for r in rows}
    step_ids = {r.routing_step_id for r in rows}

    orders = {o.id: o for o in db.query(Order).filter(Order.id.in_(order_ids))}
    steps = {s.id: s for s in db.query(RoutingStep).filter(RoutingStep.id.in_(step_ids))}

    item_ids = {o.item_id for o in orders.values() if o.item_id}
    items = {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids))}

    customer_ids = {o.customer_id for o in orders.values() if o.customer_id}
    customers = {c.id: c for c in db.query(Customer).filter(Customer.id.in_(customer_ids))}

    result = []
    for row in rows:
        order = orders.get(row.order_id)
        step = steps.get(row.routing_step_id)
        if not order or not step:
            continue
        item = items.get(order.item_id) if order.item_id else None
        cust = customers.get(order.customer_id) if order.customer_id else None
        order_customer = (cust.display_name if cust else None) or order.customer_name or None
        result.append(OrderStepProgressEnriched(
            id=row.id,
            order_id=row.order_id,
            order_customer=order_customer,
            order_status=order.status.value if hasattr(order.status, 'value') else order.status,
            order_quantity=order.quantity,
            order_quantity_printed=order.quantity_printed,
            item_id=order.item_id,
            item_name=item.name if item else None,
            routing_step_id=row.routing_step_id,
            step_description=step.description,
            parts_per_item=step.parts_per_item,
            quantity_on_plate=step.quantity_on_plate,
            parts_printed=row.parts_printed,
            items_complete=row.parts_printed // step.parts_per_item if step.parts_per_item > 0 else 0,
        ))
    return result


@router.get("/api/print-jobs", response_model=List[PrintJobEnriched])
def list_print_jobs(db: Session = Depends(get_db)):
    jobs = db.query(PrintJob).all()
    if not jobs:
        return []

    printer_ids = {j.printer_id for j in jobs if j.printer_id}
    item_ids = {j.item_id for j in jobs if j.item_id}
    step_ids = {j.routing_step_id for j in jobs if j.routing_step_id}
    order_ids = {j.order_id for j in jobs if j.order_id}

    printers = {p.id: p for p in db.query(Printer).filter(Printer.id.in_(printer_ids))}
    items = {i.id: i for i in db.query(Item).filter(Item.id.in_(item_ids))}
    steps = {s.id: s for s in db.query(RoutingStep).filter(RoutingStep.id.in_(step_ids))}
    orders = {o.id: o for o in db.query(Order).filter(Order.id.in_(order_ids))}

    customer_ids = {o.customer_id for o in orders.values() if o.customer_id}
    customers = {c.id: c for c in db.query(Customer).filter(Customer.id.in_(customer_ids))}

    result = []
    for job in jobs:
        printer = printers.get(job.printer_id)
        item = items.get(job.item_id) if job.item_id else None
        step = steps.get(job.routing_step_id) if job.routing_step_id else None
        order = orders.get(job.order_id) if job.order_id else None

        order_customer = None
        if order:
            cust = customers.get(order.customer_id) if order.customer_id else None
            if cust:
                order_customer = cust.display_name
            elif order.customer_name:
                order_customer = order.customer_name

        result.append(PrintJobEnriched(
            id=job.id,
            printer_id=job.printer_id,
            printer_name=printer.name if printer else f"#{job.printer_id}",
            printer_url=printer.url if printer else "",
            moonraker_job_id=job.moonraker_job_id,
            filename=job.filename,
            status=job.status,
            quantity_credited=job.quantity_credited,
            order_id=job.order_id,
            order_customer=order_customer,
            item_id=job.item_id,
            item_name=item.name if item else None,
            routing_step_id=job.routing_step_id,
            step_description=step.description if step else None,
            quantity_on_plate=step.quantity_on_plate if step else None,
            start_time=job.start_time,
            end_time=job.end_time,
            created_at=job.created_at,
        ))
    return result
