import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { slugify } from '../lib/format'
import { Field } from '../components/Common'
import { useContext } from 'react'
import { AdminContext } from './context'

const COLORS = ['#16a34a', '#15803d', '#ea580c', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#be185d']

export default function NewStore() {
  const nav = useNavigate()
  const admin = useContext(AdminContext)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [phone, setPhone] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [seed, setSeed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_store', {
      p_name: name,
      p_slug: slug,
      p_whatsapp: phone,
      p_color: color,
      p_seed: seed,
    })
    setBusy(false)
    if (error) return setError(error.message)
    if (data?.id) localStorage.setItem('hortion:store', data.id)
    // força recarregar a lista de lojas
    window.location.assign('/painel/precos?novo=1')
  }

  return (
    <div className="page narrow">
      <h2>{admin ? 'Adicionar outro hortifruti' : 'Vamos criar a sua loja'}</h2>
      <p className="muted">Leva menos de 1 minuto. Já vem com um catálogo de hortifruti pronto — você só preenche os preços.</p>
      <form className="panel form" onSubmit={onSubmit}>
        <Field label="Nome do hortifruti">
          <input
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugTouched) setSlug(slugify(e.target.value))
            }}
            placeholder="Ex.: Horti Verde"
          />
        </Field>
        <Field label="Endereço do catálogo" hint={`${window.location.origin}/${slug || 'sualoja'}`}>
          <input
            required
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value))
              setSlugTouched(true)
            }}
            placeholder="horti-verde"
          />
        </Field>
        <Field label="WhatsApp que recebe os pedidos" hint="Com DDD. Ex.: (21) 98765-4321">
          <input required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(21) 98765-4321" />
        </Field>
        <div className="field">
          <span>Cor da loja</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button type="button" key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Outra cor" />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
          Começar com o catálogo-modelo de hortifruti (frutas, verduras, legumes, temperos)
        </label>
        {error && <div className="hint err">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Criando…' : 'Criar minha loja'}</button>
      </form>
    </div>
  )
}
