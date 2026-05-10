import httpx
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Dict
from collections import defaultdict

from ..database import get_db
from ..models import Order, OrderStatus, FilamentSpec
from ..schemas import ForecastItem, ForecastResponse
from .settings import get_setting

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


def _material_color_key(material: str, color_name: str) -> str:
    return f"{material.lower()}::{color_name.lower()}"


async def _fetch_spoolman_stock(url: str) -> tuple[bool, Dict[str, float]]:
    if not url:
        return False, {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/v1/spool")
            resp.raise_for_status()
            spools = resp.json()
        stock: Dict[str, float] = defaultdict(float)
        for spool in spools:
            fil = spool.get("filament", {})
            material = fil.get("material", "")
            color_name = fil.get("color_name", "")
            remaining = spool.get("remaining_weight") or 0.0
            if material and color_name:
                key = _material_color_key(material, color_name)
                stock[key] += remaining
        return True, dict(stock)
    except Exception:
        return False, {}


@router.get("", response_model=ForecastResponse)
async def get_forecast(
    forecast_weeks: int = Query(4, ge=1, le=52),
    lookback_weeks: int = Query(4, ge=1, le=52),
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(weeks=lookback_weeks)

    completed_orders = (
        db.query(Order)
        .filter(Order.status == OrderStatus.complete, Order.date_ordered >= cutoff)
        .all()
    )

    # Aggregate grams used per filament spec over the lookback window
    grams_used: Dict[int, float] = defaultdict(float)
    for order in completed_orders:
        for req in order.print_model.filament_requirements:
            grams_used[req.filament_spec_id] += req.grams * order.quantity

    spoolman_url = get_setting(db, "spoolman_url")
    connected, stock = await _fetch_spoolman_stock(spoolman_url)

    all_specs = db.query(FilamentSpec).all()

    # Include specs that appear in any model, even with zero recent demand
    model_spec_ids: set[int] = set()
    for order in db.query(Order).filter(Order.status != OrderStatus.cancelled).all():
        for req in order.print_model.filament_requirements:
            model_spec_ids.add(req.filament_spec_id)
    for spec_id in grams_used:
        model_spec_ids.add(spec_id)

    items = []
    for spec in all_specs:
        if spec.id not in model_spec_ids:
            continue

        used = grams_used.get(spec.id, 0.0)
        per_week = used / lookback_weeks
        total_demand = per_week * forecast_weeks

        key = _material_color_key(spec.material, spec.color_name)
        on_hand = stock.get(key, 0.0)

        shortfall = max(0.0, total_demand - on_hand)
        if shortfall == 0:
            status = "ok"
        elif on_hand < total_demand * 0.5:
            status = "critical"
        else:
            status = "low"

        items.append(ForecastItem(
            filament_spec=spec,
            demand_grams_per_week=round(per_week, 1),
            forecast_weeks=forecast_weeks,
            total_demand_grams=round(total_demand, 1),
            spoolman_stock_grams=round(on_hand, 1),
            shortfall_grams=round(shortfall, 1),
            status=status,
        ))

    items.sort(key=lambda x: (-x.shortfall_grams, x.filament_spec.material))

    return ForecastResponse(
        forecast_weeks=forecast_weeks,
        lookback_weeks=lookback_weeks,
        items=items,
        spoolman_url=spoolman_url or None,
        spoolman_connected=connected,
    )
