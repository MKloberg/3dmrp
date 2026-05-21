import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from ..database import get_db
from ..models import Customer, Item, Order, Setting
from ..schemas import CustomerCreate, CustomerUpdate, CustomerOut, CustomerOrderOut

router = APIRouter(prefix="/api/customers", tags=["customers"])

SQUARE_API_BASE = "https://connect.squareup.com/v2"

CATEGORIES = ["Retail", "Wholesale", "VIP", "One-time", "Trade"]


def _get_square_token(db: Session) -> str:
    row = db.query(Setting).filter(Setting.key == "square_api_token").first()
    if not row or not row.value:
        raise HTTPException(status_code=400, detail="Square API token not configured")
    return row.value


@router.get("", response_model=List[CustomerOut])
def list_customers(db: Session = Depends(get_db)):
    return db.query(Customer).order_by(Customer.given_name, Customer.family_name).all()


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    customer = Customer(**data.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, data: CustomerUpdate, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(customer, k, v)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    # Unlink orders rather than cascade-delete them
    db.query(Order).filter(Order.customer_id == customer_id).update({"customer_id": None})
    db.delete(customer)
    db.commit()


@router.get("/{customer_id}/orders", response_model=List[CustomerOrderOut])
def get_customer_orders(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    orders = (
        db.query(Order)
        .options(joinedload(Order.item).joinedload(Item.images))
        .filter(Order.customer_id == customer_id)
        .order_by(Order.date_ordered.desc())
        .all()
    )
    return orders


# --- Square integration ---

def _square_customer_to_dict(sq: dict) -> dict:
    addr = sq.get("address", {})
    given = sq.get("given_name", "")
    family = sq.get("family_name", "")
    return {
        "given_name": given,
        "family_name": family,
        "company_name": sq.get("company_name", ""),
        "email": sq.get("email_address", ""),
        "phone": sq.get("phone_number", ""),
        "address_line1": addr.get("address_line_1", ""),
        "address_line2": addr.get("address_line_2", ""),
        "city": addr.get("locality", ""),
        "state": addr.get("administrative_district_code", ""),
        "postal_code": addr.get("postal_code", ""),
        "country": addr.get("country", ""),
        "notes": sq.get("note", ""),
        "square_id": sq.get("id"),
    }


async def _fetch_all_square_customers(token: str) -> List[dict]:
    customers = []
    cursor: Optional[str] = None
    async with httpx.AsyncClient() as client:
        while True:
            params = {"limit": 100}
            if cursor:
                params["cursor"] = cursor
            resp = await client.get(
                f"{SQUARE_API_BASE}/customers",
                headers={"Authorization": f"Bearer {token}", "Square-Version": "2024-01-17"},
                params=params,
                timeout=15,
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Square API error: {resp.text}")
            body = resp.json()
            customers.extend(body.get("customers", []))
            cursor = body.get("cursor")
            if not cursor:
                break
    return customers


@router.get("/square/preview")
async def square_preview(db: Session = Depends(get_db)):
    """Fetch Square customers and annotate which are already imported."""
    token = _get_square_token(db)
    sq_customers = await _fetch_all_square_customers(token)
    existing_square_ids = {
        c.square_id for c in db.query(Customer.square_id).filter(Customer.square_id.isnot(None)).all()
    }
    result = []
    for sq in sq_customers:
        d = _square_customer_to_dict(sq)
        d["already_imported"] = sq.get("id") in existing_square_ids
        result.append(d)
    return result


@router.post("/square/import")
async def square_import(body: dict, db: Session = Depends(get_db)):
    """Import a list of Square customer IDs as local customer records."""
    token = _get_square_token(db)
    square_ids: List[str] = body.get("square_ids", [])
    if not square_ids:
        raise HTTPException(status_code=422, detail="No square_ids provided")

    sq_customers = await _fetch_all_square_customers(token)
    sq_map = {sq["id"]: sq for sq in sq_customers}

    imported = []
    for sid in square_ids:
        sq = sq_map.get(sid)
        if not sq:
            continue
        existing = db.query(Customer).filter(Customer.square_id == sid).first()
        if existing:
            continue
        data = _square_customer_to_dict(sq)
        customer = Customer(**data)
        db.add(customer)
        db.flush()
        imported.append(customer.id)

    db.commit()
    return {"imported": len(imported)}


@router.post("/square/sync")
async def square_sync(db: Session = Depends(get_db)):
    """Sync all locally imported customers from Square (update changed fields)."""
    token = _get_square_token(db)
    linked = db.query(Customer).filter(Customer.square_id.isnot(None)).all()
    if not linked:
        return {"synced": 0}

    sq_customers = await _fetch_all_square_customers(token)
    sq_map = {sq["id"]: sq for sq in sq_customers}

    synced = 0
    for customer in linked:
        sq = sq_map.get(customer.square_id)
        if not sq:
            continue
        data = _square_customer_to_dict(sq)
        for k, v in data.items():
            if k != "square_id":
                setattr(customer, k, v)
        synced += 1

    db.commit()
    return {"synced": synced}
