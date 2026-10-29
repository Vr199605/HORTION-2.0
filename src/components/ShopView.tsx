import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { placeOrder, validateCoupon } from '../lib/api'
import { brl, maskPhone, normalizeText, onColor, onlyDigits, qtyLabel, r2 } from '../lib/format'
import { UNIT_LABEL, UNIT_SHORT } from '../lib/types'
import type { Box, CartLine, CatalogData, OrderResult, Product } from '../lib/types'
import { buildOrderMessage, waLink } from '../lib/whatsapp'
import type { CustomerInfo } from '../lib/whatsapp'
import { hoursTable, isStoreOpen, statusText } from '../lib/hours'
import { DEMO_COUPON_HINT } from '../lib/demoData'

export const stepFor = (unit: string) => (unit === 'kg' ? 0.5 : 1)
export const effectivePrice = (p: Product) => (p.offer_price && p.offer_price > 0 && p.offer_price < p.price ? p.offer_price : p.price)

const emptyCustomer: CustomerInfo = {
  name: '',
  phone: '',
  delivery_type: 'delivery',
  address: '',
  neighborhood: '',
  zone_id: '',
  payment_method: 'Pix',
  notes: '',
  coupon: '',
}

type Sheet = null | 'cart' | 'info'
type Step = 'cart' | 'checkout' | 'done'
type View = 'home' | 'featured' | 'boxes' | string // string = `cat:<id>`

interface Applied {
  code: string
  discount: number
}

/** Mantém o carrinho coerente com o catálogo atual: tira o que acabou e atualiza preços. */
export function syncCart(cart: CartLine[], data: CatalogData): CartLine[] {
  const out: CartLine[] = []
  for (const l of cart) {
    if (l.kind === 'box') {
      const b = data.boxes.find((x) => x.id === l.id)
      if (b && b.available && b.price > 0) out.push({ ...l, name: b.name, unitPrice: b.price })
    } else {
      const p = data.products.find((x) => x.id === l.id)
      if (p && p.available && p.price > 0) out.push({ ...l, name: p.name, unit: p.unit, unitPrice: effectivePrice(p) })
    }
  }
  const same = out.length === cart.length && out.every((l, i) => l.unitPrice === cart[i].unitPrice && l.name === cart[i].name)
  return same ? cart : out
}

export default function ShopView({ data, preview = false }: { data: CatalogData; preview?: boolean }) {
  const { store, categories, zones } = data
  const slug = store.slug
  const cartKey = `hortion:cart:${slug}`
  const custKey = 'hortion:customer'

  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>('home')
  const [cart, setCart] = useState<CartLine[]>([])
  const [sheet, setSheet] = useState<Sheet>(null)
  const [step, setStep] = useState<Step>('cart')
  const [customer, setCustomer] = useState<CustomerInfo>(emptyCustomer)
  const [change, setChange] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [applied, setApplied] = useState<Applied | null>(null)
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [couponBusy, setCouponBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')
  const [result, setResult] = useState<{ order: OrderResult; link: string; text: string; auto: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const restored = useRef(false)

  const open = data.demo ? store.is_open : isStoreOpen(store)

  // ----- restaurar carrinho e dados do cliente (só na loja real)
  useEffect(() => {
    if (preview) return
    try {
      const c = localStorage.getItem(cartKey)
      if (c) setCart(JSON.parse(c))
      const u = localStorage.getItem(custKey)
      if (u) setCustomer({ ...emptyCustomer, ...JSON.parse(u), notes: '', coupon: '' })
    } catch {
      /* ignore */
    }
    restored.current = true
  }, [cartKey, preview])

  useEffect(() => {
    if (preview || !restored.current) return
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart))
    } catch {
      /* ignore */
    }
  }, [cart, cartKey, preview])

  // ----- sincroniza com o catálogo (preço mudou, produto acabou)
  useEffect(() => {
    setCart((prev) => syncCart(prev, data))
  }, [data])

  // ----- fechar com ESC e travar rolagem do fundo
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    if (!preview) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      if (!preview) document.body.style.overflow = prev
    }
  }, [sheet, preview])

  const subtotal = r2(cart.reduce((a, l) => a + l.unitPrice * l.qty, 0))
  const count = cart.length

  // ----- cupom: revalida quando o subtotal muda
  const appliedCode = applied?.code
  useEffect(() => {
    if (!appliedCode) return
    let live = true
    validateCoupon(data, appliedCode, subtotal).then((r) => {
      if (!live) return
      if (r.valid) setApplied({ code: r.code ?? appliedCode, discount: r.discount ?? 0 })
      else {
        setApplied(null)
        setCouponMsg({ ok: false, text: r.message })
      }
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, appliedCode, data])

  useEffect(() => {
    if (cart.length === 0 && applied) {
      setApplied(null)
      setCouponMsg(null)
    }
  }, [cart.length, applied])

  const discount = applied ? Math.min(applied.discount, subtotal) : 0
  const zone = zones.find((z) => z.id === customer.zone_id)
  let fee = 0
  if (customer.delivery_type === 'delivery') {
    fee = zone ? zone.fee : store.default_delivery_fee
    if (store.free_delivery_from > 0 && subtotal - discount >= store.free_delivery_from) fee = 0
  }
  const total = r2(subtotal - discount + fee)

  // ----- listas
  const sellable = useMemo(() => data.products.filter((p) => p.price > 0), [data.products])
  const featured = useMemo(() => sellable.filter((p) => p.featured && p.available), [sellable])
  const boxes = useMemo(() => data.boxes.filter((b) => b.available && b.price > 0), [data.boxes])
  const catsWithItems = useMemo(
    () => categories.filter((c) => sellable.some((p) => p.category_id === c.id)),
    [categories, sellable],
  )
  const orphans = useMemo(
    () => sellable.filter((p) => !categories.some((c) => c.id === p.category_id)),
    [sellable, categories],
  )
  const q = normalizeText(query)
  const results = useMemo(
    () => (q ? sellable.filter((p) => normalizeText(p.name).includes(q)) : []),
    [q, sellable],
  )
  const boxResults = useMemo(
    () => (q ? boxes.filter((b) => normalizeText(b.name).includes(q)) : []),
    [q, boxes],
  )

  // ----- carrinho
  const lineOf = (key: string) => cart.find((l) => l.key === key)

  const setQty = useCallback((line: Omit<CartLine, 'qty'>, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((l) => l.key !== line.key)
      const rounded = Math.round(qty * 1000) / 1000
      const idx = prev.findIndex((l) => l.key === line.key)
      if (idx === -1) return [...prev, { ...line, qty: rounded }]
      const copy = [...prev]
      copy[idx] = { ...copy[idx], ...line, qty: rounded, note: copy[idx].note }
      return copy
    })
    setFormError('')
  }, [])

  const productLine = (p: Product): Omit<CartLine, 'qty'> => ({
    key: `product:${p.id}`,
    kind: 'product',
    id: p.id,
    name: p.name,
    emoji: p.emoji || '🛒',
    unit: p.unit,
    unitPrice: effectivePrice(p),
  })
  const boxLine = (b: Box): Omit<CartLine, 'qty'> => ({
    key: `box:${b.id}`,
    kind: 'box',
    id: b.id,
    name: b.name,
    emoji: b.emoji || '📦',
    unit: 'box',
    unitPrice: b.price,
  })

  const setNote = (key: string, note: string) => setCart((prev) => prev.map((l) => (l.key === key ? { ...l, note } : l)))

  async function applyCoupon() {
    const code = couponInput.trim()
    if (!code) return setCouponMsg({ ok: false, text: 'Digite o cupom' })
    setCouponBusy(true)
    const r = await validateCoupon(data, code, subtotal)
    setCouponBusy(false)
    if (r.valid) {
      setApplied({ code: r.code ?? code.toUpperCase(), discount: r.discount ?? 0 })
      setCouponMsg({ ok: true, text: r.message })
      setCouponInput('')
    } else {
      setApplied(null)
      setCouponMsg({ ok: false, text: r.message })
    }
  }

  function removeCoupon() {
    setApplied(null)
    setCouponMsg(null)
  }

  function openCart() {
    setStep('cart')
    setFormError('')
    setSheet('cart')
  }

  async function submit() {
    setFormError('')
    const c = customer
    if (!c.name.trim()) return setFormError('Informe seu nome.')
    if (c.delivery_type === 'delivery' && !c.address.trim()) return setFormError('Informe o endereço de entrega.')
    if (c.delivery_type === 'delivery' && zones.length > 0 && !c.zone_id) return setFormError('Escolha o seu bairro.')
    if (c.phone && onlyDigits(c.phone).length < 10) return setFormError('Confira o telefone: use DDD + número.')
    if (subtotal < store.min_order) return setFormError(`Pedido mínimo: ${brl(store.min_order)}.`)
    if (!open) return setFormError('A loja está fechada no momento.')

    const payment =
      c.payment_method === 'Dinheiro' && change.trim() ? `Dinheiro (troco para R$ ${change.trim()})` : c.payment_method
    const info: CustomerInfo = {
      ...c,
      neighborhood: zone?.name ?? c.neighborhood,
      payment_method: payment,
      coupon: applied?.code ?? '',
    }

    const auto = !data.demo && !preview
    // abre a aba agora (gesto do clique) para o navegador não bloquear o WhatsApp depois
    const win = auto ? window.open('', '_blank') : null
    setSending(true)
    try {
      const order = await placeOrder(data, cart, info)
      const text = buildOrderMessage(store, order, info)
      const link = waLink(store.whatsapp, text)
      if (win && !win.closed) win.location.href = link
      if (!preview) {
        try {
          localStorage.setItem(custKey, JSON.stringify({ ...c, notes: '', coupon: '' }))
        } catch {
          /* ignore */
        }
      }
      setResult({ order, link, text, auto: Boolean(win && !win.closed) })
      setCart([])
      setApplied(null)
      setCouponMsg(null)
      setStep('done')
    } catch (e: any) {
      win?.close()
      setFormError(e?.message || 'Não foi possível enviar o pedido. Tente de novo.')
    } finally {
      setSending(false)
    }
  }

  async function copyOrder() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const style = { '--brand': store.primary_color, '--on-brand': onColor(store.primary_color) } as CSSProperties
  const initials = store.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const renderCard = (p: Product) => (
    <ProductCard key={p.id} p={p} qty={lineOf(`product:${p.id}`)?.qty ?? 0} onChange={(n) => setQty(productLine(p), n)} />
  )
  const renderBox = (b: Box) => (
    <BoxCard key={b.id} b={b} qty={lineOf(`box:${b.id}`)?.qty ?? 0} onChange={(n) => setQty(boxLine(b), n)} />
  )

  const showHome = !q && view === 'home'
  const catId = view.startsWith('cat:') ? view.slice(4) : null
  const nothing = sellable.length === 0 && boxes.length === 0

  return (
    <div className={`shop ${preview ? 'embedded' : ''}`} style={style}>
      <div className="shop-scroll">
      <header className="shop-header">
        <div className="shop-id">
          {store.logo_url ? (
            <img src={store.logo_url} alt="" className="shop-logo" />
          ) : (
            <div className="shop-logo shop-logo-fallback" aria-hidden>
              {initials || '🥬'}
            </div>
          )}
          <div className="grow">
            <h1>{store.name || 'Sua loja'}</h1>
            <div className="shop-meta">
              <span className={`dot ${open ? 'on' : 'off'}`} />
              {data.demo ? (store.is_open ? 'Aberto agora' : 'Fechado no momento') : statusText(store)}
            </div>
          </div>
          <button className="icon-btn" onClick={() => setSheet('info')} aria-label="Informações da loja">
            ℹ️
          </button>
        </div>
        {data.demo && !preview && <div className="demo-banner">Loja de demonstração · produtos e preços fictícios. Cupom para testar: {DEMO_COUPON_HINT}</div>}
        <input
          className="search"
          type="search"
          placeholder="Buscar produtos…"
          aria-label="Buscar produtos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav className="chips" aria-label="Categorias">
          <button className={view === 'home' ? 'chip on' : 'chip'} onClick={() => { setView('home'); setQuery('') }}>
            Início
          </button>
          {featured.length > 0 && (
            <button className={view === 'featured' ? 'chip on' : 'chip'} onClick={() => { setView('featured'); setQuery('') }}>
              ⭐ Destaques
            </button>
          )}
          {boxes.length > 0 && (
            <button className={view === 'boxes' ? 'chip on' : 'chip'} onClick={() => { setView('boxes'); setQuery('') }}>
              📦 Boxes
            </button>
          )}
          {catsWithItems.map((c) => (
            <button key={c.id} className={view === `cat:${c.id}` ? 'chip on' : 'chip'} onClick={() => { setView(`cat:${c.id}`); setQuery('') }}>
              {c.emoji} {c.name}
            </button>
          ))}
        </nav>
      </header>

      {!open && !data.demo && (
        <div className="notice">
          {store.is_open ? 'A loja está fechada agora.' : 'A loja está fechada no momento.'} Você pode montar o carrinho e enviar quando abrir.
        </div>
      )}

      <main className="shop-main">
        {nothing && (
          <p className="empty">
            {preview ? 'Informe os preços dos produtos para eles aparecerem aqui.' : 'Esta loja ainda está montando o catálogo. Volte em breve!'}
          </p>
        )}

        {q && (
          <section>
            <h2>Resultados para “{query.trim()}”</h2>
            {results.length + boxResults.length === 0 ? (
              <p className="empty">Nenhum produto encontrado.</p>
            ) : (
              <div className="grid">
                {boxResults.map(renderBox)}
                {results.map(renderCard)}
              </div>
            )}
          </section>
        )}

        {showHome && (
          <>
            {featured.length > 0 && (
              <section>
                <div className="row-head">
                  <h2>⭐ Destaques</h2>
                  <button className="see-all" onClick={() => setView('featured')}>Ver todos ›</button>
                </div>
                <div className="hrow">{featured.slice(0, 12).map(renderCard)}</div>
              </section>
            )}
            {boxes.length > 0 && (
              <section>
                <div className="row-head">
                  <h2>📦 Boxes e combos</h2>
                  <button className="see-all" onClick={() => setView('boxes')}>Ver todos ›</button>
                </div>
                <div className="hrow">{boxes.map(renderBox)}</div>
              </section>
            )}
            {catsWithItems.map((c) => (
              <section key={c.id}>
                <div className="row-head">
                  <h2>{c.emoji} {c.name}</h2>
                  <button className="see-all" onClick={() => setView(`cat:${c.id}`)}>Ver todos ›</button>
                </div>
                <div className="hrow">{sellable.filter((p) => p.category_id === c.id).slice(0, 10).map(renderCard)}</div>
              </section>
            ))}
            {orphans.length > 0 && (
              <section>
                <h2>🛒 Outros</h2>
                <div className="hrow">{orphans.map(renderCard)}</div>
              </section>
            )}
          </>
        )}

        {!q && view === 'featured' && (
          <section>
            <h2>⭐ Destaques</h2>
            <div className="grid">{featured.map(renderCard)}</div>
          </section>
        )}
        {!q && view === 'boxes' && (
          <section>
            <h2>📦 Boxes e combos</h2>
            <div className="grid">{boxes.map(renderBox)}</div>
          </section>
        )}
        {!q && catId && (
          <section>
            <h2>
              {categories.find((c) => c.id === catId)?.emoji} {categories.find((c) => c.id === catId)?.name}
            </h2>
            <div className="grid">{sellable.filter((p) => p.category_id === catId).map(renderCard)}</div>
          </section>
        )}

        <footer className="shop-footer">
          {store.address && <div>📍 {store.address}</div>}
          <div>
            Catálogo por{' '}
            {preview ? <span>HORTION</span> : <Link to="/" className="muted-link">HORTION</Link>}
          </div>
        </footer>
      </main>
      </div>

      {count > 0 && sheet === null && (
        <button className="cart-bar" onClick={openCart}>
          <span>🛒 {count} {count === 1 ? 'item' : 'itens'}</span>
          <strong>{brl(subtotal)}</strong>
          <span className="cart-bar-cta">Ver carrinho</span>
        </button>
      )}

      {sheet === 'info' && (
        <div className="sheet-wrap" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Sobre a loja" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>Sobre a loja</h3>
              <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Fechar">✕</button>
            </div>
            <div className="sheet-body info">
              <h4>{store.name}</h4>
              {store.about ? <p>{store.about}</p> : store.tagline ? <p>{store.tagline}</p> : null}
              {store.address && <p>📍 {store.address}</p>}
              {store.phone && (
                <p>📞 <a href={`tel:${onlyDigits(store.phone)}`}>{store.phone}</a></p>
              )}
              <p>
                🛵 {store.accepts_delivery ? 'Entrega' : ''}{store.accepts_delivery && store.accepts_pickup ? ' e ' : ''}{store.accepts_pickup ? 'retirada na loja' : ''}
              </p>
              <ul className="facts">
                {store.min_order > 0 && <li>Valor mínimo de compra: <strong>{brl(store.min_order)}</strong></li>}
                {store.accepts_delivery && store.default_delivery_fee > 0 && zones.length === 0 && (
                  <li>Taxa de entrega: <strong>{brl(store.default_delivery_fee)}</strong></li>
                )}
                {store.free_delivery_from > 0 && <li>Frete grátis acima de <strong>{brl(store.free_delivery_from)}</strong></li>}
              </ul>
              {zones.length > 0 && store.accepts_delivery && (
                <>
                  <h5>Taxa por bairro</h5>
                  <table className="info-table">
                    <tbody>
                      {zones.map((z) => (
                        <tr key={z.id}><td>{z.name}</td><td>{z.fee > 0 ? brl(z.fee) : 'Grátis'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {store.hours_json ? (
                <>
                  <h5>Horário de funcionamento</h5>
                  <table className="info-table">
                    <tbody>
                      {hoursTable(store.hours_json).map((r) => (
                        <tr key={r.label} className={r.today ? 'today' : ''}><td>{r.label}</td><td>{r.value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : store.hours ? (
                <p>🕒 {store.hours}</p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {sheet === 'cart' && (
        <div className="sheet-wrap" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Carrinho" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>
                {step === 'cart' && 'Seu carrinho'}
                {step === 'checkout' && 'Finalizar pedido'}
                {step === 'done' && 'Pedido enviado!'}
              </h3>
              <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Fechar">✕</button>
            </div>

            {step === 'cart' && (
              <>
                <div className="sheet-body">
                  {cart.length === 0 && <p className="empty">Seu carrinho está vazio.</p>}
                  {cart.map((l) => (
                    <div key={l.key} className="line">
                      <div className="line-top">
                        <span className="line-emoji">{l.emoji}</span>
                        <div className="line-info">
                          <div className="card-name">{l.name}</div>
                          <div className="card-sub">
                            {brl(l.unitPrice)}
                            {l.unit !== 'box' ? ` / ${UNIT_SHORT[l.unit]}` : ''}
                          </div>
                        </div>
                        <div className="line-total">{brl(l.unitPrice * l.qty)}</div>
                      </div>
                      <div className="line-bottom">
                        <input
                          className="note-input"
                          placeholder="Observação (ex.: bem maduro)"
                          aria-label={`Observação para ${l.name}`}
                          value={l.note ?? ''}
                          maxLength={60}
                          onChange={(e) => setNote(l.key, e.target.value)}
                        />
                        <Stepper
                          qty={l.qty}
                          step={l.unit === 'box' ? 1 : stepFor(l.unit)}
                          unit={l.unit === 'box' ? undefined : l.unit}
                          label={l.name}
                          onChange={(n) => setQty(l, n)}
                        />
                      </div>
                    </div>
                  ))}

                  {cart.length > 0 && store.free_delivery_from > 0 && store.accepts_delivery && (
                    <div className="progress-box">
                      {subtotal - discount >= store.free_delivery_from ? (
                        <strong>🎉 Você ganhou frete grátis!</strong>
                      ) : (
                        <span>Faltam <strong>{brl(store.free_delivery_from - (subtotal - discount))}</strong> para o frete grátis</span>
                      )}
                      <div className="progress"><div style={{ width: `${Math.min(100, ((subtotal - discount) / store.free_delivery_from) * 100)}%` }} /></div>
                    </div>
                  )}

                  {cart.length > 0 && (
                    <div className="coupon-box">
                      {applied ? (
                        <div className="coupon-applied">
                          <span>🏷️ Cupom <strong>{applied.code}</strong> aplicado: -{brl(discount)}</span>
                          <button className="link-btn" onClick={removeCoupon}>Remover</button>
                        </div>
                      ) : (
                        <div className="row">
                          <input
                            className="grow"
                            placeholder="Cupom de desconto"
                            aria-label="Cupom de desconto"
                            value={couponInput}
                            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && applyCoupon()}
                          />
                          <button className="btn small ghost" onClick={applyCoupon} disabled={couponBusy}>
                            {couponBusy ? '…' : 'Aplicar'}
                          </button>
                        </div>
                      )}
                      {couponMsg && !applied && <div className={`hint ${couponMsg.ok ? 'ok' : 'err'}`}>{couponMsg.text}</div>}
                    </div>
                  )}
                </div>
                <div className="sheet-foot">
                  <div className="sum small"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
                  {discount > 0 && <div className="sum small ok"><span>Desconto</span><span>-{brl(discount)}</span></div>}
                  <div className="sum"><span>Total parcial</span><strong>{brl(subtotal - discount)}</strong></div>
                  {store.min_order > subtotal && cart.length > 0 && (
                    <div className="hint warn">Pedido mínimo: {brl(store.min_order)}. Faltam {brl(store.min_order - subtotal)}.</div>
                  )}
                  <button
                    className="btn primary block"
                    disabled={cart.length === 0 || subtotal < store.min_order}
                    onClick={() => setStep('checkout')}
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {step === 'checkout' && (
              <>
                <div className="sheet-body form">
                  <label>
                    Seu nome
                    <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} autoComplete="name" />
                  </label>
                  <label>
                    Seu WhatsApp
                    <input
                      inputMode="tel"
                      placeholder="(00) 00000-0000"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: maskPhone(e.target.value) })}
                      autoComplete="tel"
                    />
                  </label>

                  <div className="seg" role="group" aria-label="Como receber">
                    {store.accepts_delivery && (
                      <button className={customer.delivery_type === 'delivery' ? 'on' : ''} onClick={() => setCustomer({ ...customer, delivery_type: 'delivery' })}>
                        🛵 Entrega
                      </button>
                    )}
                    {store.accepts_pickup && (
                      <button className={customer.delivery_type === 'pickup' ? 'on' : ''} onClick={() => setCustomer({ ...customer, delivery_type: 'pickup' })}>
                        🏪 Retirar na loja
                      </button>
                    )}
                  </div>

                  {customer.delivery_type === 'delivery' && (
                    <>
                      {zones.length > 0 && (
                        <label>
                          Bairro
                          <select value={customer.zone_id} onChange={(e) => setCustomer({ ...customer, zone_id: e.target.value })}>
                            <option value="">Selecione…</option>
                            {zones.map((z) => (
                              <option key={z.id} value={z.id}>{z.name} · {z.fee > 0 ? brl(z.fee) : 'grátis'}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        Endereço (rua, número, complemento)
                        <input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} autoComplete="street-address" />
                      </label>
                    </>
                  )}

                  <label>
                    Forma de pagamento
                    <select value={customer.payment_method} onChange={(e) => setCustomer({ ...customer, payment_method: e.target.value })}>
                      <option>Pix</option>
                      <option>Dinheiro</option>
                      <option>Cartão na entrega</option>
                    </select>
                  </label>
                  {customer.payment_method === 'Dinheiro' && (
                    <label>
                      Troco para quanto? (opcional)
                      <input inputMode="decimal" placeholder="Ex.: 50" value={change} onChange={(e) => setChange(e.target.value)} />
                    </label>
                  )}
                  {customer.payment_method === 'Pix' && store.pix_key && (
                    <div className="hint">Chave Pix da loja: <strong>{store.pix_key}</strong></div>
                  )}
                  <label>
                    Observações do pedido (opcional)
                    <textarea rows={2} value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} />
                  </label>
                  {formError && <div className="hint err" role="alert">{formError}</div>}
                </div>
                <div className="sheet-foot">
                  <div className="sum small"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
                  {discount > 0 && <div className="sum small ok"><span>Cupom {applied?.code}</span><span>-{brl(discount)}</span></div>}
                  {customer.delivery_type === 'delivery' && (
                    <div className="sum small"><span>Entrega</span><span>{fee > 0 ? brl(fee) : 'Grátis'}</span></div>
                  )}
                  <div className="sum"><span>Total</span><strong>{brl(total)}</strong></div>
                  <div className="row">
                    <button className="btn ghost" onClick={() => setStep('cart')}>Voltar</button>
                    <button className="btn primary grow" disabled={sending} onClick={submit}>
                      {sending ? 'Enviando…' : 'Enviar pedido no WhatsApp'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 'done' && result && (
              <div className="sheet-body done">
                <div className="done-emoji">✅</div>
                <h3>Pedido {result.order.code} registrado</h3>
                <p>
                  Total <strong>{brl(result.order.total)}</strong>.{' '}
                  {data.demo || preview
                    ? 'Na loja de verdade, o WhatsApp abre aqui com o pedido pronto para enviar.'
                    : result.auto
                      ? 'Abrimos o WhatsApp com o pedido. É só tocar em enviar.'
                      : 'Toque no botão abaixo para enviar o pedido para a loja pelo WhatsApp.'}
                </p>
                <a className="btn primary block" href={result.link} target="_blank" rel="noreferrer">
                  {data.demo || preview ? 'Ver mensagem no WhatsApp' : 'Abrir WhatsApp'}
                </a>
                <button className="btn ghost block" onClick={copyOrder}>{copied ? 'Copiado!' : 'Copiar pedido'}</button>
                <button className="btn ghost block" onClick={() => setSheet(null)}>Continuar comprando</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductCard({ p, qty, onChange }: { p: Product; qty: number; onChange: (q: number) => void }) {
  const offer = p.offer_price && p.offer_price > 0 && p.offer_price < p.price
  const unavailable = !p.available
  return (
    <div className={`card ${unavailable ? 'unavailable' : ''}`}>
      {p.image_url ? <img className="card-img" src={p.image_url} alt={p.name} loading="lazy" /> : <div className="card-emoji" aria-hidden>{p.emoji}</div>}
      <div className="card-body">
        <div className="card-name">{p.name}</div>
        <div className="card-sub">
          por {UNIT_LABEL[p.unit]}
          {p.note ? ` · ${p.note}` : ''}
        </div>
        <div className="card-price">
          {offer && <s>{brl(p.price)}</s>} {brl(offer ? p.offer_price! : p.price)}
        </div>
      </div>
      {unavailable ? (
        <div className="soldout">Indisponível</div>
      ) : (
        <Stepper qty={qty} step={stepFor(p.unit)} unit={p.unit} label={p.name} onChange={onChange} />
      )}
    </div>
  )
}

function BoxCard({ b, qty, onChange }: { b: Box; qty: number; onChange: (q: number) => void }) {
  return (
    <div className="card box-card">
      <div className="card-emoji" aria-hidden>{b.emoji}</div>
      <div className="card-body">
        <div className="card-name">{b.name}</div>
        {b.description && <div className="card-sub">{b.description}</div>}
        {b.items.length > 0 && (
          <ul className="box-items">
            {b.items.map((i, k) => <li key={k}>{i}</li>)}
          </ul>
        )}
        <div className="card-price">{brl(b.price)}</div>
      </div>
      <Stepper qty={qty} step={1} label={b.name} onChange={onChange} />
    </div>
  )
}

export function Stepper({
  qty,
  step,
  unit,
  label,
  onChange,
}: {
  qty: number
  step: number
  unit?: string
  label: string
  onChange: (q: number) => void
}) {
  if (qty <= 0) {
    return (
      <button className="btn add" onClick={() => onChange(step)} aria-label={`Adicionar ${label}`}>
        Adicionar
      </button>
    )
  }
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(0, qty - step))} aria-label={`Diminuir ${label}`}>−</button>
      <span>
        {qtyLabel(qty)}
        {unit === 'kg' ? ' kg' : ''}
      </span>
      <button onClick={() => onChange(qty + step)} aria-label={`Aumentar ${label}`}>+</button>
    </div>
  )
}
