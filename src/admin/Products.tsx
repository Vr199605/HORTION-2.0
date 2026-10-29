import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { brl, parseMoney } from '../lib/format'
import { UNIT_LABEL } from '../lib/types'
import type { Product, Unit } from '../lib/types'
import { Field, Spinner } from '../components/Common'
import { useAdmin } from './context'
import { useCatalog } from './useCatalog'

const blank = (store_id: string, category_id: string | null): Product => ({
  id: '',
  store_id,
  category_id,
  name: '',
  emoji: '🛒',
  image_url: null,
  unit: 'kg',
  price: 0,
  offer_price: null,
  available: false,
  featured: false,
  note: null,
  sort: 999,
})

const UNIT_ALIASES: Record<string, Unit> = {
  kg: 'kg', quilo: 'kg', un: 'un', unidade: 'un', und: 'un', dz: 'dz', duzia: 'dz', 'dúzia': 'dz',
  mc: 'mc', maco: 'mc', 'maço': 'mc', bd: 'bd', bandeja: 'bd',
}

export default function Products() {
  const { store } = useAdmin()
  const cat = useCatalog()
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [editing, setEditing] = useState<Product | null>(null)
  const [priceText, setPriceText] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [newCat, setNewCat] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(
    () =>
      cat.products.filter(
        (p) => (catFilter === 'all' || p.category_id === catFilter) && (!q || p.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [cat.products, q, catFilter],
  )

  if (cat.loading) return <Spinner />

  function open(p: Product) {
    setEditing(p)
    setPriceText(p.price > 0 ? String(p.price).replace('.', ',') : '')
    setMsg('')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const price = priceText.trim() === '' ? 0 : parseMoney(priceText)
    if (Number.isNaN(price) || price < 0) return setMsg('Preço inválido.')
    const available = price > 0 ? editing.available : false
    const row: any = { ...editing, price, available, featured: available ? editing.featured : false }
    if (!row.id) delete row.id
    if (row.offer_price !== null && row.offer_price >= price) row.offer_price = null
    setBusy(true)
    const { error } = await supabase.from('products').upsert(row)
    setBusy(false)
    if (error) return setMsg(error.message)
    setEditing(null)
    cat.refresh()
  }

  async function remove(p: Product) {
    if (!confirm(`Excluir "${p.name}"?`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) alert(error.message)
    cat.refresh()
  }

  async function toggle(p: Product) {
    if (!p.available && p.price <= 0) return alert('Defina um preço antes de colocar no ar.')
    await supabase.from('products').update({ available: !p.available }).eq('id', p.id)
    cat.refresh()
  }

  async function toggleFeatured(p: Product) {
    if (!p.featured && !p.available) return alert('Coloque o produto no ar (com preço) para destacá-lo.')
    await supabase.from('products').update({ featured: !p.featured }).eq('id', p.id)
    cat.refresh()
  }

  async function addCategory() {
    const name = newCat.trim()
    if (!name) return
    const { error } = await supabase.from('categories').insert({ store_id: store.id, name, emoji: '🛒', sort: cat.categories.length + 1 })
    if (error) return alert(error.message)
    setNewCat('')
    cat.refresh()
  }

  async function removeCategory(id: string) {
    const c = cat.categories.find((x) => x.id === id)
    if (!c || !confirm(`Excluir a categoria "${c.name}"? Os produtos ficam sem categoria.`)) return
    await supabase.from('categories').delete().eq('id', id)
    setCatFilter('all')
    cat.refresh()
  }

  /** CSV: nome;unidade;preço;categoria  (aceita , ou ; como separador) */
  async function importCsv(file: File) {
    const text = await file.text()
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const rowsOut: any[] = []
    const catByName = new Map(cat.categories.map((c) => [c.name.toLowerCase(), c.id]))
    let created = 0
    for (let i = 0; i < lines.length; i++) {
      const sep = lines[i].includes(';') ? ';' : ','
      const parts = lines[i].split(sep).map((s) => s.trim().replace(/^"|"$/g, ''))
      if (i === 0 && /nome|produto/i.test(parts[0])) continue
      const [name, unitRaw = 'kg', priceRaw = '0', catName = ''] = parts
      if (!name) continue
      const unit = UNIT_ALIASES[unitRaw.toLowerCase()] ?? 'kg'
      const price = parseMoney(priceRaw)
      let category_id: string | null = null
      if (catName) {
        const key = catName.toLowerCase()
        if (!catByName.has(key)) {
          const { data } = await supabase.from('categories').insert({ store_id: store.id, name: catName, emoji: '🛒', sort: catByName.size + 1 }).select().single()
          if (data) catByName.set(key, data.id)
          created++
        }
        category_id = catByName.get(key) ?? null
      }
      const existing = cat.products.find((p) => p.name.toLowerCase() === name.toLowerCase())
      const p = Number.isNaN(price) ? 0 : price
      rowsOut.push({
        ...(existing ? { id: existing.id } : {}),
        store_id: store.id,
        name,
        unit,
        price: p,
        available: p > 0,
        category_id: category_id ?? existing?.category_id ?? null,
        emoji: existing?.emoji ?? '🛒',
      })
    }
    if (!rowsOut.length) return setMsg('Nenhuma linha válida encontrada no arquivo.')
    // lotes separados: com id (atualiza) e sem id (cria)
    const withId = rowsOut.filter((r) => r.id)
    const withoutId = rowsOut.filter((r) => !r.id)
    let failure = ''
    if (withId.length) {
      const r = await supabase.from('products').upsert(withId)
      if (r.error) failure = r.error.message
    }
    if (withoutId.length && !failure) {
      const r = await supabase.from('products').insert(withoutId)
      if (r.error) failure = r.error.message
    }
    setMsg(failure || `✓ ${rowsOut.length} produtos importados${created ? `, ${created} categorias criadas` : ''}.`)
    cat.refresh()
  }

  function exportCsv() {
    const catName = (id: string | null) => cat.categories.find((c) => c.id === id)?.name ?? ''
    const csv = ['nome;unidade;preco;categoria', ...cat.products.map((p) => `${p.name};${p.unit};${String(p.price).replace('.', ',')};${catName(p.category_id)}`)].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `produtos-${store.slug}.csv`
    a.click()
  }

  async function uploadImage(file: File) {
    if (!editing) return
    const path = `${store.id}/p-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('store-assets').upload(path, file, { upsert: true })
    if (error) return setMsg(error.message)
    const { data } = supabase.storage.from('store-assets').getPublicUrl(path)
    setEditing({ ...editing, image_url: data.publicUrl })
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Produtos</h2>
        <div className="row">
          <button className="btn primary small" onClick={() => open(blank(store.id, catFilter === 'all' ? cat.categories[0]?.id ?? null : catFilter))}>+ Novo produto</button>
          <button className="btn ghost small" onClick={() => fileRef.current?.click()}>Importar CSV</button>
          <button className="btn ghost small" onClick={exportCsv}>Exportar CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
        </div>
      </div>
      {msg && !editing && <div className="hint ok">{msg}</div>}
      {cat.error && <div className="hint err">{cat.error}</div>}

      <div className="toolbar">
        <input className="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">Todas as categorias</option>
          {cat.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        {catFilter !== 'all' && <button className="btn small ghost" onClick={() => removeCategory(catFilter)}>Excluir categoria</button>}
        <input className="search short" placeholder="Nova categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
        <button className="btn small ghost" onClick={addCategory}>Criar</button>
      </div>

      <div className="panel list">
        {rows.map((p) => (
          <div key={p.id} className="list-row">
            <span className="le">{p.image_url ? <img src={p.image_url} alt="" /> : p.emoji}</span>
            <div className="grow">
              <div className="card-name">{p.name}</div>
              <div className="card-sub">{p.price > 0 ? `${brl(p.price)} / ${UNIT_LABEL[p.unit]}` : 'Sem preço'}{p.offer_price ? ` · oferta ${brl(p.offer_price)}` : ''}</div>
            </div>
            <button className={`star ${p.featured ? 'on' : ''}`} onClick={() => toggleFeatured(p)} aria-label={p.featured ? 'Remover dos destaques' : 'Destacar na vitrine'} title="Destaque na vitrine">★</button>
            <button className={`toggle ${p.available ? 'on' : ''}`} onClick={() => toggle(p)} aria-label="Disponibilidade"><span /></button>
            <button className="btn small ghost" onClick={() => open(p)}>Editar</button>
            <button className="btn small ghost danger" onClick={() => remove(p)}>✕</button>
          </div>
        ))}
        {rows.length === 0 && <p className="empty">Nenhum produto.</p>}
      </div>

      {editing && (
        <div className="sheet-wrap" onClick={() => setEditing(null)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="sheet-head">
              <h3>{editing.id ? 'Editar produto' : 'Novo produto'}</h3>
              <button type="button" className="icon-btn" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="sheet-body form">
              <div className="grid2">
                <Field label="Emoji"><input value={editing.emoji ?? ''} maxLength={4} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} /></Field>
                <Field label="Nome"><input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              </div>
              <div className="grid2">
                <Field label="Categoria">
                  <select value={editing.category_id ?? ''} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}>
                    <option value="">Sem categoria</option>
                    {cat.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Vendido por">
                  <select value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value as Unit })}>
                    {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid2">
                <Field label="Preço (R$)"><input inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="0,00" /></Field>
                <Field label="Preço de oferta (opcional)">
                  <input inputMode="decimal" value={editing.offer_price ? String(editing.offer_price).replace('.', ',') : ''} onChange={(e) => { const v = parseMoney(e.target.value); setEditing({ ...editing, offer_price: Number.isNaN(v) ? null : v }) }} placeholder="—" />
                </Field>
              </div>
              <Field label="Observação (ex.: peso aproximado)"><input value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value || null })} /></Field>
              <div className="field">
                <span>Foto (opcional)</span>
                <div className="row">
                  {editing.image_url && <img src={editing.image_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10 }} />}
                  <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
                  {editing.image_url && <button type="button" className="btn small ghost" onClick={() => setEditing({ ...editing, image_url: null })}>Remover</button>}
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={editing.available} onChange={(e) => setEditing({ ...editing, available: e.target.checked })} />
                Disponível no catálogo
              </label>
              <label className="check">
                <input type="checkbox" checked={editing.featured} onChange={(e) => setEditing({ ...editing, featured: e.target.checked })} />
                ★ Destacar na vitrine
              </label>
              {msg && <div className="hint err">{msg}</div>}
            </div>
            <div className="sheet-foot">
              <button className="btn primary block" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
