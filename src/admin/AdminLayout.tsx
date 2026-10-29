import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import { supabase, isConfigured, BRAND } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Store } from '../lib/types'
import { AdminContext } from './context'
import { normalizeStore } from '../lib/api'
import { activationMessage, hasSalesContact, salesLink } from '../lib/plans'
import { Spinner } from '../components/Common'

const SEL_KEY = 'hortion:store'

export default function AdminLayout() {
  const { session, loading, signOut } = useAuth()
  const loc = useLocation()
  const [stores, setStores] = useState<Store[] | null>(null)
  const [selected, setSelected] = useState<string>(() => localStorage.getItem(SEL_KEY) || '')

  const reload = useCallback(async () => {
    if (!session) return
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', session.user.id)
      .order('created_at')
    if (error) {
      console.error(error)
      setStores([])
      return
    }
    setStores((data ?? []).map(normalizeStore))
  }, [session])

  useEffect(() => {
    reload()
  }, [reload])

  if (!isConfigured) {
    return (
      <div className="center-screen">
        <div style={{ fontSize: 48 }}>⚙️</div>
        <h2>Falta conectar o Supabase</h2>
        <p>Preencha o arquivo <code>.env</code> com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (passo 2 do README) e reinicie.</p>
        <Link to="/demo" className="btn primary">Ver loja demo</Link>
      </div>
    )
  }
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (stores === null) return <Spinner />

  const onNew = loc.pathname.startsWith('/painel/nova')
  if (stores.length === 0 && !onNew) return <Navigate to="/painel/nova" replace />
  if (stores.length === 0 && onNew) {
    return <Shell email={session.user.email ?? ''} onSignOut={signOut} hideNav><Outlet context={{}} /></Shell>
  }

  const store = stores.find((s) => s.id === selected) ?? stores[0]
  const daysLeft = Math.ceil((new Date(store.active_until).getTime() - Date.now()) / 86400000)

  return (
    <AdminContext.Provider
      value={{
        store,
        stores,
        reload,
        selectStore: (id) => {
          localStorage.setItem(SEL_KEY, id)
          setSelected(id)
        },
      }}
    >
      <Shell
        email={session.user.email ?? ''}
        onSignOut={signOut}
        hideNav={onNew}
        stores={stores}
        store={store}
        onSelect={(id) => {
          localStorage.setItem(SEL_KEY, id)
          setSelected(id)
        }}
      >
        {daysLeft <= 7 && (
          <div className={`notice ${daysLeft <= 0 ? 'err' : ''}`}>
            {daysLeft <= 0
              ? 'O acesso desta loja expirou e os clientes não conseguem enviar pedidos. Fale com o suporte para renovar.'
              : `Seu acesso vence em ${daysLeft} dia${daysLeft === 1 ? '' : 's'}. Fale com o suporte para renovar.`}
            {hasSalesContact && (
              <>
                {' '}
                <a href={salesLink(activationMessage(store.name, store.slug))} target="_blank" rel="noreferrer">Ativar agora</a>
              </>
            )}
          </div>
        )}
        <Outlet />
      </Shell>
    </AdminContext.Provider>
  )
}

function Shell({
  children,
  email,
  onSignOut,
  hideNav,
  stores,
  store,
  onSelect,
}: {
  children: React.ReactNode
  email: string
  onSignOut: () => void
  hideNav?: boolean
  stores?: Store[]
  store?: Store
  onSelect?: (id: string) => void
}) {
  return (
    <div className="admin">
      <header className="admin-top">
        <Link to="/painel" className="admin-brand">🥬 {BRAND}</Link>
        {stores && stores.length > 0 && store && onSelect && (
          <select className="store-select" value={store.id} onChange={(e) => onSelect(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <div className="grow" />
        {store && (
          <a className="btn small ghost" href={`/${store.slug}`} target="_blank" rel="noreferrer">Ver loja ↗</a>
        )}
        <button className="btn small ghost" onClick={onSignOut} title={email}>Sair</button>
      </header>
      {!hideNav && (
        <nav className="admin-nav">
          <NavLink end to="/painel">Início</NavLink>
          <NavLink to="/painel/pedidos">Pedidos</NavLink>
          <NavLink to="/painel/precos">⚡ Preços</NavLink>
          <NavLink to="/painel/produtos">Produtos</NavLink>
          <NavLink to="/painel/boxes">Boxes</NavLink>
          <NavLink to="/painel/cupons">Cupons</NavLink>
          <NavLink to="/painel/config">Configurações</NavLink>
        </nav>
      )}
      <div className="admin-body">{children}</div>
    </div>
  )
}
