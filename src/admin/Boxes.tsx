import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { brl, parseMoney } from '../lib/format'
import type { Box } from '../lib/types'
import { Field, Spinner } from '../components/Common'
import { useAdmin } from './context'
import { useCatalog } from './useCatalog'

export default function Boxes() {
  const { store } = useAdmin()
  const cat = useCatalog()
  const [editing, setEditing] = useState<Box | null>(null)
  const [priceText, setPriceText] = useState('')
  const [itemsText, setItemsText] = useState('')
  const [msg, setMsg] = useState('')

  if (cat.loading) return <Spinner />

  function open(b: Box | null) {
    const base: Box = b ?? { id: '', store_id: store.id, name: '', emoji: '📦', description: '', items: [], price: 0, available: false, sort: 99 }
    setEditing(base)
    setPriceText(base.price > 0 ? String(base.price).replace('.', ',') : '')
    setItemsText(base.items.join('\n'))
    setMsg('')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const price = priceText.trim() === '' ? 0 : parseMoney(priceText)
    if (Number.isNaN(price) || price < 0) return setMsg('Preço inválido.')
    const row: any = {
      ...editing,
      price,
      available: price > 0 ? editing.available : false,
      items: itemsText.split('\n').map((s) => s.trim()).filter(Boolean),
    }
    if (!row.id) delete row.id
    const { error } = await supabase.from('boxes').upsert(row)
    if (error) return setMsg(error.message)
    setEditing(null)
    cat.refresh()
  }

  async function remove(b: Box) {
    if (!confirm(`Excluir "${b.name}"?`)) return
    await supabase.from('boxes').delete().eq('id', b.id)
    cat.refresh()
  }

  async function toggle(b: Box) {
    if (!b.available && b.price <= 0) return alert('Defina um preço antes de colocar no ar.')
    await supabase.from('boxes').update({ available: !b.available }).eq('id', b.id)
    cat.refresh()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Boxes e combos</h2>
          <p className="muted">Monte combos com preço fechado. Box sem preço fica fora do catálogo.</p>
        </div>
        <button className="btn primary small" onClick={() => open(null)}>+ Novo box</button>
      </div>

      <div className="panel list">
        {cat.boxes.map((b) => (
          <div key={b.id} className="list-row">
            <span className="le">{b.emoji}</span>
            <div className="grow">
              <div className="card-name">{b.name}</div>
              <div className="card-sub">{b.price > 0 ? brl(b.price) : 'Sem preço'} · {b.items.join(', ') || 'sem itens'}</div>
            </div>
            <button className={`toggle ${b.available ? 'on' : ''}`} onClick={() => toggle(b)}><span /></button>
            <button className="btn small ghost" onClick={() => open(b)}>Editar</button>
            <button className="btn small ghost danger" onClick={() => remove(b)}>✕</button>
          </div>
        ))}
        {cat.boxes.length === 0 && <p className="empty">Nenhum box criado.</p>}
      </div>

      {editing && (
        <div className="sheet-wrap" onClick={() => setEditing(null)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="sheet-head">
              <h3>{editing.id ? 'Editar box' : 'Novo box'}</h3>
              <button type="button" className="icon-btn" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="sheet-body form">
              <div className="grid2">
                <Field label="Emoji"><input value={editing.emoji ?? ''} maxLength={4} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} /></Field>
                <Field label="Nome"><input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              </div>
              <Field label="Descrição curta"><input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
              <Field label="O que vem no box" hint="Um item por linha"><textarea rows={5} value={itemsText} onChange={(e) => setItemsText(e.target.value)} /></Field>
              <Field label="Preço do box (R$)"><input inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="0,00" /></Field>
              <label className="check">
                <input type="checkbox" checked={editing.available} onChange={(e) => setEditing({ ...editing, available: e.target.checked })} />
                Disponível no catálogo
              </label>
              {msg && <div className="hint err">{msg}</div>}
            </div>
            <div className="sheet-foot"><button className="btn primary block">Salvar</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
