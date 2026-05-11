import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any, Dict, List

from ..database import get_db
from ..models import FilamentSpec
from .settings import get_setting

_ASIN_RE = re.compile(r'^B[0-9A-Z]{9}$')

router = APIRouter(prefix="/api/spoolman", tags=["spoolman"])


@router.get("/stock")
async def get_spoolman_stock(db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        return {"connected": False, "spools": [], "error": "Spoolman URL not configured"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/v1/spool")
            resp.raise_for_status()
            spools = resp.json()
        return {"connected": True, "spools": spools}
    except httpx.ConnectError:
        return {"connected": False, "spools": [], "error": "Cannot connect to Spoolman"}
    except Exception as e:
        return {"connected": False, "spools": [], "error": str(e)}


@router.get("/filaments")
async def get_spoolman_filaments(db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        return {"connected": False, "filaments": [], "error": "Spoolman URL not configured"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/v1/filament")
            resp.raise_for_status()
            filaments = resp.json()
        return {"connected": True, "filaments": filaments}
    except Exception as e:
        return {"connected": False, "filaments": [], "error": str(e)}


@router.post("/import")
async def import_spoolman_filaments(body: Dict[str, List[int]], db: Session = Depends(get_db)) -> Dict[str, Any]:
    ids = body.get("ids", [])
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/v1/filament")
            resp.raise_for_status()
            sf_map = {f["id"]: f for f in resp.json()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")

    amazon_domain = get_setting(db, "amazon_domain") or "amazon.com"

    imported = 0
    for fid in ids:
        sf = sf_map.get(fid)
        if not sf:
            continue
        if db.query(FilamentSpec).filter(FilamentSpec.spoolman_id == fid).first():
            continue
        hex_val = sf.get("color_hex") or "888888"
        color_hex = (hex_val if hex_val.startswith("#") else f"#{hex_val}").lower()
        vendor = sf.get("vendor") or {}
        article_number = sf.get("article_number") or ""
        asin = article_number.strip().upper()
        purchase_url = f"https://www.{amazon_domain}/dp/{asin}" if _ASIN_RE.match(asin) else ""
        local = FilamentSpec(
            material=sf.get("material") or "PLA",
            color_name=sf.get("name", ""),
            color_hex=color_hex,
            brand=vendor.get("name", ""),
            price=sf.get("price"),
            density=sf.get("density"),
            diameter=sf.get("diameter") or 1.75,
            weight=sf.get("weight"),
            spool_weight=sf.get("spool_weight"),
            settings_extruder_temp=sf.get("settings_extruder_temp"),
            settings_bed_temp=sf.get("settings_bed_temp"),
            article_number=article_number,
            comment=sf.get("comment") or "",
            external_id=sf.get("external_id") or "",
            extra=sf.get("extra") or None,
            spoolman_id=fid,
            purchase_url=purchase_url,
        )
        db.add(local)
        imported += 1

    db.commit()
    return {"imported": imported}


@router.post("/sync")
async def sync_spoolman_filaments(db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")

    linked = db.query(FilamentSpec).filter(FilamentSpec.spoolman_id.isnot(None)).all()
    if not linked:
        return {"updated": 0}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/v1/filament")
            resp.raise_for_status()
            sf_map = {f["id"]: f for f in resp.json()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")

    updated = 0
    for local in linked:
        sf = sf_map.get(local.spoolman_id)
        if not sf:
            continue
        local.material = sf.get("material") or local.material
        local.color_name = sf.get("name") or local.color_name
        hex_val = sf.get("color_hex")
        if hex_val:
            local.color_hex = (hex_val if hex_val.startswith("#") else f"#{hex_val}").lower()
        vendor = sf.get("vendor") or {}
        if vendor.get("name"):
            local.brand = vendor["name"]
        for field in ["price", "density", "diameter", "weight", "spool_weight",
                      "settings_extruder_temp", "settings_bed_temp"]:
            v = sf.get(field)
            if v is not None:
                setattr(local, field, v)
        for field in ["article_number", "comment", "external_id"]:
            v = sf.get(field)
            if v:
                setattr(local, field, v)
        updated += 1

    db.commit()
    return {"updated": updated}
