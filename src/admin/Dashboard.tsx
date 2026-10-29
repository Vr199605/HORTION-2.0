import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { brl } from '../lib/format'
import { useAdmin, publicUrl } from './context'
import { useCatalog } from './useCatalog'

export default function Dashboard() {
  const { store } = useAdmin()
  const cat = useCatalog()
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [couponCount, setCouponCount] = useState(0)
  const [today, setToday] = useState({ count: 0, total: 0, novos: 0 })
  const url = publicUrl(store.slug)

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 320 }).then(setQr)
  }, [url])

  useEffect(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    supabase
      .from('orders')
      .select('total,status')
      .eq('store_id', store.id)
      .gte('created_at', start.toISOString())
      .neq('status', 'cancelado')
      .then(({ data }) => {
        const rows = data ?? []
        setToday({
          count: rows.length,
          total: rows.reduce((a: number, r: any) => a + Number(r.total), 0),
          novos: rows.filter((r: any) => r.status === 'novo').length,
        })
      })
  }, [store.id])

  useEffect(() => {
    supabase
      .from('coupons')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .then(({ count }) => setCouponCount(count ?? 0))
  }, [store.id])

  const priced = cat.products.filter((p) => p.price > 0 && p.available).length
  const needPrice = cat.products.filter((p) => p.price <= 0).length

  const steps = [
    { done: priced > 0, label: 'Definir os preços do dia', to: '/painel/precos', hint: needPrice ? `${needPrice} produtos sem preço` : '' },
    { done: Boolean(store.logo_url), label: 'Colocar a logo da loja', to: '/painel/config', hint: '' },
    { done: store.min_order > 0 || store.default_delivery_fee > 0, label: 'Conferir entrega, bairros e pedido mínimo', to: '/painel/config', hint: '' },
    { done: couponCount > 0, label: 'Criar um cupom de boas-vindas', to: '/painel/cupons', hint: '' },
    { done: false, label: 'Imprimir o QR Code e divulgar o link', to: '#divulgar', hint: '' },
  ]

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadQr() {
    QRCode.toDataURL(url, { margin: 2, width: 1200 }).then((d) => {
      const a = document.createElement('a')
      a.href = d
      a.download = `qrcode-${store.slug}.png`
      a.click()
    })
  }

  return (
    <div className="page">
      <h2>Olá! Este é o painel do {store.name}</h2>

      <div className="stats">
        <div className="stat"><span>Pedidos hoje</span><strong>{today.count}</strong></div>
        <div className="stat"><span>Vendido hoje</span><strong>{brl(today.total)}</strong></div>
        <div className="stat"><span>Novos para atender</span><strong>{today.novos}</strong></div>
        <div className="stat"><span>Produtos no ar</span><strong>{priced}</strong></div>
      </div>

      <div className="two">
        <section className="panel">
          <h3>Primeiros passos</h3>
          <ul className="steps">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? 'done' : ''}>
                <span className="tick">{s.done ? '✓' : '○'}</span>
                {s.to.startsWith('#') ? <span>{s.label}</span> : <Link to={s.to}>{s.label}</Link>}
                {s.hint && <small>{s.hint}</small>}
              </li>
            ))}
          </ul>
          <div className="row">
            <button className={`btn small ${store.is_open ? 'ghost' : 'primary'}`} onClick={async () => {
              await supabase.from('stores').update({ is_open: !store.is_open }).eq('id', store.id)
              window.location.reload()
            }}>
              {store.is_open ? '⏸ Fechar a loja agora' : '▶ Abrir a loja'}
            </button>
          </div>
        </section>

        <section className="panel" id="divulgar">
          <h3>Divulgue sua loja</h3>
          <div className="linkbox">
            <code>{url}</code>
            <button className="btn small primary" onClick={copy}>{copied ? 'Copiado!' : 'Copiar'}</button>
          </div>
          {qr && <img className="qr" src={qr} alt="QR Code da loja" />}
          <div className="row">
            <button className="btn small ghost" onClick={downloadQr}>Baixar QR Code (alta resolução)</button>
            <a className="btn small ghost" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Agora você pode fazer seu pedido no ${store.name} pelo celular: ${url}`)}`}>Compartilhar no WhatsApp</a>
          </div>
          <p className="muted small">Use o link na bio do Instagram, no perfil da empresa no Google, em panfletos e sacolas.</p>
        </section>
      </div>
    </div>
  )
}
