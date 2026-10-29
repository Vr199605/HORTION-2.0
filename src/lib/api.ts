import { supabase, isConfigured } from './supabase'
import { DEMOS, demoCoupon } from './demoData'
import type { CatalogData, CartLine, CouponCheck, OrderResult, Store } from './types'
import type { CustomerInfo } from './whatsapp'

export class AppError extends Error {}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Carrega loja + catálogo público pelo slug. Retorna null se não existir. */
export async function loadCatalog(slug: string): Promise<CatalogData | null> {
  const s = slug.toLowerCase()
  if (DEMOS[s]) return DEMOS[s]
  if (!isConfigured) return null

  const { data: store, error } = await supabase.from('stores').select('*').eq('slug', s).maybeSingle()
  if (error) throw new AppError(error.message)
  if (!store) return null

  const [zones, categories, products, boxes] = await Promise.all([
    supabase.from('delivery_zones').select('*').eq('store_id', store.id).order('sort').order('name'),
    supabase.from('categories').select('*').eq('store_id', store.id).order('sort'),
    supabase.from('products').select('*').eq('store_id', store.id).order('sort').order('name'),
    supabase.from('boxes').select('*').eq('store_id', store.id).order('sort'),
  ])
  for (const r of [zones, categories, products, boxes]) if (r.error) throw new AppError(r.error.message)

  return {
    store: normalizeStore(store),
    zones: (zones.data ?? []).map((z: any) => ({ ...z, fee: Number(z.fee) })),
    categories: categories.data ?? [],
    products: (products.data ?? []).map((x: any) => ({
      ...x,
      price: Number(x.price),
      offer_price: x.offer_price === null ? null : Number(x.offer_price),
      featured: Boolean(x.featured),
    })),
    boxes: (boxes.data ?? []).map((b: any) => ({ ...b, price: Number(b.price) })),
  }
}

export function normalizeStore(s: any): Store {
  return {
    ...s,
    min_order: Number(s.min_order ?? 0),
    default_delivery_fee: Number(s.default_delivery_fee ?? 0),
    free_delivery_from: Number(s.free_delivery_from ?? 0),
    hours_json: s.hours_json ?? null,
  } as Store
}

/** Valida o cupom (o servidor é quem decide; nas lojas demo é local). */
export async function validateCoupon(data: CatalogData, code: string, subtotal: number): Promise<CouponCheck> {
  if (!code.trim()) return { valid: false, message: 'Digite o cupom' }
  if (data.demo) return demoCoupon(code, subtotal)
  const { data: res, error } = await supabase.rpc('validate_coupon', {
    p_slug: data.store.slug,
    p_code: code,
    p_subtotal: subtotal,
  })
  if (error) return { valid: false, message: error.message }
  return res as CouponCheck
}

/** Cria o pedido. Nas lojas demo calcula localmente; caso contrário o servidor recalcula tudo. */
export async function placeOrder(
  data: CatalogData,
  cart: CartLine[],
  customer: CustomerInfo,
): Promise<OrderResult> {
  if (data.demo) {
    const items = cart.map((l) => ({
      name: l.name,
      unit: l.unit === 'box' ? 'un' : l.unit,
      qty: l.qty,
      unit_price: l.unitPrice,
      line_total: r2(l.unitPrice * l.qty),
      note: l.note ?? null,
    }))
    const subtotal = r2(items.reduce((a, i) => a + i.line_total, 0))
    let discount = 0
    let coupon_code: string | null = null
    if (customer.coupon) {
      const c = demoCoupon(customer.coupon, subtotal)
      if (!c.valid) throw new AppError(c.message)
      discount = c.discount ?? 0
      coupon_code = c.code ?? null
    }
    let fee = 0
    if (customer.delivery_type === 'delivery') {
      const z = data.zones.find((x) => x.id === customer.zone_id)
      fee = z ? z.fee : data.store.default_delivery_fee
      if (data.store.free_delivery_from > 0 && subtotal - discount >= data.store.free_delivery_from) fee = 0
    }
    return {
      id: 'demo',
      code: '#DEMO',
      subtotal,
      discount,
      coupon_code,
      delivery_fee: fee,
      total: r2(subtotal - discount + fee),
      items,
    }
  }

  const { data: res, error } = await supabase.rpc('create_order', {
    p_slug: data.store.slug,
    p_customer: {
      name: customer.name,
      phone: customer.phone,
      delivery_type: customer.delivery_type,
      address: customer.address,
      neighborhood: customer.neighborhood,
      zone_id: customer.zone_id || null,
      payment_method: customer.payment_method,
      notes: customer.notes,
      coupon: customer.coupon || null,
    },
    p_items: cart.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty, note: l.note ?? '' })),
  })
  if (error) throw new AppError(error.message)
  return res as OrderResult
}

export async function submitLead(input: {
  name: string
  company: string
  email: string
  whatsapp: string
  city: string
  segment: string
}): Promise<void> {
  if (!isConfigured) throw new AppError('Cadastro indisponível no momento. Fale conosco pelo WhatsApp.')
  const { error } = await supabase.rpc('submit_lead', {
    p_name: input.name,
    p_company: input.company,
    p_email: input.email,
    p_whatsapp: input.whatsapp,
    p_city: input.city,
    p_segment: input.segment,
  })
  if (error) throw new AppError(error.message)
}
