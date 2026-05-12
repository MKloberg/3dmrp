from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import engine, Base
from .routers import filaments, items, orders, spoolman, forecast, settings, printers, tags, customers, slicers, printer_types, gcode

Base.metadata.create_all(bind=engine)

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

    conn.commit()

app = FastAPI(title="3DMRP", version="1.0.0")

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
