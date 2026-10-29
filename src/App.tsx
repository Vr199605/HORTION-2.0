import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Storefront from './pages/Storefront'
import AdminLayout from './admin/AdminLayout'
import Dashboard from './admin/Dashboard'
import Orders from './admin/Orders'
import Prices from './admin/Prices'
import Products from './admin/Products'
import Boxes from './admin/Boxes'
import Settings from './admin/Settings'
import NewStore from './admin/NewStore'
import Coupons from './admin/Coupons'
import Builder from './pages/Builder'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/conheca" element={<Landing />} />
      <Route path="/montar" element={<Builder />} />
      <Route path="/planos" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Login />} />

      <Route path="/painel" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="pedidos" element={<Orders />} />
        <Route path="precos" element={<Prices />} />
        <Route path="produtos" element={<Products />} />
        <Route path="boxes" element={<Boxes />} />
        <Route path="cupons" element={<Coupons />} />
        <Route path="config" element={<Settings />} />
        <Route path="nova" element={<NewStore />} />
        <Route path="*" element={<Navigate to="/painel" replace />} />
      </Route>

      {/* Vitrine pública: /nome-da-loja  (inclui /demo) */}
      <Route path="/:slug" element={<Storefront />} />
    </Routes>
  )
}
