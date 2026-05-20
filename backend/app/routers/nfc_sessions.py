import secrets
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, Optional

router = APIRouter(prefix="/api/nfc-sessions", tags=["nfc-sessions"])

_sessions: Dict[str, Dict[str, Any]] = {}
SESSION_TTL = 300  # 5 minutes


class CreateSessionRequest(BaseModel):
    spool_id: int
    spool_label: str
    slot: str        # "A" or "B"
    mode: str        # "read_write" or "read_only"
    # Filament metadata for OpenSpool NDEF write
    filament_type: Optional[str] = None   # e.g. "PLA"
    color_hex: Optional[str] = None       # with or without leading #
    brand: Optional[str] = None           # vendor name
    subtype: Optional[str] = None         # e.g. "Matte", "Silk", "Rapid"
    min_temp: Optional[int] = None        # extruder min °C
    max_temp: Optional[int] = None        # extruder max °C
    bed_temp: Optional[int] = None        # bed °C


class TagAResult(BaseModel):
    card_uid: str
    wrote_tag: bool


class SessionResult(BaseModel):
    card_uid: str
    wrote_tag: bool
    card_uid_b: Optional[str] = None
    wrote_tag_b: Optional[bool] = None


def _cleanup() -> None:
    now = time.time()
    for t in [k for k, v in _sessions.items() if v["expires_at"] < now]:
        del _sessions[t]


@router.post("")
async def create_session(body: CreateSessionRequest) -> Dict[str, Any]:
    _cleanup()
    token = secrets.token_urlsafe(16)
    _sessions[token] = {
        "spool_id": body.spool_id,
        "spool_label": body.spool_label,
        "slot": body.slot,
        "mode": body.mode,
        "filament_type": body.filament_type,
        "color_hex": body.color_hex.lstrip("#") if body.color_hex else None,
        "brand": body.brand,
        "subtype": body.subtype,
        "min_temp": body.min_temp,
        "max_temp": body.max_temp,
        "bed_temp": body.bed_temp,
        "status": "pending",
        "card_uid": None,
        "wrote_tag": None,
        "card_uid_b": None,
        "wrote_tag_b": None,
        "expires_at": time.time() + SESSION_TTL,
    }
    return {"token": token, "expires_at": _sessions[token]["expires_at"]}


@router.get("/{token}")
async def get_session(token: str) -> Dict[str, Any]:
    _cleanup()
    s = _sessions.get(token)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return {
        "status": s["status"],
        "spool_id": s["spool_id"],
        "spool_label": s["spool_label"],
        "slot": s["slot"],
        "mode": s["mode"],
        "filament_type": s["filament_type"],
        "color_hex": s["color_hex"],
        "brand": s["brand"],
        "subtype": s["subtype"],
        "min_temp": s["min_temp"],
        "max_temp": s["max_temp"],
        "bed_temp": s["bed_temp"],
        "card_uid": s["card_uid"],
        "wrote_tag": s["wrote_tag"],
        "card_uid_b": s["card_uid_b"],
        "wrote_tag_b": s["wrote_tag_b"],
    }


@router.post("/{token}/tag-a")
async def post_tag_a(token: str, body: TagAResult) -> Dict[str, Any]:
    _cleanup()
    s = _sessions.get(token)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    if s["status"] != "pending":
        raise HTTPException(status_code=409, detail="Session already has tag A")
    s["status"] = "tag_a_done"
    s["card_uid"] = body.card_uid
    s["wrote_tag"] = body.wrote_tag
    return {"ok": True}


@router.post("/{token}/result")
async def post_result(token: str, body: SessionResult) -> Dict[str, Any]:
    _cleanup()
    s = _sessions.get(token)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    if s["status"] not in ("pending", "tag_a_done"):
        raise HTTPException(status_code=409, detail="Session already completed")
    s["status"] = "completed"
    s["card_uid"] = body.card_uid
    s["wrote_tag"] = body.wrote_tag
    s["card_uid_b"] = body.card_uid_b
    s["wrote_tag_b"] = body.wrote_tag_b
    return {"ok": True}
