from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import PrinterType
from ..schemas import PrinterTypeCreate, PrinterTypeOut, PrinterTypeUpdate

router = APIRouter(prefix="/api/printer-types", tags=["printer_types"])


@router.get("", response_model=List[PrinterTypeOut])
def list_printer_types(db: Session = Depends(get_db)):
    return db.query(PrinterType).order_by(PrinterType.name).all()


@router.post("", response_model=PrinterTypeOut, status_code=201)
def create_printer_type(data: PrinterTypeCreate, db: Session = Depends(get_db)):
    pt = PrinterType(**data.model_dump())
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@router.patch("/{pt_id}", response_model=PrinterTypeOut)
def update_printer_type(pt_id: int, data: PrinterTypeUpdate, db: Session = Depends(get_db)):
    pt = db.query(PrinterType).filter(PrinterType.id == pt_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="Printer type not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(pt, field, value)
    db.commit()
    db.refresh(pt)
    return pt


@router.delete("/{pt_id}", status_code=204)
def delete_printer_type(pt_id: int, db: Session = Depends(get_db)):
    pt = db.query(PrinterType).filter(PrinterType.id == pt_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="Printer type not found")
    db.delete(pt)
    db.commit()
