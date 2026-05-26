from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Order, OrderStatus, Item, PrintJob
from ..schemas import OrderCreate, OrderUpdate, OrderOut

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("", response_model=List[OrderOut])
def list_orders(
    status: Optional[OrderStatus] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(Order)
    if status:
        q = q.filter(Order.status == status)
    return q.order_by(Order.date_ordered.desc()).all()


@router.post("", response_model=OrderOut, status_code=201)
def create_order(data: OrderCreate, db: Session = Depends(get_db)):
    if data.item_id is None and not data.item_name:
        raise HTTPException(status_code=422, detail="Either item_id or item_name is required")
    item_id = data.item_id
    if item_id is None:
        new_item = Item(name=data.item_name)
        db.add(new_item)
        db.flush()
        item_id = new_item.id
    order = Order(
        item_id=item_id,
        customer_id=data.customer_id,
        quantity=data.quantity,
        customer_name=data.customer_name,
        customer_notes=data.customer_notes,
        date_needed=data.date_needed,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/{order_id}", response_model=OrderOut)
def update_order(order_id: int, data: OrderUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(order, k, v)
    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=204)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    db.delete(order)
    db.commit()


class QuantityAdjust(BaseModel):
    delta: int
    force: bool = False


@router.patch("/{order_id}/quantity-printed", response_model=OrderOut)
def adjust_quantity_printed(order_id: int, data: QuantityAdjust, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not data.force:
        active = (
            db.query(PrintJob)
            .filter(PrintJob.item_id == order.item_id, PrintJob.status == "in_progress")
            .count()
        )
        if active > 0:
            return JSONResponse(content={"warning": True})

    order.quantity_printed = max(0, min(order.quantity_printed + data.delta, order.quantity))
    if order.quantity_printed >= order.quantity:
        order.status = OrderStatus.complete

    db.commit()
    db.refresh(order)
    return order
