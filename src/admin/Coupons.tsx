import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { brl, parseMoney } from '../lib/format'
import type { Coupon } from '../lib/types'
import { Field, Spinner } from '../components/Common'
import { useAdmin } from './context'

export default function Coupons() {
  const { store } = useAdmin()
  const [list, setList] = useState<Coupon[] | null>(null)
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [minOrder, setMinOrder] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expires, setExpires] = useState('')
  const [msg, setMsg] = useState<{ k: 'ok' | 'err'; t: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('coupons').select('*').eq('store_id', store.id).order('created_at', { ascending: false })
    setList((data ?? []).map((c: any) => ({ ...c, value: Number(c.value), min_order: Number(c.min_order) })))
  }, [store.id])

  useEffect(() => {
    load()
  }, [load])

  async function create(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const c = code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,20}$/.test(c)) return setMsg({ k: 'err', t: 'Código: 3 a 20 letras ou números, sem espaços (ex.: BEMVINDO10).' })
    const v = parseMoney(value)
    if (Number.isNaN(v) || v <= 0) return setMsg({ k: 'err', t: 'Informe o valor do desconto.' })
    if (kind === 'percent' && v > 100) return setMsg({ k: 'err', t: 'O desconto em % vai de 1 a 100.' })
    const min = minOrder.trim() ? parseMoney(minOrder) : 0
    if (Number.isNaN(min) || min < 0) return setMsg({ k: 'err', t: 'Pedido mínimo inválido.' })
    const max = maxUses.trim() ? parseInt(maxUses, 10) : null
    if (max !== null && (Number.isNaN(max) || max < 1)) return setMsg({ k: 'err', t: 'Limite de usos inválido.' })
    setBusy(true)
    const { error } = await supabase.from('coupons').insert({
      store_id: store.id,
      code: c,
      kind,
      value: v,
      min_order: min,
      max_uses: max,
      expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
    })
    setBusy(false)
    if (error) {
      return setMsg({ k: 'err', t: error.message.includes('duplicate') ? 'Já existe um cupom com esse código.' : error.message })
    }
    setCode('')
    setValue('')
    setMinOrder('')
    setMaxUses('')
    setExpires('')
    setMsg({ k: 'ok', t: `Cupom ${c} criado.` })
    load()
  }

  async function toggle(c: Coupon) {
    await supabase.from('coupons').update({ active: !c.active }).eq('id', c.id)
    load()
  }

  async function remove(c: Coupon) {
    if (!confirm(`Excluir o cupom ${c.code}?`)) return
    await supabase.from('coupons').delete().eq('id', c.id)
    load()
  }

  if (!list) return <Spinner />

  return (
    <div className="page narrow">
      <h2>Cupons de desconto</h2>
      <form className="panel form" onSubmit={create}>
        <h3>Novo cupom</h3>
        <div className="grid2">
          <Field label="Código"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BEMVINDO10" maxLength={20} /></Field>
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'fixed')}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
            </select>
          </Field>
        </div>
        <div className="grid3">
          <Field label={kind === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <Field label="Pedido mínimo (R$)" hint="Opcional"><input inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} /></Field>
          <Field label="Limite de usos" hint="Opcional"><input inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} /></Field>
        </div>
        <Field label="Válido até" hint="Opcional"><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
        {msg && <div className={`hint ${msg.k}`}>{msg.t}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Criando…' : 'Criar cupom'}</button>
      </form>

      <section className="panel list">
        {list.map((c) => (
          <div key={c.id} className="list-row">
            <div className="grow">
              <div className="card-name">{c.code}</div>
              <div className="card-sub">
                {c.kind === 'percent' ? `${c.value}% de desconto` : `${brl(c.value)} de desconto`}
                {c.min_order > 0 ? ` · mín. ${brl(c.min_order)}` : ''}
                {` · ${c.uses}${c.max_uses ? `/${c.max_uses}` : ''} usos`}
                {c.expires_at ? ` · até ${new Date(c.expires_at).toLocaleDateString('pt-BR')}` : ''}
              </div>
            </div>
            <button className={`toggle ${c.active ? 'on' : ''}`} onClick={() => toggle(c)} aria-label={`Ativar ou desativar ${c.code}`}><span /></button>
            <button className="btn small ghost danger" onClick={() => remove(c)}>✕</button>
          </div>
        ))}
        {list.length === 0 && <p className="empty">Nenhum cupom ainda. Crie um de boas-vindas para trazer o primeiro pedido.</p>}
      </section>
    </div>
  )
}
