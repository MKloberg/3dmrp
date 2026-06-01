import os
import shutil
import socket
import subprocess
import webbrowser
from datetime import datetime
from typing import Dict

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..database import engine, get_db
from ..models import Setting

_DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
_DB_PATH = os.path.join(_DATA_DIR, "3dmrp.db")
_SQLITE_MAGIC = b"SQLite format 3\x00"

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTING_KEYS = {"spoolman_url", "amazon_domain", "gcode_repo_path", "square_api_token", "mobile_protocol", "currency",
                "ui_printers_view", "ui_spool_inventory_view", "ui_printer_label_size_index", "label_printer_name",
                "label_print_quantity", "nfc_write_mode", "machine_hourly_rate", "electricity_cost_kwh",
                "markup_multiplier", "printer_ws_mode", "mobile_base_url", "anthropic_api_key"}


def get_setting(db: Session, key: str) -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is not None:
        return row.value
    # Fall back to env var (uppercase, underscores)
    return os.getenv(key.upper(), "")


@router.get("/lan-ip")
def get_lan_ip() -> Dict[str, str]:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    return {"ip": ip, "https_port": os.getenv("HTTPS_PORT", "7892")}


@router.get("")
def get_settings(db: Session = Depends(get_db)) -> Dict[str, str]:
    rows = {r.key: r.value for r in db.query(Setting).all()}
    result = {}
    for key in SETTING_KEYS:
        result[key] = rows.get(key, os.getenv(key.upper(), ""))
    return result


@router.get("/open-spoolman")
def open_spoolman(db: Session = Depends(get_db)):
    url = get_setting(db, "spoolman_url")
    if not url:
        raise HTTPException(status_code=404, detail="Spoolman URL not configured")
    try:
        subprocess.Popen(["cmd", "/c", "start", "", url.rstrip("/")])
    except Exception:
        webbrowser.open(url.rstrip("/"))
    return {"ok": True}


@router.get("/open-browser")
async def open_browser(url: str):
    if not any(url.startswith(p) for p in ("http://localhost", "https://localhost", "http://127.0.0.1", "https://127.0.0.1")):
        raise HTTPException(status_code=400, detail="Only localhost URLs allowed")
    try:
        # cmd /c start activates the new window via ShellExecuteEx; webbrowser.open does not
        subprocess.Popen(["cmd", "/c", "start", "", url])
    except Exception:
        webbrowser.open(url)
    return {"ok": True}


@router.put("/{key}")
def set_setting(key: str, body: Dict[str, str], db: Session = Depends(get_db)) -> Dict[str, str]:
    value = body.get("value", "")
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()
    return {key: value}


@router.get("/backup")
def backup_database(db: Session = Depends(get_db)):
    if not os.path.exists(_DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    db.execute(text("PRAGMA wal_checkpoint(FULL)"))
    filename = f"3dmrp_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    return FileResponse(
        _DB_PATH,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/restore", status_code=204)
async def restore_database(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) < 16 or not data.startswith(_SQLITE_MAGIC):
        raise HTTPException(status_code=400, detail="Not a valid SQLite database file")
    tmp_path = _DB_PATH + ".restore_tmp"
    try:
        with open(tmp_path, "wb") as f:
            f.write(data)
        engine.dispose()
        shutil.move(tmp_path, _DB_PATH)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


@router.post("/anthropic/test")
async def test_anthropic(db: Session = Depends(get_db)) -> Dict[str, object]:
    api_key = get_setting(db, "anthropic_api_key")
    if not api_key:
        return {"ok": False, "error": "No API key configured"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={"model": "claude-haiku-4-5-20251001", "max_tokens": 5, "messages": [{"role": "user", "content": "Hi"}]},
            )
        if resp.status_code == 200:
            return {"ok": True}
        data = resp.json()
        return {"ok": False, "error": data.get("error", {}).get("message", f"HTTP {resp.status_code}")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/spoolman/test")
async def test_spoolman(body: Dict[str, str]) -> Dict[str, object]:
    url = body.get("url", "").rstrip("/")
    if not url:
        return {"connected": False, "error": "No URL provided"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url}/api/v1/info")
            resp.raise_for_status()
            info = resp.json()
        return {"connected": True, "version": info.get("version", "unknown")}
    except httpx.ConnectError:
        return {"connected": False, "error": "Cannot connect — check the URL and that Spoolman is running"}
    except Exception as e:
        return {"connected": False, "error": str(e)}


