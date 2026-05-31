import re
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from ..database import get_db
from datetime import datetime
from ..models import FilamentSpec, Printer, SpoolWeighLog
from .settings import get_setting

_ASIN_RE = re.compile(r'^B[0-9A-Z]{9}$')

router = APIRouter(prefix="/api/spoolman", tags=["spoolman"])


@router.get("/ping")
async def ping_spoolman(db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        return {"connected": False}
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/v1/info")
            resp.raise_for_status()
        return {"connected": True, "url": url.rstrip("/")}
    except Exception:
        return {"connected": False}


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


@router.get("/location-options")
async def get_location_options(db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    spoolman_locs: list[str] = []
    printer_locs: list[str] = []

    if url:
        base = url.rstrip("/")
        spoolman_set: set[str] = set()

        # 1. Spoolman predefined locations (stored in /api/v1/setting → locations.value)
        try:
            import json as _json
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                resp = await client.get(f"{base}/api/v1/setting")
                if resp.status_code == 200:
                    setting = resp.json()
                    raw = setting.get("locations", {}).get("value")
                    if raw:
                        for loc in _json.loads(raw):
                            if loc:
                                spoolman_set.add(loc)
        except Exception:
            pass

        # 2. Locations set directly on spools but not in the predefined list
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{base}/api/v1/spool")
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("value", data) if isinstance(data, dict) else data
                    for spool in (items if isinstance(items, list) else []):
                        loc = spool.get("location")
                        if loc:
                            spoolman_set.add(loc)
        except Exception:
            pass

        spoolman_locs = sorted(spoolman_set)

    # 3. Printer names from 3DMRP
    printer_names = sorted(p.name for p in db.query(Printer).all() if p.name)
    printer_names_lower = {n.lower() for n in printer_names}

    # Split Spoolman locations: storage (non-printer) first, printer-named ones go to bottom group
    storage_locs = sorted(l for l in spoolman_locs if l.lower() not in printer_names_lower)
    printer_locs = sorted(set(printer_names) | {l for l in spoolman_locs if l.lower() in printer_names_lower})

    return {"locations": storage_locs + printer_locs, "storage_locations": storage_locs}


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


class CreateSpoolsRequest(BaseModel):
    filament_id: int
    count: int


@router.post("/create-spools")
async def create_spools(body: CreateSpoolsRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    base = url.rstrip("/")
    created = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for _ in range(body.count):
                resp = await client.post(
                    f"{base}/api/v1/spool",
                    json={"filament_id": body.filament_id},
                )
                resp.raise_for_status()
                created.append(resp.json())
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")
    return {"spools": created, "spoolman_url": base}


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

        changed = False

        new_material = sf.get("material") or local.material
        if new_material != local.material:
            local.material = new_material
            changed = True

        new_name = sf.get("name") or local.color_name
        if new_name != local.color_name:
            local.color_name = new_name
            changed = True

        hex_val = sf.get("color_hex")
        if hex_val:
            new_hex = (hex_val if hex_val.startswith("#") else f"#{hex_val}").lower()
            if new_hex != local.color_hex:
                local.color_hex = new_hex
                changed = True

        vendor = sf.get("vendor") or {}
        if vendor.get("name") and vendor["name"] != local.brand:
            local.brand = vendor["name"]
            changed = True

        for field in ["price", "density", "diameter", "weight", "spool_weight",
                      "settings_extruder_temp", "settings_bed_temp"]:
            v = sf.get(field)
            if v is not None and v != getattr(local, field):
                setattr(local, field, v)
                changed = True

        for field in ["article_number", "comment", "external_id"]:
            v = sf.get(field)
            if v and v != getattr(local, field):
                setattr(local, field, v)
                changed = True

        sf_extra = sf.get("extra") or None
        if sf_extra and sf_extra != local.extra:
            local.extra = sf_extra
            changed = True

        if changed:
            updated += 1

    db.commit()
    return {"updated": updated}


class CreateFilamentRequest(BaseModel):
    name: str
    material: str
    color_hex: Optional[str] = None
    vendor_name: Optional[str] = None
    weight: Optional[float] = None
    spool_weight: Optional[float] = None
    diameter: Optional[float] = 1.75
    density: Optional[float] = None
    price: Optional[float] = None
    settings_extruder_temp: Optional[int] = None
    settings_bed_temp: Optional[int] = None
    article_number: Optional[str] = None


@router.post("/filaments")
async def create_spoolman_filament(body: CreateFilamentRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    base = url.rstrip("/")
    payload: Dict[str, Any] = {"name": body.name, "material": body.material}
    if body.color_hex:
        payload["color_hex"] = body.color_hex.lstrip("#")
    if body.weight is not None:
        payload["weight"] = body.weight
    if body.spool_weight is not None:
        payload["spool_weight"] = body.spool_weight
    if body.diameter is not None:
        payload["diameter"] = body.diameter
    if body.density is not None:
        payload["density"] = body.density
    if body.price is not None:
        payload["price"] = body.price
    if body.settings_extruder_temp is not None:
        payload["settings_extruder_temp"] = body.settings_extruder_temp
    if body.settings_bed_temp is not None:
        payload["settings_bed_temp"] = body.settings_bed_temp
    if body.article_number:
        payload["article_number"] = body.article_number
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if body.vendor_name:
                vresp = await client.get(f"{base}/api/v1/vendor", params={"limit": 1000})
                raw = vresp.json() if vresp.status_code == 200 else []
                vendors = raw.get("items", raw) if isinstance(raw, dict) else raw
                existing = next((v for v in vendors if isinstance(v, dict) and v.get("name", "").lower() == body.vendor_name.lower()), None)
                if existing:
                    payload["vendor_id"] = existing["id"]
                else:
                    vcresp = await client.post(f"{base}/api/v1/vendor", json={"name": body.vendor_name})
                    if vcresp.status_code in (200, 201):
                        payload["vendor_id"] = vcresp.json().get("id")
            resp = await client.post(f"{base}/api/v1/filament", json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")


class CreateSpoolsWizardRequest(BaseModel):
    filament_id: int
    count: int
    price: Optional[float] = None
    location: Optional[str] = None
    comment: Optional[str] = None


@router.post("/create-spools-wizard")
async def create_spools_wizard(body: CreateSpoolsWizardRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    base = url.rstrip("/")
    spool_payload: Dict[str, Any] = {"filament_id": body.filament_id}
    if body.price is not None:
        spool_payload["price"] = body.price
    if body.location:
        spool_payload["location"] = body.location
    if body.comment:
        spool_payload["comment"] = body.comment
    created = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for _ in range(body.count):
                resp = await client.post(f"{base}/api/v1/spool", json=spool_payload)
                resp.raise_for_status()
                created.append(resp.json())
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")
    return {"spools": created, "spoolman_url": base}


class CloneSpoolRequest(BaseModel):
    filament_id: int
    price: Optional[float] = None
    location: Optional[str] = None
    comment: Optional[str] = None


@router.post("/clone-spool")
async def clone_spool(body: CloneSpoolRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    base = url.rstrip("/")
    spool_payload: Dict[str, Any] = {"filament_id": body.filament_id}
    if body.price is not None:
        spool_payload["price"] = body.price
    if body.location:
        spool_payload["location"] = body.location
    if body.comment:
        spool_payload["comment"] = body.comment
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{base}/api/v1/spool", json=spool_payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")


class PatchCardUidRequest(BaseModel):
    card_uids: List[str]


@router.patch("/spools/{spool_id}/card-uid")
async def patch_spool_card_uid(spool_id: int, body: PatchCardUidRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")

    base = url.rstrip("/")
    normalized = [uid.replace(":", "").lower() for uid in body.card_uids]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Read existing extra.card_uids so we can compare before writing.
            get_resp = await client.get(f"{base}/api/v1/spool/{spool_id}")
            get_resp.raise_for_status()
            existing_extra = get_resp.json().get("extra") or {}
            raw = existing_extra.get("card_uids") or '""'
            existing_card_uid = json.loads(raw) if isinstance(raw, str) else ""

            existing_uids = {u.strip() for u in existing_card_uid.split(",") if u.strip()}

            # If the scanned UIDs exactly match what's already stored, nothing to do.
            if set(normalized) == existing_uids:
                return get_resp.json()

            # Otherwise the physical tags are the new source of truth — replace entirely.
            # Spoolman stores extra field values as JSON-encoded strings.
            resp = await client.patch(
                f"{base}/api/v1/spool/{spool_id}",
                json={"extra": {"card_uids": json.dumps(",".join(normalized))}},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")


class PatchLocationRequest(BaseModel):
    location: str | None


@router.patch("/spools/{spool_id}/location")
async def patch_spool_location(spool_id: int, body: PatchLocationRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(
                f"{url.rstrip('/')}/api/v1/spool/{spool_id}",
                json={"location": body.location},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")


class PatchRemainingWeightRequest(BaseModel):
    remaining_weight: float


@router.patch("/spools/{spool_id}/remaining-weight")
async def patch_spool_remaining_weight(spool_id: int, body: PatchRemainingWeightRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(
                f"{url.rstrip('/')}/api/v1/spool/{spool_id}",
                json={"remaining_weight": body.remaining_weight},
            )
            resp.raise_for_status()
            result = resp.json()
        db.add(SpoolWeighLog(spool_id=spool_id, weighed_at=datetime.utcnow()))
        db.commit()
        return result
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")


@router.get("/weigh-log")
async def get_weigh_log(db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = db.query(SpoolWeighLog).order_by(SpoolWeighLog.weighed_at.desc()).all()
    latest: dict[int, str] = {}
    for row in rows:
        if row.spool_id not in latest:
            latest[row.spool_id] = row.weighed_at.isoformat()
    return {"log": latest}


class PatchFilamentSpoolWeightRequest(BaseModel):
    spool_weight: float


@router.patch("/filaments/{filament_id}/spool-weight")
async def patch_filament_spool_weight(filament_id: int, body: PatchFilamentSpoolWeightRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(
                f"{url.rstrip('/')}/api/v1/filament/{filament_id}",
                json={"spool_weight": body.spool_weight},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Spoolman error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Spoolman: {e}")


class DeductItem(BaseModel):
    spool_id: int
    grams: float


class DeductRequest(BaseModel):
    deductions: list[DeductItem]


@router.post("/deduct")
async def deduct_filament(body: DeductRequest, db: Session = Depends(get_db)):
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=400, detail="Spoolman URL not configured")
    base = url.rstrip("/")
    errors = []
    deducted = 0
    async with httpx.AsyncClient(timeout=10.0) as client:
        for d in body.deductions:
            try:
                resp = await client.put(
                    f"{base}/api/v1/spool/{d.spool_id}/use",
                    json={"use_weight": d.grams},
                )
                resp.raise_for_status()
                deducted += 1
            except Exception as e:
                errors.append({"spool_id": d.spool_id, "error": str(e)})
    return {"deducted": deducted, "errors": errors}
