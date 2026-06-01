import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Items from './pages/Items'
import Orders from './pages/Orders'
import Customers from './pages/Customers'
import Forecast from './pages/Forecast'
import Filaments from './pages/Filaments'
import Printers from './pages/Printers'
import PrinterTypes from './pages/PrinterTypes'
import Slicers from './pages/Slicers'
import Settings from './pages/Settings'
import General from './pages/settings/General'
import Database from './pages/settings/Database'
import MobileAccess from './pages/settings/MobileAccess'
import AISettings from './pages/settings/AI'
import PriceTags from './pages/settings/PriceTags'
import Reports from './pages/Reports'
import FilamentInventory from './pages/reports/FilamentInventory'
import PrintJobsReport from './pages/reports/PrintJobsReport'
import OrderStepProgressReport from './pages/reports/OrderStepProgressReport'
import Tools from './pages/Tools'
import HueForgeExport from './pages/tools/HueForgeExport'
import ImportFilament from './pages/tools/ImportFilament'
import SpoolInventory from './pages/filaments/SpoolInventory'
import MobileLanding from './pages/mobile/MobileLanding'
import MobilePrinterLoad from './pages/mobile/MobilePrinterLoad'
import MobileNfcScan from './pages/mobile/MobileNfcScan'
import MobileApp from './pages/mobile/MobileApp'
import SpoolLabelPage from './pages/print/SpoolLabelPage'
import PriceTagPrintPage from './pages/print/PriceTagPrintPage'
import { MobileSessionProvider } from './contexts/MobileSessionContext'

function DesktopLayout() {
  return (
    <MobileSessionProvider>
      <Layout />
    </MobileSessionProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="mobile" element={<MobileLanding />} />
      <Route path="mobile/printer/:printerName" element={<MobilePrinterLoad />} />
      <Route path="mobile/nfc/:token" element={<MobileNfcScan />} />
      <Route path="mobile/app/:token" element={<MobileApp />} />
      <Route path="print/spool/:id" element={<SpoolLabelPage />} />
      <Route path="print/price-tags" element={<PriceTagPrintPage />} />
      <Route element={<DesktopLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="items" element={<Items />} />
        <Route path="orders" element={<Orders />} />
        <Route path="customers" element={<Customers />} />
        <Route path="forecast" element={<Forecast />} />
        <Route path="filaments" element={<Filaments />} />
        <Route path="printers" element={<Printers />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/general" element={<General />} />
        <Route path="settings/printer-types" element={<PrinterTypes />} />
        <Route path="settings/slicers" element={<Slicers />} />
        <Route path="settings/database" element={<Database />} />
        <Route path="settings/mobile" element={<MobileAccess />} />
        <Route path="settings/ai" element={<AISettings />} />
        <Route path="settings/price-tags" element={<PriceTags />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/filament-inventory" element={<FilamentInventory />} />
        <Route path="reports/print-jobs" element={<PrintJobsReport />} />
        <Route path="reports/order-step-progress" element={<OrderStepProgressReport />} />
        <Route path="tools" element={<Tools />} />
        <Route path="tools/hueforge-export" element={<HueForgeExport />} />
        <Route path="tools/import-filament" element={<ImportFilament />} />
        <Route path="filaments/spools" element={<SpoolInventory />} />
      </Route>
    </Routes>
  )
}
