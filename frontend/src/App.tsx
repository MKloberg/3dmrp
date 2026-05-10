import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Models from './pages/Models'
import Orders from './pages/Orders'
import Forecast from './pages/Forecast'
import Filaments from './pages/Filaments'
import Printers from './pages/Printers'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="models" element={<Models />} />
        <Route path="orders" element={<Orders />} />
        <Route path="forecast" element={<Forecast />} />
        <Route path="filaments" element={<Filaments />} />
        <Route path="printers" element={<Printers />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
