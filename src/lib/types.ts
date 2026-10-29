export type Unit = 'kg' | 'un' | 'dz' | 'mc' | 'bd'

export const UNIT_LABEL: Record<Unit, string> = {
  kg: 'kg',
  un: 'unidade',
  dz: 'dúzia',
  mc: 'maço',
  bd: 'bandeja',
}

export const UNIT_SHORT: Record<Unit, string> = {
  kg: 'kg',
  un: 'un',
  dz: 'dz',
  mc: 'maço',
  bd: 'band.',
}

export type DayKey = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom'
export interface DayHours {
  open: string // "07:00"
  close: string // "18:00"  (close <= open = vira a meia-noite; 00:00-00:00 = 24h)
}
export type HoursMap = Record<DayKey, DayHours | null>

export interface Store {
  id: string
  owner_id?: string
  slug: string
  name: string
  tagline: string | null
  about: string | null
  phone: string | null
  whatsapp: string
  logo_url: string | null
  primary_color: string
  address: string | null
  hours: string | null
  hours_json: HoursMap | null
  pix_key: string | null
  is_open: boolean
  is_published: boolean
  accepts_delivery: boolean
  accepts_pickup: boolean
  min_order: number
  default_delivery_fee: number
  free_delivery_from: number
  plan: string
  active_until: string
}

export interface Zone {
  id: string
  store_id: string
  name: string
  fee: number
  sort: number
}

export interface Category {
  id: string
  store_id: string
  name: string
  emoji: string | null
  sort: number
}

export interface Product {
  id: string
  store_id: string
  category_id: string | null
  name: string
  emoji: string | null
  image_url: string | null
  unit: Unit
  price: number
  offer_price: number | null
  available: boolean
  featured: boolean
  note: string | null
  sort: number
}

export interface Box {
  id: string
  store_id: string
  name: string
  emoji: string | null
  description: string | null
  items: string[]
  price: number
  available: boolean
  sort: number
}

export type OrderStatus = 'novo' | 'separando' | 'saiu' | 'entregue' | 'cancelado'

export interface OrderItem {
  id?: string
  name: string
  unit: string
  qty: number
  unit_price: number
  line_total: number
  note?: string | null
}

export interface Order {
  id: string
  store_id: string
  code: string
  customer_name: string
  customer_phone: string | null
  delivery_type: 'delivery' | 'pickup'
  address: string | null
  neighborhood: string | null
  payment_method: string | null
  notes: string | null
  subtotal: number
  discount: number
  coupon_code: string | null
  delivery_fee: number
  total: number
  status: OrderStatus
  created_at: string
  order_items?: OrderItem[]
}

export interface Coupon {
  id: string
  store_id: string
  code: string
  kind: 'percent' | 'fixed'
  value: number
  min_order: number
  max_uses: number | null
  uses: number
  expires_at: string | null
  active: boolean
}

export interface CatalogData {
  store: Store
  zones: Zone[]
  categories: Category[]
  products: Product[]
  boxes: Box[]
  /** loja de demonstração / prévia: ignora horário e não grava no banco */
  demo?: boolean
}

export interface CartLine {
  key: string // `${kind}:${id}`
  kind: 'product' | 'box'
  id: string
  name: string
  emoji: string
  unit: Unit | 'box'
  unitPrice: number
  qty: number
  note?: string
}

export interface OrderResult {
  id: string
  code: string
  subtotal: number
  discount: number
  coupon_code: string | null
  delivery_fee: number
  total: number
  items: OrderItem[]
}

export interface CouponCheck {
  valid: boolean
  message: string
  code?: string
  discount?: number
}
