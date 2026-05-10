from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import engine, Base
from .routers import filaments, print_models, orders, spoolman, forecast, settings, printers

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
