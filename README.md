# 3DMRP — 3D Print Management & Resource Planning

![3DMRP Logo](frontend/public/logo.png)

A self-hosted web app for managing 3D print items, filament inventory, orders, and print queues. Built for multi-printer workshops that want a single place to track what gets printed, with what filament, and for whom.

---

## Features

### Dashboard

Live overview of your shop at a glance.

- Pending, printing, overdue, and stock alert counts
- Quick-nav cards with live counts for Items, Orders, Customers, Printers, and Filaments
- Live printer status cards with progress and temperatures — click any card to jump to that printer
- Active orders sorted by urgency with due-date badges
- Filament stock alerts with one-click purchase links

![Dashboard](docs/screenshots/dashboard.png)

---

### Items

Store and manage your printable models.

- Name, SKU, description, notes, and multiple photos per item
- Upload photos or paste images directly from the clipboard
- Click any thumbnail to open a full-size lightbox with prev/next navigation, download, crop, and delete
- Define filament requirements (material, color, grams) with drag-and-drop slot ordering
- Tag items with color-coded categories and filter by tag
- Associate a slicer project file (`.3mf`) per printer and launch the slicer directly from the browser
- **STL Source URL** — store a link to the original STL source (Printables, Thingiverse, etc.); clickable directly from the item list

![Items](docs/screenshots/items.png)

#### Production Steps (Routing)

Define how an item gets made — step by step.

- Multi-step production workflows per item (e.g. Print → Post-process → Assembly)
- Assign a printer type and quantity-on-plate to each step
- Each step carries its own filament requirements, auto-populated from the item's filament specs
- Switch between simple mode (single default routing) and advanced mode (multiple named routings)
- Rename routings inline; reorder and delete steps

#### G-Code in Production Steps

Send G-Code files to printers directly from within each production step.

- Files are served from the **G-Code Repository** (see Settings → Slicers) organized by slicer and printer type
- Dropdown file selector per step — selection persists across sessions
- **Send** uploads the file to the printer via Moonraker; a progress bar tracks the upload
- **Send & Start** uploads and immediately starts the print — but first shows a **Filament Check** modal:
  - Printer image, name, and live job status at the top
  - Slot-by-slot comparison table: what's loaded vs. what the step requires (with manufacturer and color names)
  - Header turns green when all slots match, red when there's a mismatch
  - Refresh button re-reads loaded filament state from the printer in real time
- Live printer status is shown inline for each printer: current state dot, active filename, and print progress bar

---

### Filaments

Manage your filament library and track stock.

- Store specs with material, color, brand, temperature settings, and purchase URL
- Sync specs directly from a [Spoolman](https://github.com/Donkie/Spoolman) instance
- Live stock levels pulled from Spoolman for forecasting

![Filaments](docs/screenshots/filaments.png)

---

### Printers

Connect to and monitor your Klipper/Moonraker printers.

- Add printers by URL; inline-edit name and URL at any time
- Live status: print state, progress bar, temperatures, and ETA
- Webcam feed via snapshot polling (Moonraker camera API)
- Browse print job history and import completed jobs directly as item records
- Thumbnail preview shown during import
- Filament slot tracking with RFID auto-sync — reads `filament_detect` from Moonraker and matches slots to your filament library by material and color
- Assign a **Printer Type** to each printer with optional slot count override

![Printers](docs/screenshots/printers.png)

---

### Orders

Track print orders from intake to delivery.

- Customer, quantity, due date, and status (pending → printing → complete)
- Link each order to an item so filament requirements are always visible
- Create orders before an item exists — a placeholder is auto-created and can be filled in later
- **STL Source URL** — pre-filled from the linked item, editable per order, and written back to the item on save

![Orders](docs/screenshots/orders.png)

---

### Customers

Full CRM built in.

- Name, email, phone, address, notes, and category per customer
- Import from [Square](https://squareup.com) via the Square API; sync to keep records current
- Order history visible per customer

![Customers](docs/screenshots/customers.png)

---

### Forecast

Predict filament demand before you run out.

- Demand forecast based on recent order history
- Projects filament consumption vs. Spoolman stock levels
- Flags each filament as OK / low / critical

![Forecast](docs/screenshots/forecast.png)

---

### Reports

#### Filament Inventory

Live view of all active Spoolman spools — spool count, remaining weight per filament, color swatches, and progress bars. Grouped by material. Auto-refreshes every 60 seconds.

![Filament Inventory](docs/screenshots/filament-inventory.png)

---

### Settings

Settings are split into focused sub-pages accessible from a landing page.

![Settings](docs/screenshots/settings.png)

- **General** — light/dark theme; Spoolman URL with live connection test; Square Personal Access Token; preferred Amazon store for purchase link auto-fill
- **Slicers** — add, edit, and remove slicer software entries with executable paths; configure and scaffold the **G-Code Repository**
- **Printer Types** — define printer categories with default slot counts and slicer assignments
- **Database** — download a full backup or restore from a previous backup file

#### G-Code Repository

A structured folder tree that stores G-Code files for each item, organized by slicer and printer type.

- Path structure: `{repo root}/{slicer name}/{printer type name}/{item name}/*.gcode`
- Only printer types that have a slicer assigned are included in the tree
- Configure the root folder path in **Settings → Slicers**
- **Scaffold** button creates the full folder structure for all current items and printer types in one click
- Renaming an item automatically offers to rename its corresponding G-Code folders
- Files placed in the correct folder appear in the file dropdown on the Production Steps page

---

### Navigation

The sidebar uses a collapsible tree. **Settings** and **Reports** expand in place to show their sub-pages, and auto-expand when you navigate directly to a sub-page.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, React Query |
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Frontend serving | nginx in Docker |
| Backend | Native (Windows), started via `start.ps1` |

The frontend runs in Docker behind nginx. The backend runs natively on the host so it can launch local slicer applications (OrcaSlicer, PrusaSlicer, etc.) directly.

---

## Setup

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the frontend)
- [uv](https://github.com/astral-sh/uv) (Python package manager, for the backend)

### 1. Start the backend

```powershell
cd backend
.\start.ps1
```

This creates `backend/data/` for the SQLite database and uploaded images, then starts the API on `http://localhost:8000`.

### 2. Start the frontend

```powershell
docker compose up -d
```

The app is now available at `http://localhost:7891` (or set `PORT` in a `.env` file to use a different port).

### Environment variables

Copy `.env.example` to `.env` and adjust as needed:

```
PORT=7891
```

The backend reads `DATABASE_URL` and `DATA_DIR` from the environment — these are set automatically by `start.ps1`.

---

## Data

All data is stored in `backend/data/`:
- `3dmrp.db` — SQLite database
- `images/` — uploaded item and printer images

Use **Settings → Database** to download a backup or restore from one.

---

## Slicer integration

1. Go to **Settings → Slicers** and add your slicer with its executable path (e.g. `C:\Program Files\OrcaSlicer\OrcaSlicer.exe`).
2. Go to **Settings → Printer Types**, create a type, and assign the slicer to it.
3. On the Printers page, assign each printer to its type.
4. On any item, set the path to its `.3mf` file for a given printer. An **Open** button will appear that launches the slicer with the file pre-loaded.

### G-Code Repository setup

1. In **Settings → Slicers**, set the **G-Code Repository Root** to a folder on your machine (e.g. `D:\gcode`).
2. Click **Scaffold Repository** — this creates the full `{slicer}/{printer type}/{item}` folder tree for all current items.
3. Export G-Code from your slicer into the matching folder. The file will appear automatically in the production step dropdown.
4. On the Items page, open any item's Production Steps, expand the G-Code section for a step, select a file, and use **Send** or **Send & Start** to push it to a printer.

---

## Spoolman integration

Set the Spoolman URL in **Settings → General** (e.g. `http://192.168.1.100:7912`). Once connected:
- Filament specs can be imported from Spoolman
- Live spool weights feed into the forecast to calculate shortfalls
- **Reports → Filament Inventory** gives a real-time view of all active spools
