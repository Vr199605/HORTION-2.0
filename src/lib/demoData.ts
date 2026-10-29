import { presetHours } from './hours'
import type { CatalogData, Product, Unit, CouponCheck } from './types'

type Base = [cat: 'c1' | 'c2' | 'c3' | 'c4', name: string, emoji: string, unit: Unit, price: number, extra?: Partial<Product>]

const BASE: Base[] = [
  ['c1', 'Banana Prata', '🍌', 'dz', 7.99, { offer_price: 6.99, note: 'Oferta do dia', featured: true }],
  ['c1', 'Maçã Fuji', '🍎', 'kg', 9.9, { featured: true }],
  ['c1', 'Laranja Pera', '🍊', 'kg', 4.5],
  ['c1', 'Mamão Papaia', '🥭', 'un', 5.5, { featured: true }],
  ['c1', 'Abacate', '🥑', 'un', 8.99],
  ['c1', 'Morango', '🍓', 'bd', 11.9, { featured: true }],
  ['c1', 'Melancia', '🍉', 'kg', 3.99],
  ['c1', 'Uva Verde', '🍇', 'kg', 17.9, { available: false }],
  ['c2', 'Alface Crespa', '🥬', 'un', 2.99],
  ['c2', 'Couve', '🥬', 'mc', 3.5],
  ['c2', 'Brócolis', '🥦', 'un', 6.9, { featured: true }],
  ['c2', 'Rúcula', '🥬', 'mc', 3.9],
  ['c3', 'Tomate Italiano', '🍅', 'kg', 6.99, { note: 'Peso aproximado', featured: true }],
  ['c3', 'Cebola', '🧅', 'kg', 4.99],
  ['c3', 'Batata Inglesa', '🥔', 'kg', 5.49],
  ['c3', 'Cenoura', '🥕', 'kg', 4.2],
  ['c3', 'Abobrinha', '🥒', 'kg', 5.9],
  ['c4', 'Alho', '🧄', 'kg', 32],
  ['c4', 'Cheiro-verde', '🌿', 'mc', 2.5],
  ['c4', 'Gengibre', '🫚', 'kg', 24],
]

interface DemoCfg {
  slug: string
  name: string
  tagline: string
  about: string
  color: string
  mult: number
  min: number
  fee: number
  free: number
  address: string
  phone: string
}

function makeDemo(cfg: DemoCfg): CatalogData {
  const S = `store-${cfg.slug}`
  const money = (n: number) => Math.round(n * cfg.mult * 100) / 100
  const products: Product[] = BASE.map(([cat, name, emoji, unit, price, extra], i) => ({
    id: `${cfg.slug}-p${i + 1}`,
    store_id: S,
    category_id: `${cfg.slug}-${cat}`,
    name,
    emoji,
    image_url: null,
    unit,
    price: money(price),
    offer_price: extra?.offer_price ? money(extra.offer_price) : null,
    available: extra?.available ?? true,
    featured: extra?.featured ?? false,
    note: extra?.note ?? null,
    sort: i + 1,
  }))
  return {
    demo: true,
    store: {
      id: S,
      slug: cfg.slug,
      name: cfg.name,
      tagline: cfg.tagline,
      about: cfg.about,
      phone: cfg.phone,
      whatsapp: '5521999999999',
      logo_url: null,
      primary_color: cfg.color,
      address: cfg.address,
      hours: 'Seg a Sáb, 7h às 18h',
      hours_json: presetHours('seg-sab'),
      pix_key: null,
      is_open: true,
      is_published: true,
      accepts_delivery: true,
      accepts_pickup: true,
      min_order: cfg.min,
      default_delivery_fee: cfg.fee,
      free_delivery_from: cfg.free,
      plan: 'demo',
      active_until: '2099-01-01T00:00:00Z',
    },
    zones: [
      { id: `${cfg.slug}-z1`, store_id: S, name: 'Centro', fee: cfg.fee - 2, sort: 1 },
      { id: `${cfg.slug}-z2`, store_id: S, name: 'Jardim das Flores', fee: cfg.fee, sort: 2 },
      { id: `${cfg.slug}-z3`, store_id: S, name: 'Vila Nova', fee: cfg.fee + 2, sort: 3 },
    ],
    categories: [
      { id: `${cfg.slug}-c1`, store_id: S, name: 'Frutas', emoji: '🍎', sort: 1 },
      { id: `${cfg.slug}-c2`, store_id: S, name: 'Verduras', emoji: '🥬', sort: 2 },
      { id: `${cfg.slug}-c3`, store_id: S, name: 'Legumes', emoji: '🥕', sort: 3 },
      { id: `${cfg.slug}-c4`, store_id: S, name: 'Temperos', emoji: '🌿', sort: 4 },
    ],
    products,
    boxes: [
      { id: `${cfg.slug}-b1`, store_id: S, name: 'Box Econômico', emoji: '📦', description: 'O básico da semana', items: ['Banana', 'Maçã', 'Tomate', 'Cenoura'], price: money(29.9), available: true, sort: 1 },
      { id: `${cfg.slug}-b2`, store_id: S, name: 'Box Semanal', emoji: '🧺', description: 'Variedade para a semana', items: ['8 frutas', '5 verduras', '4 legumes'], price: money(69.9), available: true, sort: 2 },
      { id: `${cfg.slug}-b3`, store_id: S, name: 'Box Família', emoji: '🥬', description: 'Para a casa toda', items: ['Frutas da estação', 'Folhas frescas', 'Legumes'], price: money(99.9), available: true, sort: 3 },
    ],
  }
}

export const DEMOS: Record<string, CatalogData> = {
  demo: makeDemo({
    slug: 'demo',
    name: 'Horti Verde',
    tagline: 'Loja demonstrativa · produtos e preços fictícios',
    about: 'Hortifruti de bairro com frutas, verduras e legumes selecionados todos os dias. Esta é uma loja de demonstração.',
    color: '#16a34a',
    mult: 1,
    min: 20,
    fee: 6,
    free: 80,
    address: 'Rua das Acácias, 128',
    phone: '(21) 3000-0000',
  }),
  'demo-organicos': makeDemo({
    slug: 'demo-organicos',
    name: 'Quitanda Orgânica',
    tagline: 'Loja demonstrativa · produtos e preços fictícios',
    about: 'Quitanda com foco em orgânicos e produtores locais. Esta é uma loja de demonstração.',
    color: '#4d7c0f',
    mult: 1.6,
    min: 40,
    fee: 8,
    free: 150,
    address: 'Av. das Palmeiras, 50',
    phone: '(21) 3000-1111',
  }),
  'demo-feira': makeDemo({
    slug: 'demo-feira',
    name: 'Sacolão da Feira',
    tagline: 'Loja demonstrativa · produtos e preços fictícios',
    about: 'Sacolão com preço de feira e boxes para a semana toda. Esta é uma loja de demonstração.',
    color: '#ea580c',
    mult: 0.85,
    min: 30,
    fee: 5,
    free: 100,
    address: 'Rua da Feira, 7',
    phone: '(21) 3000-2222',
  }),
}

export const DEMO = DEMOS.demo

export const DEMO_COUPON_HINT = 'BEMVINDO10'

/** Cupons válidos nas lojas demo: BEMVINDO10 (10%, a partir de R$ 20) e MENOS5 (R$ 5 fixos). */
export function demoCoupon(code: string, subtotal: number): CouponCheck {
  const c = code.trim().toUpperCase()
  if (c === 'BEMVINDO10') {
    if (subtotal < 20) return { valid: false, message: 'Válido para pedidos a partir de R$ 20,00' }
    return { valid: true, message: 'Cupom aplicado', code: c, discount: Math.round(subtotal * 10) / 100 }
  }
  if (c === 'MENOS5') return { valid: true, message: 'Cupom aplicado', code: c, discount: Math.min(5, subtotal) }
  return { valid: false, message: 'Cupom inválido ou expirado' }
}
