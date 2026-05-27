import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import engine, Base
from .routers import filaments, items, orders, spoolman, forecast, settings, printers, tags, customers, slicers, printer_types, gcode, filepicker, nfc_sessions, mobile_ws, print_labels, webhooks, print_jobs, tools

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

_osp_created = False  # set True inside migration block when order_step_progress is first created

# Add any columns introduced after initial schema creation
_NEW_COLUMNS = [
    ("price",                  "REAL"),
    ("density",                "REAL"),
    ("diameter",               "REAL"),
    ("weight",                 "REAL"),
    ("spool_weight",           "REAL"),
    ("settings_extruder_temp", "INTEGER"),
    ("settings_bed_temp",      "INTEGER"),
    ("article_number",         "TEXT DEFAULT ''"),
    ("comment",                "TEXT DEFAULT ''"),
    ("external_id",            "TEXT DEFAULT ''"),
    ("extra",                  "TEXT DEFAULT '{}'"),
    ("spoolman_id",            "INTEGER"),
    ("purchase_url",           "TEXT DEFAULT ''"),
]

with engine.connect() as conn:
    existing = {row[1] for row in conn.execute(text("PRAGMA table_info(filament_specs)"))}
    for col, col_type in _NEW_COLUMNS:
        if col not in existing:
            conn.execute(text(f"ALTER TABLE filament_specs ADD COLUMN {col} {col_type}"))

    existing_mf = {row[1] for row in conn.execute(text("PRAGMA table_info(model_filaments)"))}
    if "sort_order" not in existing_mf:
        conn.execute(text("ALTER TABLE model_filaments ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("UPDATE model_filaments SET sort_order = id"))

    existing_printers = {row[1] for row in conn.execute(text("PRAGMA table_info(printers)"))}
    if "image_path" not in existing_printers:
        conn.execute(text("ALTER TABLE printers ADD COLUMN image_path TEXT"))
    if "slicer_name" not in existing_printers:
        conn.execute(text("ALTER TABLE printers ADD COLUMN slicer_name TEXT"))
    if "slicer_executable" not in existing_printers:
        conn.execute(text("ALTER TABLE printers ADD COLUMN slicer_executable TEXT"))

    existing_tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
    if "tags" not in existing_tables:
        conn.execute(text("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color_hex TEXT NOT NULL DEFAULT '#6366f1')"))
    if "model_tags" not in existing_tables:
        conn.execute(text("CREATE TABLE model_tags (model_id INTEGER NOT NULL REFERENCES print_models(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (model_id, tag_id))"))

    if "customers" not in existing_tables:
        conn.execute(text("""
            CREATE TABLE customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                given_name TEXT NOT NULL DEFAULT '',
                family_name TEXT NOT NULL DEFAULT '',
                company_name TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                address_line1 TEXT NOT NULL DEFAULT '',
                address_line2 TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                state TEXT NOT NULL DEFAULT '',
                postal_code TEXT NOT NULL DEFAULT '',
                country TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                square_id TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))

    existing_orders = {row[1] for row in conn.execute(text("PRAGMA table_info(orders)"))}
    if "customer_id" not in existing_orders:
        conn.execute(text("ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL"))
        # Migrate existing customer_name text into customer records
        rows = conn.execute(text("SELECT DISTINCT customer_name FROM orders WHERE customer_name != '' AND customer_name IS NOT NULL")).fetchall()
        for (name,) in rows:
            conn.execute(text("INSERT INTO customers (given_name) VALUES (:name)"), {"name": name})
            cust_id = conn.execute(text("SELECT id FROM customers WHERE given_name = :name ORDER BY id DESC LIMIT 1"), {"name": name}).scalar()
            conn.execute(text("UPDATE orders SET customer_id = :cid WHERE customer_name = :name"), {"cid": cust_id, "name": name})

    # Rename print_models → items (re-query tables after create_all may have added 'items')
    existing_tables_current = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
    if "print_models" in existing_tables_current:
        if "items" not in existing_tables_current:
            conn.execute(text("ALTER TABLE print_models RENAME TO items"))
        else:
            # create_all already made an empty 'items'; migrate data then drop old table
            pm_count = conn.execute(text("SELECT COUNT(*) FROM print_models")).scalar()
            if pm_count > 0:
                conn.execute(text("INSERT INTO items (id, name, description, notes, created_at, sku) SELECT id, name, description, notes, created_at, '' FROM print_models"))
            conn.execute(text("DROP TABLE print_models"))

    existing_items_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(items)"))}
    if "sku" not in existing_items_cols:
        conn.execute(text("ALTER TABLE items ADD COLUMN sku TEXT NOT NULL DEFAULT ''"))

    # Rename print_model_id → item_id in orders
    existing_orders_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(orders)"))}
    if "print_model_id" in existing_orders_cols and "item_id" not in existing_orders_cols:
        conn.execute(text("ALTER TABLE orders RENAME COLUMN print_model_id TO item_id"))

    if "slicers" not in existing_tables:
        conn.execute(text("""
            CREATE TABLE slicers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                executable_path TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))

    if "printer_types" not in existing_tables:
        conn.execute(text("""
            CREATE TABLE printer_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                slicer_id INTEGER REFERENCES slicers(id) ON DELETE SET NULL,
                slot_count INTEGER NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))

    existing_printers2 = {row[1] for row in conn.execute(text("PRAGMA table_info(printers)"))}
    if "printer_type_id" not in existing_printers2:
        conn.execute(text("ALTER TABLE printers ADD COLUMN printer_type_id INTEGER REFERENCES printer_types(id) ON DELETE SET NULL"))
    if "slot_count_override" not in existing_printers2:
        conn.execute(text("ALTER TABLE printers ADD COLUMN slot_count_override INTEGER"))

    existing_pt2 = {row[1] for row in conn.execute(text("PRAGMA table_info(printer_types)"))}
    if "hourly_rate" not in existing_pt2:
        conn.execute(text("ALTER TABLE printer_types ADD COLUMN hourly_rate REAL"))
    if "power_watts" not in existing_pt2:
        conn.execute(text("ALTER TABLE printer_types ADD COLUMN power_watts REAL"))
    if "power_kwh" not in existing_pt2:
        conn.execute(text("ALTER TABLE printer_types ADD COLUMN power_kwh REAL"))

    existing_steps = {row[1] for row in conn.execute(text("PRAGMA table_info(routing_steps)"))}
    if "parts_per_item" not in existing_steps:
        conn.execute(text("ALTER TABLE routing_steps ADD COLUMN parts_per_item INTEGER NOT NULL DEFAULT 1"))
    if "estimated_print_time" not in existing_steps:
        conn.execute(text("ALTER TABLE routing_steps ADD COLUMN estimated_print_time INTEGER"))
    if "include_in_planning" not in existing_steps:
        conn.execute(text("ALTER TABLE routing_steps ADD COLUMN include_in_planning BOOLEAN NOT NULL DEFAULT 1"))
    if "gcode_file" not in existing_steps:
        conn.execute(text("ALTER TABLE routing_steps ADD COLUMN gcode_file TEXT"))

    existing_routings = {row[1] for row in conn.execute(text("PRAGMA table_info(routings)"))}
    if "include_in_summary" not in existing_routings:
        conn.execute(text("ALTER TABLE routings ADD COLUMN include_in_summary BOOLEAN NOT NULL DEFAULT 1"))

    existing_items_cols2 = {row[1] for row in conn.execute(text("PRAGMA table_info(items)"))}
    if "use_advanced_routing" not in existing_items_cols2:
        conn.execute(text("ALTER TABLE items ADD COLUMN use_advanced_routing BOOLEAN NOT NULL DEFAULT 0"))
    if "stl_source_url" not in existing_items_cols2:
        conn.execute(text("ALTER TABLE items ADD COLUMN stl_source_url TEXT NOT NULL DEFAULT ''"))


    existing_tables2 = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
    if "post_processing_costs" not in existing_tables2:
        conn.execute(text("""
            CREATE TABLE post_processing_costs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                label TEXT NOT NULL,
                cost_per_item REAL NOT NULL DEFAULT 0.0,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
        """))

    # Migrate model_slicer_files from printer_id → printer_type_id
    existing_msf = {row[1] for row in conn.execute(text("PRAGMA table_info(model_slicer_files)"))}
    if "printer_type_id" not in existing_msf:
        conn.execute(text("""
            CREATE TABLE model_slicer_files_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                print_model_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                printer_type_id INTEGER NOT NULL REFERENCES printer_types(id) ON DELETE CASCADE,
                file_path TEXT NOT NULL,
                UNIQUE (print_model_id, printer_type_id)
            )
        """))
        if "printer_id" in existing_msf:
            conn.execute(text("""
                INSERT OR IGNORE INTO model_slicer_files_new (print_model_id, printer_type_id, file_path)
                SELECT msf.print_model_id, p.printer_type_id, msf.file_path
                FROM model_slicer_files msf
                JOIN printers p ON p.id = msf.printer_id
                WHERE p.printer_type_id IS NOT NULL
            """))
        conn.execute(text("DROP TABLE IF EXISTS model_slicer_files"))
        conn.execute(text("ALTER TABLE model_slicer_files_new RENAME TO model_slicer_files"))

    existing_pt3 = {row[1] for row in conn.execute(text("PRAGMA table_info(printer_types)"))}
    if "has_afc" not in existing_pt3:
        conn.execute(text("ALTER TABLE printer_types ADD COLUMN has_afc BOOLEAN NOT NULL DEFAULT 0"))
    if "has_nfc_detect" not in existing_pt3:
        conn.execute(text("ALTER TABLE printer_types ADD COLUMN has_nfc_detect BOOLEAN NOT NULL DEFAULT 0"))
    if "has_mainsail_spoolman" not in existing_pt3:
        conn.execute(text("ALTER TABLE printer_types ADD COLUMN has_mainsail_spoolman BOOLEAN NOT NULL DEFAULT 0"))

    existing_fs2 = {row[1] for row in conn.execute(text("PRAGMA table_info(filament_specs)"))}
    if "quality_rating" not in existing_fs2:
        conn.execute(text("ALTER TABLE filament_specs ADD COLUMN quality_rating INTEGER"))

    existing_orders4 = {row[1] for row in conn.execute(text("PRAGMA table_info(orders)"))}
    if "quantity_printed" not in existing_orders4:
        conn.execute(text("ALTER TABLE orders ADD COLUMN quantity_printed INTEGER NOT NULL DEFAULT 0"))

    existing_tables3 = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
    if "print_jobs" not in existing_tables3:
        conn.execute(text("""
            CREATE TABLE print_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
                routing_step_id INTEGER REFERENCES routing_steps(id) ON DELETE SET NULL,
                printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
                moonraker_job_id TEXT,
                filename TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'in_progress',
                quantity_credited INTEGER NOT NULL DEFAULT 0,
                start_time DATETIME,
                end_time DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (printer_id, moonraker_job_id)
            )
        """))

    _osp_migration_done = conn.execute(
        text("SELECT value FROM settings WHERE key = 'migration_order_step_progress_v1'")
    ).fetchone()
    if not _osp_migration_done:
        # Backfill: one completed job = quantity_on_plate parts for that step
        conn.execute(text("""
            INSERT OR IGNORE INTO order_step_progress (order_id, routing_step_id, parts_printed)
            SELECT pj.order_id, pj.routing_step_id, SUM(rs.quantity_on_plate)
            FROM print_jobs pj
            JOIN routing_steps rs ON rs.id = pj.routing_step_id
            WHERE pj.status = 'completed'
              AND pj.order_id IS NOT NULL
              AND pj.routing_step_id IS NOT NULL
            GROUP BY pj.order_id, pj.routing_step_id
        """))
        # Fix quantity_credited to mean parts produced (= quantity_on_plate), not items
        conn.execute(text("""
            UPDATE print_jobs
            SET quantity_credited = (
                SELECT rs.quantity_on_plate FROM routing_steps rs WHERE rs.id = print_jobs.routing_step_id
            )
            WHERE status = 'completed' AND routing_step_id IS NOT NULL
        """))
        conn.execute(text("INSERT INTO settings (key, value) VALUES ('migration_order_step_progress_v1', '1')"))
        _osp_created = True

    conn.commit()


if _osp_created:
    from .models import Order as _Order, Routing as _Routing, OrderStepProgress as _OSP, OrderStatus as _OS
    _db = SessionLocal()
    try:
        affected = [r[0] for r in _db.execute(text("SELECT DISTINCT order_id FROM order_step_progress")).fetchall()]
        for _oid in affected:
            _order = _db.query(_Order).filter(_Order.id == _oid).first()
            if not _order:
                continue
            _routing = (
                _db.query(_Routing)
                .filter(_Routing.item_id == _order.item_id)
                .order_by(_Routing.is_default.desc(), _Routing.sort_order.asc(), _Routing.id.asc())
                .first()
            )
            if not _routing or not _routing.steps:
                continue
            _min = None
            for _rs in _routing.steps:
                if _rs.parts_per_item <= 0:
                    continue
                _sp = _db.query(_OSP).filter(_OSP.order_id == _oid, _OSP.routing_step_id == _rs.id).first()
                _items = (_sp.parts_printed if _sp else 0) // _rs.parts_per_item
                if _min is None or _items < _min:
                    _min = _items
            if _min is None:
                continue
            _new_qty = min(_min, _order.quantity)
            _order.quantity_printed = _new_qty
            if _new_qty >= _order.quantity:
                _order.status = _OS.complete
            elif _new_qty > 0 and _order.status not in (_OS.cancelled,):
                _order.status = _OS.printing
            elif _new_qty == 0 and _order.status == _OS.complete:
                _order.status = _OS.pending
        _db.commit()
    finally:
        _db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from .services.moonraker_ws import start_ws_manager
    try:
        await start_ws_manager()
    except Exception:
        logger.exception("Failed to start WebSocket manager")
    yield


app = FastAPI(title="3DMRP", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(filaments.router)
app.include_router(items.router)
app.include_router(orders.router)
app.include_router(spoolman.router)
app.include_router(forecast.router)
app.include_router(settings.router)
app.include_router(printers.router)
app.include_router(tags.router)
app.include_router(customers.router)
app.include_router(slicers.router)
app.include_router(printer_types.router)
app.include_router(gcode.router)
app.include_router(filepicker.router)
app.include_router(nfc_sessions.router)
app.include_router(mobile_ws.router)
app.include_router(print_labels.router)
app.include_router(webhooks.router)
app.include_router(print_jobs.router)
app.include_router(tools.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
