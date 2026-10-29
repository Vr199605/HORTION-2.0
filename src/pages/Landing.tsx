import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BRAND } from '../lib/supabase'
import { DEMOS } from '../lib/demoData'
import { PLANS, SETUP_FEE_NOTE, TRIAL_DAYS, hasSalesContact, salesLink } from '../lib/plans'
import { submitLead } from '../lib/api'
import { brl, maskPhone } from '../lib/format'
import ShopView from '../components/ShopView'
import PhoneFrame from '../components/PhoneFrame'

const FEATURES: [string, string, string][] = [
  ['⚡', 'Preço do dia em 1 minuto', 'Tela de atualização express: digite os preços e publique tudo de uma vez.'],
  ['🚫', 'Acabou? Tire do ar', 'Um toque marca o produto como indisponível. Nada de vender o que não tem.'],
  ['⚖️', 'Feito para kg, maço e dúzia', 'Quantidade de 0,5 em 0,5 kg, observação “bem maduro” e total já calculado.'],
  ['🛵', 'Entrega por bairro', 'Taxa por bairro, pedido mínimo e frete grátis acima de um valor.'],
  ['🏷️', 'Cupons de desconto', 'Crie cupons em % ou em reais, com mínimo, validade e limite de usos.'],
  ['🕒', 'Horário por dia', 'Fora do expediente a loja mostra “Fechado” e não recebe pedido.'],
  ['📦', 'Boxes e combos', 'Monte seus combos com preço fechado e liste o que vai em cada um.'],
  ['📲', 'Pedido pronto no WhatsApp', 'Itens, endereço, pagamento e total numa mensagem organizada.'],
  ['🔗', 'Link e QR Code', 'Um endereço só seu para Instagram, Google e panfleto.'],
]

const FAQ: [string, string][] = [
  ['Preciso instalar algum aplicativo?', 'Não. Seu cliente abre o link no navegador do celular e seu painel funciona no navegador também.'],
  ['Os pedidos chegam onde?', 'No seu WhatsApp, já organizados, e também no painel de pedidos, onde você acompanha cada etapa.'],
  ['Como cobro o cliente?', 'Do jeito que você já faz: Pix, dinheiro ou cartão na entrega. A HORTION não cobra comissão por pedido.'],
  ['Quanto tempo leva para montar minha loja?', 'Poucos minutos. O catálogo de hortifruti já vem pronto: você informa os preços e publica.'],
  ['Posso testar antes de pagar?', `Sim. Toda loja nova tem ${TRIAL_DAYS} dias grátis, sem cartão de crédito.`],
  ['Consigo mudar os preços todo dia?', 'Sim, e é rápido: a tela ⚡ Preços lista tudo e salva de uma vez. Dá para importar uma planilha também.'],
  ['Tenho mais de uma loja. Dá certo?', 'Dá. Uma conta gerencia várias lojas, e você pode duplicar uma loja pronta para um novo cliente.'],
]

export default function Landing() {
  const demoList = Object.values(DEMOS)
  const [demoSlug, setDemoSlug] = useState(demoList[0].store.slug)
  const demo = DEMOS[demoSlug]

  useEffect(() => {
    document.title = `${BRAND} | Catálogo online para hortifruti`
  }, [])

  // formulário de contato
  const [f, setF] = useState({ name: '', company: '', email: '', whatsapp: '', city: '', segment: 'Hortifruti' })
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onLead(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (f.name.trim().length < 2) return setErr('Informe seu nome.')
    if (f.whatsapp.replace(/\D/g, '').length < 10) return setErr('Informe o WhatsApp com DDD.')
    setBusy(true)
    try {
      await submitLead(f)
      setSent(true)
    } catch (ex: any) {
      setErr(ex?.message || 'Não foi possível enviar agora. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="landing">
      <header className="l-top">
        <strong className="l-brand">🥬 {BRAND}</strong>
        <nav className="l-nav" aria-label="Seções">
          <a href="#demo">Demonstração</a>
          <a href="#como">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="#faq">Dúvidas</a>
        </nav>
        <div className="grow" />
        <Link className="btn ghost small" to="/login">Entrar</Link>
        <Link className="btn primary small" to="/montar">Montar minha loja</Link>
      </header>

      <section className="l-hero" id="demo">
        <div className="l-hero-text">
          <span className="pill">Feito para hortifrutis</span>
          <h1>Transforme seu WhatsApp numa loja digital.</h1>
          <p>
            Seus clientes escolhem frutas, legumes e verduras num catálogo organizado, montam o carrinho e o pedido chega
            pronto no seu WhatsApp. Sem aplicativo e sem comissão por pedido.
          </p>
          <div className="row">
            <Link className="btn primary big" to="/montar">Montar minha loja grátis</Link>
            <Link className="btn ghost big" to={`/${demoSlug}`}>Abrir a demonstração</Link>
          </div>
          <p className="muted small">{TRIAL_DAYS} dias grátis · sem cartão · você vê a loja ao vivo enquanto monta.</p>
        </div>
        <div className="l-hero-demo">
          <div className="seg demo-tabs" role="tablist" aria-label="Lojas de demonstração">
            {demoList.map((x) => (
              <button
                key={x.store.slug}
                role="tab"
                aria-selected={x.store.slug === demoSlug}
                className={x.store.slug === demoSlug ? 'on' : ''}
                onClick={() => setDemoSlug(x.store.slug)}
              >
                {x.store.name}
              </button>
            ))}
          </div>
          <PhoneFrame label="Demonstração interativa">
            <ShopView key={demo.store.slug} data={demo} preview />
          </PhoneFrame>
          <p className="muted small center-text">Esta é uma loja de verdade para você testar: adicione itens, use o cupom <strong>BEMVINDO10</strong> e finalize.</p>
        </div>
      </section>

      <section className="l-how" id="como">
        <h2>Da ideia à loja no ar em 3 passos</h2>
        <div className="l-steps">
          {[
            ['1', 'Monte', 'Escolha nome, cor, produtos e preços vendo a loja ganhar vida ao lado.'],
            ['2', 'Publique', 'Crie sua conta e a loja entra no ar com link e QR Code prontos.'],
            ['3', 'Receba', 'Os pedidos chegam organizados no WhatsApp e no painel.'],
          ].map(([n, t, dsc]) => (
            <div key={n} className="l-step">
              <span className="l-stepnum">{n}</span>
              <h3>{t}</h3>
              <p>{dsc}</p>
            </div>
          ))}
        </div>
        <div className="row center"><Link className="btn primary" to="/montar">Começar agora</Link></div>
      </section>

      <section>
        <h2 className="center-text">Tudo o que um hortifruti precisa</h2>
        <div className="l-grid">
          {FEATURES.map(([e, t, dsc]) => (
            <div key={t} className="l-card">
              <div className="l-emoji" aria-hidden>{e}</div>
              <h3>{t}</h3>
              <p>{dsc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="center-text">Veja outras lojas de demonstração</h2>
        <div className="l-demos">
          {demoList.map((x) => (
            <Link key={x.store.slug} to={`/${x.store.slug}`} className="l-demo" style={{ ['--c' as any]: x.store.primary_color }}>
              <span className="l-demo-badge" style={{ background: x.store.primary_color }}>{x.store.name.slice(0, 1)}</span>
              <strong>{x.store.name}</strong>
              <small>{x.products.filter((p) => p.available).length} produtos · pedido mínimo {brl(x.store.min_order)}</small>
              <span className="l-demo-cta">Abrir loja →</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="planos">
        <h2 className="center-text">Planos</h2>
        <p className="center-text muted">Comece grátis por {TRIAL_DAYS} dias. Depois, escolha como continuar.</p>
        <div className="l-plans">
          {PLANS.map((p) => (
            <article key={p.id} className={`l-plan ${p.tag ? 'hl' : ''}`}>
              {p.tag && <span className="pill">{p.tag}</span>}
              <h3>{p.name}</h3>
              <div className="l-price">
                {p.original && <s>{brl(p.original)}</s>}
                <strong>{brl(p.price)}</strong>
                <small>{p.period}</small>
              </div>
              <p className="muted small">{p.installments}</p>
              <ul>
                {p.features.map((x) => <li key={x}>✓ {x}</li>)}
              </ul>
              {hasSalesContact ? (
                <a className="btn primary block" target="_blank" rel="noreferrer" href={salesLink(`Olá! Quero contratar o plano ${p.name} do ${BRAND}.`)}>Quero este plano</a>
              ) : (
                <Link className="btn primary block" to="/montar">Começar grátis</Link>
              )}
            </article>
          ))}
        </div>
        <p className="center-text muted small" style={{ marginTop: 14 }}>{SETUP_FEE_NOTE}</p>
      </section>

      <section id="faq" className="l-faq">
        <h2 className="center-text">Perguntas frequentes</h2>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <section className="l-lead" id="contato">
        <div>
          <h2>Prefere conversar antes?</h2>
          <p>Deixe seu contato e a gente retorna pelo WhatsApp para tirar suas dúvidas.</p>
          {hasSalesContact && (
            <a className="btn ghost" href={salesLink(`Olá! Quero saber mais sobre o ${BRAND}.`)} target="_blank" rel="noreferrer">Falar agora no WhatsApp</a>
          )}
        </div>
        {sent ? (
          <div className="hint ok" role="status">✓ Recebemos seu contato! Em breve retornamos pelo WhatsApp.</div>
        ) : (
          <form className="panel form" onSubmit={onLead}>
            <label>Seu nome<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
            <label>Nome do hortifruti<input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></label>
            <div className="grid2">
              <label>WhatsApp<input inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: maskPhone(e.target.value) })} autoComplete="tel" /></label>
              <label>Cidade<input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
            </div>
            <label>E-mail (opcional)<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
            {err && <div className="hint err" role="alert">{err}</div>}
            <button className="btn primary" disabled={busy}>{busy ? 'Enviando…' : 'Quero ser contatado'}</button>
          </form>
        )}
      </section>

      <section className="l-cta">
        <h2>Pronto em minutos, não em semanas.</h2>
        <p>Monte a sua loja agora, veja como ela fica no celular e publique quando estiver do seu jeito.</p>
        <Link className="btn primary" to="/montar">Montar minha loja grátis</Link>
      </section>

      <footer className="l-foot">© {new Date().getFullYear()} {BRAND} · Catálogo online para hortifruti</footer>
    </div>
  )
}
