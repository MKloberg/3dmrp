import secrets
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import text
from typing import Any, Dict, Optional
from ..database import engine

router = APIRouter(prefix="/api/mobile", tags=["mobile"])

SESSION_TTL = 7200  # 2 hours
# Changes on every process start — phone uses this to detect a new deploy
SERVER_INSTANCE_ID = secrets.token_hex(4)

# Persist session tokens so they survive backend restarts
with engine.connect() as _c:
    _c.execute(text("""
        CREATE TABLE IF NOT EXISTS mobile_sessions (
            token TEXT PRIMARY KEY,
            created_at REAL NOT NULL
        )
    """))
    _c.commit()


class MobileSession:
    def __init__(self, token: str, created_at: Optional[float] = None):
        self.token = token
        self.created_at = created_at if created_at is not None else time.time()
        self.phone_ws: Optional[WebSocket] = None
        self.desktop_ws: Optional[WebSocket] = None

    @property
    def phone_connected(self) -> bool:
        return self.phone_ws is not None

    @property
    def desktop_connected(self) -> bool:
        return self.desktop_ws is not None

    async def send_to_phone(self, msg: dict) -> bool:
        if self.phone_ws:
            try:
                await self.phone_ws.send_json(msg)
                return True
            except Exception:
                self.phone_ws = None
        return False

    async def send_to_desktop(self, msg: dict) -> bool:
        if self.desktop_ws:
            try:
                await self.desktop_ws.send_json(msg)
                return True
            except Exception:
                self.desktop_ws = None
        return False


class ConnectionManager:
    def __init__(self):
        self._sessions: Dict[str, MobileSession] = {}

    def create_session(self) -> str:
        token = secrets.token_urlsafe(16)
        now = time.time()
        self._sessions[token] = MobileSession(token, now)
        with engine.connect() as conn:
            conn.execute(
                text("INSERT OR REPLACE INTO mobile_sessions (token, created_at) VALUES (:t, :c)"),
                {"t": token, "c": now},
            )
            conn.commit()
        return token

    def get(self, token: str) -> Optional[MobileSession]:
        # Check in-memory state first (active connections)
        s = self._sessions.get(token)
        if s:
            if time.time() - s.created_at > SESSION_TTL:
                del self._sessions[token]
                self._purge_db(token)
                return None
            return s

        # Not in memory — look up in DB (e.g. after a backend restart)
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT created_at FROM mobile_sessions WHERE token = :t"),
                {"t": token},
            ).fetchone()
        if row is None:
            return None
        created_at: float = row[0]
        if time.time() - created_at > SESSION_TTL:
            self._purge_db(token)
            return None
        # Valid persisted token — restore to memory without active WS refs
        restored = MobileSession(token, created_at)
        self._sessions[token] = restored
        return restored

    def _purge_db(self, token: str) -> None:
        with engine.connect() as conn:
            conn.execute(text("DELETE FROM mobile_sessions WHERE token = :t"), {"t": token})
            conn.commit()

    def cleanup(self) -> None:
        now = time.time()
        stale = [
            t for t, s in self._sessions.items()
            if now - s.created_at > SESSION_TTL
            and not s.phone_connected
            and not s.desktop_connected
        ]
        for t in stale:
            del self._sessions[t]
        with engine.connect() as conn:
            conn.execute(
                text("DELETE FROM mobile_sessions WHERE created_at < :cutoff"),
                {"cutoff": now - SESSION_TTL},
            )
            conn.commit()

    def remove_if_empty(self, token: str) -> None:
        s = self._sessions.get(token)
        if s and not s.phone_connected and not s.desktop_connected:
            # Drop from memory but keep in DB — both sides can reconnect with same token
            del self._sessions[token]


manager = ConnectionManager()


def _get_or_create_persistent_token() -> str:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT value FROM settings WHERE key = 'mobile_session_token'")
        ).fetchone()
    if row:
        token = row[0]
        # Refresh created_at so the TTL never expires as long as the app is in use
        now = time.time()
        with engine.connect() as conn:
            conn.execute(
                text("INSERT OR REPLACE INTO mobile_sessions (token, created_at) VALUES (:t, :c)"),
                {"t": token, "c": now},
            )
            conn.commit()
        if token not in manager._sessions:
            manager._sessions[token] = MobileSession(token, now)
        else:
            manager._sessions[token].created_at = now
        return token
    # First run — auto-generate and persist
    token = secrets.token_urlsafe(16)
    now = time.time()
    with engine.connect() as conn:
        conn.execute(
            text("INSERT OR REPLACE INTO mobile_sessions (token, created_at) VALUES (:t, :c)"),
            {"t": token, "c": now},
        )
        conn.execute(
            text("INSERT OR REPLACE INTO settings (key, value) VALUES ('mobile_session_token', :v)"),
            {"v": token},
        )
        conn.commit()
    manager._sessions[token] = MobileSession(token, now)
    return token


@router.post("/sessions")
async def create_session() -> Dict[str, Any]:
    manager.cleanup()
    token = manager.create_session()
    return {"token": token}


@router.get("/persistent-session")
async def get_persistent_session() -> Dict[str, Any]:
    token = _get_or_create_persistent_token()
    return {"token": token}


@router.post("/persistent-session/reset")
async def reset_persistent_session() -> Dict[str, Any]:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT value FROM settings WHERE key = 'mobile_session_token'")
        ).fetchone()
        if row:
            manager._sessions.pop(row[0], None)
            conn.execute(text("DELETE FROM mobile_sessions WHERE token = :t"), {"t": row[0]})
            conn.execute(text("DELETE FROM settings WHERE key = 'mobile_session_token'"))
            conn.commit()
    token = _get_or_create_persistent_token()
    return {"token": token}


@router.websocket("/ws/{token}/{role}")
async def mobile_websocket(websocket: WebSocket, token: str, role: str) -> None:
    await websocket.accept()

    session = manager.get(token)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    if role == "phone":
        if session.phone_ws:
            try:
                await session.phone_ws.close()
            except Exception:
                pass
        session.phone_ws = websocket
        await websocket.send_json({"type": "server_info", "instance_id": SERVER_INSTANCE_ID})
        await session.send_to_desktop({"type": "phone_connected"})
    elif role == "desktop":
        session.desktop_ws = websocket
        if session.phone_connected:
            await websocket.send_json({"type": "phone_connected"})
    else:
        await websocket.close(code=4003, reason="Invalid role")
        return

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if role == "phone":
                await session.send_to_desktop(data)
            else:
                await session.send_to_phone(data)

    except WebSocketDisconnect:
        if role == "phone":
            session.phone_ws = None
            await session.send_to_desktop({"type": "phone_disconnected"})
        else:
            session.desktop_ws = None
        manager.remove_if_empty(token)
    except Exception:
        if role == "phone":
            session.phone_ws = None
        else:
            session.desktop_ws = None
        manager.remove_if_empty(token)
