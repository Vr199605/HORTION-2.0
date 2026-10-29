import { TEMPLATE, SAMPLE_PRICES } from './template'
import { presetHours } from './hours'
import { onlyDigits, parseMoney, r2 } from './format'
import type { CatalogData, Category, HoursMap, Product, Unit, Zone } from './types'

export const DRAFT_KEY = 'hortion:draft'

export interface CustomItem {
  id: string
  name: string
  emoji: string
  unit: Unit
  category: string
  price: string
}

export interface Draft {
  name: string
  slug: string
  slugTouched: boolean
  whatsapp: string
  color: string
  tagline: string
  /** preço digitado por produto do modelo (chave = TemplateProduct.key) */
  prices: Record<string, string>
  /** preços que vieram do "exemplo" e ainda não foram trocados: nunca são publicados */
  sample: Record<string, boolean>
  featured: Record<string, boolean>
  custom: CustomItem[]
  accepts_delivery: boolean
  accepts_pickup: boolean
  min_order: string
  fee: string
  free_from: string
  zones: { name: string; fee: string }[]
  hours: HoursMap | null
  about: string
  address: string
  phone: string
  pix: string
}

export const COLORS = ['#16a34a', '#15803d', '#ea580c', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#be185d']

export const RESERVED = [
  'painel', 'demo', 'conheca', 'login', 'cadastro', 'api', 'admin', 'app', 'www', 'loja', 'l',
  'montar', 'planos', 'entrar', 'revenda', 'termos', 'privacidade', 'suporte', 'ajuda',
]

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export function slugError(slug: string): string {
  if (!slug) return 'Escolha o endereço da loja.'
  if (RESERVED.includes(slug) || slug.startsWith('demo')) return 'Esse endereço é reservado, escolha outro.'
  if (!SLUG_RE.test(slug)) return 'Use de 3 a 40 letras, números ou hífen.'
  return ''
}

export const money = (n: number) => String(r2(n)).replace('.', ',')

/** número a partir do texto digitado; vazio = 0; inválido = NaN */
export const num = (s: string): number => (s.trim() === '' ? 0 : parseMoney(s))

const FEATURED_SAMPLE = ['Banana Prata', 'Tomate Italiano', 'Morango']

export function samplePricesFor(): { prices: Record<string, string>; sample: Record<string, boolean> } {
  const prices: Record<string, string> = {}
  const sample: Record<string, boolean> = {}
  for (const c of TEMPLATE) {
    for (const p of c.products) {
      const v = SAMPLE_PRICES[p.name]
      if (v) {
        prices[p.key] = money(v)
        sample[p.key] = true
      }
    }
  }
  return { prices, sample }
}

export function initialDraft(): Draft {
  const { prices, sample } = samplePricesFor()
  const featured: Record<string, boolean> = {}
  for (const c of TEMPLATE) for (const p of c.products) if (FEATURED_SAMPLE.includes(p.name)) featured[p.key] = true
  return {
    name: '',
    slug: '',
    slugTouched: false,
    whatsapp: '',
    color: COLORS[0],
    tagline: '',
    prices,
    sample,
    featured,
    custom: [],
    accepts_delivery: true,
    accepts_pickup: true,
    min_order: '',
    fee: '',
    free_from: '',
    zones: [],
    hours: presetHours('seg-sab'),
    about: '',
    address: '',
    phone: '',
    pix: '',
  }
}

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) return { ...initialDraft(), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return initialDraft()
}

export function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    /* ignore */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

const price = (s: string | undefined) => {
  const n = num(s ?? '')
  return Number.isNaN(n) || n < 0 ? 0 : n
}

/** Quantos produtos têm preço de verdade (digitado pelo dono) e quantos ainda são só exemplo. */
export function countPriced(d: Draft): { real: number; sample: number } {
  let real = 0
  let sample = 0
  for (const c of TEMPLATE)
    for (const p of c.products) {
      if (price(d.prices[p.key]) <= 0) continue
      if (d.sample[p.key]) sample++
      else real++
    }
  for (const c of d.custom) if (price(c.price) > 0) real++
  return { real, sample }
}

/** Monta o catálogo que a prévia mostra (inclui preços de exemplo para a loja ganhar vida). */
export function buildPreview(d: Draft): CatalogData {
  const sid = 'preview'
  const categories: Category[] = TEMPLATE.map((c, i) => ({ id: `c${i}`, store_id: sid, name: c.name, emoji: c.emoji, sort: i }))
  const products: Product[] = []
  TEMPLATE.forEach((c, ci) =>
    c.products.forEach((p, pi) => {
      const pr = price(d.prices[p.key])
      products.push({
        id: p.key,
        store_id: sid,
        category_id: `c${ci}`,
        name: p.name,
        emoji: p.emoji,
        image_url: null,
        unit: p.unit,
        price: pr,
        offer_price: null,
        available: pr > 0,
        featured: pr > 0 && Boolean(d.featured[p.key]),
        note: null,
        sort: pi,
      })
    }),
  )
  for (const c of d.custom) {
    const ci = TEMPLATE.findIndex((t) => t.name === c.category)
    const pr = price(c.price)
    products.push({
      id: `custom:${c.id}`,
      store_id: sid,
      category_id: ci >= 0 ? `c${ci}` : 'c0',
      name: c.name || 'Novo produto',
      emoji: c.emoji || '🛒',
      image_url: null,
      unit: c.unit,
      price: pr,
      offer_price: null,
      available: pr > 0,
      featured: false,
      note: null,
      sort: 900,
    })
  }
  const zones: Zone[] = d.zones
    .filter((z) => z.name.trim())
    .map((z, i) => ({ id: `z${i}`, store_id: sid, name: z.name.trim(), fee: price(z.fee), sort: i }))
  return {
    demo: true,
    store: {
      id: sid,
      slug: d.slug || 'sua-loja',
      name: d.name.trim() || 'Sua loja',
      tagline: d.tagline.trim() || null,
      about: d.about.trim() || null,
      phone: d.phone.trim() || null,
      whatsapp: onlyDigits(d.whatsapp) || '5500000000000',
      logo_url: null,
      primary_color: d.color,
      address: d.address.trim() || null,
      hours: null,
      hours_json: d.hours,
      pix_key: d.pix.trim() || null,
      is_open: true,
      is_published: true,
      accepts_delivery: d.accepts_delivery,
      accepts_pickup: d.accepts_pickup || !d.accepts_delivery,
      min_order: price(d.min_order),
      default_delivery_fee: price(d.fee),
      free_delivery_from: price(d.free_from),
      plan: 'trial',
      active_until: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
    zones,
    categories,
    products,
    boxes: [],
  }
}

/** Rascunho no formato que a função apply_builder_draft() do banco espera. Preços de exemplo ficam de fora. */
export function toPayload(d: Draft) {
  const products: Record<string, unknown>[] = []
  for (const c of TEMPLATE)
    for (const p of c.products) {
      const pr = price(d.prices[p.key])
      if (pr <= 0 || d.sample[p.key]) continue
      products.push({ name: p.name, price: pr, unit: p.unit, category: c.name, emoji: p.emoji, featured: Boolean(d.featured[p.key]), available: true })
    }
  for (const c of d.custom) {
    const pr = price(c.price)
    if (!c.name.trim() || pr <= 0) continue
    products.push({ name: c.name.trim(), price: pr, unit: c.unit, category: c.category, emoji: c.emoji || '🛒', featured: false, available: true })
  }
  return {
    tagline: d.tagline.trim(),
    about: d.about.trim(),
    address: d.address.trim(),
    phone: d.phone.trim(),
    pix_key: d.pix.trim(),
    hours_json: d.hours,
    min_order: price(d.min_order),
    default_delivery_fee: price(d.fee),
    free_delivery_from: price(d.free_from),
    accepts_delivery: d.accepts_delivery,
    accepts_pickup: d.accepts_pickup || !d.accepts_delivery,
    zones: d.zones.filter((z) => z.name.trim()).map((z) => ({ name: z.name.trim(), fee: price(z.fee) })),
    products,
  }
}
