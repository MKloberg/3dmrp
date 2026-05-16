# 3DMRP — 3D Print Management & Resource Planning

![3DMRP Logo](frontend/public/logo.png)

A self-hosted web app for managing 3D print items, filament inventory, orders, and print queues. Built for multi-printer workshops that want a single place to track what gets printed, with what filament, and for whom.

> **v0.3.0 note:** 3DMRP started as a production planning tool — a place to manage items, orders, and filament. It has quietly grown into something more: a **fleet command and control center** for Klipper/Moonraker printer farms. You can now monitor every printer's live status, load and unload filament lanes remotely, mirror and interact with the printer touchscreen, and see aggregated fleet statistics across your entire operation — all from a single browser tab. The MRP roots are still here; the scope is now bigger.

---

## Features

### Dashboard

Live overview of your shop at a glance.

- Pending, printing, overdue, and stock alert counts
- Quick-nav cards with live counts for Items, Orders, Customers, Printers, and Filaments
- Live printer status cards with progress and temperatures — click any card to jump to that printer
- **Fleet Stats** — aggregated across all printers: total jobs, total print time, total filament used, longest print, and job outcome breakdown (completed / cancelled / errors)
- Active orders sorted by urgency with due-date badges
- Filament stock alerts with one-click purchase links

![Dashboard](docs/screenshots/dashboard.png)
<!-- SCREENSHOT PLACEHOLDER: Full dashboard showing the Fleet Stats row beneath the printer cards. Make sure at least one printer is printing so the live status card shows a progress bar. -->

---

### Items

Store and manage your printable models.

- Name, SKU, description, notes, and multiple photos per item
- Upload photos or paste images directly from the clipboard
- Click any thumbnail to open a full-size lightbox with prev/next navigation, download, crop, and delete
- Define filament requirements (material, color, grams) with drag-and-drop slot ordering
- Tag items with color-coded categories and filter by tag
- **Model Files** — associate a model file (`.3mf`, `.stl`, or any format your slicer accepts) per printer type, and launch the slicer directly from the browser with the file pre-loaded
- **STL Source URL** — store a link to the original STL source (Printables, Thingiverse, etc.); clickable directly from the item list

![Items](docs/screenshots/items.png)

#### Production Steps (Routing)

Define how an item gets made — step by step.

- Multi-step production workflows per item (e.g. Print → Post-process → Assembly)
- Assign a printer type and quantity-on-plate to each step
- Each step carries its own filament requirements, auto-populated from the item's filament specs
- Switch between simple mode (single default routing) and advanced mode (multiple named routings)
- Rename routings inline; reorder and delete steps
- **Cost accounting** — each step supports an MSRP and post-processing cost, giving a full cost breakdown per item
- **Spoolman status** — each printer shown in a production step displays a live Spoolman indicator (green check = active, red cross = not configured), so you know at a glance whether slot assignment will sync to the printer

#### G-Code in Production Steps

Send G-Code files to printers directly from within each production step.

- Files are served from the **G-Code Repository** (see Settings → Slicers) organized by slicer and printer type
- Dropdown file selector per step — selection persists across sessions
- G-Code files are parsed for embedded metadata: **per-slot filament weights** and **estimated print time** are read from the file and shown alongside the filename
- **Send** uploads the file to the printer via Moonraker; a progress bar tracks the upload
- **Send & Start** uploads and immediately starts the print — but first shows a **Filament Check** modal:
  - Printer image, name, and live job status at the top
  - Slot-by-slot comparison table: what's loaded vs. what the step requires (with manufacturer and color names)
  - If per-slot weights from the G-Code don't match the item's filament requirements, a **weight mismatch warning** is shown so you can catch configuration errors before committing the print
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

Connect to, monitor, and control your Klipper/Moonraker printers.

- Add printers by URL; inline-edit name and URL at any time
- **List view / Details view toggle** — switch between a compact status list and full detail cards, with the preference remembered across sessions
- Live status: print state, progress bar, temperatures, and ETA
- **Completed job filename** — when a print finishes, the filename is shown next to the "Complete" badge in both the list and detail views
- **Spoolman status badge** — each printer card shows whether Spoolman is active in Moonraker (green check) or not (red cross), fetched live from the printer
- Lifetime stats per printer: total jobs, print time, filament used, longest print, job outcomes, and per-extruder tool-change and error counts
- Browse print job history and import completed jobs directly as item records
- Thumbnail preview shown during import
- Assign a **Printer Type** to each printer with optional slot count override
- **Print QR Label** — each printer card has a QR button that opens a sticker preview modal. Choose your label size (saved across sessions), then click **Print Sticker** to open a centered preview popup and send to your label printer. Supports common label sizes including 40×25mm, Brother 62mm, and Dymo 57mm.

![Printers](docs/screenshots/printers.png)
<!-- SCREENSHOT PLACEHOLDER: Printer list view showing multiple printers. Ideally one is printing (green pulse dot + filename) and one is complete (filename shown). -->

#### AFC Lanes (Multi-Material)

For printers running an Automated Filament Changer (AFC), 3DMRP shows a live lane panel with full remote control.

- One card per lane showing: filament color swatch, tool mapping (T0–T3), material, spool name and number, remaining weight and percentage, and a color-matched progress bar
- **Load / Unload controls** — small pill buttons on each lane card:
  - Load button triggers the lane's gcode mapping command (e.g. `T0`) and remains disabled until the printer confirms the filament is in the toolhead
  - Unload button sends `TOOL_UNLOAD` and waits for the printer to confirm the lane is clear
  - Both buttons are disabled while a print is in progress, and re-enable automatically when the print ends
  - A 60-second safety timeout releases the lock if the printer never responds
- AFC lane color pills also appear in the printer card header and in the compact list view, giving an at-a-glance view of all loaded filaments

![AFC Lanes](docs/screenshots/printer-afc.png)
<!-- SCREENSHOT PLACEHOLDER: Expanded printer detail showing the AFC Lanes section. Ideally show 4 lanes with different colors, at least one marked "Loaded" and one showing the Load button available. The colored progress bars should be visible. -->

#### Camera & Touchscreen

Each expanded printer card shows a live media section below the AFC lanes.

- **Camera feeds** — snapshot-polled webcam streams from Moonraker's camera API, displayed in the left column. Multiple cameras tile in a 2-column sub-grid.
- **Interactive touchscreen mirror** — for printers running the [paxx12](https://github.com/paxx13/snapmaker-moonraker) extended firmware (Snapmaker U1), the right column shows a live mirror of the printer's touchscreen:
  - Refreshed at 300ms intervals via the printer's framebuffer HTTP endpoint
  - **Click to tap** — a single click sends a `tap` action at the correct screen coordinates
  - **Click and drag to swipe** — holding and dragging sends `down` / `move` / `up` events, enabling scroll and drag gestures on the printer's UI
  - Coordinates are automatically mapped from displayed image pixels to native framebuffer resolution
  - The panel is hidden automatically for printers that don't expose the framebuffer endpoint

![Camera and Touchscreen](docs/screenshots/printer-media.png)
<!-- SCREENSHOT PLACEHOLDER: The two-column camera + touchscreen layout on a Snapmaker U1 printer card. Left column: camera feed showing the print bed. Right column: touchscreen mirror showing the printer's UI with colored filament slots visible. Both columns should be clearly visible side by side. -->

#### Filament Slots

The Filament Slots section below the media area shows what's loaded in each slot, using the most authoritative source available:

- **AFC active (highest priority)** — slots are driven entirely by live AFC lane data. The section is read-only and updates automatically as the AFC state changes. Each slot row shows:
  - Slot number, filament color dot, Spoolman spool ID (`#5`), material pill, filament name, a color-matched progress bar (fixed width so all bars align perfectly), and remaining weight with percentage
  - A **Spoolman ✓** indicator appears in the section header when Spoolman data is enriching the AFC assignments
- **Spoolman active, no AFC** — slots show the current live Spoolman assignments from Moonraker. Read-only.
- **Neither** — editable dropdowns from 3DMRP's own database. A "Sync from printer" button reads the printer's `filament_detect` data and offers to update slots.

![Filament Slots](docs/screenshots/printer-slots.png)
<!-- SCREENSHOT PLACEHOLDER: The Filament Slots section on a U1 printer with AFC active. Show all 4 slots fully populated — each with a colored dot, spool ID, material pill, filament name, colored progress bar, and weight/percentage on the right. The "Spoolman ✓" badge should be visible in the section header. Dark mode preferred. -->

---

### Mobile Filament Loader

A phone-optimized workflow for loading spools at the printer — no typing required.

#### How it works

1. Open the **Mobile** QR code in the sidebar on any desktop browser and scan it with your phone. It links to `https://your-server:7892/mobile`.
2. On the mobile landing screen, point your phone's camera at the **QR label on a printer** (printed from the Printers page). The app identifies the printer automatically.
3. For each filament slot, tap **Scan spool** and point the camera at the Spoolman QR label on the spool you're loading. The spool is looked up in Spoolman and shown with color, material, and remaining weight.
4. Rearrange slots with the up/down arrows if the physical order doesn't match.
5. Tap **Confirm & Update Printer** to write the slot assignments to Moonraker via the Spoolman plugin.

#### Features

- Live camera viewfinder with real-time QR decode (no button press needed)
- Parses both plain spool IDs and full Spoolman QR URLs
- Per-slot color swatch, vendor, material, and remaining weight
- Re-scan or clear individual slots at any time
- **Spoolman warning** — if the scanned printer doesn't have Spoolman active in Moonraker, a banner is shown explaining that the assignment will be saved in 3DMRP only (not pushed to the printer)
- Works on iPhone (Safari) and Android (Chrome)

#### Accessing from your phone

The sidebar QR widget auto-detects your server's LAN IP and generates the correct mobile URL. Click the QR code to expand a larger version with the full URL printed below it.

HTTPS is required for camera access on real devices (both iOS and Android enforce this). 3DMRP serves HTTPS automatically on port `7892` using a self-signed certificate. The first time you open the mobile URL on a new phone, your browser will show a certificate warning — this is expected and safe to proceed past:

- **iPhone / iPad (Safari):** "This Connection Is Not Private" → tap **Show Details** → **visit this website** → **Visit Website**
- **Android (Chrome):** "Your connection is not private" → tap **Advanced** → **Proceed to [IP] (unsafe)**

You only need to do this once per device. See **Settings → Mobile Access** to toggle between HTTPS and HTTP or review these instructions again.

---

### Orders

Track print orders from intake to delivery.

- Customer, quantity, due date, and status (pending → printing → complete)
- Link each order to an item so filament requirements are always visible
- Create orders before an item exists — a placeholder is auto-created and can be filled in later
- **STL Source URL** — pre-filled from the linked item, editable per order, and written back to the item on save
- **Item thumbnail** in the edit modal — the linked item's first photo is shown next to the item name so you can quickly confirm you have the right item selected
- **Open Item** button in the edit modal — jumps directly to the Items page, auto-expands the linked item's accordion, and scrolls it into view

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
- **Mobile Access** — HTTPS/HTTP protocol toggle for the mobile filament loader QR codes, with certificate trust instructions for iOS and Android
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

The sidebar uses a collapsible tree. **Settings** and **Reports** expand in place to show their sub-pages, and auto-expand when you navigate directly to a sub-page. The current app version is shown at the bottom of the sidebar.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, React Query |
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Frontend serving | nginx in Docker |
| Backend | Native (Windows), started via `start.bat` |

The frontend runs in Docker behind nginx. The backend runs natively on the host so it can launch local slicer applications (OrcaSlicer, PrusaSlicer, etc.) directly.

---

## Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the frontend) — make sure it is running before you start 3DMRP
- [uv](https://github.com/astral-sh/uv) (Python package manager, for the backend) — install once, then forget about it

### Starting 3DMRP

The easiest way to start everything is with the `start.bat` file in the root of the repo.

**Option A — double-click (no terminal needed):**
Open the repo folder in File Explorer and double-click `start.bat`.

**Option B — from a Command Prompt or PowerShell terminal:**
```cmd
start.bat
```

Either way, `start.bat` does two things automatically:

1. **Starts the backend** in a new, separate window titled "3DMRP Backend". This window shows the API logs and must stay open while you use the app. To stop the backend, simply close that window.
2. **Starts the frontend** (Docker containers) in the background via `docker compose up -d`. The nginx server and frontend assets are served from Docker, so there is no visible window for this — it runs silently.

Once both are running, the app is available at:

- **Desktop browser:** `http://localhost:7891` — plain HTTP, no certificate warning
- **Mobile / camera features:** `https://your-lan-ip:7892` — HTTPS required for camera access; uses a self-signed certificate (see [Mobile Filament Loader](#mobile-filament-loader) for the one-time phone trust setup)

> **If Docker fails to start**, you'll see an error message in the terminal. Make sure Docker Desktop is open and has finished starting before running `start.bat` again.

---

### Starting each part manually

If you need to start only the backend or only the frontend (e.g. after a Docker rebuild), you can start them individually.

**Backend only — from a terminal:**
```cmd
cd backend
start.bat
```

**Backend only — PowerShell:**
```powershell
cd backend
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

> **Note on PowerShell execution policy:** Running `.\start.ps1` directly in a PowerShell window can fail (or open the script for editing) depending on your system's execution policy. This is a Windows security default and not a bug. Using `start.bat` or the explicit `powershell -ExecutionPolicy Bypass -File` command above always works regardless of that setting.

**Frontend only:**
```powershell
docker compose up -d
```

---

### Environment variables

Copy `.env.example` to `.env` and adjust as needed:

```
PORT=7891        # HTTP port for desktop browser access
HTTPS_PORT=7892  # HTTPS port for mobile camera access
```

The backend reads `DATABASE_URL` and `DATA_DIR` from the environment — these are set automatically by `start.ps1` / `start.bat` and do not need to be configured manually under normal use.

---

## Data

All data is stored in `backend/data/`:
- `3dmrp.db` — SQLite database
- `images/` — uploaded item and printer images

Use **Settings → Database** to download a full backup or restore from a previous one.

---

## Slicer integration

1. Go to **Settings → Slicers** and add your slicer with its executable path (e.g. `C:\Program Files\OrcaSlicer\OrcaSlicer.exe`).
2. Go to **Settings → Printer Types**, create a type, and assign the slicer to it.
3. On the Printers page, assign each printer to its type.
4. Open any item and expand it. In the **Model Files** section, you'll see one row per printer type that has a slicer configured. Set the path to the model file (`.3mf`, `.stl`, or any format your slicer supports) for each printer type. An **Open** button will appear that launches the correct slicer with the file pre-loaded.

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
- The **Mobile Filament Loader** looks up scanned spool QR codes against Spoolman and writes slot assignments back to Moonraker
- The **Printers** page shows live Spoolman slot assignments per printer when Spoolman is active
- AFC-equipped printers automatically enrich their lane data with Spoolman spool names, weights, and IDs

---

## What's new in v0.3.0

### Fleet command & control

The biggest theme of this release is printer-side control. You can now do things from 3DMRP that previously required walking to the printer or opening a separate Moonraker/Fluidd tab.

**AFC lane remote control**
- Load and unload filament lanes directly from the printer detail card
- Load/Unload buttons stay disabled during a print and remain locked until the printer confirms the action completed — no guessing whether the command went through
- 60-second safety timeout prevents buttons from staying locked forever if the printer goes offline mid-operation

**Interactive touchscreen mirror (Snapmaker U1 / paxx12)**
- For printers running paxx12 extended firmware, the printer card now shows a live mirror of the printer's touchscreen
- Click to tap, click-and-drag to swipe — full touch interaction proxied through the backend
- Displayed side-by-side with the camera feed in a two-column layout

**AFC-driven filament slots**
- When a printer has AFC data, the Filament Slots section is now driven entirely by that live data — no manual slot assignment needed
- Each row shows the spool ID, material pill, filament name, color-matched progress bar, and weight/percentage, all horizontally aligned across slots
- Automatically falls back to Spoolman data, then local database, for printers without AFC

### Dashboard fleet stats

A new Fleet Stats row on the dashboard aggregates data across all printers: total jobs ever run, cumulative print time, total filament consumed (shown in km when over 1000m), longest single print, and a breakdown of completed / cancelled / error jobs.

### Printer status improvements

- The filename of the last completed job is now shown next to the "Complete" badge in both the list and detail views
- AFC lane color pills appear in the printer detail header (previously list-only)
- Printer lifetime stats cards are more compact, leaving more room for the media and lane sections
- Camera feeds no longer show black pillarbox bars — they fill their column edge-to-edge

### Sidebar version display

The current app version is shown at the bottom of the sidebar, automatically sourced from the latest git tag at build time.
