import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase, isConfigured, BRAND } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { maskPhone, normalizeText, onlyDigits, slugify } from '../lib/format'
import { TEMPLATE, TEMPLATE_COUNT } from '../lib/template'
import { UNIT_LABEL } from '../lib/types'
import type { Unit } from '../lib/types'
import {
  COLORS,
  buildPreview,
  clearDraft,
  countPriced,
  loadDraft,
  num,
  samplePricesFor,
  saveDraft,
  slugError,
  toPayload,
} from '../lib/draft'
import type { Draft } from '../lib/draft'
import ShopView from '../components/ShopView'
import PhoneFrame from '../components/PhoneFrame'
import HoursEditor from '../components/HoursEditor'
import { Field } from '../components/Common'

const STEPS = ['Sua loja', 'Produtos e preços', 'Entrega e horários', 'Publicar']

function useWide(): boolean {
  const query = '(min-width: 980px)'
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false)
  const [wide, setWide] = useState(get)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [])
  return wide
}

type SlugState = 'idle' | 'checking' | 'free' | 'taken'

export default function Builder() {
  const nav = useNavigate()
  const { session, loading: authLoading, signOut } = useAuth()
  const [d, setD] = useState<Draft>(loadDraft)
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [tried, setTried] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const wide = useWide()
  const [slugState, setSlugState] = useState<SlugState>('idle')
  const [published, setPublished] = useState<{ slug: string } | null>(null)

  useEffect(() => saveDraft(d), [d])
  useEffect(() => {
    document.title = `Monte sua loja | ${BRAND}`
  }, [])

  const patch = (p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p }))
  const preview = useMemo(() => buildPreview(d), [d])
  const counts = useMemo(() => countPriced(d), [d])

  // ---- verificação de endereço livre
  const sErr = slugError(d.slug)
  useEffect(() => {
    if (sErr || !isConfigured) {
      setSlugState('idle')
      return
    }
    setSlugState('checking')
    let live = true
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.from('stores').select('id').eq('slug', d.slug).maybeSingle()
        if (live) setSlugState(data ? 'taken' : 'free')
      } catch {
        if (live) setSlugState('idle')
      }
    }, 400)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [d.slug, sErr])

  // ---- validações por passo
  const phoneDigits = onlyDigits(d.whatsapp)
  const step1Errors: string[] = []
  if (d.name.trim().length < 2) step1Errors.push('Informe o nome da loja.')
  if (sErr) step1Errors.push(sErr)
  else if (slugState === 'taken') step1Errors.push('Esse endereço já está em uso, escolha outro.')
  if (phoneDigits.length < 10) step1Errors.push('Informe o WhatsApp com DDD.')

  const step3Errors: string[] = []
  for (const [label, v] of [['Pedido mínimo', d.min_order], ['Taxa de entrega', d.fee], ['Frete grátis acima de', d.free_from]] as const) {
    const n = num(v)
    if (Number.isNaN(n) || n < 0) step3Errors.push(`${label}: valor inválido.`)
  }
  if (!d.accepts_delivery && !d.accepts_pickup) step3Errors.push('Marque entrega, retirada ou os dois.')

  const errorsFor = (s: number) => (s === 0 ? step1Errors : s === 2 ? step3Errors : [])

  function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) {
        if (errorsFor(s).length) {
          setTried(true)
          setStep(s)
          return
        }
      }
    }
    setTried(false)
    setStep(to)
    setMaxStep((m) => Math.max(m, to))
    window.scrollTo?.({ top: 0 })
  }

  // ---- preços
  function setPrice(key: string, text: string) {
    setD((prev) => {
      const sample = { ...prev.sample }
      delete sample[key]
      return { ...prev, prices: { ...prev.prices, [key]: text }, sample }
    })
  }
  const toggleFeatured = (key: string) => setD((prev) => ({ ...prev, featured: { ...prev.featured, [key]: !prev.featured[key] } }))
  const loadSamples = () => {
    const s = samplePricesFor()
    setD((prev) => {
      const prices = { ...prev.prices }
      const sample = { ...prev.sample }
      for (const k of Object.keys(s.prices)) {
        if (!prices[k]) {
          prices[k] = s.prices[k]
          sample[k] = true
        }
      }
      return { ...prev, prices, sample }
    })
  }
  const clearSamples = () =>
    setD((prev) => {
      const prices = { ...prev.prices }
      for (const k of Object.keys(prev.sample)) delete prices[k]
      return { ...prev, prices, sample: {} }
    })
  const clearAll = () => setD((prev) => ({ ...prev, prices: {}, sample: {}, featured: {}, custom: [] }))

  // ---- publicar
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [authMsg, setAuthMsg] = useState<{ k: 'ok' | 'err'; t: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pubError, setPubError] = useState('')

  async function onAuth(e: FormEvent) {
    e.preventDefault()
    setAuthMsg(null)
    if (!isConfigured) return setAuthMsg({ k: 'err', t: 'Supabase não configurado. Veja o README (passo 2).' })
    if (password.length < 6) return setAuthMsg({ k: 'err', t: 'A senha precisa ter pelo menos 6 caracteres.' })
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          setAuthMsg({
            k: 'ok',
            t: 'Conta criada! Confirme o e-mail que enviamos e volte a esta página: sua loja continua salva aqui.',
          })
          setMode('login')
        }
      }
    } catch (err: any) {
      const m = String(err.message || err)
      setAuthMsg({
        k: 'err',
        t: m.includes('Invalid login') ? 'E-mail ou senha incorretos.' : m.includes('already') ? 'Esse e-mail já tem conta. Use “Já tenho conta”.' : m,
      })
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setPubError('')
    if (step1Errors.length || step3Errors.length) {
      setPubError('Falta corrigir alguns dados nos passos anteriores.')
      setStep(step1Errors.length ? 0 : 2)
      setTried(true)
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_store_from_draft', {
      p_name: d.name.trim(),
      p_slug: d.slug,
      p_whatsapp: d.whatsapp,
      p_color: d.color,
      p_draft: toPayload(d),
    })
    setBusy(false)
    if (error) {
      if (/em uso|reservado/i.test(error.message)) {
        setSlugState('taken')
        setTried(true)
        setStep(0)
      }
      return setPubError(error.message)
    }
    if (data?.id) {
      try {
        localStorage.setItem('hortion:store', data.id)
      } catch {
        /* ignore */
      }
    }
    clearDraft()
    setPublished({ slug: d.slug })
  }

  if (published) return <Published slug={published.slug} name={d.name} onPanel={() => nav('/painel')} />

  const showErrors = tried ? errorsFor(step) : []
  const previewNode = (
    <PhoneFrame>
      <ShopView data={preview} preview />
    </PhoneFrame>
  )

  return (
    <div className="builder">
      <header className="b-top">
        <Link to="/" className="b-brand">🥬 {BRAND}</Link>
        <div className="grow" />
        <Link className="btn small ghost" to="/login">Já tenho conta</Link>
      </header>

      <div className="b-layout">
        <div className="b-main">
          <ol className="b-steps" aria-label="Etapas">
            {STEPS.map((t, i) => (
              <li key={t}>
                <button
                  type="button"
                  className={`b-step ${i === step ? 'on' : ''} ${i < step || i <= maxStep ? 'done' : ''}`}
                  aria-current={i === step ? 'step' : undefined}
                  disabled={i > maxStep + 1}
                  onClick={() => go(i)}
                >
                  <span className="b-num">{i < step ? '✓' : i + 1}</span>
                  <span className="b-label">{t}</span>
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <section className="panel form" aria-label="Sua loja">
              <h2>Como se chama o seu hortifruti?</h2>
              <p className="muted small">Tudo o que você preencher aparece na prévia ao lado, ao vivo.</p>
              <Field label="Nome da loja">
                <input
                  value={d.name}
                  placeholder="Ex.: Horti Verde"
                  onChange={(e) => patch({ name: e.target.value, ...(d.slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                />
              </Field>
              <Field
                label="Endereço do catálogo"
                hint={`${typeof window !== 'undefined' ? window.location.origin : ''}/${d.slug || 'sualoja'}`}
              >
                <input value={d.slug} placeholder="horti-verde" onChange={(e) => patch({ slug: slugify(e.target.value), slugTouched: true })} />
              </Field>
              {d.slug && sErr && <div className="hint err" role="status">{sErr}</div>}
              {d.slug && !sErr && (
                <div className={`hint ${slugState === 'taken' ? 'err' : slugState === 'free' ? 'ok' : ''}`} role="status">
                  {slugState === 'checking' && 'Verificando…'}
                  {slugState === 'free' && '✓ Endereço disponível'}
                  {slugState === 'taken' && 'Esse endereço já está em uso, escolha outro.'}
                  {slugState === 'idle' && 'Endereço válido.'}
                </div>
              )}
              <Field label="WhatsApp que recebe os pedidos" hint="Com DDD">
                <input inputMode="tel" placeholder="(21) 98765-4321" value={d.whatsapp} onChange={(e) => patch({ whatsapp: maskPhone(e.target.value) })} />
              </Field>
              <Field label="Frase de apresentação (opcional)">
                <input value={d.tagline} placeholder="Frescor direto do produtor" onChange={(e) => patch({ tagline: e.target.value })} />
              </Field>
              <div className="field">
                <span>Cor da loja</span>
                <div className="swatches">
                  {COLORS.map((c) => (
                    <button type="button" key={c} className={`swatch ${c === d.color ? 'on' : ''}`} style={{ background: c }} onClick={() => patch({ color: c })} aria-label={`Cor ${c}`} />
                  ))}
                  <input type="color" value={d.color} onChange={(e) => patch({ color: e.target.value })} aria-label="Outra cor" />
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <ProductsStep
              d={d}
              counts={counts}
              setPrice={setPrice}
              toggleFeatured={toggleFeatured}
              loadSamples={loadSamples}
              clearSamples={clearSamples}
              clearAll={clearAll}
              setCustom={(custom) => patch({ custom })}
            />
          )}

          {step === 2 && (
            <section className="panel form" aria-label="Entrega e horários">
              <h2>Como você entrega?</h2>
              <div className="grid2">
                <label className="check"><input type="checkbox" checked={d.accepts_delivery} onChange={(e) => patch({ accepts_delivery: e.target.checked })} /> Faço entrega</label>
                <label className="check"><input type="checkbox" checked={d.accepts_pickup} onChange={(e) => patch({ accepts_pickup: e.target.checked })} /> Cliente retira na loja</label>
              </div>
              <div className="grid3">
                <Field label="Pedido mínimo (R$)" hint="0 = sem mínimo"><input inputMode="decimal" value={d.min_order} onChange={(e) => patch({ min_order: e.target.value })} placeholder="0,00" /></Field>
                {d.accepts_delivery && (
                  <>
                    <Field label="Taxa de entrega (R$)" hint="Quando não há bairro"><input inputMode="decimal" value={d.fee} onChange={(e) => patch({ fee: e.target.value })} placeholder="0,00" /></Field>
                    <Field label="Frete grátis acima de (R$)" hint="0 = desligado"><input inputMode="decimal" value={d.free_from} onChange={(e) => patch({ free_from: e.target.value })} placeholder="0,00" /></Field>
                  </>
                )}
              </div>

              {d.accepts_delivery && (
                <ZonesEditor zones={d.zones} onChange={(zones) => patch({ zones })} />
              )}

              <div className="field">
                <span>Horário de funcionamento</span>
                <HoursEditor value={d.hours} onChange={(hours) => patch({ hours })} />
                <small>Fora do horário, o cliente vê “Fechado” e não envia pedido.</small>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="panel form" aria-label="Publicar">
              <h2>Quase lá! Últimos detalhes</h2>
              <Field label="Sobre a loja (opcional)" hint="Aparece no botão ℹ️ da vitrine">
                <textarea rows={3} value={d.about} onChange={(e) => patch({ about: e.target.value })} placeholder="Há 20 anos levando frescor à sua mesa…" />
              </Field>
              <Field label="Endereço da loja (opcional)"><input value={d.address} onChange={(e) => patch({ address: e.target.value })} /></Field>
              <div className="grid2">
                <Field label="Telefone fixo (opcional)"><input inputMode="tel" value={d.phone} onChange={(e) => patch({ phone: e.target.value })} /></Field>
                <Field label="Chave Pix (opcional)"><input value={d.pix} onChange={(e) => patch({ pix: e.target.value })} /></Field>
              </div>

              <h3>Resumo</h3>
              <ul className="checklist">
                <li className={step1Errors.length ? 'bad' : 'ok'}>{step1Errors.length ? '○' : '✓'} {d.name.trim() || 'Sem nome'} · /{d.slug || '—'}</li>
                <li className={counts.real ? 'ok' : 'warn'}>
                  {counts.real ? '✓' : '○'} {counts.real} produto{counts.real === 1 ? '' : 's'} com o seu preço
                  {!counts.real && ' — você poderá preencher depois no painel (⚡ Preços)'}
                </li>
                {counts.sample > 0 && (
                  <li className="warn" role="alert">
                    ⚠ {counts.sample} preço{counts.sample === 1 ? '' : 's'} de exemplo <strong>não será{counts.sample === 1 ? '' : 'o'} publicado{counts.sample === 1 ? '' : 's'}</strong>: esses produtos ficam fora do ar até você informar o preço.{' '}
                    <button type="button" className="link-inline" onClick={() => go(1)}>Informar agora</button>
                  </li>
                )}
                <li className="ok">✓ {d.accepts_delivery ? 'Entrega' : ''}{d.accepts_delivery && d.accepts_pickup ? ' e ' : ''}{d.accepts_pickup || !d.accepts_delivery ? 'retirada' : ''}</li>
                <li className={d.hours ? 'ok' : 'warn'}>{d.hours ? '✓ Horário por dia definido' : '○ Sem horário fixo (aberta sempre que ligada)'}</li>
              </ul>

              {!isConfigured && <div className="hint warn">Supabase não configurado: a publicação fica indisponível. Veja o README (passo 2).</div>}

              {authLoading ? (
                <p className="muted">Verificando sua conta…</p>
              ) : session ? (
                <div className="b-publish">
                  <p>Conectado como <strong>{session.user.email}</strong>. <button type="button" className="link-inline" onClick={signOut}>Trocar</button></p>
                  {pubError && <div className="hint err" role="alert">{pubError}</div>}
                  <button type="button" className="btn primary block" onClick={publish} disabled={busy || !isConfigured}>
                    {busy ? 'Publicando…' : '🚀 Publicar minha loja'}
                  </button>
                  <p className="muted small">14 dias grátis para testar. Sem cartão.</p>
                </div>
              ) : (
                <form className="b-auth form" onSubmit={onAuth}>
                  <h3>{mode === 'signup' ? 'Crie sua conta para publicar' : 'Entre na sua conta para publicar'}</h3>
                  <Field label="E-mail"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
                  <Field label="Senha (mín. 6 caracteres)"><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
                  {authMsg && <div className={`hint ${authMsg.k}`} role="status">{authMsg.t}</div>}
                  <button className="btn primary block" disabled={busy}>{busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : 'Entrar'}</button>
                  <button type="button" className="link-btn" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setAuthMsg(null) }}>
                    {mode === 'signup' ? 'Já tenho conta' : 'Ainda não tenho conta'}
                  </button>
                </form>
              )}
            </section>
          )}

          {showErrors.length > 0 && (
            <div className="hint err" role="alert">
              {showErrors.map((m) => <div key={m}>{m}</div>)}
            </div>
          )}

          <div className="b-nav">
            {step > 0 && <button type="button" className="btn ghost" onClick={() => go(step - 1)}>← Voltar</button>}
            <div className="grow" />
            {step < 3 && <button type="button" className="btn primary" onClick={() => go(step + 1)}>Continuar →</button>}
          </div>
        </div>

        {wide && (
          <aside className="b-preview" aria-label="Prévia ao vivo">
            {previewNode}
            <p className="muted small center-text">Prévia ao vivo — toque nos produtos, monte o carrinho e teste um pedido.</p>
          </aside>
        )}
      </div>

      {!wide && (
        <>
          <button type="button" className="b-fab" onClick={() => setShowPreview(true)}>📱 Ver prévia</button>
          {showPreview && (
            <div className="b-modal" role="dialog" aria-modal="true" aria-label="Prévia da loja" onClick={() => setShowPreview(false)}>
              <div onClick={(e) => e.stopPropagation()}>
                {previewNode}
                <button type="button" className="btn primary block" onClick={() => setShowPreview(false)}>Fechar prévia</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ZonesEditor({ zones, onChange }: { zones: Draft['zones']; onChange: (z: Draft['zones']) => void }) {
  const [name, setName] = useState('')
  const [fee, setFee] = useState('')
  function add() {
    if (!name.trim()) return
    const n = num(fee)
    if (Number.isNaN(n) || n < 0) return
    onChange([...zones, { name: name.trim(), fee }])
    setName('')
    setFee('')
  }
  return (
    <div className="field">
      <span>Taxa por bairro (opcional)</span>
      <div className="list">
        {zones.map((z, i) => (
          <div key={`${z.name}-${i}`} className="list-row">
            <div className="grow">{z.name}</div>
            <strong>{num(z.fee) > 0 ? `R$ ${z.fee}` : 'Grátis'}</strong>
            <button type="button" className="btn small ghost danger" aria-label={`Remover ${z.name}`} onClick={() => onChange(zones.filter((_, k) => k !== i))}>✕</button>
          </div>
        ))}
      </div>
      <div className="row">
        <input className="grow" placeholder="Bairro" aria-label="Nome do bairro" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <input className="short-input" placeholder="Taxa R$" aria-label="Taxa do bairro" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button type="button" className="btn small primary" onClick={add}>Adicionar</button>
      </div>
      <small>Sem bairros, vale a taxa padrão para todos.</small>
    </div>
  )
}

function ProductsStep({
  d,
  counts,
  setPrice,
  toggleFeatured,
  loadSamples,
  clearSamples,
  clearAll,
  setCustom,
}: {
  d: Draft
  counts: { real: number; sample: number }
  setPrice: (key: string, text: string) => void
  toggleFeatured: (key: string) => void
  loadSamples: () => void
  clearSamples: () => void
  clearAll: () => void
  setCustom: (c: Draft['custom']) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string>(TEMPLATE[0].name)
  const nq = normalizeText(q)

  const [cName, setCName] = useState('')
  const [cEmoji, setCEmoji] = useState('🛒')
  const [cUnit, setCUnit] = useState<Unit>('kg')
  const [cCat, setCCat] = useState(TEMPLATE[0].name)
  const [cPrice, setCPrice] = useState('')
  const [cErr, setCErr] = useState('')

  function addCustom() {
    setCErr('')
    const p = num(cPrice)
    if (!cName.trim()) return setCErr('Informe o nome do produto.')
    if (Number.isNaN(p) || p <= 0) return setCErr('Informe um preço maior que zero.')
    if (TEMPLATE.some((c) => c.products.some((x) => normalizeText(x.name) === normalizeText(cName))) || d.custom.some((x) => normalizeText(x.name) === normalizeText(cName)))
      return setCErr('Já existe um produto com esse nome.')
    setCustom([...d.custom, { id: String(Date.now()), name: cName.trim(), emoji: cEmoji || '🛒', unit: cUnit, category: cCat, price: cPrice }])
    setCName('')
    setCPrice('')
  }

  return (
    <section className="panel form" aria-label="Produtos e preços">
      <h2>Quais produtos você vende?</h2>
      <p className="muted small">
        Já vem com {TEMPLATE_COUNT} produtos de hortifruti. Só aparece na vitrine o que tiver preço. Toque na ★ para destacar na página inicial.
      </p>

      <div className="b-counts">
        <strong>{counts.real}</strong> com o seu preço
        {counts.sample > 0 && <> · <span className="sample-tag">{counts.sample} de exemplo</span></>}
      </div>
      {counts.sample > 0 && (
        <div className="hint warn" role="note">
          Os preços em amarelo são só <strong>exemplo</strong>, para você ver a loja funcionando. Troque pelos seus: os de exemplo <strong>não são publicados</strong>.
        </div>
      )}
      <div className="row wrap">
        <button type="button" className="btn small ghost" onClick={loadSamples}>Carregar preços de exemplo</button>
        {counts.sample > 0 && <button type="button" className="btn small ghost" onClick={clearSamples}>Limpar exemplos</button>}
        <button type="button" className="btn small ghost danger" onClick={clearAll}>Limpar tudo</button>
      </div>

      <input type="search" placeholder="Buscar produto…" aria-label="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} />

      {TEMPLATE.map((c) => {
        const items = nq ? c.products.filter((p) => normalizeText(p.name).includes(nq)) : c.products
        if (nq && items.length === 0) return null
        const isOpen = nq ? true : open === c.name
        const pricedHere = c.products.filter((p) => num(d.prices[p.key] ?? '') > 0).length
        return (
          <div key={c.name} className="b-cat">
            <button type="button" className="b-cat-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen && !nq ? '' : c.name)}>
              <span>{c.emoji} {c.name}</span>
              <small>{pricedHere}/{c.products.length} com preço</small>
              <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="b-prod-list">
                {items.map((p) => {
                  const isSample = Boolean(d.sample[p.key])
                  return (
                    <div key={p.key} className="b-prod">
                      <span className="b-emoji" aria-hidden>{p.emoji}</span>
                      <div className="grow">
                        <div className="card-name">{p.name}</div>
                        <div className="card-sub">por {UNIT_LABEL[p.unit]}</div>
                      </div>
                      <button
                        type="button"
                        className={`star ${d.featured[p.key] ? 'on' : ''}`}
                        aria-label={`${d.featured[p.key] ? 'Remover destaque de' : 'Destacar'} ${p.name}`}
                        aria-pressed={Boolean(d.featured[p.key])}
                        onClick={() => toggleFeatured(p.key)}
                      >★</button>
                      <input
                        className={`price-in ${isSample ? 'sample' : ''}`}
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        aria-label={`Preço de ${p.name}`}
                        value={d.prices[p.key] ?? ''}
                        onChange={(e) => setPrice(p.key, e.target.value)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div className="b-custom">
        <h3>Algum produto que não está na lista?</h3>
        {d.custom.map((c) => (
          <div key={c.id} className="b-prod">
            <span className="b-emoji" aria-hidden>{c.emoji}</span>
            <div className="grow">
              <div className="card-name">{c.name}</div>
              <div className="card-sub">{c.category} · por {UNIT_LABEL[c.unit]}</div>
            </div>
            <input
              className="price-in"
              inputMode="decimal"
              aria-label={`Preço de ${c.name}`}
              value={c.price}
              onChange={(e) => setCustom(d.custom.map((x) => (x.id === c.id ? { ...x, price: e.target.value } : x)))}
            />
            <button type="button" className="btn small ghost danger" aria-label={`Remover ${c.name}`} onClick={() => setCustom(d.custom.filter((x) => x.id !== c.id))}>✕</button>
          </div>
        ))}
        <div className="b-custom-form">
          <input className="emoji-in" maxLength={4} aria-label="Emoji do produto" value={cEmoji} onChange={(e) => setCEmoji(e.target.value)} />
          <input className="grow" placeholder="Nome do produto" aria-label="Nome do novo produto" value={cName} onChange={(e) => setCName(e.target.value)} />
          <select aria-label="Categoria do novo produto" value={cCat} onChange={(e) => setCCat(e.target.value)}>
            {TEMPLATE.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
          <select aria-label="Unidade do novo produto" value={cUnit} onChange={(e) => setCUnit(e.target.value as Unit)}>
            {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
          </select>
          <input className="price-in" placeholder="R$ 0,00" aria-label="Preço do novo produto" inputMode="decimal" value={cPrice} onChange={(e) => setCPrice(e.target.value)} />
          <button type="button" className="btn small primary" onClick={addCustom}>Adicionar</button>
        </div>
        {cErr && <div className="hint err" role="alert">{cErr}</div>}
      </div>
    </section>
  )
}

function Published({ slug, name, onPanel }: { slug: string; name: string; onPanel: () => void }) {
  const url = `${window.location.origin}/${slug}`
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 320 }).then(setQr).catch(() => undefined)
  }, [url])
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>🎉</div>
        <h2>{name} está no ar!</h2>
        <p className="muted">Seus clientes já podem pedir pelo link abaixo.</p>
        <div className="linkbox"><code>{url}</code>
          <button
            type="button"
            className="btn small primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url)
                setCopied(true)
              } catch {
                /* ignore */
              }
            }}
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        {qr && <img className="qr" src={qr} alt="QR Code da loja" />}
        <a className="btn ghost block" href={`/${slug}`} target="_blank" rel="noreferrer">Ver minha loja ↗</a>
        <button type="button" className="btn primary block" onClick={onPanel}>Ir para o painel</button>
      </div>
    </div>
  )
}

