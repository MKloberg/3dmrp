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
import Reports from './pages/Reports'
import FilamentInventory from './pages/reports/FilamentInventory'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
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
        <Route path="reports" element={<Reports />} />
        <Route path="reports/filament-inventory" element={<FilamentInventory />} />
      </Route>
    </Routes>
  )
}
