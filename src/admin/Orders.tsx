import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { brl, dateTime, qtyLabel } from '../lib/format'
import { UNIT_SHORT } from '../lib/types'
import type { Order, OrderStatus, Unit } from '../lib/types'
import { Spinner } from '../components/Common'
import { waLink } from '../lib/whatsapp'
import { useAdmin } from './context'

const STATUS: { key: OrderStatus; label: string; next?: OrderStatus; nextLabel?: string }[] = [
  { key: 'novo', label: 'Novo', next: 'separando', nextLabel: 'Começar a separar' },
  { key: 'separando', label: 'Separando', next: 'saiu', nextLabel: 'Saiu para entrega' },
  { key: 'saiu', label: 'Em rota', next: 'entregue', nextLabel: 'Marcar entregue' },
  { key: 'entregue', label: 'Entregue' },
  { key: 'cancelado', label: 'Cancelado' },
]

export default function Orders() {
  const { store } = useAdmin()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [filter, setFilter] = useState<'abertos' | 'todos'>('abertos')
  const [beep, setBeep] = useState(false)
  const known = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(100)
    const rows = (data ?? []).map((o: any) => ({ ...o, subtotal: Number(o.subtotal), discount: Number(o.discount ?? 0), delivery_fee: Number(o.delivery_fee), total: Number(o.total) })) as Order[]
    if (known.current.size > 0 && rows.some((o) => !known.current.has(o.id))) {
      setBeep(true)
      setTimeout(() => setBeep(false), 4000)
    }
    known.current = new Set(rows.map((o) => o.id))
    setOrders(rows)
  }, [store.id])

  useEffect(() => {
    known.current = new Set()
    load()
    const t = setInterval(load, 20000) // atualiza sozinho a cada 20s
    return () => clearInterval(t)
  }, [load])

  async function setStatus(id: string, status: OrderStatus) {
    await supabase.from('orders').update({ status }).eq('id', id)
    load()
  }

  if (!orders) return <Spinner />
  const shown = orders.filter((o) => (filter === 'abertos' ? ['novo', 'separando', 'saiu'].includes(o.status) : true))

  return (
    <div className="page">
      <div className="page-head">
        <h2>Pedidos</h2>
        <div className="seg">
          <button className={filter === 'abertos' ? 'on' : ''} onClick={() => setFilter('abertos')}>Em andamento</button>
          <button className={filter === 'todos' ? 'on' : ''} onClick={() => setFilter('todos')}>Todos</button>
        </div>
      </div>
      {beep && <div className="hint ok">🔔 Chegou pedido novo!</div>}
      {shown.length === 0 && <p className="empty">Nenhum pedido por aqui ainda.</p>}

      {shown.map((o) => {
        const st = STATUS.find((s) => s.key === o.status)!
        return (
          <article key={o.id} className={`panel order st-${o.status}`}>
            <div className="order-head">
              <strong>{o.code}</strong>
              <span className={`badge b-${o.status}`}>{st.label}</span>
              <span className="muted small">{dateTime(o.created_at)}</span>
              <div className="grow" />
              <strong>{brl(o.total)}</strong>
            </div>
            <div className="order-who">
              {o.customer_name}{o.customer_phone ? ` · ${o.customer_phone}` : ''}
              <br />
              {o.delivery_type === 'pickup' ? '🏪 Retirada na loja' : `🛵 ${o.address ?? ''}${o.neighborhood ? ` — ${o.neighborhood}` : ''}`}
              {o.payment_method ? ` · ${o.payment_method}` : ''}
            </div>
            <ul className="order-items">
              {(o.order_items ?? []).map((it, i) => (
                <li key={i}>
                  {qtyLabel(it.qty)}{it.unit === 'un' ? '×' : ` ${UNIT_SHORT[it.unit as Unit] ?? it.unit}`} {it.name}
                  {it.note ? <em> ({it.note})</em> : null}
                  <span>{brl(it.line_total)}</span>
                </li>
              ))}
              {o.discount > 0 && <li>Cupom {o.coupon_code ?? ''}<span>-{brl(o.discount)}</span></li>}
              {o.delivery_fee > 0 && <li>Entrega<span>{brl(o.delivery_fee)}</span></li>}
            </ul>
            {o.notes && <div className="hint">Obs.: {o.notes}</div>}
            <div className="row">
              {st.next && <button className="btn primary small" onClick={() => setStatus(o.id, st.next!)}>{st.nextLabel}</button>}
              {o.customer_phone && (
                <a className="btn ghost small" target="_blank" rel="noreferrer" href={waLink(o.customer_phone.replace(/\D/g, '').length <= 11 ? `55${o.customer_phone}` : o.customer_phone, `Olá, ${o.customer_name}! Aqui é do ${store.name}. Sobre o seu pedido ${o.code}: `)}>
                  Falar com o cliente
                </a>
              )}
              {!['entregue', 'cancelado'].includes(o.status) && (
                <button className="btn ghost small danger" onClick={() => confirm('Cancelar este pedido?') && setStatus(o.id, 'cancelado')}>Cancelar</button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
