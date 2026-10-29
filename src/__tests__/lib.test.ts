import { describe, expect, it } from 'vitest'
import { isOpenAt, isStoreOpen, statusText, presetHours, emptyHours, hoursTable } from '../lib/hours'
import { maskPhone, normalizeText, parseMoney, slugify, onColor, qtyLabel } from '../lib/format'
import { TEMPLATE, TEMPLATE_COUNT } from '../lib/template'
import { buildPreview, countPriced, initialDraft, slugError, toPayload } from '../lib/draft'
import { syncCart } from '../components/ShopView'
import { DEMOS, demoCoupon } from '../lib/demoData'
import type { CartLine, HoursMap } from '../lib/types'

// São Paulo = UTC-3 o ano todo (sem horário de verão)
const sp = (y: number, m: number, d: number, h: number, min = 0) => new Date(Date.UTC(y, m - 1, d, h + 3, min))
// 26/10/2026 é segunda-feira
const MON = (h: number, m = 0) => sp(2026, 10, 26, h, m)
const SUN = (h: number, m = 0) => sp(2026, 11, 1, h, m)

describe('horário de funcionamento', () => {
  const h = presetHours('seg-sab')
  it('abre e fecha nos limites', () => {
    expect(isOpenAt(h, MON(6, 59))).toBe(false)
    expect(isOpenAt(h, MON(7, 0))).toBe(true)
    expect(isOpenAt(h, MON(17, 59))).toBe(true)
    expect(isOpenAt(h, MON(18, 0))).toBe(false)
  })
  it('domingo fechado no preset seg-sab', () => {
    expect(isOpenAt(h, SUN(10))).toBe(false)
  })
  it('24 horas', () => {
    expect(isOpenAt(presetHours('24h'), SUN(3))).toBe(true)
    expect(isOpenAt(presetHours('24h'), MON(0, 0))).toBe(true)
  })
  it('vira a meia-noite (18h às 02h)', () => {
    const w: HoursMap = { ...emptyHours(), seg: { open: '18:00', close: '02:00' } }
    expect(isOpenAt(w, MON(23, 0))).toBe(true)
    expect(isOpenAt(w, MON(1, 0))).toBe(true)
    expect(isOpenAt(w, MON(10, 0))).toBe(false)
  })
  it('sem horário cadastrado vale só o botão abrir/fechar', () => {
    expect(isOpenAt(null, SUN(3))).toBe(true)
    expect(isStoreOpen({ is_open: false, hours_json: null }, MON(10))).toBe(false)
    expect(isStoreOpen({ is_open: true, hours_json: null }, MON(10))).toBe(true)
  })
  it('texto de status', () => {
    expect(statusText({ is_open: true, hours_json: h }, MON(10))).toBe('Aberto agora · fecha às 18h')
    expect(statusText({ is_open: true, hours_json: h }, MON(5))).toBe('Fechado · abre hoje às 7h')
    expect(statusText({ is_open: true, hours_json: h }, SUN(10))).toBe('Fechado · abre amanhã às 7h')
    expect(statusText({ is_open: false, hours_json: h }, MON(10))).toBe('Fechado no momento')
  })
  it('tabela marca o dia de hoje e domingo fechado', () => {
    const t = hoursTable(h)
    expect(t).toHaveLength(7)
    expect(t[6]).toMatchObject({ label: 'Domingo', value: 'Fechado' })
  })
})

describe('formatação', () => {
  it('parseMoney', () => {
    expect(parseMoney('7,99')).toBe(7.99)
    expect(parseMoney('R$ 1.234,50')).toBe(1234.5)
    expect(parseMoney('7.99')).toBe(7.99)
    expect(parseMoney('')).toBeNaN()
    expect(parseMoney('abc')).toBeNaN()
  })
  it('maskPhone', () => {
    expect(maskPhone('21987654321')).toBe('(21) 98765-4321')
    expect(maskPhone('2133334444')).toBe('(21) 3333-4444')
    expect(maskPhone('21')).toBe('21')
    expect(maskPhone('219876543219999')).toBe('(21) 98765-4321')
  })
  it('slugify e busca sem acento', () => {
    expect(slugify('Horti do João & Filhos!')).toBe('horti-do-joao-filhos')
    expect(normalizeText('  Maçã Fuji ')).toBe('maca fuji')
  })
  it('cor do texto e quantidades', () => {
    expect(onColor('#ffffff')).toBe('#111827')
    expect(onColor('#16a34a')).toBe('#ffffff')
    expect(qtyLabel(1.5)).toBe('1,5')
    expect(qtyLabel(2)).toBe('2')
  })
})

describe('catálogo-modelo e rascunho', () => {
  it('nomes de produto são únicos (o banco casa por nome)', () => {
    const names = TEMPLATE.flatMap((c) => c.products.map((p) => p.name.toLowerCase()))
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBe(TEMPLATE_COUNT)
  })
  it('endereços reservados e inválidos', () => {
    expect(slugError('')).not.toBe('')
    expect(slugError('montar')).toMatch(/reservado/)
    expect(slugError('demo-xyz')).toMatch(/reservado/)
    expect(slugError('a')).toMatch(/3 a 40/)
    expect(slugError('-ab')).not.toBe('')
    expect(slugError('horti-verde')).toBe('')
  })
  it('preços de exemplo nunca vão para o banco', () => {
    const d = initialDraft()
    const c = countPriced(d)
    expect(c.sample).toBeGreaterThan(0)
    expect(c.real).toBe(0)
    expect(toPayload(d).products).toHaveLength(0)
    // a pessoa troca um preço: vira real e é publicado
    const key = TEMPLATE[0].products[0].key
    const d2 = { ...d, prices: { ...d.prices, [key]: '8,50' }, sample: { ...d.sample, [key]: false } }
    const p = toPayload(d2).products as any[]
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ name: TEMPLATE[0].products[0].name, price: 8.5, available: true })
  })
  it('destaque só vale com preço; produto próprio entra no payload', () => {
    const d = initialDraft()
    const k = TEMPLATE.flatMap((c) => c.products).find((p) => !d.prices[p.key])!.key
    d.featured[k] = true
    const prev = buildPreview(d)
    expect(prev.products.find((p) => p.id === k)!.featured).toBe(false) // sem preço
    d.custom = [{ id: '1', name: 'Pitaya', emoji: '🐉', unit: 'un', category: TEMPLATE[0].name, price: '12,90' }]
    const payload = toPayload(d).products as any[]
    expect(payload.find((p) => p.name === 'Pitaya')).toMatchObject({ price: 12.9, unit: 'un', category: 'Frutas' })
  })
  it('prévia usa preços de exemplo e respeita horário/entrega', () => {
    const d = initialDraft()
    d.name = 'Teste'
    d.accepts_delivery = false
    d.accepts_pickup = false
    const prev = buildPreview(d)
    expect(prev.demo).toBe(true)
    expect(prev.products.filter((p) => p.price > 0).length).toBeGreaterThan(5)
    expect(prev.store.accepts_pickup).toBe(true) // nunca fica sem nenhuma forma de receber
  })
})

describe('carrinho e cupons', () => {
  const data = DEMOS.demo
  const prod = data.products.find((p) => p.available)!
  const line = (over: Partial<CartLine> = {}): CartLine => ({
    key: `product:${prod.id}`, kind: 'product', id: prod.id, name: prod.name, emoji: '🍌', unit: prod.unit, unitPrice: prod.price, qty: 1, ...over,
  })
  it('syncCart remove o que sumiu e atualiza preço', () => {
    const gone = line({ key: 'product:x', id: 'x' })
    const stale = line({ unitPrice: 0.01, name: 'Antigo' })
    const out = syncCart([gone, stale], data)
    expect(out).toHaveLength(1)
    expect(out[0].unitPrice).toBe(prod.offer_price && prod.offer_price < prod.price ? prod.offer_price : prod.price)
    expect(out[0].name).toBe(prod.name)
  })
  it('syncCart mantém a referência quando nada mudou', () => {
    const cart = syncCart([line()], data)
    expect(syncCart(cart, data)).toBe(cart)
  })
  it('cupons de demonstração', () => {
    expect(demoCoupon('bemvindo10', 50)).toMatchObject({ valid: true, discount: 5 })
    expect(demoCoupon('BEMVINDO10', 10).valid).toBe(false)
    expect(demoCoupon('MENOS5', 3)).toMatchObject({ valid: true, discount: 3 })
    expect(demoCoupon('XYZ', 50).valid).toBe(false)
  })
})
