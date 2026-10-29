import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { brl, formatPhone, onlyDigits, parseMoney, slugify } from '../lib/format'
import type { Store } from '../lib/types'
import { Field, Spinner } from '../components/Common'
import HoursEditor from '../components/HoursEditor'
import { PLANS, activationMessage, hasSalesContact, salesLink } from '../lib/plans'
import { useAdmin } from './context'
import { useCatalog } from './useCatalog'

const COLORS = ['#16a34a', '#15803d', '#ea580c', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#be185d']

export default function Settings() {
  const { store, reload } = useAdmin()
  const cat = useCatalog()
  const [f, setF] = useState<Store>(store)
  const [minText, setMinText] = useState(String(store.min_order).replace('.', ','))
  const [feeText, setFeeText] = useState(String(store.default_delivery_fee).replace('.', ','))
  const [freeText, setFreeText] = useState(String(store.free_delivery_from).replace('.', ','))
  const [phone, setPhone] = useState(formatPhone(store.whatsapp))
  const [msg, setMsg] = useState<{ k: 'ok' | 'err'; t: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // bairros
  const [zName, setZName] = useState('')
  const [zFee, setZFee] = useState('')

  // transferir / duplicar
  const [email, setEmail] = useState('')
  const [cName, setCName] = useState('')
  const [cSlug, setCSlug] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cPrices, setCPrices] = useState(false)
  const [adv, setAdv] = useState<{ k: 'ok' | 'err'; t: string } | null>(null)

  if (cat.loading) return <Spinner />

  async function save(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const min = minText.trim() ? parseMoney(minText) : 0
    const fee = feeText.trim() ? parseMoney(feeText) : 0
    const free = freeText.trim() ? parseMoney(freeText) : 0
    if ([min, fee, free].some((n) => Number.isNaN(n) || n < 0)) return setMsg({ k: 'err', t: 'Confira os valores em dinheiro.' })
    let digits = onlyDigits(phone)
    if (digits.length < 10) return setMsg({ k: 'err', t: 'WhatsApp inválido.' })
    if (digits.length <= 11) digits = '55' + digits
    setBusy(true)
    const { error } = await supabase
      .from('stores')
      .update({
        name: f.name,
        tagline: f.tagline,
        whatsapp: digits,
        address: f.address,
        hours: f.hours,
        hours_json: f.hours_json,
        about: f.about?.trim() || null,
        phone: f.phone?.trim() || null,
        pix_key: f.pix_key,
        primary_color: f.primary_color,
        logo_url: f.logo_url,
        accepts_delivery: f.accepts_delivery,
        accepts_pickup: f.accepts_pickup || !f.accepts_delivery,
        min_order: min,
        default_delivery_fee: fee,
        free_delivery_from: free,
      })
      .eq('id', store.id)
    setBusy(false)
    if (error) return setMsg({ k: 'err', t: error.message })
    setMsg({ k: 'ok', t: 'Configurações salvas.' })
    reload()
  }

  async function uploadLogo(file: File) {
    const path = `${store.id}/logo-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('store-assets').upload(path, file, { upsert: true })
    if (error) return setMsg({ k: 'err', t: error.message })
    const { data } = supabase.storage.from('store-assets').getPublicUrl(path)
    setF({ ...f, logo_url: data.publicUrl })
  }

  async function addZone() {
    const fee = zFee.trim() ? parseMoney(zFee) : 0
    if (!zName.trim() || Number.isNaN(fee)) return
    await supabase.from('delivery_zones').insert({ store_id: store.id, name: zName.trim(), fee, sort: cat.zones.length + 1 })
    setZName('')
    setZFee('')
    cat.refresh()
  }

  async function transfer() {
    setAdv(null)
    if (!email.trim()) return
    if (!confirm(`Transferir "${store.name}" para ${email}? Você perde o acesso a esta loja.`)) return
    const { error } = await supabase.rpc('transfer_store', { p_slug: store.slug, p_email: email })
    if (error) return setAdv({ k: 'err', t: error.message })
    localStorage.removeItem('hortion:store')
    window.location.assign('/painel')
  }

  async function clone() {
    setAdv(null)
    const { data, error } = await supabase.rpc('clone_store', {
      p_source_slug: store.slug,
      p_name: cName,
      p_slug: cSlug,
      p_whatsapp: cPhone,
      p_copy_prices: cPrices,
    })
    if (error) return setAdv({ k: 'err', t: error.message })
    localStorage.setItem('hortion:store', data.id)
    window.location.assign('/painel/precos?novo=1')
  }

  const daysLeft = Math.ceil((new Date(store.active_until).getTime() - Date.now()) / 86400000)

  return (
    <div className="page narrow">
      <h2>Configurações</h2>

      <section className="panel">
        <h3>Seu plano</h3>
        <p>
          {daysLeft > 0 ? (
            <>Acesso ativo até <strong>{new Date(store.active_until).toLocaleDateString('pt-BR')}</strong> ({daysLeft} dia{daysLeft === 1 ? '' : 's'}).</>
          ) : (
            <strong>Acesso expirado: os clientes não conseguem enviar pedidos.</strong>
          )}
        </p>
        {hasSalesContact ? (
          <div className="row wrap">
            {PLANS.map((p) => (
              <a key={p.id} className="btn small primary" target="_blank" rel="noreferrer" href={salesLink(activationMessage(store.name, store.slug, p.name))}>
                Ativar {p.name}
              </a>
            ))}
          </div>
        ) : (
          <p className="muted small">Fale com o suporte para ativar ou renovar.</p>
        )}
      </section>

      <form className="panel form" onSubmit={save}>
        <h3>Dados da loja</h3>
        <Field label="Nome"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Frase de apresentação"><input value={f.tagline ?? ''} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
        <Field label="WhatsApp que recebe os pedidos"><input inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Endereço"><input value={f.address ?? ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Sobre a loja" hint="Aparece no botão ℹ️ da vitrine"><textarea rows={3} value={f.about ?? ''} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="Há 20 anos levando frescor à sua mesa…" /></Field>
        <Field label="Telefone fixo (opcional)"><input inputMode="tel" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <div className="field">
          <span>Horário de funcionamento</span>
          <HoursEditor value={f.hours_json} onChange={(v) => setF({ ...f, hours_json: v })} />
          <small>Fora do horário, o cliente vê “Fechado” e não consegue enviar pedido.</small>
        </div>
        <Field label="Chave Pix (aparece no checkout)"><input value={f.pix_key ?? ''} onChange={(e) => setF({ ...f, pix_key: e.target.value })} /></Field>

        <div className="field">
          <span>Logo</span>
          <div className="row">
            {f.logo_url && <img src={f.logo_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 12 }} />}
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            {f.logo_url && <button type="button" className="btn small ghost" onClick={() => setF({ ...f, logo_url: null })}>Remover</button>}
          </div>
        </div>

        <div className="field">
          <span>Cor da loja</span>
          <div className="swatches">
            {COLORS.map((c) => <button type="button" key={c} className={`swatch ${c === f.primary_color ? 'on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, primary_color: c })} aria-label={c} />)}
            <input type="color" value={f.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value })} />
          </div>
        </div>

        <h3>Entrega e pedido</h3>
        <div className="grid2">
          <label className="check"><input type="checkbox" checked={f.accepts_delivery} onChange={(e) => setF({ ...f, accepts_delivery: e.target.checked })} /> Faz entrega</label>
          <label className="check"><input type="checkbox" checked={f.accepts_pickup} onChange={(e) => setF({ ...f, accepts_pickup: e.target.checked })} /> Aceita retirada</label>
        </div>
        <div className="grid3">
          <Field label="Pedido mínimo (R$)"><input inputMode="decimal" value={minText} onChange={(e) => setMinText(e.target.value)} /></Field>
          <Field label="Taxa padrão (R$)" hint="Usada quando não há bairro"><input inputMode="decimal" value={feeText} onChange={(e) => setFeeText(e.target.value)} /></Field>
          <Field label="Frete grátis acima de" hint="0 = desligado"><input inputMode="decimal" value={freeText} onChange={(e) => setFreeText(e.target.value)} /></Field>
        </div>
        {msg && <div className={`hint ${msg.k}`}>{msg.t}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configurações'}</button>
      </form>

      <section className="panel">
        <h3>Taxa de entrega por bairro</h3>
        <div className="list">
          {cat.zones.map((z) => (
            <div key={z.id} className="list-row">
              <div className="grow">{z.name}</div>
              <strong>{z.fee > 0 ? brl(z.fee) : 'Grátis'}</strong>
              <button className="btn small ghost danger" onClick={async () => { await supabase.from('delivery_zones').delete().eq('id', z.id); cat.refresh() }}>✕</button>
            </div>
          ))}
          {cat.zones.length === 0 && <p className="muted small">Sem bairros: vale a taxa padrão para todos.</p>}
        </div>
        <div className="row">
          <input className="search" placeholder="Bairro" value={zName} onChange={(e) => setZName(e.target.value)} />
          <input className="search short" placeholder="Taxa R$" inputMode="decimal" value={zFee} onChange={(e) => setZFee(e.target.value)} />
          <button className="btn small primary" onClick={addZone}>Adicionar</button>
        </div>
      </section>

      <section className="panel form">
        <h3>Implantar para um cliente</h3>
        <p className="muted small">Duplique esta loja como base para outro hortifruti. Cria uma loja nova na sua conta; depois você pode transferi-la ao dono.</p>
        <Field label="Nome do novo hortifruti"><input value={cName} onChange={(e) => { setCName(e.target.value); setCSlug(slugify(e.target.value)) }} /></Field>
        <div className="grid2">
          <Field label="Endereço (link)"><input value={cSlug} onChange={(e) => setCSlug(slugify(e.target.value))} /></Field>
          <Field label="WhatsApp do cliente"><input inputMode="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={cPrices} onChange={(e) => setCPrices(e.target.checked)} /> Copiar também os preços atuais</label>
        <button className="btn primary" onClick={clone} disabled={!cName || !cSlug || !cPhone}>Duplicar loja</button>

        <hr />
        <h3>Transferir esta loja</h3>
        <p className="muted small">Entrega a loja pronta ao dono. Ele precisa já ter criado a conta com esse e-mail.</p>
        <div className="row">
          <input className="search" type="email" placeholder="e-mail do dono" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn ghost" onClick={transfer} disabled={!email}>Transferir</button>
        </div>
        {adv && <div className={`hint ${adv.k}`}>{adv.t}</div>}
      </section>
    </div>
  )
}
