from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Bumped on every Spoolman webhook call; frontend polls this to know when to refetch.
_spoolman_version: int = 0


@router.post("/spoolman")
async def spoolman_webhook(request: Request):
    global _spoolman_version
    _spoolman_version += 1
    return {"ok": True}


@router.get("/spoolman/version")
def spoolman_version():
    return {"version": _spoolman_version}
