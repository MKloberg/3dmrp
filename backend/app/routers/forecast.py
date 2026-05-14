import httpx
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Dict
from collections import defaultdict

from ..database import get_db
from ..models import Order, OrderStatus, FilamentSpec
from ..schemas import ForecastItem, ForecastResponse, ContributingOrder
from .settings import get_setting

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


def _grams_per_item(item) -> Dict[int, float]:
    """Returns {filament_spec_id: grams_per_item} for one copy of the item.

    For advanced-routing items, calculates per-item grams from routing steps:
      grams_per_item = step.grams * (parts_per_item / quantity_on_plate)
    summed across all steps of the first/default routing.
    Falls back to item.filament_requirements for simple items.
    """
    if item.use_advanced_routing and item.routings:
        routing = next((r for r in item.routings if r.is_default), item.routings[0])
        grams: Dict[int, float] = defaultdict(float)
        for step in routing.steps:
            if not step.quantity_on_plate:
                continue
            ratio = step.parts_per_item / step.quantity_on_plate
            for sf in step.filaments:
                grams[sf.filament_spec_id] += sf.grams * ratio
        return dict(grams)
    return {req.filament_spec_id: req.grams for req in item.filament_requirements}


async def _fetch_spoolman_stock(url: str) -> tuple[bool, Dict[int, float]]:
    """Returns (connected, {spoolman_filament_id: remaining_grams}), skipping archived spools."""
    if not url:
        return False, {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/v1/spool")
            resp.raise_for_status()
            spools = resp.json()
        stock: Dict[int, float] = defaultdict(float)
        for spool in spools:
            if spool.get("archived"):
                continue
            fil = spool.get("filament", {})
            fid = fil.get("id")
            remaining = spool.get("remaining_weight") or 0.0
            if fid is not None:
                stock[fid] += remaining
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

    # Historical rate from recently completed orders
    completed_orders = (
        db.query(Order)
        .filter(Order.status == OrderStatus.complete, Order.date_ordered >= cutoff)
        .all()
    )
    grams_used: Dict[int, float] = defaultdict(float)
    for order in completed_orders:
        for spec_id, g in _grams_per_item(order.item).items():
            grams_used[spec_id] += g * order.quantity

    # Committed demand from all pending/printing orders
    committed_grams: Dict[int, float] = defaultdict(float)
    contributing_orders_map: Dict[int, list] = defaultdict(list)
    active_orders = (
        db.query(Order)
        .filter(Order.status.in_([OrderStatus.pending, OrderStatus.printing]))
        .all()
    )
    for order in active_orders:
        c = order.customer
        if c:
            customer_name = " ".join(filter(None, [c.given_name, c.family_name])) or c.company_name or ""
        else:
            customer_name = order.customer_name or ""
        item_grams = _grams_per_item(order.item)
        for spec_id, g in item_grams.items():
            grams_per_order = g * order.quantity
            committed_grams[spec_id] += grams_per_order
            contributing_orders_map[spec_id].append(ContributingOrder(
                order_id=order.id,
                model_name=order.item.name,
                customer_name=customer_name,
                quantity=order.quantity,
                grams_needed=round(grams_per_order, 1),
                status=order.status.value,
            ))

    spoolman_url = get_setting(db, "spoolman_url")
    connected, stock = await _fetch_spoolman_stock(spoolman_url)

    all_specs = db.query(FilamentSpec).all()

    model_spec_ids: set[int] = set(grams_used.keys()) | set(committed_grams.keys())

    items = []
    for spec in all_specs:
        if spec.id not in model_spec_ids:
            continue

        used = grams_used.get(spec.id, 0.0)
        per_week = used / lookback_weeks
        rate_demand = per_week * forecast_weeks
        committed = committed_grams.get(spec.id, 0.0)

        total_demand = max(rate_demand, committed)

        on_hand = stock.get(spec.spoolman_id, 0.0) if spec.spoolman_id else 0.0

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
            contributing_orders=contributing_orders_map.get(spec.id, []),
        ))

    items.sort(key=lambda x: (-x.shortfall_grams, x.filament_spec.material))

    return ForecastResponse(
        forecast_weeks=forecast_weeks,
        lookback_weeks=lookback_weeks,
        items=items,
        spoolman_url=spoolman_url or None,
        spoolman_connected=connected,
    )
