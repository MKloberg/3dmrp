import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Any, Dict

from ..database import get_db
from .settings import get_setting

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
