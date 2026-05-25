# 3DMRP — 3D Print Management & Resource Planning

![3DMRP Logo](frontend/public/logo.png)

A self-hosted web app for managing 3D print items, filament inventory, orders, and print queues. Built for multi-printer workshops that want a single place to track what gets printed, with what filament, and for whom.

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-mkloberg-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/mkloberg)

> **v0.6.0:** Exclude Objects Awareness — 3DMRP now detects when a G-code file was sliced without the Label Objects / Exclude Objects setting enabled and warns you before you send the job. Filament quality ratings (−5 to +5) stored in your local catalog and shown in both the Filaments page and Spool Inventory. Analyze wizard now writes G-code weight changes and filament slot reassignments back to the BOM on close, with a new pencil icon to override any existing slot assignment inline. Auto-assign rebuilt with CIE LAB perceptual color matching. AFC Unload All button. Webcam snapshot proxy for cross-origin feeds.
>
> **v0.5.0:** Clone Tagging — duplicate a spool in Spoolman and walk it through the full intake sequence (NFC tagging, QR label, weighing) in one continuous flow, entirely from your phone. Mobile app gains three new standalone actions: Label a Spool, Weigh a Spool, and Clone Tag a Spool. Spool picker adds NFC scan-to-select, wrapping filter pills, multi-color support in the color filter, and ID sort. Weigh screen shows current gross weight in the accept button and a before/after/change breakdown on the success screen.
>
> **v0.4.9:** Spool weigh modal now includes an inline guide explaining the process, where the empty spool tare comes from (Spoolman's filament type definition), and the drift risk if tare isn't kept up to date. Location sort now correctly separates storage locations from printer-named locations. Dropdown focus clears immediately after selection. Spool inventory refresh interval tightened to 15 s.
>
> **v0.4.8:** Live two-way spool location sync between 3DMRP and Spoolman — the foundation for RFID-based spool tracking across your printer fleet. Plus spool weighing workflow, inventory sort pills, and more.
>
> **v0.4.7:** Spoolman webhook support on the Spool Inventory page, unified NFC tagging via the persistent mobile session, TLS certificate persistence across container restarts, and several UX refinements.
>
> **v0.4.3:** Patch — fixes remaining null crashes on the Spool Inventory and Filament Inventory report pages when Spoolman filaments have a null name or material field.
>
> **v0.4.2:** QR Code Label Printer setting moved to General Settings, plus an additional null-safety fix in the Spoolman import form.
>
> **v0.4.1:** Patch — fixes a crash on the Filaments and Filament Inventory pages when Spoolman returns filaments with a null name or material field.
>
> **v0.4.0:** 3DMRP now has a mobile companion app. Scan a QR code once and your phone stays connected — permanently. Walk up to any spool, tag both sides with NFC, print a QR label directly to your label printer, and move on. No dialogs. No tapping "confirm" on a desktop. The spool workflow is now fully hands-free.
>
> **v0.3.1:** G-Code thumbnail previews with zoom & drag, native Windows file picker for model files, redesigned Analyze wizard step 1, and AFC load/unload reliability improvements.
>
> **v0.3.0:** 3DMRP started as a production planning tool — a place to manage items, orders, and filament. It has quietly grown into something more: a **fleet command and control center** for Klipper/Moonraker printer farms. You can now monitor every printer's live status, load and unload filament lanes remotely, mirror and interact with the printer touchscreen, and see aggregated fleet statistics across your entire operation — all from a single browser tab. The MRP roots are still here; the scope is now bigger.

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

![Dashboard](docs/screenshots/dashboard.png?v=2)
<!-- SCREENSHOT PLACEHOLDER: Full dashboard showing the Fleet Stats row beneath the printer cards. Make sure at least one printer is printing so the live status card shows a progress bar. -->

---

### Items

Store and manage your printable models.

- Name, SKU, description, notes, and multiple photos per item
- Upload photos or paste images directly from the clipboard
- Click any thumbnail to open a full-size lightbox with prev/next navigation, download, crop, and delete
- Define filament requirements (material, color, grams) with drag-and-drop slot ordering
- Tag items with color-coded categories and filter by tag
- **Model Files** — associate a model file (`.3mf`, `.stl`, or any format your slicer accepts) per printer type, and launch the slicer directly from the browser with the file pre-loaded. Click the **folder icon** to open a native Windows file browser filtered to `.3mf` / `.stl` — no typing required. The dialog remembers the last-used directory and opens at the existing file's location when editing
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
- **Slicer thumbnail preview** — the preview image embedded in the G-Code file by OrcaSlicer / PrusaSlicer / SuperSlicer is extracted and shown as a small inline thumbnail. Click it to open a zoom modal:
  - Zoom in / out in 10% steps (10%–400% range); click the percentage label to reset to 150%
  - Drag inside the modal to reposition the image — the offset is mirrored back to the inline thumbnail so both stay in sync
- **Send** uploads the file to the printer via Moonraker; a progress bar tracks the upload
- **Exclude Objects warning** — if the selected G-code file was sliced without the Label Objects / Exclude Objects setting enabled, a red warning badge appears below the weight readout. Clicking it explains what Exclude Objects does, why it matters for mid-print failure recovery, and the exact Orca Slicer setting to enable
- **Analyze / Send / Send & Start** each open a two-step wizard:
  - **Step 1 — G-Code vs. BOM**: compares per-slot G-Code filament weights against the item's BOM spec. Weight mismatches and missing BOM entries are flagged. Existing BOM slots show a pencil icon — click to reassign which filament spec covers that slot inline. **Auto-assign** maps unmatched G-code slots to catalog filaments using CIE LAB perceptual color matching with color-group bonuses
  - **Step 2 — Filament Check**: slot-by-slot comparison of what is physically loaded in the printer vs. what the BOM requires. Refreshes every 3 seconds; turns green when all slots match. Analyze mode stops here; Send and Send & Start proceed to upload the file
  - **Write-back on close**: closing the Analyze wizard automatically saves detected weight changes and slot reassignments back to the step BOM — no separate manual update step required
- Live printer status is shown inline for each printer: current state dot, active filename, and print progress bar

---

### Filaments

Manage your filament library and track stock.

- Store specs with material, color, brand, temperature settings, and purchase URL
- Sync specs directly from a [Spoolman](https://github.com/Donkie/Spoolman) instance
- Live stock levels pulled from Spoolman for forecasting
- **Quality ratings** — rate any filament −5 to +5; positive ratings show as amber stars (★★★), negative as red skulls (☠☠). Accessible from both the Filaments page and Spool Inventory, stored in the local catalog

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
  - Unload button sends `TOOL_UNLOAD LANE=x` and waits for the printer to confirm the lane is clear
  - Both buttons are disabled while a print is in progress, and re-enable automatically when the print ends
  - The button shows `…` for the full duration of the operation (typically 60–90 seconds), not just the brief HTTP acknowledgment
  - A 120-second safety timeout releases the lock if the printer never responds
- **Unload All** — one button unloads every loaded lane simultaneously; polls Klipper until all lanes confirm clear
- AFC lane color pills also appear in the printer card header and in the compact list view, giving an at-a-glance view of all loaded filaments

![AFC Lanes](docs/screenshots/printer-afc.png)
<!-- SCREENSHOT PLACEHOLDER: Expanded printer detail showing the AFC Lanes section. Ideally show 4 lanes with different colors, at least one marked "Loaded" and one showing the Load button available. The colored progress bars should be visible. -->

#### Camera & Touchscreen

Each expanded printer card shows a live media section below the AFC lanes.

- **Camera feeds** — snapshot-polled webcam streams from Moonraker's camera API, displayed in the left column. Multiple cameras tile in a 2-column sub-grid. Snapshots are proxied through the 3DMRP backend to avoid cross-origin browser restrictions when the printer and 3DMRP run on different ports or hosts.
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

### Mobile Companion App *(Android)*

A dedicated single-page app that turns your phone into a hands-free spool management terminal. Scan the QR code in the sidebar once and your phone stays paired — across page refreshes, new browser tabs, and backend restarts.

#### Home screen actions

The mobile app home screen has four actions. Each opens a spool picker — scroll the list or tap the NFC button in the top-right corner to identify a spool by scanning its tag instead.

- **Tag a Spool** — write the spool ID to one or two NFC tags. Tag both sides of the spool so it can be identified at the printer regardless of which way it faces.
- **Label a Spool** — send a QR code label directly to the configured Windows label printer. The label comes out immediately; a success screen confirms which spool was labeled.
- **Weigh a Spool** — enter the gross weight from your scale; the app subtracts the empty spool tare and saves the remaining weight to Spoolman. If the weight hasn't changed, tap **Accept** — the button shows the expected gross weight (tare + last recorded filament weight) so you can confirm at a glance without doing the math. The success screen shows the before weight, the new weight, and the change.
- **Clone Tag a Spool** — see below.

#### Clone Tag a Spool

The headline feature of v0.5.0. When a new spool of a filament you already stock arrives, this flow registers it and walks you through the full intake sequence without leaving the phone.

1. **Pick the source spool** from the list — or scan its NFC tag to jump straight to it.
2. A confirmation screen shows the spool's filament type, color, ID, and which fields will be copied (filament type, price, storage location, and any notes). The new spool is created as a full spool; the old spool's remaining weight is not carried over.
3. Tap **Clone Spool** — a new spool is created in Spoolman immediately.
4. The app transitions directly into **NFC tagging** for the new spool: write Tag A, optionally write Tag B on the other side.
5. After tagging, tap **Print QR Label** to send the label to the printer — it comes out with the new spool's ID.
6. Tap **Weigh this spool** if you want to record the opening weight before putting it away.

The entire sequence — clone, tag ×2, label, weigh — runs start to finish from a single flow on your phone, with no desktop interaction required.

#### Spool intake workflow

Walk up to a new spool delivery and complete the entire intake without touching a keyboard:

1. Open the **Mobile** QR code in the sidebar and scan it with your Android phone. The app loads at `https://your-server:7892/mobile/app/{token}`.
2. Tap **Add Spool(s)** to start the receive wizard — scan the Spoolman QR code on the spool packaging to identify it.
3. Tap **Tag Spool** to write NFC tags to both sides of the spool. The phone writes the spool ID to the tag; either side can be scanned later to identify the spool at a printer.
4. Tap **Print Label** to send a QR label directly to your configured label printer. The label comes out immediately — no browser print dialog, no desktop interaction required.

#### Filament loader workflow

Load filament at a printer without touching a computer:

1. On the mobile app, point the camera at the **QR label on a printer** to identify it.
2. For each filament slot, tap **Scan spool** and scan the Spoolman QR label (or NFC tag) on the spool.
3. Rearrange slots with the up/down arrows if the physical order doesn't match.
4. Tap **Confirm & Update Printer** to write slot assignments to Moonraker via the Spoolman plugin.

#### Features

- **Persistent pairing** — scan once, stay connected. The session token is stored in the database and survives backend restarts; the phone reconnects automatically with no re-scan needed
- **Real-time WebSocket bridge** — tasks and results flow instantly between phone and desktop via a dedicated relay channel
- **NFC tag writing** — write Spoolman spool IDs to NFC tags (write both sides for convenience); tags can be scanned at any printer to identify the spool without hunting for the QR label
- **NFC scan-to-select** — in the spool picker, tap the NFC button to identify a spool by scanning its tag rather than scrolling the list; works in all four home screen flows
- **Direct label printing** — configure a Windows label printer in **Settings → Mobile Access**; labels triggered from the mobile app bypass the browser print dialog and print immediately
- Live camera viewfinder with real-time QR decode — no button press needed
- Parses both plain spool IDs and full Spoolman QR URLs
- Per-slot color swatch, vendor, material, and remaining weight
- **Spoolman warning** — if the scanned printer doesn't have Spoolman active in Moonraker, a banner explains that the assignment will be saved in 3DMRP only
- **Android Chrome** is the supported and tested platform

#### Desktop label printing

The desktop Spool Inventory page also has a **Print QR Label** button on each spool row. This opens a modal with label size selection and a browser print dialog — giving you full control over printer selection, copies, and paper size. The two flows are independent: mobile prints go direct, desktop prints go through the dialog.

#### Label printer setup

In **Settings → Mobile Access**, select a Windows printer from the dropdown and click **Test Print** to verify. Once saved, all mobile-triggered label prints go straight to that printer. Desktop modal prints are unaffected and always use the browser dialog.

#### Accessing from your phone

The sidebar QR widget auto-detects your server's LAN IP and generates the correct mobile URL. Click the QR code to expand a larger version with the full URL printed below it.

HTTPS is required for camera access on real devices. 3DMRP serves HTTPS automatically on port `7892` using a self-signed certificate. The first time you open the mobile URL on a new phone, your browser will show a certificate warning — this is expected and safe to proceed past:

- **Android (Chrome):** "Your connection is not private" → tap **Advanced** → **Proceed to [IP] (unsafe)**
- **iPhone / iPad (Safari):** "This Connection Is Not Private" → tap **Show Details** → **visit this website** → **Visit Website**

You only need to do this once per device. See **Settings → Mobile Access** to toggle between HTTPS and HTTP.

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
- **Mobile Access** — HTTPS/HTTP protocol toggle for QR codes; label printer selection with test print button for direct mobile-triggered label printing
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

## Installation

### One-command setup

Open **PowerShell** (search for it in the Start menu) and paste this:

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/MKloberg/3dmrp/main/setup.ps1 | iex"
```

The setup script handles everything:
- Installs **Docker Desktop** if missing (downloads the installer and walks you through it)
- Installs **uv** (Python environment manager) silently — no separate Python install needed
- Downloads the latest 3DMRP release from GitHub
- Creates a **3DMRP shortcut on your Desktop**

If Docker needs to be installed, you'll be asked to restart your PC. A copy of the setup script is placed on your Desktop automatically — right-click it and choose **Run with PowerShell** after restarting to finish.

Once setup completes, double-click the **3DMRP** shortcut on your Desktop. Then open your browser to `http://localhost:7891`.

> **Docker Desktop is free** for personal use. You do not need a Docker account.

---

### Updating

Run the same setup command again (or re-run the script from your Desktop). It detects the existing install, asks to confirm, backs up your database, downloads the latest release, and restores your data.

---

### Manual setup (advanced)

If you prefer to install prerequisites yourself:

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it
2. Install uv: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
3. Download the [latest release ZIP](https://github.com/MKloberg/3dmrp/releases/latest) and extract it
4. Double-click `start.bat` in the extracted folder

### Ports

To run on different ports, copy `.env.example` to `.env` and edit:

```
PORT=7891        # desktop HTTP port
HTTPS_PORT=7892  # mobile HTTPS port
```

### Mobile / phone access

The app also serves HTTPS on port `7892` for features that require camera access (QR scanning). Your phone will show a certificate warning the first time — tap **Advanced → Proceed** (Chrome) or **Show Details → visit this website** (Safari). You only do this once. The correct URL is shown in the app's sidebar QR widget.

---

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-mkloberg-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/mkloberg)
