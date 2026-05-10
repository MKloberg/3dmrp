from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import engine, Base
from .routers import filaments, print_models, orders, spoolman, forecast, settings, printers, tags, customers

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
app.include_router(print_models.router)
app.include_router(orders.router)
app.include_router(spoolman.router)
app.include_router(forecast.router)
app.include_router(settings.router)
app.include_router(printers.router)
app.include_router(tags.router)
app.include_router(customers.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
