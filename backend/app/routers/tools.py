import json
import os
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any, Dict, Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import FilamentSpec, Setting
from .settings import get_setting

_HUEFORGE_NS = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

router = APIRouter(prefix="/api/tools", tags=["tools"])

_PARSE_PROMPT = """Extract 3D printing filament specifications from the product listing below. Return a single JSON object only — no explanation, no markdown, no code block.

Fields (use null for any not found or unclear):
- name: string — color or product name (e.g. "Silk Green", "Matte Black Forest")
- material: string — filament material type (e.g. "PLA", "PETG", "ABS", "TPU", "ASA", "PLA+", "ABS+")
- brand: string — manufacturer or brand name
- color_hex: string — 6-character hex color WITHOUT # (estimate from color description, e.g. "2eb82e" for green)
- diameter: number — in mm, typically 1.75 or 2.85
- weight: number — net filament weight in grams, NOT including empty spool (e.g. 1000 for a 1kg spool)
- spool_weight: number — empty spool weight in grams if mentioned
- extruder_temp: integer — nozzle temperature in Celsius (use midpoint if range given, e.g. 220 for "210-230°C")
- bed_temp: integer — bed temperature in Celsius (use midpoint if range given)
- price: number — price in USD if clearly stated
- asin: string — Amazon ASIN if present (letter B followed by 9 alphanumeric characters, e.g. "B0C582W5BS")
- density: number — material density in g/cm³ if mentioned

Return only valid JSON. Example: {"name":"Silk Green","material":"PLA","brand":"eSUN","color_hex":"3cb371","diameter":1.75,"weight":1000,"spool_weight":null,"extruder_temp":220,"bed_temp":60,"price":null,"asin":null,"density":1.24}

Product listing:
"""


class PickFolderRequest(BaseModel):
    initial_dir: Optional[str] = None


class ExportHueForgeRequest(BaseModel):
    path: str


class ParseFilamentRequest(BaseModel):
    text: str


class ParsedFilamentSpec(BaseModel):
    name: Optional[str] = None
    material: Optional[str] = None
    brand: Optional[str] = None
    color_hex: Optional[str] = None
    diameter: Optional[float] = None
    weight: Optional[float] = None
    spool_weight: Optional[float] = None
    extruder_temp: Optional[int] = None
    bed_temp: Optional[int] = None
    price: Optional[float] = None
    asin: Optional[str] = None
    density: Optional[float] = None


@router.post("/parse-filament", response_model=ParsedFilamentSpec)
async def parse_filament(body: ParseFilamentRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    api_key = get_setting(db, "anthropic_api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="Anthropic API key not configured. Go to Settings → AI.")

    prompt = _PARSE_PROMPT + body.text.strip()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if resp.status_code != 200:
        data = resp.json()
        raise HTTPException(status_code=502, detail=data.get("error", {}).get("message", f"Anthropic API error {resp.status_code}"))

    content = resp.json()["content"][0]["text"].strip()

    # Strip markdown code fences if the model wrapped the response
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        content = "\n".join(lines).strip()

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned malformed JSON. Try pasting more structured product text.")

    return parsed


@router.post("/pick-hueforge-folder")
def pick_hueforge_folder(body: PickFolderRequest = PickFolderRequest()):
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        return {"directory": None, "error": "tkinter not available"}

    initial_dir: Optional[str] = None
    if body.initial_dir and os.path.isdir(body.initial_dir):
        initial_dir = body.initial_dir

    root = tk.Tk()
    root.withdraw()
    root.wm_attributes("-topmost", True)
    chosen = filedialog.askdirectory(title="Select HueForge Libraries Folder", initialdir=initial_dir)
    root.destroy()

    if not chosen:
        return {"directory": None}

    return {"directory": os.path.normpath(chosen)}


@router.post("/export-hueforge")
def export_hueforge(body: ExportHueForgeRequest, db: Session = Depends(get_db)):
    directory = os.path.dirname(os.path.normpath(body.path))
    if not os.path.isdir(directory):
        raise HTTPException(status_code=404, detail=f"Directory not found: {directory}")

    filaments = db.query(FilamentSpec).order_by(FilamentSpec.id).all()

    hueforge_list = []
    for f in filaments:
        extra = f.extra if isinstance(f.extra, dict) else {}
        td_raw = extra.get("td", 0.0)
        try:
            td = float(td_raw) if td_raw is not None else 0.0
        except (TypeError, ValueError):
            td = 0.0

        color = f.color_hex or ""
        if not color.startswith("#"):
            color = "#" + color

        uid = "{" + str(uuid.uuid5(_HUEFORGE_NS, str(f.id))) + "}"

        hueforge_list.append({
            "Brand": f.brand or "",
            "Color": color,
            "Name": f.color_name or "",
            "Owned": True,
            "Transmissivity": td,
            "Type": f.material or "",
            "uuid": uid,
        })

    payload = json.dumps({"Filaments": hueforge_list}, indent=2)

    try:
        with open(body.path, "w", encoding="utf-8") as fh:
            fh.write(payload)
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {body.path}")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Directory not found: {directory}")

    return {"path": body.path}
