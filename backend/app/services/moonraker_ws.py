import asyncio
import json
import logging
from datetime import datetime
from typing import Optional

import httpx
import websockets

from ..database import SessionLocal
from ..models import Order, OrderStatus, OrderStepProgress, Printer, PrintJob, Routing, RoutingStep

logger = logging.getLogger(__name__)

_ws_tasks: list[asyncio.Task] = []


async def start_ws_manager() -> None:
    """Launch a persistent WebSocket task for each printer in the DB."""
    db = SessionLocal()
    try:
        printers = db.query(Printer).all()
        for printer in printers:
            _launch_ws_task(printer.id, printer.url)
        logger.info("WebSocket manager started for %d printer(s)", len(printers))
    finally:
        db.close()

    # Reconcile all printers on startup so in-progress jobs are linked to orders
    # even when the backend restarts mid-print.
    db = SessionLocal()
    try:
        printers = db.query(Printer).all()
        for printer in printers:
            try:
                await _reconcile(printer.id, db)
            except Exception:
                logger.exception("Startup reconcile failed for printer %d", printer.id)
        db.commit()
    finally:
        db.close()


def add_printer_ws(printer_id: int, printer_url: str) -> None:
    """Start a WebSocket task for a newly-added printer (called from async context)."""
    existing = {t.get_name() for t in _ws_tasks if not t.done()}
    if f"ws-printer-{printer_id}" in existing:
        return
    _launch_ws_task(printer_id, printer_url)
    logger.info("WebSocket task started for new printer %d", printer_id)


def _launch_ws_task(printer_id: int, printer_url: str) -> None:
    task = asyncio.create_task(
        _connect_printer(printer_id, printer_url),
        name=f"ws-printer-{printer_id}",
    )
    _ws_tasks.append(task)


async def _connect_printer(printer_id: int, printer_url: str) -> None:
    """Maintain a persistent WebSocket connection with exponential backoff."""
    backoff = [5, 10, 20, 40, 60]
    attempt = 0

    url = printer_url.rstrip("/")
    if url.startswith("https://"):
        ws_url = "wss://" + url[len("https://"):]
    else:
        ws_url = "ws://" + url[len("http://"):]
    ws_url += "/websocket"

    while True:
        try:
            async with websockets.connect(ws_url, open_timeout=10) as ws:
                attempt = 0
                logger.info("Connected to printer %d WebSocket", printer_id)
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        if msg.get("method") == "notify_history_changed":
                            params = msg.get("params", [])
                            event = params[0] if params else {}
                            await _handle_history_changed(printer_id, event)
                    except Exception:
                        logger.exception("Error handling WS message from printer %d", printer_id)
        except Exception as exc:
            delay = backoff[min(attempt, len(backoff) - 1)]
            logger.warning(
                "Printer %d WS disconnected (%s), retry in %ds", printer_id, exc, delay
            )
            attempt += 1
            await asyncio.sleep(delay)


async def _handle_history_changed(printer_id: int, event: dict) -> None:
    action = event.get("action", "")
    job = event.get("job", {})

    if action == "added" or job.get("status") == "in_progress":
        db = SessionLocal()
        try:
            _handle_job_started(printer_id, job, db)
            db.commit()
        except Exception:
            logger.exception("Error handling job-started for printer %d", printer_id)
            db.rollback()
        finally:
            db.close()

    elif action == "finished":
        db = SessionLocal()
        try:
            await _reconcile(printer_id, db)
        except Exception:
            logger.exception("Reconciliation error for printer %d", printer_id)
            db.rollback()
        finally:
            db.close()


def _link_order_to_job(pj: PrintJob, db) -> None:
    """Link the earliest open FIFO order for this job's item, and advance pending → printing.
    Also back-fills item_id and routing_step_id from the filename whenever they are missing."""
    # Always try to resolve item/step from filename if fields are missing.
    if pj.item_id is None and pj.filename:
        pj.item_id = _resolve_item_by_filename(pj.filename, db)
    if pj.routing_step_id is None and pj.filename:
        step = _resolve_step_by_filename(pj.filename, db)
        if step:
            pj.routing_step_id = step.id

    if pj.order_id is not None:
        return
    item_id = pj.item_id
    if item_id is None:
        return
    order = (
        db.query(Order)
        .filter(
            Order.item_id == item_id,
            Order.status.notin_([OrderStatus.complete, OrderStatus.cancelled]),
            Order.quantity_printed < Order.quantity,
        )
        .order_by(Order.date_ordered.asc(), Order.id.asc())
        .first()
    )
    if order is None:
        return
    pj.order_id = order.id
    if order.status == OrderStatus.pending:
        order.status = OrderStatus.printing


def _handle_job_started(printer_id: int, job: dict, db) -> None:
    """Advance linked order from pending → printing when a job goes in_progress."""
    filename = job.get("filename", "")
    moonraker_job_id = job.get("job_id")

    pj: Optional[PrintJob] = None
    if moonraker_job_id:
        pj = (
            db.query(PrintJob)
            .filter(
                PrintJob.printer_id == printer_id,
                PrintJob.moonraker_job_id == moonraker_job_id,
            )
            .first()
        )
    if pj is None and filename:
        pj = (
            db.query(PrintJob)
            .filter(
                PrintJob.printer_id == printer_id,
                PrintJob.filename == filename,
                PrintJob.status == "in_progress",
            )
            .order_by(PrintJob.created_at.desc())
            .first()
        )

    # Back-fill moonraker_job_id on an orphaned in-progress record (created by
    # send_gcode before Moonraker history had the new job) so reconciliation
    # can find and close it correctly when the print finishes.
    if pj and moonraker_job_id and pj.moonraker_job_id is None:
        pj.moonraker_job_id = moonraker_job_id

    # No existing record — job was started externally (not via 3DMRP send-gcode).
    # Create a PrintJob now so the order shows as in-progress and reconciliation
    # can credit it when the print finishes.
    if pj is None and (moonraker_job_id or filename):
        start_ts = job.get("start_time")
        item_id = _resolve_item_by_filename(filename, db) if filename else None
        step = _resolve_step_by_filename(filename, db) if filename else None
        pj = PrintJob(
            printer_id=printer_id,
            moonraker_job_id=moonraker_job_id,
            filename=filename,
            status="in_progress",
            start_time=datetime.utcfromtimestamp(start_ts) if start_ts else None,
            item_id=item_id,
            routing_step_id=step.id if step else None,
        )
        db.add(pj)
        db.flush()

    if pj:
        _link_order_to_job(pj, db)


async def _reconcile(printer_id: int, db) -> None:
    """Sync Moonraker print history with local PrintJob records and apply credits."""
    printer = db.query(Printer).filter(Printer.id == printer_id).first()
    if not printer:
        return

    url = printer.url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{url}/server/history/list", params={"limit": 500})
            resp.raise_for_status()
    except Exception as exc:
        logger.error("Could not fetch history from printer %d: %s", printer_id, exc)
        return

    jobs = resp.json().get("result", {}).get("jobs", [])
    changed = False

    for job_data in jobs:
        moonraker_job_id = job_data.get("job_id")
        if not moonraker_job_id:
            continue

        filename = job_data.get("filename", "")
        status = _map_status(job_data.get("status", ""))
        start_ts = job_data.get("start_time")
        end_ts = job_data.get("end_time")

        existing = (
            db.query(PrintJob)
            .filter(
                PrintJob.printer_id == printer_id,
                PrintJob.moonraker_job_id == moonraker_job_id,
            )
            .first()
        )

        if existing is None:
            # Before creating a brand-new record, check for an orphaned in-progress
            # job (null moonraker_job_id, same filename) left by send_gcode when the
            # Moonraker history hadn't yet reflected the new job.
            orphan = (
                db.query(PrintJob)
                .filter(
                    PrintJob.printer_id == printer_id,
                    PrintJob.filename == filename,
                    PrintJob.moonraker_job_id.is_(None),
                    PrintJob.status == "in_progress",
                )
                .order_by(PrintJob.created_at.desc())
                .first()
            )
            if orphan:
                orphan.moonraker_job_id = moonraker_job_id
                orphan.status = status
                if orphan.start_time is None and start_ts:
                    orphan.start_time = datetime.utcfromtimestamp(start_ts)
                if end_ts:
                    orphan.end_time = datetime.utcfromtimestamp(end_ts)
                pj = orphan
            else:
                pj = PrintJob(
                    printer_id=printer_id,
                    moonraker_job_id=moonraker_job_id,
                    filename=filename,
                    status=status,
                    start_time=datetime.utcfromtimestamp(start_ts) if start_ts else None,
                    end_time=datetime.utcfromtimestamp(end_ts) if end_ts else None,
                )
                db.add(pj)
                db.flush()
            if status == "completed":
                _credit_and_advance(pj, db)
            elif status == "in_progress":
                _handle_job_started(printer_id, job_data, db)
            changed = True
        elif existing.status != status:
            existing.status = status
            if existing.end_time is None and end_ts:
                existing.end_time = datetime.utcfromtimestamp(end_ts)
            if status == "completed" and existing.quantity_credited == 0:
                _credit_and_advance(existing, db)
            changed = True

        # Unconditional backfill for existing records — runs even when status unchanged
        if existing is not None:
            if existing.start_time is None and start_ts:
                existing.start_time = datetime.utcfromtimestamp(start_ts)
                changed = True
            if existing.end_time is None and end_ts:
                existing.end_time = datetime.utcfromtimestamp(end_ts)
                changed = True
            if existing.order_id is None or existing.routing_step_id is None:
                _link_order_to_job(existing, db)
                if existing.order_id is not None or existing.routing_step_id is not None:
                    changed = True

    if changed:
        db.commit()


def _map_status(moon_status: str) -> str:
    return {
        "completed": "completed",
        "cancelled": "cancelled",
        "error": "error",
        "in_progress": "in_progress",
    }.get(moon_status, moon_status)


def _credit_and_advance(print_job: PrintJob, db) -> None:
    """Credit parts produced to order_step_progress and recompute order completion."""
    item_id = print_job.item_id
    if item_id is None:
        item_id = _resolve_item_by_filename(print_job.filename, db)

    if item_id is None:
        print_job.quantity_credited = 0
        return

    step: Optional[RoutingStep] = None
    if print_job.routing_step_id:
        step = db.query(RoutingStep).filter(RoutingStep.id == print_job.routing_step_id).first()
    if step is None:
        step = _resolve_step_by_filename(print_job.filename, db)

    order: Optional[Order] = None
    if print_job.order_id:
        order = db.query(Order).filter(Order.id == print_job.order_id).first()
        if order and (
            order.status in (OrderStatus.complete, OrderStatus.cancelled)
            or order.quantity_printed >= order.quantity
        ):
            order = None

    if order is None:
        order = (
            db.query(Order)
            .filter(
                Order.item_id == item_id,
                Order.status.notin_([OrderStatus.complete, OrderStatus.cancelled]),
                Order.quantity_printed < Order.quantity,
            )
            .order_by(Order.date_ordered.asc(), Order.id.asc())
            .first()
        )

    if order is None:
        print_job.quantity_credited = 0
        return

    if step is None:
        # No routing step — legacy fallback: credit 1 item per completed job
        order.quantity_printed = min(order.quantity_printed + 1, order.quantity)
        print_job.quantity_credited = 1
        print_job.order_id = order.id
        _advance_status(order)
        return

    # Each completed plate run produces quantity_on_plate parts for this step
    parts_produced = step.quantity_on_plate

    progress = (
        db.query(OrderStepProgress)
        .filter(
            OrderStepProgress.order_id == order.id,
            OrderStepProgress.routing_step_id == step.id,
        )
        .first()
    )
    if progress is None:
        progress = OrderStepProgress(
            order_id=order.id,
            routing_step_id=step.id,
            parts_printed=0,
        )
        db.add(progress)
        db.flush()

    progress.parts_printed += parts_produced
    print_job.quantity_credited = parts_produced
    print_job.order_id = order.id

    # Recompute order.quantity_printed as the bottleneck across all steps in this routing.
    # An item is only complete when every step has produced enough parts.
    routing = db.query(Routing).filter(Routing.id == step.routing_id).first()
    if routing is None or not routing.steps:
        order.quantity_printed = min(order.quantity_printed + 1, order.quantity)
        _advance_status(order)
        return

    min_complete: Optional[int] = None
    for rs in routing.steps:
        if rs.parts_per_item <= 0:
            continue
        sp = (
            db.query(OrderStepProgress)
            .filter(
                OrderStepProgress.order_id == order.id,
                OrderStepProgress.routing_step_id == rs.id,
            )
            .first()
        )
        items_complete = (sp.parts_printed if sp else 0) // rs.parts_per_item
        if min_complete is None or items_complete < min_complete:
            min_complete = items_complete

    order.quantity_printed = min(min_complete or 0, order.quantity)
    _advance_status(order)


def _advance_status(order: Order) -> None:
    if order.quantity_printed >= order.quantity:
        order.status = OrderStatus.complete


def _resolve_item_by_filename(filename: str, db) -> Optional[int]:
    row = (
        db.query(Routing.item_id)
        .join(RoutingStep, RoutingStep.routing_id == Routing.id)
        .filter(RoutingStep.gcode_file.contains(filename))
        .order_by(RoutingStep.id.desc())
        .first()
    )
    return row[0] if row else None


def _resolve_step_by_filename(filename: str, db) -> Optional[RoutingStep]:
    return (
        db.query(RoutingStep)
        .filter(RoutingStep.gcode_file.contains(filename))
        .order_by(RoutingStep.id.desc())
        .first()
    )
