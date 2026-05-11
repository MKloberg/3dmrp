from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Slicer
from ..schemas import SlicerCreate, SlicerOut, SlicerUpdate

router = APIRouter(prefix="/api/slicers", tags=["slicers"])


@router.get("", response_model=List[SlicerOut])
def list_slicers(db: Session = Depends(get_db)):
    return db.query(Slicer).order_by(Slicer.name).all()


@router.post("", response_model=SlicerOut, status_code=201)
def create_slicer(data: SlicerCreate, db: Session = Depends(get_db)):
    slicer = Slicer(**data.model_dump())
    db.add(slicer)
    db.commit()
    db.refresh(slicer)
    return slicer


@router.patch("/{slicer_id}", response_model=SlicerOut)
def update_slicer(slicer_id: int, data: SlicerUpdate, db: Session = Depends(get_db)):
    slicer = db.query(Slicer).filter(Slicer.id == slicer_id).first()
    if not slicer:
        raise HTTPException(status_code=404, detail="Slicer not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(slicer, field, value)
    db.commit()
    db.refresh(slicer)
    return slicer


@router.delete("/{slicer_id}", status_code=204)
def delete_slicer(slicer_id: int, db: Session = Depends(get_db)):
    slicer = db.query(Slicer).filter(Slicer.id == slicer_id).first()
    if not slicer:
        raise HTTPException(status_code=404, detail="Slicer not found")
    db.delete(slicer)
    db.commit()
