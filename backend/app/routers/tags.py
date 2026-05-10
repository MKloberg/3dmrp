from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Tag, PrintModel
from ..schemas import TagOut, TagCreate

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=List[TagOut])
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).order_by(Tag.name).all()


@router.post("", response_model=TagOut, status_code=201)
def create_tag(data: TagCreate, db: Session = Depends(get_db)):
    if db.query(Tag).filter(Tag.name == data.name).first():
        raise HTTPException(status_code=409, detail="Tag already exists")
    tag = Tag(**data.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, data: TagCreate, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag.name = data.name
    tag.color_hex = data.color_hex
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()


@router.post("/{tag_id}/models/{model_id}", status_code=204)
def add_tag_to_model(tag_id: int, model_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    model = db.query(PrintModel).filter(PrintModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if tag not in model.tags:
        model.tags.append(tag)
        db.commit()


@router.delete("/{tag_id}/models/{model_id}", status_code=204)
def remove_tag_from_model(tag_id: int, model_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    model = db.query(PrintModel).filter(PrintModel.id == model_id).first()
    if tag and model and tag in model.tags:
        model.tags.remove(tag)
        db.commit()
