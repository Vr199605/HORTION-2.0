import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { brl, parseMoney } from '../lib/format'
import { UNIT_SHORT } from '../lib/types'
import type { Product } from '../lib/types'
import { Spinner } from '../components/Common'
import { useCatalog } from './useCatalog'

interface Edit {
  price?: string
  offer?: string
  available?: boolean
}

/** Atualização Express: todos os preços do dia numa tela só. */
export default function Prices() {
  const cat = useCatalog()
  const [params] = useSearchParams()
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [filter, setFilter] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(params.get('novo') === '1')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const dirty = Object.keys(edits).length

  function edit(id: string, patch: Edit) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }))
  }

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return cat.products.filter(
      (p) => (!q || p.name.toLowerCase().includes(q)) && (!onlyMissing || p.price <= 0),
    )
  }, [cat.products, filter, onlyMissing])

  if (cat.loading) return <Spinner />

  async function save() {
    setMsg('')
    const updates: Product[] = []
    for (const p of cat.products) {
      const e = edits[p.id]
      if (!e) continue
      const next = { ...p }
      if (e.price !== undefined) {
        const v = e.price.trim() === '' ? 0 : parseMoney(e.price)
        if (Number.isNaN(v) || v < 0) return setMsg(`Preço inválido em "${p.name}".`)
        next.price = v
        // quem acabou de receber preço entra no ar automaticamente
        if (p.price <= 0 && v > 0 && e.available === undefined) next.available = true
        if (v <= 0) next.available = false
      }
      if (e.offer !== undefined) {
        if (e.offer.trim() === '') next.offer_price = null
        else {
          const o = parseMoney(e.offer)
          if (Number.isNaN(o) || o <= 0) return setMsg(`Preço de oferta inválido em "${p.name}".`)
          if (o >= next.price) return setMsg(`A oferta de "${p.name}" precisa ser menor que o preço normal.`)
          next.offer_price = o
        }
      }
      if (e.available !== undefined) next.available = e.available
      if (next.available && next.price <= 0) return setMsg(`"${p.name}" precisa de um preço para ficar disponível.`)
      updates.push(next)
    }
    if (!updates.length) return
    setSaving(true)
    const { error } = await supabase.from('products').upsert(updates)
    setSaving(false)
    if (error) return setMsg(error.message)
    setEdits({})
    setMsg(`✓ ${updates.length} produto${updates.length > 1 ? 's' : ''} atualizado${updates.length > 1 ? 's' : ''}.`)
    await cat.refresh()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>⚡ Atualização Express</h2>
          <p className="muted">Digite os preços de hoje e publique tudo de uma vez. Produto sem preço fica fora do catálogo.</p>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar produto…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Só os sem preço ({cat.products.filter((p) => p.price <= 0).length})
        </label>
      </div>

      {cat.categories.map((c) => {
        const items = rows.filter((p) => p.category_id === c.id)
        if (!items.length) return null
        return (
          <section key={c.id} className="panel">
            <h3>{c.emoji} {c.name}</h3>
            <div className="price-table">
              <div className="price-head"><span>Produto</span><span>Preço</span><span>Oferta</span><span>No ar</span></div>
              {items.map((p) => {
                const e = edits[p.id] ?? {}
                const available = e.available ?? p.available
                return (
                  <div key={p.id} className={`price-row ${edits[p.id] ? 'changed' : ''}`}>
                    <span className="pname">{p.emoji} {p.name} <small>/{UNIT_SHORT[p.unit]}</small></span>
                    <input
                      inputMode="decimal"
                      placeholder={p.price > 0 ? brl(p.price) : '0,00'}
                      value={e.price ?? (p.price > 0 ? String(p.price).replace('.', ',') : '')}
                      onChange={(ev) => edit(p.id, { price: ev.target.value })}
                    />
                    <input
                      inputMode="decimal"
                      placeholder="—"
                      value={e.offer ?? (p.offer_price ? String(p.offer_price).replace('.', ',') : '')}
                      onChange={(ev) => edit(p.id, { offer: ev.target.value })}
                    />
                    <button
                      className={`toggle ${available ? 'on' : ''}`}
                      onClick={() => edit(p.id, { available: !available })}
                      aria-label={available ? 'Tirar do ar' : 'Colocar no ar'}
                    >
                      <span />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      {rows.length === 0 && <p className="empty">Nada por aqui.</p>}

      <div className="savebar">
        <span>{msg || (dirty ? `${dirty} alteraç${dirty > 1 ? 'ões' : 'ão'} não publicada${dirty > 1 ? 's' : ''}` : 'Tudo publicado')}</span>
        {dirty > 0 && <button className="btn ghost small" onClick={() => setEdits({})}>Descartar</button>}
        <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Publicando…' : 'PUBLICAR ALTERAÇÕES'}</button>
      </div>
    </div>
  )
}
